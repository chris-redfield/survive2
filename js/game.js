/**
 * Game - Raycasting engine using actual textures
 * Ported from Andrew Lim's SDL2 Raycasting Engine
 */

const ASSETS_PATH = 'assets/';

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
            rotSpeed: 0.05,
            // Jump physics
            velocityZ: 0,
            groundZ: 0,
            jumpStrength: 12,
            gravity: 0.5
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

        this.DEBUG_MODE = false;  // Set to true to enable debug logging

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

    // Get pixel data from image for direct sampling
    getImageData(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
    }

    // Create seamless sky by adding horizontally flipped version
    createSeamlessSky(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * 2;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Draw original image on the left
        ctx.drawImage(img, 0, 0);

        // Draw horizontally flipped image on the right
        ctx.save();
        ctx.translate(img.width * 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();

        console.log(`Seamless sky created: ${canvas.width}x${canvas.height}`);
        return canvas;
    }

    async loadTextures() {
        try {
            console.log('Loading textures...');

            // Load wall textures (texture atlas - vertical 64x256)
            this.wallsImage = await this.loadImage(ASSETS_PATH + 'walls4.bmp');
            this.wallsImageDark = await this.loadImage(ASSETS_PATH + 'walls4dark.bmp');
            console.log(`Wall atlas (light): ${this.wallsImage.width}x${this.wallsImage.height}`);
            console.log(`Wall atlas (dark): ${this.wallsImageDark.width}x${this.wallsImageDark.height}`);

            // Load floor/ceiling
            this.floorImage = await this.loadImage(ASSETS_PATH + 'mossycobble.bmp');
            this.ceilingImage = await this.loadImage(ASSETS_PATH + 'default_brick.bmp');

            // Load sky (use night sky image with horizontal flip for seamless wrapping)
            const skyImg = await this.loadImage(ASSETS_PATH + 'night_sky_2.png');
            this.skyImage = this.createSeamlessSky(skyImg);

            // Load sprites and remove magenta background
            let spriteImg = await this.loadImage(ASSETS_PATH + 'tree.bmp');
            this.spriteImages.barrel = this.makeTransparent(spriteImg);

            spriteImg = await this.loadImage(ASSETS_PATH + 'skeleton.bmp');
            this.spriteImages.enemy1 = this.makeTransparent(spriteImg);

            spriteImg = await this.loadImage(ASSETS_PATH + 'druid.bmp');
            this.spriteImages.enemy2 = this.makeTransparent(spriteImg);

            // Load door and remove magenta background
            const gatesImg = await this.loadImage(ASSETS_PATH + 'gates.bmp');
            this.gatesImage = this.makeTransparent(gatesImg);

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
        // Keyboard controls
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

        // Mouse look controls with pointer lock
        this.mouseSensitivity = 0.002;
        this.pitchSensitivity = 0.3;
        this.maxPitch = 300;

        // Click canvas to enable mouse look
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });

        // Handle mouse movement when pointer is locked
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.canvas) {
                // Horizontal movement = rotation
                this.player.rot -= e.movementX * this.mouseSensitivity;

                // Vertical movement = pitch (look up/down)
                this.pitch -= e.movementY * this.pitchSensitivity;
                this.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitch));
            }
        });

        // Show instruction when pointer lock changes
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === this.canvas) {
                console.log('Mouse look enabled - Press ESC to release');
            }
        });
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

        // Jump physics
        if (this.keys['Space'] && this.player.z <= this.player.groundZ + 1) {
            this.player.velocityZ = this.player.jumpStrength;
        }
        this.player.velocityZ -= this.player.gravity;
        this.player.z += this.player.velocityZ;
        if (this.player.z <= this.player.groundZ) {
            this.player.z = this.player.groundZ;
            this.player.velocityZ = 0;
        }
    }

    draw() {
        if (!this.texturesLoaded) return;

        const ctx = this.ctx;
        const W = this.displayWidth;
        const H = this.displayHeight;
        const halfH = H / 2;

        // Clear with floor color as base (prevents gaps when jumping)
        const horizonY = halfH + this.pitch;
        const floorGrad = ctx.createLinearGradient(0, halfH, 0, H);
        floorGrad.addColorStop(0, '#4a4035');
        floorGrad.addColorStop(1, '#2a2015');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, 0, W, H);

        // Draw sky on top - fixed height with clipping
        if (this.skyImage) {
            const skyW = this.skyImage.width;
            const skyH = this.skyImage.height;

            // Fixed sky height (doesn't stretch with pitch)
            const fixedSkyHeight = H * 0.95;
            const visibleSkyHeight = Math.max(0, Math.min(fixedSkyHeight, horizonY));

            // Fill background for sky area (dark for night sky)
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, W, Math.max(0, horizonY));

            if (visibleSkyHeight > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, W, visibleSkyHeight);
                ctx.clip();

                // Calculate horizontal offset based on rotation (25% slower parallax, reversed direction)
                let xOffset = -(this.player.rot / TWO_PI) * skyW * 0.75;
                xOffset = ((xOffset % skyW) + skyW) % skyW;

                // Draw sky with seamless horizontal wrapping at fixed height
                ctx.drawImage(this.skyImage,
                    xOffset, 0, skyW - xOffset, skyH,
                    0, 0, W * (1 - xOffset / skyW), fixedSkyHeight
                );

                if (xOffset > 0) {
                    ctx.drawImage(this.skyImage,
                        0, 0, xOffset, skyH,
                        W * (1 - xOffset / skyW), 0, W * (xOffset / skyW), fixedSkyHeight
                    );
                }

                ctx.restore();
            }
        }

        // Reset z-buffer
        this.zBuffer.fill(Infinity);

        // Cast rays and draw walls
        const cameraZ = this.TILE_SIZE / 2 + this.player.z;
        const horizon = halfH + this.pitch;
        // Only use multi-hit when jumping (performance optimization)
        const canSeeOverWalls = this.player.z > 5;

        // Collect all door hits for rendering after sprites
        const allDoorHits = [];
        // Track rendered wall segments per strip for door clipping
        const wallSegments = [];

        for (let strip = 0; strip < this.numRays; strip++) {
            wallSegments[strip] = [];
            const screenX = (this.numRays / 2 - strip) * this.stripWidth;
            const stripAngle = Math.atan(screenX / this.viewDist);
            const rayAngle = this.player.rot + stripAngle;
            const drawX = strip * this.stripWidth;

            let angle = rayAngle;
            while (angle < 0) angle += TWO_PI;
            while (angle >= TWO_PI) angle -= TWO_PI;

            // Unified DDA - single pass through cells in ray order
            const hits = [];
            const dirX = Math.cos(rayAngle);
            const dirY = -Math.sin(rayAngle);

            // Starting cell
            let cx = Math.floor(this.player.x / this.TILE_SIZE);
            let cy = Math.floor(this.player.y / this.TILE_SIZE);

            // Step directions
            const stepX = dirX >= 0 ? 1 : -1;
            const stepY = dirY >= 0 ? 1 : -1;

            // Distance to cross one full cell
            const tDeltaX = dirX !== 0 ? Math.abs(this.TILE_SIZE / dirX) : Infinity;
            const tDeltaY = dirY !== 0 ? Math.abs(this.TILE_SIZE / dirY) : Infinity;

            // Distance to first cell boundary
            let tMaxX, tMaxY;
            if (dirX > 0) {
                tMaxX = ((cx + 1) * this.TILE_SIZE - this.player.x) / dirX;
            } else if (dirX < 0) {
                tMaxX = (cx * this.TILE_SIZE - this.player.x) / dirX;
            } else {
                tMaxX = Infinity;
            }
            if (dirY > 0) {
                tMaxY = ((cy + 1) * this.TILE_SIZE - this.player.y) / dirY;
            } else if (dirY < 0) {
                tMaxY = (cy * this.TILE_SIZE - this.player.y) / dirY;
            } else {
                tMaxY = Infinity;
            }

            // Check if starting cell is a wall (for each level)
            const startKey = cx + cy * MAP_WIDTH;
            const numLevels = this.raycaster.grids.length;
            let prevWalls = [];
            for (let level = 0; level < numLevels; level++) {
                const startWall = this.raycaster.cellAt(cx, cy, level);
                prevWalls[level] = (startWall > 0 && !(Raycaster.isDoor(startWall) && this.doors[startKey])) ? startWall : 0;
            }

            // DDA stepping - continue until we exit the map or hit a wall
            while (true) {
                // Which boundary is closer?
                const crossVertical = tMaxX < tMaxY;
                const crossDist = crossVertical ? tMaxX : tMaxY;

                // Calculate hit position at the boundary
                const hitX = this.player.x + dirX * crossDist;
                const hitY = this.player.y + dirY * crossDist;

                // Step to next cell
                if (crossVertical) {
                    cx += stepX;
                    tMaxX += tDeltaX;
                } else {
                    cy += stepY;
                    tMaxY += tDeltaY;
                }

                // Bounds check - exit when ray leaves the map
                if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) break;

                // Check walls at all levels (0 = ground, 1 = upper)
                const cellKey = cx + cy * MAP_WIDTH;
                const numLevels = this.raycaster.grids.length;

                for (let level = 0; level < numLevels; level++) {
                    const wall = this.raycaster.cellAt(cx, cy, level);
                    const isOpenDoor = Raycaster.isDoor(wall) && this.doors[cellKey];
                    const isSolid = wall > 0 && !isOpenDoor;

                    // Front face: entering wall from empty space
                    if (isSolid && prevWalls[level] === 0) {
                        let texX;
                        if (crossVertical) {
                            // Crossed a vertical boundary (east/west face)
                            texX = ((hitY % this.TILE_SIZE) + this.TILE_SIZE) % this.TILE_SIZE;
                            if (stepX < 0) texX = this.TILE_SIZE - texX;
                        } else {
                            // Crossed a horizontal boundary (north/south face)
                            texX = ((hitX % this.TILE_SIZE) + this.TILE_SIZE) % this.TILE_SIZE;
                            if (stepY > 0) texX = this.TILE_SIZE - texX;
                        }
                        hits.push({ dist: crossDist, horiz: !crossVertical, type: wall, texX, level });
                    }

                    // Back face: exiting wall into empty space
                    if (!isSolid && prevWalls[level] > 0 && canSeeOverWalls) {
                        let texX;
                        if (crossVertical) {
                            texX = ((hitY % this.TILE_SIZE) + this.TILE_SIZE) % this.TILE_SIZE;
                            if (stepX > 0) texX = this.TILE_SIZE - texX;
                        } else {
                            texX = ((hitX % this.TILE_SIZE) + this.TILE_SIZE) % this.TILE_SIZE;
                            if (stepY < 0) texX = this.TILE_SIZE - texX;
                        }
                        hits.push({ dist: crossDist, horiz: !crossVertical, type: prevWalls[level], texX, level });
                    }

                    // For doors, keep prevWalls as 0 so walls behind them are detected
                    // This allows the ray to register walls behind transparent doors
                    prevWalls[level] = (isSolid && !Raycaster.isDoor(wall)) ? wall : 0;
                }

                // Break if we hit a solid wall at ground level and can't see over
                // Continue past all doors (open or closed) to render walls behind transparent parts
                const groundWall = this.raycaster.cellAt(cx, cy, 0);
                const groundSolid = groundWall > 0 && !Raycaster.isDoor(groundWall);
                if (groundSolid && !canSeeOverWalls) break;
            }

            // Sort hits by distance (far to near) like the original C++ code
            // Far walls render first, then near walls render on top
            // This allows transparent door pixels to show walls behind
            hits.sort((a, b) => {
                if (a.dist !== b.dist) return b.dist - a.dist; // Far to near
                return (b.level || 0) - (a.level || 0); // Higher levels first
            });

            // DEBUG: Log hits for center strip (only when DEBUG_MODE is true)
            if (this.DEBUG_MODE && strip === Math.floor(this.numRays / 2) && hits.length > 0 && this.frameCount % 60 === 0) {
                const debugHits = hits.map(h => `L${h.level}@${h.dist.toFixed(0)}`).join(', ');
                console.log(`Center ray hits: ${debugHits}`);
            }

            // Collect door hits for second pass (rendered after sprites)
            const doorHits = [];

            // PASS 1: Process non-door hits from far to near (painter's algorithm)
            // Far walls render first, then near walls overwrite them
            for (const hit of hits) {
                const hitIsDoor = Raycaster.isDoor(hit.type);

                // Defer door rendering to after sprites
                if (hitIsDoor) {
                    doorHits.push({ hit, strip, drawX, stripAngle });
                    continue;
                }

                const correctDist = hit.dist * Math.cos(stripAngle);
                const projScale = this.viewDist / correctDist;

                // Wall position based on level (level 0 = ground, level 1 = upper, etc.)
                const level = hit.level || 0;
                const levelBottom = level * this.TILE_SIZE;
                const levelTop = (level + 1) * this.TILE_SIZE;
                const wallBottom = horizon + (cameraZ - levelBottom) * projScale;
                const wallTop = horizon + (cameraZ - levelTop) * projScale;

                // Clamp to screen bounds
                const yStart = Math.max(0, Math.floor(wallTop));
                const yEnd = Math.min(H, Math.ceil(wallBottom));

                // Skip walls that are entirely off-screen
                if (yEnd <= 0 || yStart >= H) continue;

                const drawYStart = yStart;
                const drawYEnd = yEnd;

                // Store z-buffer for sprites
                if (drawYEnd >= horizon) {
                    for (let sx = drawX; sx < drawX + this.stripWidth && sx < W; sx++) {
                        if (correctDist < this.zBuffer[sx]) {
                            this.zBuffer[sx] = correctDist;
                        }
                    }
                }

                // Get texture coordinates
                const tex = hit.horiz ? this.wallsImageDark : this.wallsImage;
                let tileTexX = Math.floor(hit.texX / this.TILE_SIZE * this.TEXTURE_SIZE);
                if (tileTexX >= this.TEXTURE_SIZE) tileTexX = this.TEXTURE_SIZE - 1;

                const wallIndex = (hit.type - 1) % 4;
                const srcX = tileTexX;
                const srcY = wallIndex * this.TEXTURE_SIZE;
                const srcH = this.TEXTURE_SIZE;

                // Calculate source Y for partial wall drawing
                const wallHeight = wallBottom - wallTop;
                const srcYOffset = ((drawYStart - wallTop) / wallHeight) * srcH;
                const srcYEndCalc = ((drawYEnd - wallTop) / wallHeight) * srcH;
                const srcDrawH = srcYEndCalc - srcYOffset;

                // Draw wall strip
                if (srcDrawH > 0 && drawYEnd > drawYStart) {
                    ctx.drawImage(
                        tex,
                        srcX, srcY + srcYOffset, 1, srcDrawH,
                        drawX, drawYStart, this.stripWidth, drawYEnd - drawYStart
                    );

                    // Distance shading
                    const shade = Math.min(correctDist / (this.TILE_SIZE * 10), 0.6);
                    if (shade > 0.05) {
                        ctx.fillStyle = `rgba(0,0,0,${shade})`;
                        ctx.fillRect(drawX, drawYStart, this.stripWidth, drawYEnd - drawYStart);
                    }

                    // Record wall segment for door clipping
                    wallSegments[strip].push({ dist: correctDist, yStart: drawYStart, yEnd: drawYEnd });
                }
            }

            // Store door hits for pass 2
            allDoorHits.push(...doorHits);
        }

        // Draw sprites (after walls, before doors)
        this.drawSprites(ctx);

        // PASS 2: Render doors on top of sprites
        // This allows door's opaque parts to cover sprites, while transparent parts show through
        // Clip doors to only render portions not occluded by closer walls
        for (const { hit, strip, drawX, stripAngle } of allDoorHits) {
            const correctDist = hit.dist * Math.cos(stripAngle);
            const projScale = this.viewDist / correctDist;

            const level = hit.level || 0;
            const levelBottom = level * this.TILE_SIZE;
            const levelTop = (level + 1) * this.TILE_SIZE;
            const doorBottom = horizon + (cameraZ - levelBottom) * projScale;
            const doorTop = horizon + (cameraZ - levelTop) * projScale;

            let yStart = Math.max(0, Math.floor(doorTop));
            let yEnd = Math.min(H, Math.ceil(doorBottom));

            if (yEnd <= 0 || yStart >= H) continue;

            // Clip door against closer wall segments
            // Find the closest wall that overlaps and clip the door to the visible region
            for (const seg of wallSegments[strip]) {
                if (seg.dist < correctDist) {
                    // Check for overlap
                    if (seg.yStart < yEnd && seg.yEnd > yStart) {
                        // Wall overlaps with door - clip the door
                        if (seg.yStart <= yStart && seg.yEnd >= yEnd) {
                            // Wall fully covers door - skip entirely
                            yStart = yEnd;
                            break;
                        } else if (seg.yStart <= yStart) {
                            // Wall covers top portion - render bottom part only
                            yStart = Math.max(yStart, seg.yEnd);
                        } else if (seg.yEnd >= yEnd) {
                            // Wall covers bottom portion - render top part only
                            yEnd = Math.min(yEnd, seg.yStart);
                        }
                        // Note: if wall is in the middle, we'd need two draws
                        // For simplicity, we just render the larger visible region
                    }
                }
            }

            if (yEnd <= yStart) continue;

            const drawYStart = yStart;
            const drawYEnd = yEnd;

            let tileTexX = Math.floor(hit.texX / this.TILE_SIZE * this.TEXTURE_SIZE);
            if (tileTexX >= this.TEXTURE_SIZE) tileTexX = this.TEXTURE_SIZE - 1;

            const tex = this.gatesImage;
            const srcX = tileTexX % tex.width;
            const srcY = 0;
            const srcH = tex.height;

            const doorHeight = doorBottom - doorTop;
            const srcYOffset = ((drawYStart - doorTop) / doorHeight) * srcH;
            const srcYEndCalc = ((drawYEnd - doorTop) / doorHeight) * srcH;
            const srcDrawH = srcYEndCalc - srcYOffset;

            if (srcDrawH > 0 && drawYEnd > drawYStart) {
                ctx.drawImage(
                    tex,
                    srcX, srcY + srcYOffset, 1, srcDrawH,
                    drawX, drawYStart, this.stripWidth, drawYEnd - drawYStart
                );

                // Distance shading for doors
                const shade = Math.min(correctDist / (this.TILE_SIZE * 10), 0.6);
                if (shade > 0.05) {
                    ctx.fillStyle = `rgba(0,0,0,${shade})`;
                    ctx.fillRect(drawX, drawYStart, this.stripWidth, drawYEnd - drawYStart);
                }
            }
        }

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

            // Height-based projection (same as walls)
            const projScale = this.viewDist / dist;
            const horizon = halfH + this.pitch;
            const cameraZ = this.TILE_SIZE / 2 + this.player.z;

            // Sprite bottom at floor (z=0), sprite top at sprite.h
            const spriteBottom = horizon + cameraZ * projScale;
            const spriteTop = horizon + (cameraZ - sprite.h) * projScale;

            const screenX = this.displayWidth / 2 + Math.tan(angleDiff) * this.viewDist;
            const size = Math.floor(spriteBottom - spriteTop);
            const drawX = Math.floor(screenX - size / 2);
            const drawY = Math.floor(spriteTop);

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
