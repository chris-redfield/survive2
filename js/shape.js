/**
 * Shape utilities - Geometry helper functions
 * Ported from Andrew Lim's SDL2 Raycasting Engine
 */

const Shape = {
    /**
     * Check if two line segments intersect
     * Based on: http://paulbourke.net/geometry/pointlineplane/javascript.txt
     * @returns {object|null} Intersection point {x, y} or null if no intersection
     */
    linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        // Check if none of the lines are of length 0
        if ((x1 === x2 && y1 === y2) || (x3 === x4 && y3 === y4)) {
            return null;
        }

        const denominator = ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));

        // Lines are parallel
        if (denominator === 0) {
            return null;
        }

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;

        // Is the intersection along the segments?
        if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
            return null;
        }

        // Return intersection coordinates
        return {
            x: x1 + ua * (x2 - x1),
            y: y1 + ua * (y2 - y1)
        };
    },

    /**
     * Check if a point is inside a rectangle
     */
    pointInRect(ptx, pty, x, y, w, h) {
        return x <= ptx && ptx <= (x + w) &&
               y <= pty && pty <= (y + h);
    },

    /**
     * Sign function for point-in-triangle test
     */
    sign(p1, p2, p3) {
        return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    },

    /**
     * Check if a point is inside a triangle
     * Based on: https://stackoverflow.com/a/2049593/1645045
     */
    pointInTriangle(pt, v1, v2, v3) {
        const d1 = Shape.sign(pt, v1, v2);
        const d2 = Shape.sign(pt, v2, v3);
        const d3 = Shape.sign(pt, v3, v1);

        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

        return !(hasNeg && hasPos);
    },

    /**
     * Check if a point is inside a quadrilateral
     */
    pointInQuad(pt, v1, v2, v3, v4) {
        return Shape.pointInTriangle(pt, v1, v2, v3) ||
               Shape.pointInTriangle(pt, v3, v4, v1);
    }
};
