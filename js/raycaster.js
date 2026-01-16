/**
 * Raycaster - Core raycasting engine
 * Ported from Andrew Lim's SDL2 Raycasting Engine
 */

const TWO_PI = Math.PI * 2;

// Wall type constants
const THICK_WALL_TYPE_NONE = 0;
const THICK_WALL_TYPE_RECT = 1;
const THICK_WALL_TYPE_TRIANGLE = 2;
const THICK_WALL_TYPE_QUAD = 3;

const SLOPE_TYPE_WEST_EAST = 1;
const SLOPE_TYPE_NORTH_SOUTH = 2;

/**
 * ThinWall - Represents a line segment wall
 */
class ThinWall {
    constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0, wallType = 0, thickWall = null, wallHeight = 0) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.wallType = wallType;
        this.horizontal = false;
        this.height = wallHeight;
        this.z = 0;
        this.slope = 0;
        this.hidden = false;
        this.thickWall = thickWall;
    }

    distanceToOrigin(ix, iy) {
        const dx = this.x1 - ix;
        const dy = this.y1 - iy;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

/**
 * ThickWall - An enclosed area containing multiple ThinWalls
 */
class ThickWall {
    constructor() {
        this.type = THICK_WALL_TYPE_NONE;
        this.slopeType = 0;
        this.thinWalls = [];
        this.x = 0;
        this.y = 0;
        this.w = 0;
        this.h = 0;
        this.points = [];
        this.slope = 0;
        this.ceilingTextureID = 0;
        this.floorTextureID = 0;
        this.startHeight = 0;
        this.endHeight = 0;
        this.tallerHeight = 0;
        this.invertedSlope = false;
        this._height = 0;
        this._z = 0;
    }

    createRectThickWall(x, y, w, h, z, wallHeight) {
        this.type = THICK_WALL_TYPE_RECT;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this._z = z;
        this._height = wallHeight;

        // Create 4 thin walls for the rectangle
        this.thinWalls = [
            new ThinWall(x, y, x + w, y, 1, this, wallHeight),         // Top
            new ThinWall(x + w, y, x + w, y + h, 1, this, wallHeight), // Right
            new ThinWall(x + w, y + h, x, y + h, 1, this, wallHeight), // Bottom
            new ThinWall(x, y + h, x, y, 1, this, wallHeight)          // Left
        ];

        this.thinWalls.forEach(tw => tw.z = z);
    }

    setZ(z) {
        this._z = z;
        this.thinWalls.forEach(tw => tw.z = z);
    }

    getZ() {
        return this._z;
    }

    setHeight(height) {
        this._height = height;
        this.thinWalls.forEach(tw => tw.height = height);
    }

    getHeight() {
        return this._height;
    }

    setThinWallsType(wallType) {
        this.thinWalls.forEach(tw => tw.wallType = wallType);
    }

    containsPoint(x, y) {
        if (this.type === THICK_WALL_TYPE_RECT) {
            return Shape.pointInRect(x, y, this.x, this.y, this.w, this.h);
        } else if (this.type === THICK_WALL_TYPE_TRIANGLE && this.points.length >= 3) {
            return Shape.pointInTriangle({x, y}, this.points[0], this.points[1], this.points[2]);
        } else if (this.type === THICK_WALL_TYPE_QUAD && this.points.length >= 4) {
            return Shape.pointInQuad({x, y}, this.points[0], this.points[1], this.points[2], this.points[3]);
        }
        return false;
    }
}

/**
 * Sprite - A renderable object in the world
 */
class Sprite {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.w = 0;
        this.h = 0;
        this.level = 0;
        this.dir = 0;
        this.rot = 0;
        this.speed = 0;
        this.moveSpeed = 0;
        this.rotSpeed = 0;
        this.distance = 0;
        this.textureID = 0;
        this.cleanup = false;
        this.frameRate = 0;
        this.frame = 0;
        this.hidden = false;
        this.jumping = false;
        this.heightJumped = 0;
        this.rayhit = false;
    }
}

/**
 * RayHit - Stores collision data from a single ray
 */
