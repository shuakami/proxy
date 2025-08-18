document.addEventListener('DOMContentLoaded', () => {
    // Initialize Feather Icons
    feather.replace();

    // --- Mobile menu functionality (copied from home.js but specific to status page) ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileOverlay = document.getElementById('mobile-overlay');

    // --- Status Bar Node Detection ---
    function updateStatusBarNode() {
        const hostname = window.location.hostname;
        let nodeInfo = '';
        let flagClass = '';
        
        if (hostname.includes('hk.') || hostname.includes('hk.proxy.sdjz.wiki') || hostname === 'hk.proxy.sdjz.wiki') {
            nodeInfo = 'HK (Hong Kong)';
            flagClass = 'fi-hk';
        } else if (hostname.includes('proxy.sdjz.wiki') || hostname === 'proxy.sdjz.wiki') {
            nodeInfo = 'JP (Tokyo)';
            flagClass = 'fi-jp';
        } else {
            nodeInfo = 'Local Dev';
            flagClass = '';
        }
        
        // Update status bar items that show node info
        const statusItems = document.querySelectorAll('.status-bar-item');
        statusItems.forEach(item => {
            const span = item.querySelector('span');
            if (span && (span.textContent.includes('Proxy v1.0') || span.textContent.includes('Proxy v2.0'))) {
                if (flagClass) {
                    span.innerHTML = `<span class="fi ${flagClass}" style="margin-right: 0.5rem;"></span>${nodeInfo} - Proxy v2.0`;
                } else {
                    span.textContent = `${nodeInfo} - Proxy v2.0`;
                }
            }
        });
    }

    // Call the function to update status bar
    updateStatusBarNode();

    // --- Sidebar Toggle Functionality ---
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            // Only toggle collapsed state on desktop
            if (window.innerWidth > 768) {
                sidebar.classList.toggle('collapsed');
            }
        });
    }

    // --- Mobile Menu Functionality ---
    if (mobileMenuBtn && sidebar && mobileOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            mobileOverlay.classList.toggle('active');
        });

        mobileOverlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            mobileOverlay.classList.remove('active');
        });

        // Close mobile menu when clicking nav links
        const navLinks = sidebar.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('mobile-open');
                    mobileOverlay.classList.remove('active');
                }
            });
        });
    }

    // --- Handle Window Resize ---
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            // Reset mobile menu state on desktop
            sidebar.classList.remove('mobile-open');
            if (mobileOverlay) {
                mobileOverlay.classList.remove('active');
            }
        }
    });

    // --- Statistics Fetching (copied from script.js) ---
    const totalRequestsEl = document.getElementById('total-requests');
    const cacheHitsEl = document.getElementById('cache-hits');
    const dataProxiedEl = document.getElementById('data-proxied');
    const gitRequestsEl = document.getElementById('git-requests');
    let previousStats = { totalRequests: 0, cacheHits: 0, proxiedBytes: 0, gitRequests: 0 };

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    // Animate with an ease-out cubic function
    function animateValue(element, start, end, duration, isBytes = false) {
        if (start === end && !element.classList.contains('loading')) return;
        
        // Remove loading state once animation starts
        if(element.classList.contains('loading')) {
            element.classList.remove('loading');
            element.style.width = null; // Revert width
        }

        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.floor(easedProgress * (end - start) + start);
            element.innerText = isBytes ? formatBytes(currentValue) : currentValue.toLocaleString();
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    async function updateStats() {
        try {
            const response = await fetch('/api/stats');
            if (!response.ok) {
                console.error('API响应错误:', response.status, response.statusText);
                return;
            }
            const stats = await response.json();

            const isFirstLoad = totalRequestsEl.classList.contains('loading');
            const animationDuration = isFirstLoad ? 700 : 400; // Longer animation on first load

            animateValue(totalRequestsEl, previousStats.totalRequests, stats.totalRequests, animationDuration);
            animateValue(cacheHitsEl, previousStats.cacheHits, stats.cacheHits, animationDuration);
            animateValue(dataProxiedEl, previousStats.proxiedBytes, stats.proxiedBytes, animationDuration, true);
            animateValue(gitRequestsEl, previousStats.gitRequests, stats.gitRequests, animationDuration);
            
            previousStats = stats;

        } catch (error) {
            console.error('获取统计数据时出错:', error);
            // 在有错误时显示错误信息
            if (totalRequestsEl.classList.contains('loading')) {
                totalRequestsEl.textContent = '加载失败';
                totalRequestsEl.classList.remove('loading');
            }
        }
    }

    // 启动统计数据更新
    setInterval(updateStats, 2000);
    updateStats(); // Initial call
});