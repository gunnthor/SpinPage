/* ══════════════════════════════════════
   Overlay canvas (confetti + boost elements)
══════════════════════════════════════ */
const overlayCanvas = document.createElement('canvas');
overlayCanvas.style.cssText = 'position:fixed;inset:0;z-index:1002;pointer-events:none;';
document.body.appendChild(overlayCanvas);
const octx = overlayCanvas.getContext('2d');

let confettiParticles = [];
let boostElements     = [];
let overlayRunning    = false;

function resizeOverlay() { overlayCanvas.width = window.innerWidth; overlayCanvas.height = window.innerHeight; }

const CONFETTI_COLORS = ['#d4af37','#f5e070','#c0392b','#e74c3c','#fff','#e8dfc8','#2471a3','#1e8449'];
const SUITS = ['♠','♥','♦','♣'];

function launchConfetti(accentColor) {
    const W = overlayCanvas.width, H = overlayCanvas.height;
    const ox = W / 2, oy = H * 0.42;
    const colors = [...CONFETTI_COLORS, accentColor];
    for (let i = 0; i < 160; i++) {
        const angle = Math.random() * Math.PI * 2, speed = Math.random() * 14 + 4;
        confettiParticles.push({
            x: ox + (Math.random()-0.5)*80, y: oy + (Math.random()-0.5)*60,
            vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 4,
            color: colors[Math.floor(Math.random()*colors.length)],
            w: Math.random()*11+5, h: Math.random()*6+3, r: Math.random()*5+2,
            rot: Math.random()*Math.PI*2, rotV: (Math.random()-0.5)*0.28,
            life: 0, maxLife: Math.floor(Math.random()*90+60),
            shape: Math.random() < 0.55 ? 'rect' : 'circle',
        });
    }
    startOverlay();
}

function launchBoostElements() {
    const W = overlayCanvas.width, H = overlayCanvas.height;
    const ox = W / 2, oy = H * 0.42;

    // Flying card suits — large and dramatic
    for (let i = 0; i < 28; i++) {
        const angle = Math.random() * Math.PI * 2, speed = Math.random() * 22 + 14;
        boostElements.push({
            kind: 'suit',
            symbol: SUITS[Math.floor(Math.random()*4)],
            x: ox + (Math.random()-0.5)*180, y: oy + (Math.random()-0.5)*120,
            vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 7,
            rot: Math.random()*360, rotV: (Math.random()-0.5)*18,
            size: Math.random()*42+22,
            color: ['#d4af37','#f5e070','#c0392b','#ff6b6b','#fff'][Math.floor(Math.random()*5)],
            life: 0, maxLife: Math.floor(Math.random()*70+50),
        });
    }

    // Golden sparks
    for (let i = 0; i < 70; i++) {
        const angle = Math.random() * Math.PI * 2, speed = Math.random() * 20 + 10;
        boostElements.push({
            kind: 'spark',
            x: ox + (Math.random()-0.5)*120, y: oy + (Math.random()-0.5)*100,
            vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed - 4,
            size: Math.random()*5+2,
            color: Math.random() < 0.65 ? '#d4af37' : '#ff6b6b',
            life: 0, maxLife: Math.floor(Math.random()*45+20),
        });
    }
    startOverlay();
}

function startOverlay() {
    if (!overlayRunning) { overlayRunning = true; requestAnimationFrame(overlayLoop); }
}

