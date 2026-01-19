# Wall Top Implementation - Failed Attempts

## Attempt 1: Per-pixel fillRect with cell bounds tolerance
**Problem**: FPS dropped significantly (52 -> ~30), visual glitches with wall tops appearing/disappearing inconsistently as height changed.

**Root cause**:
- Using `ctx.fillStyle` and `ctx.fillRect` for every single pixel is extremely slow
- Cell bounds checking with tolerance was unreliable across different ray angles

## Attempt 2: Per-pixel with color batching
**Problem**: Still slow, still had visual glitches.

**Root cause**:
- Batching consecutive pixels with same color didn't help much since texture colors vary
- The projection formula or cell bounds checking was still inconsistent

## Attempt 3: ImageData for direct pixel manipulation
**Problem**: Wall tops stopped rendering entirely.

**Root cause**:
- ImageData row ordering was wrong - rows were filled in reverse order but drawn at wrong Y position
- The `putImageData` Y coordinate calculation was incorrect

## Attempt 4: Simplified fillRect with pitch correction
**Problem**: Still no wall tops rendered.

**Root cause**:
- Unknown - likely still Y coordinate issues

---

## Key Insights from C++ Code Analysis

### Variables used in C++ `drawWallTop`:
```cpp
float eyeHeight = TILE_SIZE/2 + player.z;           // Player eye height
float wallTop = (rayHit.level+1)*TILE_SIZE;         // Wall top in world units
float centerPlane = displayHeight/2;                 // Horizon without pitch
int wallScreenHeight = viewDist * TILE_SIZE / correctDist;  // Projected tile height
float playerScreenZ = viewDist * player.z / correctDist;    // Jump offset on screen
```

### Starting Y calculation:
```cpp
int screenY = (displayHeight - wallScreenHeight) / 2;
screenY = screenY - rayHit.level * wallScreenHeight + playerScreenZ;
```

### Loop and projection:
```cpp
for (; screenY >= centerPlane; screenY--) {
    float ratio = (eyeHeight - wallTop) / (screenY - centerPlane);
    float straightDistance = viewDist * ratio;
    float diagonalDistance = straightDistance * cosFactor;

    float xEnd = player.x + diagonalDistance * cos(rayAngle);
    float yEnd = player.y - diagonalDistance * sin(rayAngle);  // Note: negative sine
}
```

### Cell checking:
```cpp
int wallX = xEnd / TILE_SIZE;
int wallY = yEnd / TILE_SIZE;
bool sameWall = wallX == rayHit.wallX && wallY == rayHit.wallY;
```

### Pixel output position:
```cpp
int dstPixel = screenX + (screenY + pitch) * displayWidth;
```

---

## Attempt 5: Fresh implementation with C++ formula
**Problem**: Wall tops appear but with gaps and inconsistencies.

**Changes**:
- Added wallX/wallY to hit objects
- Used C++ starting Y formula: `(displayHeight - wallScreenHeight) / 2 - level * wallScreenHeight + playerScreenZ`
- Used C++ projection formula exactly

**Root cause**: Starting Y calculation from C++ formula doesn't match the wallTop screen Y calculated in the main rendering loop.

## Attempt 6: Pass actual wallTop screen position
**Change**: Instead of recalculating starting Y, pass the actual `wallTop` screen position from the rendering loop.

**Result**: sameWall check still failing - projected cell doesn't match hit cell

## Attempt 7: Disabled sameWall check
**Change**: Removed the sameWall check entirely to see wall tops.

**Result**: Wall tops appear on DISTANT walls but NOT on close walls. This confirmed the projection formula works but something is wrong with close wall handling.

## Attempt 8: Removed wasInWall early exit
**Change**: Removed the `wasInWall` check that caused early return when leaving the wall cell.

**Result**: Broke differently - caused horizontal stripes across the screen.

## Attempt 9: Simplified interpolation approach
**Change**: Replaced C++ projection with simple interpolation from wall center into the cell.

**Result**: Still broken - texture mapping doesn't match the proper perspective projection.

---

## Key Debug Findings:

1. **screenY < centerPlane issue**: The starting Y was sometimes above the horizon, causing the loop to never execute.