class RayHit {
    constructor(worldX = 0, worldY = 0, angle = 0) {
        this.x = worldX;
        this.y = worldY;
        this.rayAngle = angle;
        this.wallX = 0;
        this.wallY = 0;
        this.wallType = 0;
        this.strip = 0;
        this.tileX = 0;
        this.squaredDistance = 0;
        this.distance = 0;
        this.correctDistance = 0;
        this.horizontal = false;
        this.level = 0;
        this.sprite = null;
        this.sortdistance = 0;
        this.thinWall = null;
        this.wallHeight = 0;
        this.invertedZ = 0;
        this.right = false;
        this.up = false;
        this.siblingWallHeight = 0;
        this.siblingDistance = 0;
        this.siblingCorrectDistance = 0;
        this.siblingThinWallZ = 0;
        this.siblingInvertedZ = 0;
    }

    copySibling(rayHit2) {
        this.siblingWallHeight = rayHit2.wallHeight;
        this.siblingDistance = rayHit2.distance;
        this.siblingCorrectDistance = rayHit2.correctDistance;
        if (rayHit2.thinWall) {
            this.siblingThinWallZ = rayHit2.thinWall.z;
        }
        this.siblingInvertedZ = rayHit2.invertedZ;
    }

    static spriteRayHit(sprite, distX, distY, stripIdx, stripAngle) {
        const rayHit = new RayHit(sprite.x, sprite.y, stripAngle);
        rayHit.strip = stripIdx;
        const blockDist = distX * distX + distY * distY;
        if (blockDist) {
            rayHit.distance = Math.sqrt(blockDist);
            rayHit.correctDistance = rayHit.distance * Math.cos(stripAngle);
        }
        rayHit.wallType = 0;
        rayHit.sprite = sprite;
        rayHit.level = sprite.level;
        sprite.rayhit = true;
        return rayHit;
    }
}

/**
 * Raycaster - The main raycasting engine class
 */
class Raycaster {
    constructor(gridWidth = 0, gridHeight = 0, tileSize = 0) {
        this.grids = [];
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.gridCount = 0;
        this.tileSize = tileSize;
    }

    createGrids(gridWidth, gridHeight, gridCount, tileSize) {
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;
        this.gridCount = gridCount;
        this.tileSize = tileSize;
        this.grids = [];
        for (let i = 0; i < gridCount; i++) {
            this.grids.push(new Array(gridWidth * gridHeight).fill(0));
        }
    }

    /**
     * Calculate the distance from the player to the projection screen
     */
    static screenDistance(screenWidth, fovRadians) {
        return (screenWidth / 2) / Math.tan(fovRadians / 2);
    }

    /**
     * Calculate the angle of a strip relative to the center of the screen
     */
    static stripAngle(screenX, screenDistance) {
        return Math.atan(screenX / screenDistance);
    }

    /**
     * Calculate the height of a wall strip on screen
     */
    static stripScreenHeight(screenDistance, correctDistance, tileSize) {
        return Math.floor(screenDistance / correctDistance * tileSize + 0.5);
    }

    /**
     * Check if door types
     */
    static isHorizontalDoor(wallType) {
        return wallType > 1500;
    }

    static isVerticalDoor(wallType) {
        return wallType > 1000 && wallType <= 1500;
    }

    static isDoor(wallType) {
        return Raycaster.isVerticalDoor(wallType) || Raycaster.isHorizontalDoor(wallType);
    }

    /**
     * Get cell value at position
     */
    cellAt(x, y, z = 0) {
        if (z < 0 || z >= this.grids.length) return 0;
        const offset = x + y * this.gridWidth;
        if (offset < 0 || offset >= this.gridWidth * this.gridHeight) return 0;
        return this.grids[z][offset];
    }

    safeCellAt(x, y, z, fallback = 0) {
        const offset = x + y * this.gridWidth;
        if (z < 0 || z >= this.gridCount || offset < 0 || offset >= this.gridWidth * this.gridHeight) {
            return fallback;
        }
        return this.grids[z][offset];
    }

    /**
     * Find sprites in a specific cell
     */
    static findSpritesInCell(sprites, cellX, cellY, tileSize) {
        const found = [];
        for (const sprite of sprites) {
            const spriteCellX = Math.floor(sprite.x / tileSize);
            const spriteCellY = Math.floor(sprite.y / tileSize);
            if (spriteCellX === cellX && spriteCellY === cellY) {
                found.push(sprite);
            }
        }
        return found;
    }

