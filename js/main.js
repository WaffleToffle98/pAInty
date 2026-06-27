// main.js — pAInty training simulation

const cm = new CanvasManager();

// ── Helpers ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function setStat(id, val) {
    const el = $(id);
    if (el) el.textContent = val;
}

function setMode(mode) {
    $('mode-pill').textContent = '● ' + mode;
    $('mode-pill').className   = 'pill ' + mode;
    setStat('s-mode', mode);
}

function setError(n) {
    const pct = Math.min(Math.round(n * 100), 100);
    $('error-num').textContent       = n.toFixed(3);
    $('error-fill').style.width      = pct + '%';
    $('error-fill').style.background = n < 0.05 ? '#6EC66E' : n < 0.25 ? '#F0C060' : '#CC5858';
}

// ── Geometry helper ───────────────────────────────────────────────────
// Returns the closest point on segment A→B to point P.
// This is how we find the nearest spot on any rectangle edge to the cursor.
function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: ax, y: ay };
    // t is how far along the segment (0 = at A, 1 = at B), clamped to [0,1]
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return { x: ax + t * dx, y: ay + t * dy };
}

// ── State ─────────────────────────────────────────────────────────────
let SPEED         = 5;
let running       = false;
let renderEnabled = true;
let rafId         = null;
let epochCount    = 0;

// AI cursor starts at canvas centre
let curX = cm.W / 2;
let curY = cm.H / 2;

// The current shape's movement plan
let waypoints = [];
let penFlags  = [];   // penFlags[i] = true means draw a line to waypoints[i]
let wpIdx     = 0;

// For shapes/sec rate display in fast mode
let rateTimer     = Date.now();
let rateEpochMark = 0;

// ── Shape preparation ─────────────────────────────────────────────────
// Generates a random shape and fills waypoints/penFlags using the
// CURRENT cursor position to find the most efficient entry point.
// Returns shape data so the caller can draw the target overlay.
function prepareShape() {
    const types = ['circle', 'rect', 'line'];
    const type  = types[Math.floor(Math.random() * types.length)];

    const margin = 80;
    const cx = margin + Math.random() * (cm.W - margin * 2);
    const cy = margin + Math.random() * (cm.H - margin * 2);
    const r  = 28  + Math.random() * 55;
    const w  = 70  + Math.random() * 130;
    const h  = 45  + Math.random() * 90;

    waypoints = [];
    penFlags  = [];
    wpIdx     = 0;

    if (type === 'circle') {
        // atan2 gives the angle from the centre pointing AT the cursor.
        // That angle is the closest point on the circle's edge, so we start there.
        const startAngle = Math.atan2(curY - cy, curX - cx);
        const steps = 64;

        waypoints.push({
            x: cx + Math.cos(startAngle) * r,
            y: cy + Math.sin(startAngle) * r
        });
        penFlags.push(false); // pen UP: travel to start

        for (let i = 1; i <= steps; i++) {
            const a = startAngle + (i / steps) * Math.PI * 2;
            waypoints.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
            penFlags.push(true); // pen DOWN: trace the circle
        }
    }

    if (type === 'rect') {
        const L = cx - w / 2, R = cx + w / 2;
        const T = cy - h / 2, B = cy + h / 2;

        // The 4 sides of the rectangle going clockwise.
        // Each is a segment from A to B.
        const sides = [
            { ax: L, ay: T, bx: R, by: T },  // top:    left  → right
            { ax: R, ay: T, bx: R, by: B },  // right:  top   → bottom
            { ax: R, ay: B, bx: L, by: B },  // bottom: right → left
            { ax: L, ay: B, bx: L, by: T },  // left:   bottom → top
        ];

        // Find the closest point on ANY side's edge to the current cursor.
        // This lets the AI start mid-side, not just at corners.
        let bestDist = Infinity, bestSide = 0, bestPt = null;
        sides.forEach((s, i) => {
            const pt = closestPointOnSegment(curX, curY, s.ax, s.ay, s.bx, s.by);
            const d  = Math.hypot(pt.x - curX, pt.y - curY);
            if (d < bestDist) { bestDist = d; bestSide = i; bestPt = pt; }
        });

        // Pen UP: travel to that nearest edge point
        waypoints.push({ x: bestPt.x, y: bestPt.y });
        penFlags.push(false);

        // Pen DOWN: draw to the end-corner of this side
        waypoints.push({ x: sides[bestSide].bx, y: sides[bestSide].by });
        penFlags.push(true);

        // Continue clockwise through the remaining 3 corners
        for (let i = 1; i <= 3; i++) {
            const s = sides[(bestSide + i) % 4];
            waypoints.push({ x: s.bx, y: s.by });
            penFlags.push(true);
        }

        // Close the shape by returning to where we started
        waypoints.push({ x: bestPt.x, y: bestPt.y });
        penFlags.push(true);
    }

    if (type === 'line') {
        const lx1 = cx - w / 2, ly1 = cy - h / 4;
        const lx2 = cx + w / 2, ly2 = cy + h / 4;

        // Start from whichever endpoint is closer to the cursor
        const d1 = Math.hypot(lx1 - curX, ly1 - curY);
        const d2 = Math.hypot(lx2 - curX, ly2 - curY);

        if (d1 <= d2) {
            waypoints = [{ x: lx1, y: ly1 }, { x: lx2, y: ly2 }];
        } else {
            waypoints = [{ x: lx2, y: ly2 }, { x: lx1, y: ly1 }];
        }
        penFlags = [false, true];
    }

    return { type, cx, cy, r, w, h };
}