2. **sameWall always failing**: Debug showed projected cell coordinates don't match hit cell coordinates, especially for close walls.

3. **Coordinate system difference**: C++ uses `yEnd = player.y - diagonalDistance * sin(rayAngle)` (NEGATIVE sine). This is critical for matching the coordinate system.

---

## Attempt 10: Exact C++ projection with correct coordinate system
**Changes**:
- Use EXACT C++ projection formula
- Use negative sine for Y projection: `yEnd = player.y - distance * sin(angle)`
- Use Math.floor for integer division (not Math.trunc)
- Don't clamp screenY before the loop
- Changed sameWall exact match to tolerance-based bounds check (±2 pixels)

**Result**: Still bugged.

---

# COMPREHENSIVE NOTES FOR FUTURE ATTEMPTS

## Game Constants (from game.js)
```javascript
displayWidth = 800
displayHeight = 600
TILE_SIZE = 64
FOV_DEGREES = 60
viewDist = (displayWidth / 2) / tan(FOV_RADIANS / 2) ≈ 693
centerPlane = displayHeight / 2 = 300
```

## C++ Reference Code (main.cpp lines 1662-1736)
```cpp
void Game::drawWallTop(RayHit& rayHit, int wallScreenHeight, float playerScreenZ)
{
  float eyeHeight = TILE_SIZE/2 + player.z;
  float wallTop = (rayHit.level+1)*TILE_SIZE;
  float centerPlane = displayHeight/2;
  bool wasInWall = false;
  int screenX = rayHit.strip * stripWidth;
  const float cosFactor = 1/cos(player.rot-rayHit.rayAngle);

  // Starting Y calculation
  int screenY = (displayHeight-wallScreenHeight)/2;
  screenY = screenY - rayHit.level * wallScreenHeight + playerScreenZ;
  if (screenY > displayHeight - pitch) {
    screenY = displayHeight - pitch;
  }

  // Main loop - from wall top toward horizon
  for (; screenY>=centerPlane; screenY--)
  {
    float ratio = (eyeHeight - wallTop) / (screenY-centerPlane);
    float straightDistance = viewDist * ratio;
    float diagonalDistance = straightDistance * cosFactor;

    float xEnd = player.x + diagonalDistance * cosine(rayHit.rayAngle);
    float yEnd = player.y - diagonalDistance * sine(rayHit.rayAngle);  // NEGATIVE SINE!

    int x = (int)(xEnd) % TILE_SIZE;
    int y = (int)(yEnd) % TILE_SIZE;
    int wallX = xEnd / TILE_SIZE;
    int wallY = yEnd / TILE_SIZE;

    bool outOfBounds = x < 0 || y < 0 || x>MAP_WIDTH*TILE_SIZE || y>MAP_HEIGHT*TILE_SIZE;
    bool sameWall = wallX==rayHit.wallX && wallY==rayHit.wallY;

    if (outOfBounds || !sameWall || !raycaster3D.cellAt(wallX,wallY,rayHit.level)) {
      if (wasInWall) return;  // Early exit optimization
      continue;
    }

    // Draw pixel at screenX, screenY+pitch
    wasInWall = true;
    int dstPixel = screenX + (screenY+pitch) * displayWidth;
    // ... texture lookup and pixel write ...
  }
}
```

## Key Formulas
1. **wallScreenHeight** = viewDist * TILE_SIZE / correctDist
2. **playerScreenZ** = viewDist * player.z / correctDist
3. **Starting screenY** = (displayHeight - wallScreenHeight) / 2 - level * wallScreenHeight + playerScreenZ
4. **Projection ratio** = (eyeHeight - wallTopWorld) / (screenY - centerPlane)
5. **straightDistance** = viewDist * ratio
6. **diagonalDistance** = straightDistance * cosFactor (where cosFactor = 1/cos(player.rot - rayAngle))
7. **xEnd** = player.x + diagonalDistance * cos(rayAngle)
8. **yEnd** = player.y - diagonalDistance * sin(rayAngle)  ← NEGATIVE SINE!

## Where wallX/wallY Come From
In our raycasting loop, when a wall hit is detected:
```javascript
hits.push({ dist: crossDist, horiz: !crossVertical, type: wall, texX, level, wallX: cx, wallY: cy });
```
Where cx, cy are the cell coordinates being checked in the DDA loop.

