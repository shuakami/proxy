const fetch = require('node-fetch');
const Redis = require('ioredis');

// --- Redis Client Initialization ---
// The client will automatically use the REDIS_URL from the .env file.
const redis = new Redis(process.env.REDIS_URL);
const STATS_KEY = 'proxy:stats';

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
  // --- Handle Stats API Endpoint ---
  if (req.url.startsWith('/api/stats')) {
    const statsData = await redis.hgetall(STATS_KEY);
    const stats = {
      totalRequests: parseInt(statsData.totalRequests, 10) || 0,
      cacheHits: parseInt(statsData.cacheHits, 10) || 0,
      gitRequests: parseInt(statsData.gitRequests, 10) || 0,
      proxiedBytes: parseInt(statsData.proxiedBytes, 10) || 0,
    };
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify(stats));
  }

  await redis.hincrby(STATS_KEY, 'totalRequests', 1);
  let targetUrl = req.url.slice(1);

  // --- URL Decoding ---
  targetUrl = decodeURIComponent(targetUrl);

  // --- NEW, SIMPLIFIED FIX for URL reconstruction ---
  // This robustly turns "https:/example.com" into "https://example.com"
  if (targetUrl.includes(':/') && !targetUrl.includes('://')) {
      targetUrl = targetUrl.replace(':/', '://');
  }

  // --- Robustness: Prepend https:// if protocol is missing ---
  // This handles cases like "github.com/user/repo" instead of "https://github.com/user/repo"
  if (targetUrl && !targetUrl.startsWith('http') && targetUrl.includes('.')) {
    console.log(`[REWRITE] Protocol missing. Rewriting URL to: https://${targetUrl}`);
    targetUrl = `https://` + targetUrl;
  }

  if (!targetUrl || !targetUrl.startsWith('http')) {
    res.statusCode = 400;
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
    
    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers: { ...req.headers, host: new URL(targetUrl).host },
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

    const headers = {};
    proxyRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['transfer-encoding', 'connection', 'cache-control', 'set-cookie'].includes(lowerKey)) {
        headers[key] = value;
        res.setHeader(key, value);
      }
    });

    const bodyBuffer = await proxyRes.buffer();
    await redis.hincrby(STATS_KEY, 'proxiedBytes', bodyBuffer.length);
    
    if (isCachable && proxyRes.ok) {
        // --- 动态缓存逻辑 ---
        const dynamicCacheSeconds = getDynamicCacheDuration(duration);
        console.log(`[DYNAMIC CACHE] Origin Time: ${duration}ms, Caching for: ${dynamicCacheSeconds}s`);

        // 设置 Vercel Edge 缓存和 Redis 缓存
        res.setHeader('Cache-Control', `public, s-maxage=${dynamicCacheSeconds}, stale-while-revalidate=${dynamicCacheSeconds}`);
        const cacheEntry = {
            body: bodyBuffer.toString('base64'), // Store body as base64 string
            headers,
            status: proxyRes.status,
        };
        await redis.set(targetUrl, JSON.stringify(cacheEntry), 'EX', dynamicCacheSeconds);
    }
    
    res.statusCode = proxyRes.status;
    res.end(bodyBuffer);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Proxy encountered an error.', details: error.message }));
  }
}; 