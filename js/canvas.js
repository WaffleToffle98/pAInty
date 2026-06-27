// canvas.js — manages the 4 stacked canvas layers

class CanvasManager {
    constructor() {
        this.W = 720;
        this.H = 460;

        // Grab each layer
        this.layers = {
            bg:     document.getElementById('canvas-bg'),
            target: document.getElementById('canvas-target'),
            ai:     document.getElementById('canvas-ai'),
            cursor: document.getElementById('canvas-cursor'),
        };

        // Set buffer size for all
        Object.values(this.layers).forEach(c => {
            c.width  = this.W;
            c.height = this.H;
        });

        // Get 2D contexts
        this.ctx = {};
        Object.entries(this.layers).forEach(([name, canvas]) => {
            this.ctx[name] = canvas.getContext('2d');
        });

        this._drawBackground();
    }

    // Warm off-white with dot grid — gives it a sketchpad feel
    _drawBackground() {
        const ctx = this.ctx.bg;

        ctx.fillStyle = '#F7F6F1';
        ctx.fillRect(0, 0, this.W, this.H);

        // Dot grid
        const spacing = 22;
        ctx.fillStyle = '#CCCBBF';
        for (let x = spacing; x < this.W; x += spacing) {
            for (let y = spacing; y < this.H; y += spacing) {
                ctx.beginPath();
                ctx.arc(x, y, 0.9, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    clearLayer(name) {
        this.ctx[name].clearRect(0, 0, this.W, this.H);
    }

    clearAll() {
        this.clearLayer('target');
        this.clearLayer('ai');
        this.clearLayer('cursor');
    }

    // ── TARGET SHAPES — dashed blue overlay ──────────────────────────

    drawTargetCircle(cx, cy, radius) {
        const ctx = this.ctx.target;
        ctx.save();
        ctx.strokeStyle = '#5B91D0';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        // Small crosshair at center so you can see where (cx,cy) is
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
        ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
        ctx.stroke();
        ctx.restore();
    }

    drawTargetRect(cx, cy, w, h) {
        const ctx = this.ctx.target;
        ctx.save();
        ctx.strokeStyle = '#5B91D0';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        ctx.globalAlpha = 0.75;
        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
        // Center dot
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#5B91D0';
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawTargetLine(x1, y1, x2, y2) {
        const ctx = this.ctx.target;
        ctx.save();
        ctx.strokeStyle = '#5B91D0';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // End-point dots
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#5B91D0';
        [[x1, y1], [x2, y2]].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    // ── AI DRAWING ───────────────────────────────────────────────────

    // Pen DOWN — solid red stroke (the actual drawing)
    drawAILine(x1, y1, x2, y2) {
        const ctx = this.ctx.ai;
        ctx.save();
        ctx.strokeStyle = '#CC5858';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }

    // Pen UP — faint grey dash so you can see the AI "walking" between shapes
    drawAIMove(x1, y1, x2, y2) {
        const ctx = this.ctx.ai;
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 100, 120, 0.22)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 7]);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }

    // ── AI CURSOR — cleared every frame so it moves smoothly ─────────

    drawCursor(x, y, penDown) {
        const ctx = this.ctx.cursor;
        ctx.clearRect(0, 0, this.W, this.H);
        ctx.save();

        const color = penDown ? '#CC5858' : '#888899';

        // Outer ring
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = penDown ? 'rgba(204,88,88,.3)' : 'rgba(136,136,153,.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(x, y, penDown ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.restore();
    }
}