## Known Issues

### Issue 1: sameWall Check Fails
The projection formula projects from player position along the ray angle. The projected cell (wallX, wallY) often doesn't match rayHit.wallX/wallY due to:
- Floating-point precision differences
- The ray hit point is at the cell BOUNDARY, projection might land just outside
- For close walls, small errors in screenY cause large projection distance errors

### Issue 2: Close Walls Don't Render
For very close walls:
- wallScreenHeight >> displayHeight (wall is taller than screen)
- Starting screenY can be very large (below screen) or very small (above screen)
- The clamping `if (screenY > displayHeight - pitch)` changes the screenY value
- This breaks the projection formula because ratio depends on true screenY

### Issue 3: Coordinate System Mismatch?
We may have a Y-axis direction mismatch between:
- The raycasting code (where Y increases in which direction?)
- The projection formula (yEnd = player.y - distance * sin)
- The screen coordinates (Y=0 at top, increases downward)

## Things We Tried That Didn't Work
1. Per-pixel fillRect - too slow (FPS drop)
2. Color batching - still slow, still glitchy
3. ImageData - wrong row ordering
4. Simplified fillRect with pitch - no rendering
5. C++ formula with recalculated startY - gaps/inconsistencies
6. Passing wallTop screen position from render loop - sameWall fails
7. Disabling sameWall check - distant walls work, close walls don't
8. Removing wasInWall early exit - horizontal stripes
9. Simplified interpolation - texture mapping wrong
10. Unclamped screenY + tolerance-based cell check - still bugged

## Potential Root Causes to Investigate
1. **Y-axis direction**: Does our raycasting use Y+ = up or Y+ = down? Does the projection formula match?
2. **wallX/wallY storage**: Are we storing the correct cell coords in the hit object?
3. **Pitch interaction**: How does pitch affect the projection? Currently we add pitch to output Y but not to centerPlane
4. **cosFactor calculation**: Is player.rot - rayAngle giving the correct angle difference?

## Alternative Approaches to Try
1. **Use hit point directly**: Instead of projecting from player, use the actual hit point coordinates and extend from there
2. **Column-based rendering**: Render wall top as part of the main wall column rendering, not separately
3. **Offscreen canvas**: Pre-render wall tops to a texture for better performance
4. **Skip sameWall entirely**: Just render based on distance limits (may cause artifacts but might work)
5. **Debug visualization**: Draw the projected points on the minimap to see where they land

---

# Session 2 - Claude's New Attempts

## Attempt 11: Per-pixel ctx.drawImage with distance bounds
**Changes**:
- Loop from wallTop toward horizon
- Project each screenY to world position on horizontal plane at wallTopWorld height
- Use distance bounds (correctDist to correctDist + TILE_SIZE*1.5) instead of sameWall check
- Sample ceiling texture and draw with ctx.drawImage(1x1 pixel)

**Result**: Wall tops appear and geometry looks correct, BUT FPS dropped to 4 (from 60). Completely unusable.

**Root cause**: ctx.drawImage for every single pixel is extremely slow, even worse than fillRect per pixel.

## Attempt 12: Single fillRect per strip with calculated far edge
**Changes**:
- Calculate near edge (at wall, screenY = wallTop) and far edge (at correctDist + TILE_SIZE)
- Draw single solid color rectangle from farScreenY to nearScreenY
- No per-pixel loop

**Result**: Good FPS (61), but wall tops extend WAY too far. Instead of small horizontal strips on top of walls, huge triangular areas fill from walls toward horizon.

**Root cause**: The far edge calculation `farDist = correctDist + TILE_SIZE` doesn't account for actual cell geometry. Without per-pixel sameWall checking, the wall top extends beyond its cell boundaries. The simple rectangle approach fills the ENTIRE area between horizon and wall top, not just the actual wall cell surface.

## Key Insight from Attempt 12:
The problem is fundamental: a wall top is a horizontal surface that should only render within its specific cell. Without per-pixel cell checking, we can't know where the cell boundaries project to on screen. But per-pixel checking is too slow.