    /**
     * Check if there's space below a cell
     */
    static anySpaceBelow(grids, gridWidth, x, y, z) {
        for (let level = z - 1; level >= 0; level--) {
            const offset = x + y * gridWidth;
            if (grids[level][offset] === 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if we need to find the next wall (for multi-level support)
     */
    static needsNextWall(grids, playerZ, tileSize, gridWidth, x, y, z) {
        if (grids.length <= 1) return false;

        const playerLevel = Math.floor(playerZ / tileSize);
        const offset = x + y * gridWidth;

        // Check if there's open space above or below
        if (z > 0 && grids[z - 1][offset] === 0) return true;
        if (z < grids.length - 1 && grids[z + 1][offset] === 0) return true;

        return false;
    }

    /**
     * Main raycasting function - traces a single ray through the grid
     */
    raycast(rayHits, playerX, playerY, playerZ, playerRot, stripAngle, stripIdx, spritesToLookFor = null) {
        Raycaster.raycastStatic(
            rayHits, this.grids, this.gridWidth, this.gridHeight, this.tileSize,
            playerX, playerY, playerZ, playerRot, stripAngle, stripIdx, spritesToLookFor
        );
    }

    /**
     * Static raycasting function
     */
    static raycastStatic(hits, grids, gridWidth, gridHeight, tileSize,
                         playerX, playerY, playerZ, playerRot,
                         stripAngle, stripIdx, spritesToLookFor = null) {
        if (grids.length === 0) return;

        let rayAngle = stripAngle + playerRot;

        // Normalize angle to 0-2PI
        while (rayAngle < 0) rayAngle += TWO_PI;
        while (rayAngle >= TWO_PI) rayAngle -= TWO_PI;

        // Determine ray direction
        const right = (rayAngle < TWO_PI * 0.25 && rayAngle >= 0) || (rayAngle > TWO_PI * 0.75);
        const up = rayAngle < TWO_PI * 0.5 && rayAngle >= 0;

        const currentTileX = Math.floor(playerX / tileSize);
        const currentTileY = Math.floor(playerY / tileSize);

        // Process each grid level
        for (let level = 0; level < grids.length; level++) {
            const grid = grids[level];
            const playerOffset = currentTileX + currentTileY * gridWidth;

            // Check walls above player
            if (level + 1 < grids.length && grids[level + 1][playerOffset] > 0) {
                const distX = 10;
                const distY = 10;
                const blockDist = distX * distX + distY * distY;
                if (blockDist) {
                    let texX = playerY % tileSize;
                    texX = right ? texX : tileSize - texX;
                    const rayHit = new RayHit(playerX, playerY, rayAngle);
                    rayHit.strip = stripIdx;
                    rayHit.wallType = grids[level + 1][playerOffset];
                    rayHit.wallX = currentTileX;
                    rayHit.wallY = currentTileY;
                    rayHit.level = level + 1;
                    rayHit.distance = Math.sqrt(blockDist);
                    rayHit.correctDistance = rayHit.distance * Math.cos(stripAngle);
                    rayHit.horizontal = false;
                    rayHit.tileX = texX;
                    hits.push(rayHit);
                }
            }

            // Check sprites in current cell
            if (spritesToLookFor) {
                const spritesFound = Raycaster.findSpritesInCell(spritesToLookFor, currentTileX, currentTileY, tileSize);
                for (const sprite of spritesFound) {
                    if (!sprite.rayhit) {
                        const distX = playerX - sprite.x;
                        const distY = playerY - sprite.y;
                        const spriteRayHit = RayHit.spriteRayHit(sprite, distX, distY, stripIdx, stripAngle);
                        hits.push(spriteRayHit);
                    }
                }
            }

            let verticalLineDistance = 0;
            let verticalWallHit = null;

            // ============================================
            // VERTICAL LINE INTERSECTION
            // ============================================
            let vx = right
                ? Math.floor(playerX / tileSize) * tileSize + tileSize
                : Math.floor(playerX / tileSize) * tileSize - 1;

            let vy = playerY + (playerX - vx) * Math.tan(rayAngle);

            const stepx = right ? tileSize : -tileSize;
            let stepy = tileSize * Math.tan(rayAngle);
            if (right) stepy = -stepy;

            while (vx >= 0 && vx < gridWidth * tileSize && vy >= 0 && vy < gridHeight * tileSize) {
                const wallY = Math.floor(vy / tileSize);
                const wallX = Math.floor(vx / tileSize);
                const wallOffset = wallX + wallY * gridWidth;

                // Check for sprites
                if (spritesToLookFor) {
                    const spritesFound = Raycaster.findSpritesInCell(spritesToLookFor, wallX, wallY, tileSize);
                    for (const sprite of spritesFound) {
                        if (!sprite.rayhit) {
                            const distX = playerX - sprite.x;
                            const distY = playerY - sprite.y;
                            const blockDist = distX * distX + distY * distY;
                            sprite.distance = Math.sqrt(blockDist);

                            const spriteRayHit = new RayHit(vx, vy, rayAngle);
                            spriteRayHit.strip = stripIdx;
                            if (sprite.distance) {
                                spriteRayHit.distance = sprite.distance;
                                spriteRayHit.correctDistance = spriteRayHit.distance * Math.cos(stripAngle);
                            }
                            spriteRayHit.wallType = 0;
                            spriteRayHit.sprite = sprite;
                            spriteRayHit.level = sprite.level;
                            sprite.rayhit = true;
                            hits.push(spriteRayHit);
                        }
                    }
                }

                // Check for wall hit
                if (grid[wallOffset] > 0 && !Raycaster.isHorizontalDoor(grid[wallOffset])) {
                    const distX = playerX - vx;
                    const distY = playerY - vy;
                    const blockDist = distX * distX + distY * distY;

                    if (blockDist) {
                        let texX = vy % tileSize;
                        texX = right ? texX : tileSize - texX;

                        const rayHit = new RayHit(vx, vy, rayAngle);
                        rayHit.strip = stripIdx;
                        rayHit.wallType = grid[wallOffset];
                        rayHit.wallX = wallX;
                        rayHit.wallY = wallY;
                        rayHit.level = level;
                        rayHit.up = up;
                        rayHit.right = right;
                        rayHit.distance = Math.sqrt(blockDist);
                        rayHit.sortdistance = rayHit.distance;

                        let canAdd = true;

                        // Handle doors (offset by half tile)
                        if (Raycaster.isVerticalDoor(grid[wallOffset])) {
                            const newWallY = Math.floor((vy + stepy / 2) / tileSize);
                            const newWallX = Math.floor((vx + stepx / 2) / tileSize);
                            if (newWallY === wallY && newWallX === wallX) {
                                const halfDistance = stepx / 2 * stepx / 2 + stepy / 2 * stepy / 2;
                                rayHit.distance += Math.sqrt(halfDistance);
                                texX = (vy + stepy / 2) % tileSize;
                                rayHit.sortdistance -= 1;
                            } else {
                                canAdd = false;
                            }
                        }

                        // Fisheye correction
                        rayHit.correctDistance = rayHit.distance * Math.cos(stripAngle);
                        rayHit.horizontal = false;
                        rayHit.tileX = texX;

                        const gaps = Raycaster.needsNextWall(grids, playerZ, tileSize, gridWidth, wallX, wallY, level);

                        if (!gaps) {
                            verticalWallHit = rayHit;
                            verticalLineDistance = blockDist;
                            break;
                        }

                        if (canAdd) {
                            hits.push(rayHit);
                        }
                    }
                }
                vx += stepx;
                vy += stepy;
            }

            // ============================================
            // HORIZONTAL LINE INTERSECTION
            // ============================================
            let horizontalLineDistance = 0;

            let hy = up
                ? Math.floor(playerY / tileSize) * tileSize - 1
                : Math.floor(playerY / tileSize) * tileSize + tileSize;

            let hx = playerX + (playerY - hy) / Math.tan(rayAngle);

            const stepy2 = up ? -tileSize : tileSize;
            let stepx2 = tileSize / Math.tan(rayAngle);
            if (!up) stepx2 = -stepx2;

            while (hx >= 0 && hx < gridWidth * tileSize && hy >= 0 && hy < gridHeight * tileSize) {
                const wallY = Math.floor(hy / tileSize);
                const wallX = Math.floor(hx / tileSize);
                const wallOffset = wallX + wallY * gridWidth;

                // Check for sprites
                if (spritesToLookFor) {
                    const spritesFound = Raycaster.findSpritesInCell(spritesToLookFor, wallX, wallY, tileSize);
                    for (const sprite of spritesFound) {
                        if (!sprite.rayhit) {
                            const distX = playerX - sprite.x;
                            const distY = playerY - sprite.y;
                            const blockDist = distX * distX + distY * distY;
                            sprite.distance = Math.sqrt(blockDist);

                            const spriteRayHit = new RayHit(hx, hy, rayAngle);
                            spriteRayHit.strip = stripIdx;
                            if (sprite.distance) {
                                spriteRayHit.distance = sprite.distance;
                                spriteRayHit.correctDistance = spriteRayHit.distance * Math.cos(stripAngle);
                            }
                            spriteRayHit.wallType = 0;
                            spriteRayHit.sprite = sprite;
                            spriteRayHit.level = sprite.level;
                            sprite.rayhit = true;
                            hits.push(spriteRayHit);
                        }
                    }
                }

                // Check for wall hit
                if (grid[wallOffset] > 0 && !Raycaster.isVerticalDoor(grid[wallOffset])) {
                    const distX = playerX - hx;
                    const distY = playerY - hy;
                    const blockDist = distX * distX + distY * distY;

                    // If vertical wall was closer, stop
                    if (verticalLineDistance > 0 && verticalLineDistance < blockDist) {
                        break;
                    }

                    if (blockDist) {
                        let texX = hx % tileSize;
                        texX = up ? texX : tileSize - texX;

                        const rayHit = new RayHit(hx, hy, rayAngle);
                        rayHit.strip = stripIdx;
                        rayHit.wallType = grid[wallOffset];
                        rayHit.wallX = wallX;
                        rayHit.wallY = wallY;
                        rayHit.level = level;
                        rayHit.up = up;
                        rayHit.right = right;
                        rayHit.distance = Math.sqrt(blockDist);
                        rayHit.sortdistance = rayHit.distance;

                        let canAdd = true;

                        // Handle doors
                        if (Raycaster.isHorizontalDoor(grid[wallOffset])) {
                            const newWallY = Math.floor((hy + stepy2 / 2) / tileSize);
                            const newWallX = Math.floor((hx + stepx2 / 2) / tileSize);
                            if (newWallY === wallY && newWallX === wallX) {
                                const halfDistance = stepx2 / 2 * stepx2 / 2 + stepy2 / 2 * stepy2 / 2;
                                rayHit.distance += Math.sqrt(halfDistance);
                                texX = (hx + stepx2 / 2) % tileSize;
                                rayHit.sortdistance -= 1;
                            } else {
                                canAdd = false;
                            }
                        }

                        rayHit.correctDistance = rayHit.distance * Math.cos(stripAngle);
                        rayHit.horizontal = true;
                        rayHit.tileX = texX;
                        horizontalLineDistance = blockDist;

                        if (canAdd) {
                            hits.push(rayHit);
                        }

                        const gaps = Raycaster.needsNextWall(grids, playerZ, tileSize, gridWidth, wallX, wallY, level);
                        if (gaps && verticalLineDistance) {
                            hits.push(verticalWallHit);
                            verticalLineDistance = 0;
                        } else if (!gaps) {
                            break;
                        }
                    }
                }
                hx += stepx2;
                hy += stepy2;
            }

            // Add vertical wall hit if no horizontal wall was closer
            if (!horizontalLineDistance && verticalLineDistance && verticalWallHit) {
                hits.push(verticalWallHit);
            }
        }
    }
}

/**
 * RayHitSorter - Compare function for sorting ray hits by distance (far to near)
 */
function sortRayHits(a, b) {
    // Sort by distance (furthest first for painter's algorithm)
    return b.correctDistance - a.correctDistance;
}
