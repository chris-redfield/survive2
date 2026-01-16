/**
 * Main entry point
 * JavaScript Raycasting Engine
 * Ported from Andrew Lim's SDL2 Raycasting Engine
 */

window.addEventListener('DOMContentLoaded', async () => {
    console.log('JavaScript Raycasting Engine');
    console.log('Loading textures from GitHub repository...');

    const game = new Game();
    await game.start();

    console.log('Game started!');
    console.log('Controls: Click=Mouse Look, WASD=Move/Strafe, Space=Jump, F=Doors, M=Minimap, ESC=Release');
});