**Possible solutions**:
1. Calculate actual cell corner projections to bound the wall top
2. Use a fixed/proportional wall top height (hack but fast)
3. Pre-calculate cell projections and cache them
4. Use WebGL for proper perspective texture mapping

---

# CRITICAL REMINDER (DO NOT FORGET):

WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them
WE DO NOT WANT VERTICAL STRIPS ON TOP OF WALLS, WE WANT A GROUND SURFACE on top of them

Wall tops are HORIZONTAL surfaces like the FLOOR/GROUND. They must be rendered with HORIZONTAL SCANLINES (row by row), NOT vertical strips (column by column). The approach must be like floor rendering, not wall rendering.

---

## Attempt 13: Horizontal scanline rendering (WORKS!)
**Changes**:
- Completely different approach: render wall tops AFTER all walls, using horizontal scanlines
- For each screen ROW from horizon downward:
  - Calculate distance for this row on the wall-top plane: `rowDist = (cameraZ - wallTopHeight) * viewDist / (screenY - horizon)`
  - For each pixel in the row, calculate world position using ray angle
  - Check if position is inside a wall cell
  - If yes, draw the pixel

**Result**: IT WORKS! Wall tops render as proper horizontal surfaces, like the ground. They look correct from all angles.

**Problem**: Performance hit (FPS drops from 60 to ~43) due to per-pixel processing.

**Key insight**: Wall tops MUST be rendered row-by-row (horizontal scanlines) like floor rendering, NOT column-by-column like wall rendering. Any column-based approach will look like vertical strips growing upward.

## Attempt 14: Span batching optimization (SUCCESS!)
**Changes**:
- Instead of `fillRect` per pixel, batch continuous spans of wall-top pixels
- For each row, track where wall-top spans start and end
- Draw entire spans with single `fillRect` calls
- Calculate color once per row instead of per pixel

**Result**: FPS is now 61 at all times! No performance drop!

**Why it works**:
- Instead of potentially hundreds of `fillRect` calls per row (one per pixel), we now make just a few calls per row (one per continuous span)
- Example: a row with wall tops at X: 100-200 and 350-400 = 2 fillRect calls instead of 75
- Color string generation happens once per row, not per pixel
- The cell lookup still happens per pixel, but that's fast (just array access)

---

# WALL TOP IMPLEMENTATION COMPLETE!

**Final working solution**:
1. Render wall tops AFTER walls, as a separate pass
2. Use horizontal scanline rendering (row by row, like floor rendering)
3. For each row, project to wall-top plane and check which pixels are inside wall cells
4. Batch continuous spans into single fillRect calls for performance

**Key learnings**:
- Wall tops are HORIZONTAL surfaces - must be rendered with horizontal scanlines, NOT vertical strips
- Column-based approaches will always look like walls growing upward
- Span batching is crucial for performance - reduces draw calls from hundreds to just a few per row

## Bug Fix: Fish-eye curved edges
**Problem**: Wall tops had curved edges at the left and right corners of the screen - they curved upward instead of being straight.

**Cause**: We used the same `rowDist` for all pixels in a row, but rays at the screen edges travel at an angle. Without correction, edge pixels project to incorrect world positions.

**Solution**: Apply fish-eye correction for each pixel:
```javascript
const cosAngle = Math.cos(rayAngle - this.player.rot);
const correctedDist = rowDist / cosAngle;
```

**Result**: Wall tops now have perfectly straight edges across the entire screen.

---

# WALL TOP CONFIGURATION SYSTEM

## Overview
Wall tops can be configured per-cell using the `g_map_walltops` array in `maps.js`. This allows different buildings or areas to have different wall top styles (textured or solid colors).

## Map Layer: g_map_walltops (maps.js)

Location: `js/maps.js` (after g_map2, before g_floormap)

### Value Reference:
| Value | Type | Description |
|-------|------|-------------|
| `0` | Texture | Default texture (uses ceilingImage/brick) |
| `1+` | Texture | Future: additional texture IDs |
| `-1` | Solid | Purple (RGB: 140, 56, 140) |
| `-2` | Solid | Gray (RGB: 100, 100, 100) |
| `-3` | Solid | Brown (RGB: 139, 90, 43) |
| `-4` | Solid | Dark Blue (RGB: 40, 60, 100) |

