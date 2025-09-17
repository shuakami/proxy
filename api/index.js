const fetch = require('node-fetch');
const Redis = require('ioredis');

// --- Redis Client Initialization ---
// The client will automatically use the REDIS_URL from the .env file.
const redis = new Redis(process.env.REDIS_URL);
// Add a general error handler to prevent crashing on connection issues
redis.on('error', (err) => console.error('[Redis Client Error]', err));

const STATS_KEY = 'proxy:stats';

/**
 * 设置通用 CORS 头，允许所有来源。
 * - 允许: *
 * - 方法: GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD
 * - 允许头: 回显预检请求头或使用通配
 * - 暴露头: 便于前端读取长度/范围/自定义头
 */
function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  const reqHeaders = req.headers['access-control-request-headers'];
  if (reqHeaders) {
    res.setHeader('Access-Control-Allow-Headers', reqHeaders);
  } else {
    res.setHeader('Access-Control-Allow-Headers', '*');
  }
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Content-Type,Accept-Ranges,X-Cache,X-Cache-Remaining,X-Proxy-Response-Time');
}

/**
 * 根据源站的响应时间动态计算缓存时长。
 * 源站越慢，缓存时间越长，以减少对其的请求。
 * @param {number} responseTimeMs - 源站响应时间（毫秒）。
 * @returns {number} 缓存时长（秒）。
 */
function getDynamicCacheDuration(responseTimeMs) {
  if (responseTimeMs < 200) { // 响应非常快
    return 60; // 缓存 1 分钟
  }
  if (responseTimeMs < 800) { // 中等速度
    return 300; // 缓存 5 分钟
  }
  if (responseTimeMs < 3000) { // 慢速度
    return 600; //缓存 10 分钟
  }
  return 1800; // 响应非常慢，缓存 30 分钟
}

