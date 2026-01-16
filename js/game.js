/**
 * Game - Raycasting engine using actual textures
 * Ported from Andrew Lim's SDL2 Raycasting Engine
 */

const GITHUB_RAW = 'https://raw.githubusercontent.com/andrew-lim/sdl2-raycast/master/res/';

class Game {
    constructor() {
        this.displayWidth = 800;
        this.displayHeight = 600;
        this.stripWidth = 2;

        this.TILE_SIZE = 64;
        this.TEXTURE_SIZE = 128;  // Actual texture size in atlas (256x512 = 4 textures of 256x128)
        this.FOV_DEGREES = 60;
        this.FOV_RADIANS = this.FOV_DEGREES * Math.PI / 180;

        this.numRays = Math.ceil(this.displayWidth / this.stripWidth);
        this.viewDist = Raycaster.screenDistance(this.displayWidth, this.FOV_RADIANS);

        this.player = {
            x: 0, y: 0, z: 0, rot: 0,
            moveSpeed: 4,
            rotSpeed: 0.05
        };

        this.pitch = 0;
        this.keys = {};
        this.showMinimap = true;
        this.doors = {};
        this.sprites = [];
        this.raycaster = null;

        this.canvas = null;
        this.ctx = null;

        // Textures loaded from GitHub
        this.wallsImage = null;
        this.wallsImageDark = null;
        this.floorImage = null;
        this.ceilingImage = null;
        this.skyImage = null;
        this.spriteImages = {};
        this.gatesImage = null;

        this.zBuffer = new Float32Array(this.displayWidth);
        this.texturesLoaded = false;

        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsTime = 0;
    }