### Example Usage:
```javascript
// In g_map_walltops array:
// To make a specific cell use solid purple:
g_map_walltops[y][x] = -1;

// To make a cell use the default brick texture:
g_map_walltops[y][x] = 0;
```

## Color Palette: wallTopSolidColors (game.js)

Location: `js/game.js` (in Game constructor)

```javascript
this.wallTopSolidColors = [
    [140, 56, 140],   // -1: Purple
    [100, 100, 100],  // -2: Gray
    [139, 90, 43],    // -3: Brown
    [40, 60, 100],    // -4: Dark Blue
];
```

To add more colors, append to this array and use corresponding negative values (-5, -6, etc.)

## Important Notes:
1. Wall tops only render for cells that have a wall in `g_map` (level 0)
2. Wall tops do NOT render if there's a wall directly above in `g_map2` (level 1)
3. The map layer uses the same 64x48 dimensions as other maps
4. Changes to `g_map_walltops` take effect immediately (no reload needed)

---

# Slope Implementation - Failed Attempts

## Overview
Slopes are diagonal surfaces (ramps) that connect ground level (0) to platform height (TILE_SIZE=64). They face the same fundamental challenge as wall tops: they are horizontal-ish surfaces that must be rendered with horizontal scanlines, NOT vertical strips.

## Data Structure (Working)
The slope data structure in `maps.js` works correctly:

```javascript
const SLOPE_TYPE_NONE = 0;
const SLOPE_TYPE_WEST_EAST = 1;      // Rises west to east (+X)
const SLOPE_TYPE_EAST_WEST = 2;      // Rises east to west (-X)
const SLOPE_TYPE_NORTH_SOUTH = 3;    // Rises north to south (+Y)
const SLOPE_TYPE_SOUTH_NORTH = 4;    // Rises south to north (-Y)

function getHeightAt(worldX, worldY) {
    // Returns interpolated height (0 to TILE_SIZE) based on position in slope cell
}
```

## Collision Detection (Working)
- `isWall()` modified to return `false` for slope cells (slopes are passable)
- `update()` sets `player.groundZ = getHeightAt(player.x, player.y)` so player walks up/down slopes

---

## Attempt 1: Sparse point-based rendering
**Problem**: Slopes not visible at all.

**Approach**: Cast rays and draw individual pixels at slope intersection points.

**Root cause**: Too sparse - individual pixels don't form visible surfaces.

## Attempt 2: Row-based scanline rendering
**Problem**: FPS dropped to 5, game unplayable.

**Approach**: For each screen row, check every pixel for slope intersection.

**Root cause**: O(H * W * maxDist) complexity - checking every screen pixel against every ray distance is extremely slow.

## Attempt 3: Column-based vertical strip rendering (Initial)
**Problem**: Slopes appeared as vertical bars extending to bottom of screen.

**Approach**: For each screen column, step along ray and draw vertical strips from slope point down.

```javascript
for (let screenX = 0; screenX < W; screenX += stripWidth) {
    let prevScreenY = H;  // Start at bottom of screen
    for (let dist = 4; dist < maxDist; dist += 4) {
        // ... calculate slopeScreenY ...
        ctx.fillRect(screenX, slopeScreenY, stripWidth, prevScreenY - slopeScreenY);
        prevScreenY = slopeScreenY;
    }
}
```

**Root cause**: Drawing from `slopeScreenY` down to `prevScreenY` (which starts at screen height H) creates vertical lines extending to screen bottom. This is the exact same problem wall tops had - vertical strip approach doesn't work for horizontal surfaces.

## Attempt 4: Column-based with fillRect connecting points
**Problem**: Good FPS (61), slopes visible as diagonal ramps, but implementation fragile.

**Approach**: Draw filled strips connecting adjacent slope points along each ray.

**Result**: This worked visually! Slopes looked correct. But when trying to add features (larger slopes, side walls, textures), the implementation broke repeatedly.

## Attempt 5: Larger slopes (4x4 tiles)
**Problem**: FPS dropped to 18-19, slopes rendered with artifacts.

**Changes**: Moved slopes to center of map (rows 21-24, columns 26-29 and 34-37), made them 4x4 tiles.