function overlayLoop() {
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Draw boost elements
    boostElements = boostElements.filter(p => {
        p.life++;
        p.x += p.vx; p.y += p.vy; p.vy += 0.38; p.vx *= 0.98;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (alpha <= 0) return false;

        octx.save();
        octx.globalAlpha = alpha;
        octx.translate(p.x, p.y);

        if (p.kind === 'suit') {
            p.rot += p.rotV;
            octx.rotate(p.rot * Math.PI / 180);
            octx.font = `bold ${p.size}px 'Palatino Linotype', serif`;
            octx.fillStyle = p.color;
            octx.shadowColor = p.color;
            octx.shadowBlur = 22;
            octx.textAlign = 'center';
            octx.textBaseline = 'middle';
            octx.fillText(p.symbol, 0, 0);
        } else {
            octx.beginPath(); octx.arc(0, 0, p.size, 0, Math.PI*2);
            octx.fillStyle = p.color;
            octx.shadowColor = p.color; octx.shadowBlur = 12;
            octx.fill();
        }
        octx.restore();
        return true;
    });

    // Draw confetti
    confettiParticles = confettiParticles.filter(p => {
        p.life++;
        p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.99;
        p.rot += p.rotV;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (alpha <= 0) return false;

        octx.save();
        octx.globalAlpha = alpha;
        octx.translate(p.x, p.y); octx.rotate(p.rot);
        octx.fillStyle = p.color;
        if (p.shape === 'rect') { octx.fillRect(-p.w/2, -p.h/2, p.w, p.h); }
        else { octx.beginPath(); octx.arc(0,0,p.r,0,Math.PI*2); octx.fill(); }
        octx.restore();
        return true;
    });

    if (boostElements.length === 0 && confettiParticles.length === 0) {
        overlayRunning = false;
        octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    } else {
        requestAnimationFrame(overlayLoop);
    }
}

/* ══════════════════════════════════════
   Fire
══════════════════════════════════════ */
const fireCanvas = document.getElementById('fireCanvas');
const fctx       = fireCanvas.getContext('2d');
let   fireParticles = [];
let   fireRunning   = false;

function startFire() {
    if (!fireRunning) { fireRunning = true; requestAnimationFrame(fireLoop); }
}

function resizeFire() { fireCanvas.width = window.innerWidth; fireCanvas.height = window.innerHeight; }

function spawnFlame(x, vy, size) {
    fireParticles.push({
        x, y: fireCanvas.height,
        vx: (Math.random()-0.5)*1.6, vy: vy ?? -(Math.random()*3.8+1.8),
        life: 0, maxLife: Math.floor(Math.random()*55+35),
        size: size ?? Math.random()*18+8,
    });
}

function fireColor(t) {
    let r,g,b;
    if      (t<0.22) { const u=t/0.22;          r=255; g=Math.round(255-u*55);       b=Math.round(120*(1-u)); }
    else if (t<0.52) { const u=(t-0.22)/0.3;   r=255; g=Math.round(200*(1-u));      b=0; }
    else if (t<0.78) { const u=(t-0.52)/0.26;  r=Math.round(255-u*85); g=0;         b=0; }
    else             { const u=(t-0.78)/0.22;  r=Math.round(170*(1-u)); g=0;        b=0; }
    return {r,g,b};
}

function fireLoop() {
    const W=fireCanvas.width, H=fireCanvas.height;
    fctx.clearRect(0,0,W,H);

    // Idle flames removed — fire only spawns via triggerWindBack()

    // Solid fill + globalAlpha — CSS blur on the canvas handles the glow
    fireParticles = fireParticles.filter(p => {
        p.life++; p.x+=p.vx+Math.sin(p.life*0.13)*0.9; p.y+=p.vy; p.vy*=0.99; p.size*=0.981;
        if (p.life>p.maxLife||p.size<0.5) return false;
        const t=p.life/p.maxLife, {r,g,b}=fireColor(t);
        const alpha=Math.pow(1-t,1.6)*0.9;
        fctx.globalAlpha = alpha;
        fctx.fillStyle = `rgb(${r},${g},${b})`;
        fctx.beginPath(); fctx.arc(p.x,p.y,p.size,0,Math.PI*2); fctx.fill();
        return true;
    });
    fctx.globalAlpha = 1;

    // Stop the loop once the surge burns out — no idle full-screen RAF
    if (fireParticles.length === 0) { fireRunning = false; fctx.clearRect(0,0,W,H); return; }
    requestAnimationFrame(fireLoop);
}


function flashScreen() {
    if (prefersReducedMotion()) return;   // skip the photosensitive luminance flash
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(212,175,55,0.22);z-index:1500;pointer-events:none;opacity:1;transition:opacity 0.45s ease;';
    document.body.appendChild(el);
    requestAnimationFrame(()=>{ el.style.opacity='0'; });
    setTimeout(()=>el.remove(), 550);
}

function shakeWheel() {
    wheelWrap.classList.remove('shaking');
    void wheelWrap.offsetWidth; // force reflow
    wheelWrap.classList.add('shaking');
    setTimeout(()=>wheelWrap.classList.remove('shaking'), 600);
}