/**
 * 辅助函数：从请求中异步读取原始请求体
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });
}

/**
 * Vercel Serverless Function 主处理函数
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
module.exports = async (req, res) => {
  // --- Handle CORS Preflight ---
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.statusCode = 204;
    return res.end();
  }

  // --- Handle Stats API Endpoint ---
  if (req.url.startsWith('/api/stats')) {
    // Handle resetting stats via POST request
    if (req.method === 'POST' && req.url.endsWith('/reset')) {
        try {
            await redis.del(STATS_KEY);
            console.log('[INFO] Proxy stats have been reset via API.');
            res.setHeader('Content-Type', 'application/json');
            setCorsHeaders(req, res);
            res.statusCode = 200;
            return res.end(JSON.stringify({ message: 'Stats have been reset successfully.' }));
        } catch(e) {
            console.error('Redis DEL error during stats reset:', e);
            res.setHeader('Content-Type', 'application/json');
            setCorsHeaders(req, res);
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: 'Failed to reset stats.', details: e.message }));
        }
    }
    
    // Handle fetching stats via GET request
    if (req.method === 'GET') {
        const statsData = await redis.hgetall(STATS_KEY);
        const stats = {
          totalRequests: parseInt(statsData.totalRequests, 10) || 0,
          cacheHits: parseInt(statsData.cacheHits, 10) || 0,
          gitRequests: parseInt(statsData.gitRequests, 10) || 0,
          proxiedBytes: parseInt(statsData.proxiedBytes, 10) || 0,
        };
        res.setHeader('Content-Type', 'application/json');
        setCorsHeaders(req, res);
        res.statusCode = 200;
        return res.end(JSON.stringify(stats));
    }

    // For other methods to /api/stats, return 405
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    setCorsHeaders(req, res);
    return res.end('Method Not Allowed');
  }

  try {
    await redis.hincrby(STATS_KEY, 'totalRequests', 1);
  } catch (e) {
    console.error('Redis hincrby totalRequests error:', e);
  }
  
  // --- Correctly determine targetUrl from rewrite header or fallback to URL ---
  const originalUrl = req.headers['x-vercel-rewritten-url'] || req.url;
  // With the rewrite `/((?!api/).*)`, the full URL is simply the originalUrl without the leading slash.
  let targetUrl = originalUrl.slice(1);

  // --- URL Decoding ---
  targetUrl = decodeURIComponent(targetUrl);

  // --- NEW, SIMPLIFIED FIX for URL reconstruction ---
  // This robustly turns "https:/example.com" into "https://example.com"
  if (targetUrl.includes(':/') && !targetUrl.includes('://')) {
      targetUrl = targetUrl.replace(':/', '://');
  }

  // Log the final, corrected URL
  console.log(`[INFO] Attempting to proxy URL: ${targetUrl}`);

  // --- Robustness: Prepend https:// if protocol is missing ---
  // This handles cases like "github.com/user/repo" instead of "https://github.com/user/repo"
  if (targetUrl && !targetUrl.startsWith('http') && targetUrl.includes('.')) {
    console.log(`[REWRITE] Protocol missing. Rewriting URL to: https://${targetUrl}`);
    targetUrl = `https://` + targetUrl;
  }

  if (!targetUrl || !targetUrl.startsWith('http')) {
    res.statusCode = 400;
    setCorsHeaders(req, res);
    return res.end('Bad Request: Please provide a valid URL to proxy.');
  }

  // --- Intelligent Request Identification ---
  const isGitRequest = targetUrl.includes('.git/info/refs') || targetUrl.includes('git-upload-pack') || targetUrl.includes('git-receive-pack');
  if (isGitRequest) await redis.hincrby(STATS_KEY, 'gitRequests', 1);
  const isCachable = req.method === 'GET' && !isGitRequest;

  // --- Redis Cache Check ---
  if (isCachable) {
    try {
      const cachedResult = await redis.get(targetUrl);
      if (cachedResult) {
        await redis.hincrby(STATS_KEY, 'cacheHits', 1);
        const cached = JSON.parse(cachedResult);
        const ttl = await redis.ttl(targetUrl);

        console.log(`[CACHE HIT] ${req.url} - Redis TTL: ${ttl}s`);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Remaining', `${ttl}s`);
        res.setHeader('X-Proxy-Response-Time', '0ms');
        
        // 当 Redis 命中时，也设置边缘缓存，让 Vercel Edge 也能缓存住这个响应
        if (ttl > 0) {
            res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl}`);
        }
        
        Object.entries(cached.headers).forEach(([key, value]) => res.setHeader(key, value));
        setCorsHeaders(req, res);
        res.statusCode = cached.status;
        return res.end(Buffer.from(cached.body, 'base64'));
      }
    } catch (e) {
      console.error('Redis GET error:', e);
    }
  }

  // --- Proxy request if not cached or not cachable ---
  try {
    const requestBody = (req.method !== 'GET' && req.method !== 'HEAD') ? await getRawBody(req) : undefined;
    const startTime = Date.now();
    
    // Create a new, clean set of headers to forward.
    // Copying all headers can cause issues with Vercel's routing/Fastly.
    const outgoingHeaders = {};
    const headersToPreserve = [
      'accept', 'accept-encoding', 'accept-language', 
      'user-agent', 'dnt', 'content-type', 'content-length',
      'range' // Crucial for download managers (e.g., IDM) and resuming downloads.
    ];
    for (const header of headersToPreserve) {
      if (req.headers[header]) {
        outgoingHeaders[header] = req.headers[header];
      }
    }

    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers: outgoingHeaders,
      body: requestBody,
      redirect: 'follow',
      compress: false,
    });
    
    const duration = Date.now() - startTime;
    const responseTime = `${duration}ms`;

    if (isGitRequest) console.log(`[GIT PROXY] ${req.method} ${req.url} - ${proxyRes.status} - ${responseTime}`);
    else if (isCachable) console.log(`[CACHE MISS] ${req.method} ${req.url} - Response Time: ${responseTime}`);
    else console.log(`[PROXY] ${req.method} ${req.url} - ${proxyRes.status} - ${responseTime}`);
    
    res.setHeader('X-Proxy-Response-Time', responseTime);
    if (isCachable) res.setHeader('X-Cache', 'MISS');

    // Forward headers from the proxied response to the client.
    proxyRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Filter out headers that are specific to the connection or would interfere.
      if (!['transfer-encoding', 'connection', 'set-cookie', 'cache-control'].includes(lowerKey)) {
        res.setHeader(key, value);
      }
    });

    // --- Accurate Byte Counting ---
    // To prevent miscounting on ranged requests, we calculate bytes transferred based on status code.
    let bytesTransferred = 0;
    const contentRange = proxyRes.headers.get('content-range');
    const contentLength = proxyRes.headers.get('content-length');

    if (proxyRes.status === 206 && contentRange) {
        // For partial content, parse the content-range header (e.g., "bytes 200-1000/67589").
        const match = contentRange.match(/bytes (\d+)-(\d+)\/\d+/);
        if (match) {
            const start = parseInt(match[1], 10);
            const end = parseInt(match[2], 10);
            bytesTransferred = end - start + 1;
        }
    } else if (contentLength) {
        // For full responses, use the content-length header.
        bytesTransferred = parseInt(contentLength, 10);
    }

    if (bytesTransferred > 0) {
        try {
            await redis.hincrby(STATS_KEY, 'proxiedBytes', bytesTransferred);
        } catch (e) {
            console.error('Redis hincrby proxiedBytes error:', e);
        }
    }

    // For cachable GET requests, we rely on Vercel's Edge Caching.
    // Redis caching of the body is disabled to support streaming large files.
    if (isCachable && proxyRes.ok) {
        const dynamicCacheSeconds = getDynamicCacheDuration(duration);
        console.log(`[DYNAMIC CACHE] Origin Time: ${duration}ms, Caching for: ${dynamicCacheSeconds}s`);
        res.setHeader('Cache-Control', `public, s-maxage=${dynamicCacheSeconds}, stale-while-revalidate=${dynamicCacheSeconds}`);
    }
    
    // Always set permissive CORS headers on the final response to the browser
    setCorsHeaders(req, res);
    res.statusCode = proxyRes.status;
    
    // --- Font CSS Processing for Google Fonts ---
    // Check if this is a Google Fonts CSS request that needs URL replacement
    const isFontsCssRequest = targetUrl.includes('fonts.googleapis.com/css') && 
                              proxyRes.headers.get('content-type')?.includes('text/css');
    
    if (isFontsCssRequest && proxyRes.ok) {
      try {
        // Read the CSS content
        const cssContent = await proxyRes.text();
        
        // Get the current proxy base URL from the request
        // Extract from either x-forwarded-host or host header, defaulting to a fallback
        const proxyHost = req.headers['x-forwarded-host'] || req.headers['host'] || 'proxy.sdjz.wiki';
        const proxyBaseUrl = `https://${proxyHost}`;
        
        // Replace font URLs in the CSS content
        // This replaces: url(https://fonts.gstatic.com/...)
        // With: url(https://proxy.sdjz.wiki/https://fonts.gstatic.com/...)
        const modifiedCss = cssContent.replace(
          /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g,
          `url(${proxyBaseUrl}/$1)`
        );
        
        console.log(`[FONT PROXY] Processed CSS with ${(cssContent.match(/url\(https:\/\/fonts\.gstatic\.com\//g) || []).length} font URLs replaced`);
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        res.setHeader('Content-Length', Buffer.byteLength(modifiedCss, 'utf8'));
        
        // Return the modified CSS
        return res.end(modifiedCss);
        
      } catch (error) {
        console.error('Font CSS processing error:', error);
        // Fall back to streaming if processing fails
      }
    }

    // Stream the response body directly to the client for all other requests.
    // This is crucial to avoid buffering large files in memory, which causes crashes.
    return new Promise((resolve) => {
        proxyRes.body.pipe(res);
        proxyRes.body.on('end', () => resolve());
        proxyRes.body.on('error', (err) => {
            console.error('Proxy stream error:', err);
            resolve(); // End the function even if the stream breaks.
        });
    });

  } catch (error) {
    console.error('Proxy Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    setCorsHeaders(req, res);
    res.end(JSON.stringify({ error: 'Proxy encountered an error.', details: error.message }));
  }
}; 
