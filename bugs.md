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
