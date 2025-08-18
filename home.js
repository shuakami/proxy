document.addEventListener('DOMContentLoaded', () => {
    // Initialize Feather Icons
    feather.replace();

    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const proxyForm = document.getElementById('proxy-form');
    const urlInput = document.getElementById('url-input');

    // Reset input state when page loads (fixes issue when user returns from proxy page)
    function resetInputState() {
        if (urlInput) {
            urlInput.disabled = false;
            urlInput.classList.remove('loading');
            urlInput.value = ''; // Clear any existing value
        }
    }

    // Call reset function immediately
    resetInputState();

    // Reset input state when page becomes visible (e.g., user switches back to tab)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            resetInputState();
        }
    });

    // Reset input state when window regains focus
    window.addEventListener('focus', resetInputState);

    // Mobile menu elements
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileOverlay = document.getElementById('mobile-overlay');

    // --- Status Bar Node Detection & Dynamic URL Update ---
    function updateStatusBarNode() {
        const hostname = window.location.hostname;
        let nodeInfo = '';
        let flagClass = '';
        let currentDomain = '';
        
        if (hostname.includes('hk.') || hostname.includes('hk.proxy.sdjz.wiki') || hostname === 'hk.proxy.sdjz.wiki') {
            nodeInfo = 'HK (Hong Kong)';
            flagClass = 'fi-hk';
            currentDomain = 'hk.proxy.sdjz.wiki';
        } else if (hostname.includes('proxy.sdjz.wiki') || hostname === 'proxy.sdjz.wiki') {
            nodeInfo = 'JP (Tokyo)';
            flagClass = 'fi-jp';
            currentDomain = 'proxy.sdjz.wiki';
        } else {
            nodeInfo = 'Local Dev';
            flagClass = '';
            currentDomain = hostname + (window.location.port ? ':' + window.location.port : '');
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

        // Update example URL dynamically
        const exampleUrlElement = document.getElementById('example-url');
        if (exampleUrlElement) {
            const protocol = window.location.protocol; // http: or https:
            exampleUrlElement.textContent = `${protocol}//${currentDomain}/https://github.com/some/resource`;
        }
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
            console.log('Mobile menu button clicked'); // Debug log
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

    // --- Proxy Form Submission ---
    if (proxyForm) {
        proxyForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const url = urlInput.value.trim();
            if (url) {
                // Add loading effect to input
                urlInput.classList.add('loading');
                urlInput.disabled = true;
                
                // Simulate processing time for better UX
                setTimeout(() => {
                    // Construct the proxied URL and navigate to it.
                    // It's better to navigate directly than to use fetch,
                    // as this correctly handles all content types and redirects.
                    window.location.href = `/${url}`;
                }, 800);
            }
        });
    }
}); 
