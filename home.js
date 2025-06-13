document.addEventListener('DOMContentLoaded', () => {
    // --- Particle Background (Copied from original script.js) ---
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
                this.vx *= 0.95;
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

    // --- Proxy Form Logic ---
    const proxyForm = document.getElementById('proxy-form');
    const urlInput = document.getElementById('url-input');

    proxyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        let url = urlInput.value.trim();

        if (!url) {
            return;
        }

        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        window.location.href = `/${url}`;
    });

    window.addEventListener('resize', resize);
    resize();
    animate();
}); 
