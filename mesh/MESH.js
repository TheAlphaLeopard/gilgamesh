/**
 * Gilgamesh MESH Rendering Engine
 * A high-performance 2D pipeline for the Gilgamesh language.
 */

let ctx = null; // Front buffer (visible)
let canvas = null;
let backCanvas = document.createElement('canvas'); // Back buffer (offscreen)
let backCtx = backCanvas.getContext('2d', { alpha: false });
let lastFrameTime = 0;
let targetFPS = 60;
let keys = new Set();
let keysPressed = new Set();
let keysReleased = new Set();
let mousePos = { x: 0, y: 0 };
let mouseButtons = new Set();
let mouseButtonsPressed = new Set();
let mouseButtonsReleased = new Set();

// Setup Keyboard Listeners
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!keys.has(k)) keysPressed.add(k);
    keys.add(k);
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    keys.delete(k);
    keysReleased.add(k);
});

// Setup Mouse Listeners
window.addEventListener('mousemove', (e) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mousePos.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mousePos.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
window.addEventListener('mousedown', (e) => {
    mouseButtons.add(e.button);
    mouseButtonsPressed.add(e.button);
});
window.addEventListener('mouseup', (e) => {
    mouseButtons.delete(e.button);
    mouseButtonsReleased.add(e.button);
});

const Colors = {
    LIGHTGRAY: "#D3D3D3", GRAY: "#808080", DARKGRAY: "#404040", YELLOW: "#FFFF00",
    GOLD: "#FFD700", ORANGE: "#FFA500", PINK: "#FFC0CB", RED: "#FF0000",
    MAROON: "#800000", GREEN: "#00FF00", LIME: "#00FF00", DARKGREEN: "#006400",
    SKYBLUE: "#87CEEB", BLUE: "#0000FF", DARKBLUE: "#00008B", PURPLE: "#800080",
    VIOLET: "#EE82EE", DARKPURPLE: "#9400D3", BEIGE: "#F5F5DC", BROWN: "#A52A2A",
    DARKBROWN: "#5D4037", WHITE: "#FFFFFF", BLACK: "#000000", BLANK: "transparent",
    MAGENTA: "#FF00FF", RAYWHITE: "#F5F5F5"
};

class MeshEngine {
    constructor() {
        Object.assign(this, Colors);
        this.MOUSE_LEFT = 0;
        this.MOUSE_MIDDLE = 1;
        this.MOUSE_RIGHT = 2;
        this._fps = 0;
        this._frameCount = 0;
        this._lastFpsTime = performance.now();

        // Auto-bind all methods to ensure 'this' context is preserved
        const prototype = Object.getPrototypeOf(this);
        Object.getOwnPropertyNames(prototype).forEach(key => {
            if (key !== 'constructor' && typeof this[key] === 'function') {
                this[key] = this[key].bind(this);
            }
        });
    }

    InitWindow(width, height, title) {
        canvas = document.getElementById('render-canvas');
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        
        // Setup Back Buffer
        backCanvas.width = width;
        backCanvas.height = height;
        backCtx = backCanvas.getContext('2d', { alpha: false });
        backCtx.imageSmoothingEnabled = false;

        // Setup Front Buffer
        ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        ctx.imageSmoothingEnabled = false;
        
        if (title) document.title = title;
    }

    SetTargetFPS(fps) { targetFPS = fps; }

    BeginDrawing() {
        if (!backCtx) return;
        this._frameCount++;
        const now = performance.now();
        if (now - this._lastFpsTime >= 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._lastFpsTime = now;
        }
    }

    async EndDrawing() {
        if (!ctx || !backCanvas) return;
        
        // Swap buffers: Draw back buffer to front buffer
        ctx.drawImage(backCanvas, 0, 0);

        const targetMs = 1000 / targetFPS;
        const now = performance.now();
        const elapsed = now - lastFrameTime;
        
        // Simple frame rate limiter
        if (elapsed < targetMs) {
            await new Promise(r => setTimeout(r, targetMs - elapsed));
        }
        
        mouseButtonsPressed.clear();
        mouseButtonsReleased.clear();
        keysPressed.clear();
        keysReleased.clear();
        
        lastFrameTime = performance.now();
        return new Promise(r => requestAnimationFrame(r));
    }

    ClearBackground(color) {
        backCtx.fillStyle = color;
        backCtx.fillRect(0, 0, backCanvas.width, backCanvas.height);
    }

    DrawText(text, x, y, size, color) {
        backCtx.fillStyle = color;
        backCtx.font = `${size}px "Courier New", monospace`;
        backCtx.fillText(text, x, y + size);
    }

    DrawFPS(x, y) {
        this.DrawText(`FPS: ${this._fps}`, x, y, 20, this.LIME);
    }

    DrawRectangle(x, y, w, h, color) {
        backCtx.fillStyle = color;
        backCtx.fillRect(x, y, w, h);
    }

    DrawCircle(x, y, radius, color) {
        backCtx.beginPath();
        backCtx.arc(x, y, radius, 0, 2 * Math.PI);
        backCtx.fillStyle = color;
        backCtx.fill();
    }

    DrawLine(x1, y1, x2, y2, color) {
        backCtx.beginPath();
        backCtx.moveTo(x1, y1);
        backCtx.lineTo(x2, y2);
        backCtx.strokeStyle = color;
        backCtx.lineWidth = 1;
        backCtx.stroke();
    }

    DrawTriangle(v1x, v1y, v2x, v2y, v3x, v3y, color) {
        backCtx.beginPath();
        backCtx.moveTo(v1x, v1y);
        backCtx.lineTo(v2x, v2y);
        backCtx.lineTo(v3x, v3y);
        backCtx.closePath();
        backCtx.fillStyle = color;
        backCtx.fill();
    }

    DrawPoly(x, y, sides, radius, rotation, color) {
        if (sides < 3) return;
        backCtx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (rotation * Math.PI / 180) + (i * 2 * Math.PI / sides);
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            if (i === 0) backCtx.moveTo(px, py);
            else backCtx.lineTo(px, py);
        }
        backCtx.closePath();
        backCtx.fillStyle = color;
        backCtx.fill();
    }

    CheckCollisionRecs(x1, y1, w1, h1, x2, y2, w2, h2) {
        return (x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2);
    }

    CheckCollisionCircleRec(cx, cy, radius, rx, ry, rw, rh) {
        let testX = cx;
        let testY = cy;
        if (cx < rx) testX = rx;
        else if (cx > rx + rw) testX = rx + rw;
        if (cy < ry) testY = ry;
        else if (cy > ry + rh) testY = ry + rh;
        const distX = cx - testX;
        const distY = cy - testY;
        return (distX * distX + distY * distY) <= (radius * radius);
    }

    CheckCollisionCircles(x1, y1, r1, x2, y2, r2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        const distSq = dx * dx + dy * dy;
        const radSum = r1 + r2;
        return distSq <= (radSum * radSum);
    }

    GetTime() { return performance.now() / 1000; }
    GetFrameTime() { return 1 / (this._fps || 60); }

    IsKeyDown(key) { return keys.has(key.toLowerCase()); }
    IsKeyPressed(key) { return keysPressed.has(key.toLowerCase()); }
    IsMouseButtonDown(btn) { return mouseButtons.has(btn); }
    IsMouseButtonPressed(btn) { return mouseButtonsPressed.has(btn); }
    GetMouseX() { return mousePos.x; }
    GetMouseY() { return mousePos.y; }
    GetScreenWidth() { return canvas ? canvas.width : 0; }
    GetScreenHeight() { return canvas ? canvas.height : 0; }
    GetRandomValue(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
}

export const MESH = new MeshEngine();

export default MESH;