// ── Next shape ────────────────────────────────────────────────────────
function nextShape() {
    if (!running) return;

    const s = prepareShape();

    if (renderEnabled) {
        cm.clearLayer('target');
        cm.clearLayer('ai');

        if (s.type === 'circle') cm.drawTargetCircle(s.cx, s.cy, s.r);
        if (s.type === 'rect')   cm.drawTargetRect(s.cx, s.cy, s.w, s.h);
        if (s.type === 'line')   cm.drawTargetLine(
            s.cx - s.w / 2, s.cy - s.h / 4,
            s.cx + s.w / 2, s.cy + s.h / 4
        );

        setStat('s-shape',  s.type);
        setStat('s-target', `(${Math.round(s.cx)}, ${Math.round(s.cy)})`);
        setMode('training');

        if (rafId) cancelAnimationFrame(rafId);
        tick();
    } else {
        runFastBatch();
    }
}

// ── Personality pause ─────────────────────────────────────────────────
// When pAInty finishes a shape, it pauses with a green flash then
// jitters slightly — like a person stepping back to look at their drawing.
function personalityPause(callback) {
    const delay     = 600 + Math.random() * 1200;  // 0.6–1.8 sec
    const startTime = performance.now();
    const homeX     = curX;
    const homeY     = curY;

    cm.drawCursor(homeX, homeY, false, '#6EC66E'); // green "I'm done!" flash
    setMode('thinking');

    function idleTick() {
        if (!running) return;

        const elapsed = performance.now() - startTime;
        if (elapsed >= delay) {
            // Time's up — snap back and move on
            curX = homeX;
            curY = homeY;
            cm.drawCursor(curX, curY, false);
            callback();
            return;
        }

        // Tiny random jitter — looks like the AI is thinking
        const jx = homeX + (Math.random() - 0.5) * 3;
        const jy = homeY + (Math.random() - 0.5) * 3;
        cm.drawCursor(jx, jy, false);

        rafId = requestAnimationFrame(idleTick);
    }

    idleTick();
}