**Root cause**: More slope cells = more rendering work. The vertical strip approach doesn't scale well.

## Attempt 6: Added procedural brick texture
**Problem**: FPS dropped to 18-19, unplayable.

**Changes**: Added `getSlopeTexture()` function for per-pixel color calculation.

**Root cause**: Per-pixel color calculation in inner loop is extremely expensive.

## Attempt 7: Revert to small test slopes
**Problem**: Slopes disappeared entirely.

**Changes**: Reverted slope map to original small slopes at row 5, cols 8 and 10. Changed step size from 1 to 4.

**Root cause**: The code changes for side walls and textures corrupted the basic rendering logic.

## Attempt 8: Complete revert to simple rendering (Current State)
**Result**: Slopes visible again with 61 FPS, BUT they have vertical infinite lines extending to screen bottom.

**Current code** (game.js lines ~846-888):
```javascript
for (let screenX = 0; screenX < W; screenX += this.stripWidth) {
    let prevScreenY = H;
    for (let dist = 4; dist < maxDist; dist += 4) {
        // ... calculate slope height and screen position ...
        if (slopeScreenY >= 0 && slopeScreenY < H && slopeScreenY < prevScreenY) {
            ctx.fillRect(screenX, slopeScreenY, stripWidth, prevScreenY - slopeScreenY);
            prevScreenY = slopeScreenY;
        }
    }
}
```

**Root cause**: Same as wall tops - vertical strip rendering creates infinite lines because `prevScreenY` starts at `H` (screen bottom).

---

## Key Insights

### The Fundamental Problem
Slopes (like wall tops and floors) are SURFACES that extend horizontally. They MUST be rendered with HORIZONTAL SCANLINES (row by row), NOT vertical strips (column by column).

The vertical strip approach treats each ray column independently, filling downward from the slope point. This creates:
- Vertical bars extending to screen bottom on first iteration
- Gaps between columns if step size is too large
- Incorrect surface appearance (looks like vertical walls, not diagonal ramps)

### Why Wall Tops Work (Reference)
Wall tops use horizontal scanline rendering:
```javascript
for (let screenY = startY; screenY < endY; screenY++) {
    // Calculate distance for this row on the surface plane
    const rowDist = (cameraZ - surfaceHeight) * viewDist / (screenY - horizon);

    for (let screenX = 0; screenX < W; screenX += stripWidth) {
        // Calculate world position for this pixel
        // Check if position is on the surface
        // Draw pixel
    }
}
```

### Why Slopes Are Harder
Unlike wall tops (which have constant height across a cell), slopes have VARIABLE height that depends on position within the cell. This means:

1. **No single "surface height"**: Can't use simple `rowDist = (cameraZ - height) * viewDist / (screenY - horizon)` formula
2. **Height changes along ray**: The slope height at the near end of a ray differs from the far end
3. **Ray-surface intersection**: Must find where the ray actually intersects the slope surface, not just project to a flat plane

---

## Potential Solutions

### Solution A: Adaptive horizontal scanlines
For each screen row:
1. Calculate distance range that could hit slopes
2. For each pixel in row, find if ray at that distance intersects a slope
3. If yes, draw the pixel

**Challenge**: Finding ray-slope intersection for variable height surface.

### Solution B: Ray marching with proper surface detection
Step along each ray and detect when ray passes through slope surface:
```javascript
for each ray:
    for dist from near to far:
        worldPos = player + ray * dist
        slopeHeight = getHeightAt(worldPos)
        rayHeight = cameraZ - (dist * (screenY - horizon) / viewDist)
        if rayHeight <= slopeHeight:
            // Ray has entered the slope - draw this point
            break
```

**Challenge**: Getting the ray height calculation correct for perspective projection.

### Solution C: Polygon rasterization
Calculate the 4 corners of each slope cell in screen space, then rasterize the resulting quadrilateral.

**Challenge**: Complex math, potential for gaps between adjacent slopes.

---

## Performance Considerations

From failed attempts:
- Per-pixel fillRect: Too slow (FPS < 10)
- Per-pixel color calculation: Too slow (FPS < 20)
- Step size 1: Accurate but slow
- Step size 4: Fast but gaps possible

