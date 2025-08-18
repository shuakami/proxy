// Language switching functionality
class LanguageManager {
    constructor() {
        this.currentLang = localStorage.getItem('language') || 'zh';
        this.translations = {
            en: {
                'page.title': 'Proxy V2 - Universal Accelerator',
                'status.title': 'Service Status - Proxy V2',
                'nav.home': 'Home',
                'nav.status': 'Service Status',
                'nav.source': 'Source Code',
                'home.subtitle': 'A minimal, high-performance universal acceleration proxy.',
                'home.input.placeholder': 'Enter URL to proxy, e.g.: https://github.com',
                'docs.title': 'How to Use',
                'docs.description': 'This service can proxy and accelerate any URL. Usage is very simple:',
                'docs.example': 'For example, to proxy GitHub resources, you can construct the URL like this:',
                'docs.benefits': 'This is very useful for accelerating access to slow foreign resources or solving network accessibility issues.',
                'nodes.title': 'Available Nodes',
                'nodes.description': 'Proxy currently has two nodes:',
                'nodes.jp': 'JP (Tokyo, Japan)',
                'nodes.hk': 'HK (Hong Kong, China)',
                'nodes.and': 'and',
                'nodes.choice': 'You can choose the best node according to your network environment, data is now synchronized between nodes.',
                'status.heading': 'Service Status',
                'status.subtitle': 'Real-time monitoring of Proxy service status and statistics',
                'status.realtime': 'Real-time Statistics',
                'status.stats.totalRequests': 'Total Requests',
                'status.stats.cacheHits': 'Cache Hits',
                'status.stats.gitRequests': 'Git Operations',
                'status.stats.dataProxied': 'Data Transferred',
                'statusBar.source': 'Source',
                'statusBar.status': 'Status: Online',
                'statusBar.powered': 'Powered by Shuakami'
            },
            zh: {
                'page.title': 'Proxy V2 - 通用加速器',
                'status.title': '服务状态 - Proxy V2',
                'nav.home': '主页',
                'nav.status': '服务状态',
                'nav.source': '项目源码',
                'home.subtitle': '一个极简、高性能的通用加速代理。',
                'home.input.placeholder': '输入需要代理的 URL，例如：https://github.com',
                'docs.title': '如何使用',
                'docs.description': '本服务可以代理和加速任何 URL。使用方法非常简单：',
                'docs.example': '例如，要代理 GitHub 的资源，您可以这样构造 URL：',
                'docs.benefits': '这对于加速访问速度较慢的国外资源、或是解决网络访问性问题非常有用。',
                'nodes.title': '可用节点',
                'nodes.description': 'Proxy 目前有两个节点：',
                'nodes.jp': 'JP (日本东京)',
                'nodes.hk': 'HK (中国香港)',
                'nodes.and': '和',
                'nodes.choice': '可根据网络环境选择最佳节点，数据已支持互通。',
                'status.heading': '服务状态',
                'status.subtitle': '实时监控 Proxy 服务运行状态和统计数据',
                'status.realtime': '实时统计',
                'status.stats.totalRequests': '总请求数',
                'status.stats.cacheHits': '缓存命中',
                'status.stats.gitRequests': 'Git 操作',
                'status.stats.dataProxied': '数据传输',
                'statusBar.source': 'Source',
                'statusBar.status': '服务器在线',
                'statusBar.powered': 'Powered by Shuakami'
            }
        };
        
        this.init();
    }

    init() {
        this.setLanguage(this.currentLang);
        this.bindEvents();
    }

    bindEvents() {
        // Desktop language switch
        const desktopSwitch = document.getElementById('language-switch');
        if (desktopSwitch) {
            desktopSwitch.addEventListener('click', () => this.toggleLanguage());
        }

        // Mobile language switch
        const mobileSwitch = document.getElementById('language-switch-mobile');
        if (mobileSwitch) {
            mobileSwitch.addEventListener('click', () => this.toggleLanguage());
        }

        // Mobile menu functionality
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');

        if (mobileMenuBtn && sidebar && overlay) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('mobile-open');
                overlay.classList.toggle('active');
            });

            overlay.addEventListener('click', () => {
                sidebar.classList.remove('mobile-open');
                overlay.classList.remove('active');
            });

            // Close menu when clicking nav links on mobile
            const navLinks = sidebar.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        sidebar.classList.remove('mobile-open');
                        overlay.classList.remove('active');
                    }
                });
            });
        }
    }

    toggleLanguage() {
        const newLang = this.currentLang === 'en' ? 'zh' : 'en';
        this.setLanguage(newLang);
    }

    setLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem('language', lang);
        
        // Update HTML lang attribute
        document.documentElement.lang = lang;
        document.documentElement.setAttribute('data-lang', lang);
        
        // Update language switch buttons
        const switchButtons = document.querySelectorAll('#language-switch, #language-switch-mobile');
        switchButtons.forEach(btn => {
            btn.textContent = lang.toUpperCase();
        });
        
        // Update all translatable elements
        this.updateTranslations();
    }

    updateTranslations() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (this.translations[this.currentLang] && this.translations[this.currentLang][key]) {
                element.textContent = this.translations[this.currentLang][key];
            }
        });

        // Update placeholder for input elements
        const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
        placeholderElements.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (this.translations[this.currentLang] && this.translations[this.currentLang][key]) {
                element.placeholder = this.translations[this.currentLang][key];
            }
        });

        // Update document title
        const titleElement = document.querySelector('title[data-i18n]');
        if (titleElement) {
            const key = titleElement.getAttribute('data-i18n');
            if (this.translations[this.currentLang] && this.translations[this.currentLang][key]) {
                document.title = this.translations[this.currentLang][key];
            }
        }
    }
}

// Initialize language manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LanguageManager();
});