    async loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${url}`));
            img.src = url;
        });
    }

    // Remove color key background (transparency)
    // C++ uses SDL_MapRGB with (152, 0, 136) - a dark purple, not pure magenta
    makeTransparent(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Color key from C++ code: RGB(152, 0, 136)
        const keyR = 152, keyG = 0, keyB = 136;
        const tolerance = 10;  // Small tolerance for compression artifacts

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Check if pixel matches color key (with tolerance)
            if (Math.abs(r - keyR) <= tolerance &&
                Math.abs(g - keyG) <= tolerance &&
                Math.abs(b - keyB) <= tolerance) {
                // Set to fully transparent
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
                data[i + 3] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    async loadTextures() {
        try {
            console.log('Loading textures from GitHub...');

            // Load wall textures (texture atlas - vertical 64x256)
            this.wallsImage = await this.loadImage(GITHUB_RAW + 'walls4.bmp');
            this.wallsImageDark = await this.loadImage(GITHUB_RAW + 'walls4dark.bmp');
            console.log(`Wall atlas (light): ${this.wallsImage.width}x${this.wallsImage.height}`);
            console.log(`Wall atlas (dark): ${this.wallsImageDark.width}x${this.wallsImageDark.height}`);

            // Load floor/ceiling
            this.floorImage = await this.loadImage(GITHUB_RAW + 'mossycobble.bmp');
            this.ceilingImage = await this.loadImage(GITHUB_RAW + 'default_brick.bmp');

            // Load sky
            this.skyImage = await this.loadImage(GITHUB_RAW + 'skybox2.bmp');

            // Load sprites and remove magenta background
            let spriteImg = await this.loadImage(GITHUB_RAW + 'tree.bmp');
            this.spriteImages.barrel = this.makeTransparent(spriteImg);

            spriteImg = await this.loadImage(GITHUB_RAW + 'skeleton.bmp');
            this.spriteImages.enemy1 = this.makeTransparent(spriteImg);

            spriteImg = await this.loadImage(GITHUB_RAW + 'druid.bmp');
            this.spriteImages.enemy2 = this.makeTransparent(spriteImg);

            // Load door
            this.gatesImage = await this.loadImage(GITHUB_RAW + 'gates.bmp');

            console.log('All textures loaded!');
            this.texturesLoaded = true;
        } catch (e) {
            console.error('Failed to load textures:', e);
            // Create fallback textures
            this.createFallbackTextures();
            this.texturesLoaded = true;
        }
    }

    createFallbackTextures() {
        // Simple colored fallback textures
        const createColorTexture = (color, size = 64) => {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const ctx = c.getContext('2d');
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, size, size);
            return c;
        };

        this.wallsImage = this.createWallAtlas();
        this.wallsImageDark = this.createWallAtlas(true);
        this.floorImage = createColorTexture('#4a3728');
        this.ceilingImage = createColorTexture('#3a3a3a');
        this.skyImage = createColorTexture('#001144', 256);
        this.spriteImages.barrel = createColorTexture('#8B4513');
        this.gatesImage = createColorTexture('#654321');
    }

    createWallAtlas(dark = false) {
        // Create a 64x256 texture atlas (4 wall types stacked vertically)
        const c = document.createElement('canvas');
        c.width = 64;
        c.height = 256;
        const ctx = c.getContext('2d');

        const colors = dark
            ? ['#5a3a1a', '#4a4a4a', '#5a1a1a', '#2a3a3a']
            : ['#8B5A2B', '#707070', '#8B2323', '#4A5A5A'];

        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = colors[i];
            ctx.fillRect(0, i * 64, 64, 64);

            // Add brick pattern
            ctx.fillStyle = dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)';
            for (let y = i * 64; y < (i + 1) * 64; y += 16) {
                ctx.fillRect(0, y, 64, 2);
            }
            for (let row = 0; row < 4; row++) {
                const offset = (row % 2) * 16;
                for (let x = offset; x < 64; x += 32) {
                    ctx.fillRect(x, i * 64 + row * 16, 2, 16);
                }
            }
        }
        return c;
    }

    async init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        // Load textures first
        await this.loadTextures();

        // Initialize raycaster
        this.raycaster = new Raycaster(MAP_WIDTH, MAP_HEIGHT, this.TILE_SIZE);
        this.raycaster.createGrids(MAP_WIDTH, MAP_HEIGHT, 2, this.TILE_SIZE);
        this.raycaster.grids[0] = flattenMap(g_map);
        this.raycaster.grids[1] = flattenMap(g_map2);

        this.initSprites();
        this.setupInput();

        this.player.x = 2.5 * this.TILE_SIZE;
        this.player.y = 2.5 * this.TILE_SIZE;
        this.player.rot = 0;
    }

    initSprites() {
        const spriteTypes = ['barrel', 'enemy1', 'enemy2'];
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const type = g_spritemap[y][x];
                if (type > 0) {
                    const s = new Sprite();
                    s.x = (x + 0.5) * this.TILE_SIZE;
                    s.y = (y + 0.5) * this.TILE_SIZE;
                    s.type = spriteTypes[(type - 1) % spriteTypes.length];
                    s.w = this.TILE_SIZE;
                    s.h = this.TILE_SIZE;
                    this.sprites.push(s);
                }
            }
        }
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'KeyM') {
                this.showMinimap = !this.showMinimap;
                this.minimapCanvas.style.display = this.showMinimap ? 'block' : 'none';
            }
            if (e.code === 'KeyF') this.interactDoor();
            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
                e.preventDefault();
            }
        });
        document.addEventListener('keyup', (e) => this.keys[e.code] = false);
    }

    interactDoor() {
        const dist = this.TILE_SIZE * 1.5;
        const cx = this.player.x + Math.cos(this.player.rot) * dist;
        const cy = this.player.y - Math.sin(this.player.rot) * dist;
        const cellX = Math.floor(cx / this.TILE_SIZE);
        const cellY = Math.floor(cy / this.TILE_SIZE);
        const wall = this.raycaster.cellAt(cellX, cellY, 0);
        if (Raycaster.isDoor(wall)) {
            this.doors[cellX + cellY * MAP_WIDTH] = !this.doors[cellX + cellY * MAP_WIDTH];
        }
    }

    isWall(x, y) {
        const cx = Math.floor(x / this.TILE_SIZE);
        const cy = Math.floor(y / this.TILE_SIZE);
        if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) return true;
        const wall = this.raycaster.cellAt(cx, cy, 0);
        if (Raycaster.isDoor(wall)) return !this.doors[cx + cy * MAP_WIDTH];
        return wall > 0;
    }

    update() {
        const speed = this.player.moveSpeed;
        const rotSpeed = this.player.rotSpeed;

        // Arrow keys for turning
        if (this.keys['ArrowLeft']) this.player.rot += rotSpeed;
        if (this.keys['ArrowRight']) this.player.rot -= rotSpeed;

        let dx = 0, dy = 0;
        // W/S or Up/Down for forward/backward
        if (this.keys['ArrowUp'] || this.keys['KeyW']) {
            dx += Math.cos(this.player.rot) * speed;
            dy -= Math.sin(this.player.rot) * speed;
        }
        if (this.keys['ArrowDown'] || this.keys['KeyS']) {
            dx -= Math.cos(this.player.rot) * speed;
            dy += Math.sin(this.player.rot) * speed;
        }
        // A/D for strafing
        if (this.keys['KeyA']) {
            dx += Math.cos(this.player.rot + Math.PI/2) * speed;
            dy -= Math.sin(this.player.rot + Math.PI/2) * speed;
        }
        if (this.keys['KeyD']) {
            dx += Math.cos(this.player.rot - Math.PI/2) * speed;
            dy -= Math.sin(this.player.rot - Math.PI/2) * speed;
        }

        const newX = this.player.x + dx;
        const newY = this.player.y + dy;
        if (!this.isWall(newX, this.player.y)) this.player.x = newX;
        if (!this.isWall(this.player.x, newY)) this.player.y = newY;

        if (this.keys['PageUp']) this.pitch = Math.min(this.pitch + 10, 200);
        if (this.keys['PageDown']) this.pitch = Math.max(this.pitch - 10, -200);
    }

    draw() {
        if (!this.texturesLoaded) return;

        const ctx = this.ctx;
        const W = this.displayWidth;
        const H = this.displayHeight;
        const halfH = H / 2;

        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // Draw sky - scrolls with player rotation
        if (this.skyImage) {
            const skyW = this.skyImage.width;
            const skyH = this.skyImage.height;
            const skyDrawH = Math.max(1, halfH + this.pitch);

            // Calculate offset based on rotation (2x for full panorama effect)
            const offset = Math.floor(((this.player.rot / TWO_PI) * skyW * 2) % skyW);

            // Draw first portion
            const firstWidth = Math.min(skyW - offset, W);
            if (firstWidth > 0) {
                ctx.drawImage(this.skyImage,
                    offset, 0, firstWidth, skyH,
                    0, 0, firstWidth, skyDrawH);
            }

            // Draw wrapped portion if needed
            if (firstWidth < W) {
                ctx.drawImage(this.skyImage,
                    0, 0, W - firstWidth, skyH,
                    firstWidth, 0, W - firstWidth, skyDrawH);
            }
        }

        // Floor color - gradient for depth effect
        const floorGrad = ctx.createLinearGradient(0, halfH + this.pitch, 0, H);
        floorGrad.addColorStop(0, '#4a4035');
        floorGrad.addColorStop(1, '#2a2015');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, halfH + this.pitch, W, H - halfH - this.pitch);

        // Reset z-buffer
        this.zBuffer.fill(Infinity);

        // Cast rays and draw walls
        for (let strip = 0; strip < this.numRays; strip++) {
            const screenX = (this.numRays / 2 - strip) * this.stripWidth;
            const stripAngle = Math.atan(screenX / this.viewDist);
            const rayAngle = this.player.rot + stripAngle;

            let angle = rayAngle;
            while (angle < 0) angle += TWO_PI;
            while (angle >= TWO_PI) angle -= TWO_PI;

            const right = angle < Math.PI / 2 || angle > Math.PI * 1.5;
            const up = angle < Math.PI;
            const tanA = Math.tan(rayAngle);

            let hitDist = Infinity, hitHoriz = false, hitType = 0, hitTexX = 0;

            // Vertical intersections
            const vStepX = right ? this.TILE_SIZE : -this.TILE_SIZE;
            let vx = right
                ? Math.floor(this.player.x / this.TILE_SIZE) * this.TILE_SIZE + this.TILE_SIZE
                : Math.floor(this.player.x / this.TILE_SIZE) * this.TILE_SIZE - 0.001;
            let vy = this.player.y + (this.player.x - vx) * tanA;
            const vStepY = -vStepX * tanA;

            for (let i = 0; i < 20; i++) {
                const cx = Math.floor(vx / this.TILE_SIZE);
                const cy = Math.floor(vy / this.TILE_SIZE);
                if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) break;

                const wall = this.raycaster.cellAt(cx, cy, 0);
                if (wall > 0 && !Raycaster.isHorizontalDoor(wall)) {
                    if (Raycaster.isDoor(wall) && this.doors[cx + cy * MAP_WIDTH]) {
                        vx += vStepX; vy += vStepY; continue;
                    }
                    const dx = vx - this.player.x, dy = vy - this.player.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < hitDist) {
                        hitDist = dist; hitHoriz = false; hitType = wall;
                        hitTexX = vy % this.TILE_SIZE;
                        if (!right) hitTexX = this.TILE_SIZE - hitTexX;
                    }
                    break;
                }
                vx += vStepX; vy += vStepY;
            }

            // Horizontal intersections
            const hStepY = up ? -this.TILE_SIZE : this.TILE_SIZE;
            let hy = up
                ? Math.floor(this.player.y / this.TILE_SIZE) * this.TILE_SIZE - 0.001
                : Math.floor(this.player.y / this.TILE_SIZE) * this.TILE_SIZE + this.TILE_SIZE;
            let hx = this.player.x + (this.player.y - hy) / tanA;
            const hStepX = -hStepY / tanA;

            for (let i = 0; i < 20; i++) {
                const cx = Math.floor(hx / this.TILE_SIZE);
                const cy = Math.floor(hy / this.TILE_SIZE);
                if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) break;

                const wall = this.raycaster.cellAt(cx, cy, 0);
                if (wall > 0 && !Raycaster.isVerticalDoor(wall)) {
                    if (Raycaster.isDoor(wall) && this.doors[cx + cy * MAP_WIDTH]) {
                        hx += hStepX; hy += hStepY; continue;
                    }
                    const dx = hx - this.player.x, dy = hy - this.player.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < hitDist) {
                        hitDist = dist; hitHoriz = true; hitType = wall;
                        hitTexX = hx % this.TILE_SIZE;
                        if (!up) hitTexX = this.TILE_SIZE - hitTexX;
                    }
                    break;
                }
                hx += hStepX; hy += hStepY;
            }

            // Draw wall strip
            if (hitDist < Infinity && hitType > 0) {
                const correctDist = hitDist * Math.cos(stripAngle);
                const wallH = Math.floor(this.viewDist / correctDist * this.TILE_SIZE);

                const yStart = halfH - wallH / 2 + this.pitch;
                const yEnd = halfH + wallH / 2 + this.pitch;
                const drawX = strip * this.stripWidth;

                // Store z-buffer
                for (let sx = drawX; sx < drawX + this.stripWidth && sx < W; sx++) {
                    this.zBuffer[sx] = correctDist;
                }

                // Get texture coordinates
                let tex = hitHoriz ? this.wallsImageDark : this.wallsImage;

                // Calculate texture X position within the tile (scale to TEXTURE_SIZE, not full atlas)
                // C++ uses: sx = tileX / TILE_SIZE * TEXTURE_SIZE (maps 0-64 to 0-128)
                let tileTexX = Math.floor(hitTexX / this.TILE_SIZE * this.TEXTURE_SIZE);
                if (tileTexX >= this.TEXTURE_SIZE) tileTexX = this.TEXTURE_SIZE - 1;

                let srcX, srcY, srcH;

                if (Raycaster.isDoor(hitType)) {
                    tex = this.gatesImage;
                    srcX = tileTexX % tex.width;
                    srcY = 0;
                    srcH = tex.height;
                } else {
                    // Atlas is VERTICAL: 64x256 (4 textures of 64x64 stacked vertically)
                    // Wall types 1-4 map to rows 0-3 in the atlas
                    const wallIndex = (hitType - 1) % 4;
                    srcX = tileTexX;
                    srcY = wallIndex * this.TEXTURE_SIZE;
                    srcH = this.TEXTURE_SIZE;
                }

                // Draw wall strip
                ctx.drawImage(
                    tex,
                    srcX, srcY, 1, srcH,
                    drawX, yStart, this.stripWidth, yEnd - yStart
                );

                // Distance shading
                const shade = Math.min(correctDist / (this.TILE_SIZE * 10), 0.6);
                if (shade > 0.05) {
                    ctx.fillStyle = `rgba(0,0,0,${shade})`;
                    ctx.fillRect(drawX, yStart, this.stripWidth, yEnd - yStart);
                }
            }
        }

        // Draw sprites
        this.drawSprites(ctx);

        // Minimap
        if (this.showMinimap) this.drawMinimap();

        // FPS
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsTime = now;
            document.getElementById('fps').textContent = `FPS: ${this.fps}`;
        }
        document.getElementById('position').textContent = `X:${Math.floor(this.player.x)} Y:${Math.floor(this.player.y)}`;
    }

    drawSprites(ctx) {
        const spriteData = [];
        for (const s of this.sprites) {
            const dx = s.x - this.player.x;
            const dy = s.y - this.player.y;
            spriteData.push({ sprite: s, dist: Math.sqrt(dx*dx + dy*dy), angle: Math.atan2(-dy, dx) });
        }
        spriteData.sort((a, b) => b.dist - a.dist);

        const halfH = this.displayHeight / 2;

        for (const { sprite, dist, angle } of spriteData) {
            let angleDiff = this.player.rot - angle;
            while (angleDiff > Math.PI) angleDiff -= TWO_PI;
            while (angleDiff < -Math.PI) angleDiff += TWO_PI;

            if (Math.abs(angleDiff) > this.FOV_RADIANS / 2 + 0.3) continue;

            const tex = this.spriteImages[sprite.type] || this.spriteImages.barrel;
            if (!tex) continue;

            const screenX = this.displayWidth / 2 + Math.tan(angleDiff) * this.viewDist;
            const size = Math.floor(this.viewDist / dist * sprite.h);
            const drawX = Math.floor(screenX - size / 2);
            const drawY = Math.floor(halfH - size / 2 + this.pitch);

            // Simple z-buffer check (center of sprite)
            const centerX = Math.floor(screenX);
            if (centerX >= 0 && centerX < this.displayWidth && dist < this.zBuffer[centerX]) {
                // Draw sprite at full brightness (C++ doesn't apply fog to sprites)
                ctx.drawImage(tex, drawX, drawY, size, size);
            }
        }
    }

    drawMinimap() {
        const ctx = this.minimapCtx;
        const scale = this.minimapCanvas.width / (MAP_WIDTH * this.TILE_SIZE);
        const ts = this.TILE_SIZE * scale;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);

        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const w = g_map[y][x];
                if (w > 0) {
                    ctx.fillStyle = Raycaster.isDoor(w)
                        ? (this.doors[x + y * MAP_WIDTH] ? '#432' : '#864')
                        : '#555';
                    ctx.fillRect(x * ts, y * ts, ts, ts);
                }
            }
        }

        ctx.fillStyle = '#0f0';
        for (const s of this.sprites) {
            ctx.beginPath();
            ctx.arc(s.x * scale, s.y * scale, 2, 0, TWO_PI);
            ctx.fill();
        }

        const px = this.player.x * scale;
        const py = this.player.y * scale;
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, TWO_PI);
        ctx.fill();

        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(this.player.rot) * 12, py - Math.sin(this.player.rot) * 12);
        ctx.stroke();
    }

    run() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.run());
    }

    async start() {
        await this.init();
        this.run();
    }
}