From wall top success:
- Span batching is crucial: Batch continuous spans into single fillRect calls
- Calculate color once per row, not per pixel
- Cell lookup (array access) is fast; draw calls are expensive

---

## Files Modified

| File | Changes |
|------|---------|
| `js/maps.js` | Slope constants, `getHeightAt()`, `g_map_slopes` array |
| `js/game.js` | `isWall()` modification, `update()` modification, slope rendering code |
| `js/raycaster.js` | Had duplicate slope constants (removed) |

---

## Current Test Setup

Small test slopes at row 5:
- Column 8: SLOPE_TYPE_WEST_EAST (rises west to east)
- Column 10: SLOPE_TYPE_EAST_WEST (rises east to west)

---

## CRITICAL REMINDER FOR FUTURE ATTEMPTS:

SLOPES ARE HORIZONTAL SURFACES LIKE FLOORS AND WALL TOPS!
THEY MUST BE RENDERED WITH HORIZONTAL SCANLINES, NOT VERTICAL STRIPS!
THE APPROACH THAT WORKED FOR WALL TOPS SHOULD BE ADAPTED FOR SLOPES!

---

## Attempt 9: Horizontal scanlines with ground-level projection
**Problem**: Slopes rendered as flat quadrilateral on the ground, not as raised ramps.

**Approach**:
- For each screenY row, calculate distance to ground level (height=0)
- Project to world position and check if slope exists
- Check if `rayHeight <= slopeHeight`

**Root cause**: The formula `rowDistGround = cameraZ * viewDist / (screenY - horizon)` always projects to ground level. The rayHeight calculation then equals ~0, so we only see where slopes exist at ground level, not their raised portions.

## Attempt 10: Horizontal scanlines with ray marching
**Problem**: Terrible FPS (single digits), slopes rendered as horizontal stripes filling large portions of screen incorrectly.

**Approach**:
- For each screenY row, for each screenX pixel
- March along ray at step intervals (stepSize=8)
- At each step, calculate where slope point would project: `projScreenY = horizon + (cameraZ - slopeHeight) * viewDist / correctDist`
- If `projScreenY <= screenY`, draw pixel

**Root cause**:
1. **Performance**: O(H * W * maxDist/stepSize) = O(300 * 400 * 120) = 14.4 million iterations per frame. Even with span batching, this is way too slow.
2. **Visual bug**: The condition `projScreenY <= screenY` fills everything BELOW the slope's top edge, creating horizontal bands instead of the actual slope surface.

---

## Key Insight: Why Slopes Are Different From Wall Tops

**Wall tops work because**:
- They have a CONSTANT height (TILE_SIZE)
- For any screenY, there's exactly ONE distance where that height is visible
- Formula: `rowDist = (cameraZ - wallTopHeight) * viewDist / (screenY - horizon)`
- We just check if that world position is on a wall

**Slopes don't work the same way because**:
- They have VARIABLE height (0 to TILE_SIZE depending on position)
- For any screenY, MULTIPLE distances could show different parts of the slope
- There's no simple closed-form solution for ray-slope intersection
- The slope height depends on world position, which depends on distance, which we're trying to find

---

## Approaches NOT to try again:

1. **Per-pixel ray marching** - Too slow (O(H*W*steps))
2. **Ground-level projection with height check** - Only shows base of slope
3. **Vertical strips with prevScreenY=H** - Creates infinite vertical bars
4. **Per-pixel fillRect** - Too slow
5. **Per-pixel color calculation** - Too slow

## Approaches that might work:

1. **Polygon rasterization**: Project the 4 corners of each slope cell to screen space, rasterize the resulting quadrilateral. Fast but complex math.

2. **Column-based with proper initialization**: Fix the vertical strip approach by initializing prevScreenY to the correct starting point (not H).

3. **Hybrid approach**: Use wall-top style scanlines but only for the TOP edge of slopes, then fill down to ground with vertical strips.

4. **Pre-computed lookup tables**: For each slope type, pre-compute the screen projection and cache it.

5. **Simplified rendering**: Just draw slopes as solid colored quadrilaterals without per-pixel height accuracy.

---

## Attempt 11: Column-based with proper initialization (SUCCESS!)
**Result**: Slopes render correctly as diagonal ramps with good FPS (61).