// ── Animation tick (render ON) ────────────────────────────────────────
function tick() {
    if (!running) return;

    const wp = waypoints[wpIdx];

    if (!wp) {
        // Finished this shape
        setError(0);
        setStat('s-error', '0 px');
        epochCount++;
        setStat('s-epoch', epochCount.toLocaleString());
        personalityPause(() => { if (running) nextShape(); });
        return;
    }

    const dx      = wp.x - curX;
    const dy      = wp.y - curY;
    const dist    = Math.sqrt(dx * dx + dy * dy);
    const penDown = penFlags[wpIdx];
    let nx = curX, ny = curY;

    if (dist <= SPEED) {
        // Close enough — snap to waypoint and advance
        nx = wp.x; ny = wp.y;
        if (penDown) cm.drawAILine(curX, curY, nx, ny);
        else         cm.drawAIMove(curX, curY, nx, ny);
        wpIdx++;
    } else {
        // Move SPEED pixels toward the waypoint
        nx = curX + (dx / dist) * SPEED;
        ny = curY + (dy / dist) * SPEED;
        if (penDown) cm.drawAILine(curX, curY, nx, ny);
        else         cm.drawAIMove(curX, curY, nx, ny);
    }

    curX = nx;
    curY = ny;
    cm.drawCursor(curX, curY, penDown);

    setStat('s-x',   Math.round(curX));
    setStat('s-y',   Math.round(curY));
    setStat('s-pen', penDown ? 'DOWN ✏️' : 'up');

    rafId = requestAnimationFrame(tick);
}

// ── Fast batch (render OFF) ───────────────────────────────────────────
// Completes 200 shapes per call with no drawing — just math.
// Yields to the browser between batches so the page stays responsive.
function runFastBatch() {
    if (!running || renderEnabled) return;

    const BATCH = 200;
    for (let i = 0; i < BATCH && running && !renderEnabled; i++) {
        prepareShape();
        // Skip all animation — jump cursor straight to the final waypoint
        if (waypoints.length > 0) {
            const last = waypoints[waypoints.length - 1];
            curX = last.x;
            curY = last.y;
        }
        epochCount++;
    }

    // Update stats once per batch
    setStat('s-epoch', epochCount.toLocaleString());
    setStat('s-x', Math.round(curX));
    setStat('s-y', Math.round(curY));

    // Calculate and display shapes/sec every 500ms
    const now = Date.now();
    if (now - rateTimer >= 500) {
        const rate = Math.round((epochCount - rateEpochMark) / ((now - rateTimer) / 1000));
        setStat('s-rate', rate.toLocaleString() + '/s');
        rateTimer     = now;
        rateEpochMark = epochCount;
    }

    // Yield briefly to the browser, then keep going
    if (running && !renderEnabled) {
        setTimeout(runFastBatch, 0);
    }
}

// ── Buttons ───────────────────────────────────────────────────────────

$('btn-run').addEventListener('click', () => {
    if (running) {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        $('btn-run').textContent = '▶  Run';
        setMode('idle');
    } else {
        running = true;
        $('btn-run').textContent = '⏸  Pause';
        rateTimer     = Date.now();
        rateEpochMark = epochCount;
        nextShape();
    }
});

$('btn-clear').addEventListener('click', () => {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    cm.clearAll();
    curX = cm.W / 2;
    curY = cm.H / 2;
    epochCount = 0;
    $('btn-run').textContent = '▶  Run';
    setMode('idle');
    ['s-shape', 's-target', 's-x', 's-y', 's-rate'].forEach(id => setStat(id, '—'));
    setStat('s-pen',   'up');
    setStat('s-epoch', '0');
    $('error-num').textContent  = '—';
    $('error-fill').style.width = '0%';
    setStat('s-error', '—');
});

$('slider-speed').addEventListener('input', e => {
    SPEED = parseInt(e.target.value);
    setStat('s-speed', SPEED + ' px/f');
});

$('btn-render').addEventListener('click', () => {
    renderEnabled = !renderEnabled;

    const btn = $('btn-render');
    btn.textContent = renderEnabled ? 'ON' : 'OFF';
    btn.className   = 'btn-toggle ' + (renderEnabled ? 'on' : 'off');

    if (running) {
        if (rafId) cancelAnimationFrame(rafId);

        if (renderEnabled) {
            setStat('s-rate', '—');
            nextShape();                      // back to animated mode
        } else {
            rateTimer     = Date.now();
            rateEpochMark = epochCount;
            runFastBatch();                   // switch to fast mode
        }
    }
});