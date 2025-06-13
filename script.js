document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('background-canvas');
    const ctx = canvas.getContext('2d');

    let width, height;
    let particles = [];
    const PARTICLE_COUNT = 150;
    
    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(new Particle());
        }
    }

    class Particle {
        constructor(isBurst = false) {
            this.isBurst = isBurst;
            if (isBurst) {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 4 + 2;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
                this.lifespan = 60; // Frames
                this.radius = Math.random() * 2 + 1;
            } else {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = Math.random() * 0.3 - 0.15;
                this.vy = Math.random() * 0.3 - 0.15;
                this.radius = Math.random() * 1.5 + 0.5;
            }
        }

        update() {
            if (this.isBurst) {
                this.lifespan--;
                this.vx *= 0.95; // Damping
                this.vy *= 0.95;
            }
            this.x += this.vx;
            this.y += this.vy;

            if (!this.isBurst) {
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;
            }
        }

        draw() {
            const alpha = this.isBurst ? Math.max(0, this.lifespan / 60) : 0.7;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fill();
        }
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        particles = particles.filter(p => !p.isBurst || p.lifespan > 0);

        for (const particle of particles) {
            particle.update();
            particle.draw();
        }

        requestAnimationFrame(animate);
    }
    
    // --- Statistics Fetching ---
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
            if (!response.ok) return;
            const stats = await response.json();

            const isFirstLoad = totalRequestsEl.classList.contains('loading');
            const animationDuration = isFirstLoad ? 700 : 400; // Longer animation on first load

            animateValue(totalRequestsEl, previousStats.totalRequests, stats.totalRequests, animationDuration);
            animateValue(cacheHitsEl, previousStats.cacheHits, stats.cacheHits, animationDuration);
            animateValue(dataProxiedEl, previousStats.proxiedBytes, stats.proxiedBytes, animationDuration, true);
            animateValue(gitRequestsEl, previousStats.gitRequests, stats.gitRequests, animationDuration);
            
            // "Particle Burst" effect on new request
            if (!isFirstLoad && stats.totalRequests > previousStats.totalRequests) {
                for(let i = 0; i < 15; i++) {
                    particles.push(new Particle(true));
                }
            }
            previousStats = stats;

        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    window.addEventListener('resize', resize);
    resize();
    animate();
    setInterval(updateStats, 2000);
    updateStats(); // Initial call
}); 