**Approach**:
- Column-based iteration (for each screenX, step along ray)
- **Key fix**: Initialize `prevScreenY = -1` (NOT `H`!)
- When first encountering a slope point, calculate ground position at that distance: `groundScreenY = horizon + cameraZ * projScale`
- Set `prevScreenY = min(groundScreenY, H)`
- Draw vertical strips from `slopeScreenY` to `prevScreenY`
- Update `prevScreenY = slopeScreenY` after each draw
- Reset `prevScreenY = -1` when leaving slope cell

**Why it works**:
- The first vertical strip fills from slope surface down to GROUND LEVEL (not screen bottom)
- Subsequent strips fill the gap between consecutive slope points
- This creates the proper diagonal ramp appearance
- Column-based approach is fast (O(W * maxDist/stepSize))

**Working code** (game.js):
```javascript
for (let screenX = 0; screenX < W; screenX += this.stripWidth) {
    // ... ray setup ...
    let prevScreenY = -1; // KEY: Not H!

    for (let dist = stepSize; dist < maxDist; dist += stepSize) {
        // ... calculate worldX, worldY, correctDist ...
        if (correctDist >= this.zBuffer[screenX]) break;

        const slopeHeight = getHeightAt(worldX, worldY);
        if (slopeHeight > 0) {
            const projScale = this.viewDist / correctDist;
            const slopeScreenY = Math.floor(horizon + (cameraZ - slopeHeight) * projScale);

            if (prevScreenY === -1) {
                // First slope point - use ground position, not H!
                const groundScreenY = Math.floor(horizon + cameraZ * projScale);
                prevScreenY = Math.min(groundScreenY, H);
            }

            if (slopeScreenY < prevScreenY && slopeScreenY >= 0 && slopeScreenY < H) {
                ctx.fillRect(screenX, slopeScreenY, stripWidth, prevScreenY - slopeScreenY);
                prevScreenY = slopeScreenY;
            }
        } else if (prevScreenY !== -1) {
            prevScreenY = -1; // Reset when leaving slope
        }
    }
}
```

---

# SLOPE RENDERING COMPLETE!

**Final working solution**:
1. Column-based iteration (fast)
2. Initialize prevScreenY to -1, not H
3. On first slope point, set prevScreenY to ground level at that distance
4. Draw vertical strips between consecutive slope points
5. Reset when leaving slope cell

**Key lesson**: The difference between "infinite vertical bars" and "correct diagonal ramp" was ONE LINE of code - initializing prevScreenY to ground level instead of screen height H.

## Bug Fix: Higher slope parts vanishing when approaching/side view
**Problem**: When approaching a multi-level slope or viewing from the side, the higher parts (level 1+) would vanish.

**Cause**: The condition `slopeScreenY < prevScreenY` only drew when the slope was going upward on screen. When approaching or viewing from the side, the higher slope cells are farther away, so they project LOWER on screen despite having greater world height. The condition failed and nothing was drawn.

**Solution**: Changed approach to draw each slope point from its height down to ground level, tracking `minScreenYDrawn` to avoid overdraw:
```javascript
// Track the highest point drawn so far (smallest screenY) to avoid overdraw
let minScreenYDrawn = H;

for (let dist = stepSize; dist < maxDist; dist += stepSize) {
    // ... calculate worldX, worldY, correctDist, slopeHeight ...

    if (slopeHeight > 0) {
        const projScale = this.viewDist / correctDist;
        const slopeScreenY = Math.floor(horizon + (cameraZ - slopeHeight) * projScale);
        const groundScreenY = Math.floor(horizon + cameraZ * projScale);

        // Draw from slope surface to ground (or to minScreenYDrawn to avoid overdraw)
        const drawTop = Math.max(0, slopeScreenY);
        const drawBottom = Math.min(minScreenYDrawn, groundScreenY, H);

        if (drawTop < drawBottom && drawTop < minScreenYDrawn) {
            ctx.fillRect(screenX, drawTop, this.stripWidth, drawBottom - drawTop);
            minScreenYDrawn = Math.min(minScreenYDrawn, drawTop);
        }
    }
}
```

**Result**: Slopes now render correctly from all angles, including side views and when approaching multi-level slopes.
