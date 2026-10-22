/* ══════════════════════════════════════
   Audio
══════════════════════════════════════ */
let audioCtx = null;

function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

/* ------------------------------------------------------------------
   Peg click
   ------------------------------------------------------------------
   A leather flapper snapping off a wheel pin is two sounds at once: a
   bright contact transient, then the pin and flapper ringing together on
   a couple of inharmonic modes. Each click is rebuilt from those parts
   with a little randomness, so no two are identical.

   `tickIntensity` (0 = crawling, 1 = flat out) is the other half of it.
   A fast wheel is bright, tight and clipped; a dying one is duller,
   lower and rings on. That contrast is what makes a spin audibly slow
   down instead of just clicking slower.
------------------------------------------------------------------ */
let tickIntensity = 0.5;
let noiseBuffer   = null;
let tickBus       = null;

// One shared noise table, read from a random offset per click.
function getNoiseBuffer() {
    if (!noiseBuffer) {
        const len = Math.floor(audioCtx.sampleRate * 0.4);
        noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const d = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
}

// Clicks can land ~100x a second at full tilt, so they share a compressor
// instead of stacking straight onto the output and clipping.
function getTickBus() {
    if (!tickBus) {
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 7;
        comp.attack.value = 0.002; comp.release.value = 0.14;
        // Six times as many clicks as the old one-per-slice cadence, so the
        // bus is pulled well down to keep the clatter under the fanfare.
        const out = audioCtx.createGain(); out.gain.value = 0.6;
        comp.connect(out); out.connect(audioCtx.destination);
        tickBus = comp;
    }
    return tickBus;
}

// accent = the click that marks a whole slice passing, rather than one of
// the pins between them: a shade lower, louder and woodier.
function playTick(accent) {
    if (!audioCtx) return;
    const t   = audioCtx.currentTime;
    const i   = Math.min(Math.max(tickIntensity, 0), 1);
    const bus = getTickBus();

    // 1. Contact transient — flapper snapping off the pin.
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    noise.playbackRate.value = 0.75 + Math.random() * 0.6;
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1500 + 2800 * i;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime((accent ? 0.42 : 0.28) * (0.7 + 0.3 * i), t);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + 0.010 + 0.012 * (1 - i));
    noise.connect(hp); hp.connect(ng); ng.connect(bus);
    noise.start(t, Math.random() * 0.3); noise.stop(t + 0.06);

    // 2. Body — two inharmonic modes with a fast pitch drop, so it reads
    //    as something struck rather than a beep.
    const decay = 0.085 - 0.055 * i;
    const base  = (accent ? 430 : 600) * (0.92 + Math.random() * 0.16) * (0.85 + 0.4 * i);
    [[1, 1], [2.74, 0.4]].forEach(([mult, lvl]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(base * mult * 1.7, t);
        o.frequency.exponentialRampToValueAtTime(base * mult, t + 0.018);
        const peak = (accent ? 0.3 : 0.19) * lvl * (0.65 + 0.5 * (1 - i));
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + decay + 0.03);
    });
}

// Wheel speed (rad/ms) -> click character. 0.03 rad/ms is about a
// full-blooded flick, which is where the tone tops out.
function setTickSpeed(radPerMs) {
    tickIntensity = Math.min(Math.abs(radPerMs) / 0.03, 1);
}

// A real wheel carries far more pins than slices — a three-name wheel
// clicking three times a lap sounds empty. Clicks come off a ring of
// ~30 evenly spaced pegs instead, a whole number of them per slice, so
// every `per`-th click can be accented as a name goes by.
const PEG_RING = 30;
function pegRing(segments) {
    const segs = Math.max(segments, 1);
    const per  = Math.max(1, Math.ceil(PEG_RING / segs));
    return { per, arc: (2 * Math.PI) / (segs * per) };
}
function isAccentPeg(idx, per) { return ((idx % per) + per) % per === 0; }

function playStampSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    // Deep thud
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    g.gain.setValueAtTime(1.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.42);
    // Impact crack
    const bufLen = Math.floor(audioCtx.sampleRate * 0.07);
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<bufLen;i++) data[i] = Math.random()*2-1;
    const noise = audioCtx.createBufferSource(), ng = audioCtx.createGain(), nf = audioCtx.createBiquadFilter();
    noise.buffer = buf; nf.type = 'lowpass'; nf.frequency.value = 600;
    ng.gain.setValueAtTime(0.7, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    noise.connect(nf); nf.connect(ng); ng.connect(audioCtx.destination);
    noise.start(now); noise.stop(now + 0.08);
}


/* -- Wind-back --
   A ratchet letting go, then the wheel groaning backwards against it.
   The peg clicks carry the clatter on their own, so these two only have
   to supply the mechanism underneath them. */
function playWindBack() {
    if (!audioCtx) return;
    const fx  = getFxBus();
    const now = audioCtx.currentTime;

    // the catch releasing — one hard metallic clack
    const c = audioCtx.createOscillator(), cg = audioCtx.createGain();
    c.type = 'square';
    c.frequency.setValueAtTime(340, now);
    c.frequency.exponentialRampToValueAtTime(90, now + 0.09);
    cg.gain.setValueAtTime(0.0001, now);
    cg.gain.exponentialRampToValueAtTime(0.4, now + 0.006);
    cg.gain.exponentialRampToValueAtTime(0.0006, now + 0.2);
    c.connect(cg); cg.connect(fx.dry); cg.connect(fx.verb);
    c.start(now); c.stop(now + 0.22);
    noiseBurst(0.12, 1800, 0.32, 0.8);

    // the groan of the wheel being dragged the wrong way
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(210, now + 0.02);
    o.frequency.exponentialRampToValueAtTime(58, now + 1.5);
    lp.type = 'lowpass'; lp.Q.value = 5;
    lp.frequency.setValueAtTime(1400, now + 0.02);
    lp.frequency.exponentialRampToValueAtTime(180, now + 1.5);
    g.gain.setValueAtTime(0.0001, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.26, now + 0.12);
    g.gain.setValueAtTime(0.26, now + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.65);
    o.connect(lp); lp.connect(g); g.connect(fx.dry); g.connect(fx.verb);
    o.start(now + 0.02); o.stop(now + 1.7);

    // a slow wobble on the groan, so it sounds strained rather than synthy
    const lfo = audioCtx.createOscillator(), lg = audioCtx.createGain();
    lfo.type = 'sine'; lfo.frequency.setValueAtTime(6.5, now);
    lg.gain.setValueAtTime(9, now);
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(now); lfo.stop(now + 1.7);
}

/* -- The shove --
   What the wind-back is given to send it the other way: a sub thump and
   a whoosh sweeping up under the groan of the reversal. */
function playShove() {
    if (!audioCtx) return;
    const fx  = getFxBus();
    const now = audioCtx.currentTime;

    const thump = audioCtx.createOscillator(), tg = audioCtx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(180, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.3);
    tg.gain.setValueAtTime(0.7, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    thump.connect(tg); tg.connect(fx.dry);
    thump.start(now); thump.stop(now + 0.5);

    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, now);
    o.frequency.exponentialRampToValueAtTime(1100, now + 0.42);
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.exponentialRampToValueAtTime(3200, now + 0.42);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.4, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.62);
    o.connect(bp); bp.connect(g); g.connect(fx.dry); g.connect(fx.verb);
    o.start(now); o.stop(now + 0.65);

    // air moving with it
    const n = audioCtx.createBufferSource();
    n.buffer = getNoiseBuffer(); n.loop = true;
    const nf = audioCtx.createBiquadFilter();
    nf.type = 'bandpass'; nf.Q.value = 0.7;
    nf.frequency.setValueAtTime(500, now);
    nf.frequency.exponentialRampToValueAtTime(5200, now + 0.4);
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.3, now + 0.1);
    ng.gain.exponentialRampToValueAtTime(0.0006, now + 0.6);
    n.connect(nf); nf.connect(ng); ng.connect(fx.dry); ng.connect(fx.verb);
    n.start(now); n.stop(now + 0.65);
}

/* -- The gremlin --
   Three noises: him landing on the rim, one per shove, and the laugh he
   leaves on. The shoves stay deliberately quiet — the peg ticks are the
   star of a creep this slow, and a grunt on top of each one is enough to
   tell you the wheel isn't moving on its own. */
function playGoblinArrive() {
    if (!audioCtx) return;
    const fx  = getFxBus();
    const now = audioCtx.currentTime;

    // something heavy landing on the rim
    const th = audioCtx.createOscillator(), tg = audioCtx.createGain();
    th.type = 'sine';
    th.frequency.setValueAtTime(155, now);
    th.frequency.exponentialRampToValueAtTime(38, now + 0.26);
    tg.gain.setValueAtTime(0.6, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    th.connect(tg); tg.connect(fx.dry);
    th.start(now); th.stop(now + 0.36);
    noiseBurst(0.09, 2600, 0.3, 0.9);

    // and the noise it makes: a squeal sliding UP, which is the wrong
    // direction for anything friendly
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    const bp = audioCtx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, now + 0.03);
    o.frequency.exponentialRampToValueAtTime(940, now + 0.20);
    o.frequency.exponentialRampToValueAtTime(700, now + 0.34);
    bp.type = 'bandpass'; bp.Q.value = 3.5;
    bp.frequency.setValueAtTime(700, now + 0.03);
    bp.frequency.exponentialRampToValueAtTime(2400, now + 0.28);
    g.gain.setValueAtTime(0.0001, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.30, now + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);
    o.connect(bp); bp.connect(g); g.connect(fx.dry); g.connect(fx.verb);
    o.start(now + 0.03); o.stop(now + 0.45);

    // a flutter on it, so it reads as a creature and not a synth sweep
    const lfo = audioCtx.createOscillator(), lg = audioCtx.createGain();
    lfo.type = 'sine'; lfo.frequency.setValueAtTime(18, now);
    lg.gain.setValueAtTime(55, now);
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(now); lfo.stop(now + 0.45);
}

function playGoblinShove(kind) {
    if (!audioCtx) return;
    const fx  = getFxBus();
    const now = audioCtx.currentTime;
    const heave = kind === 'release', snatch = kind === 'gotcha', back = kind === 'tease';
    const hard  = heave || snatch;      // both are him yanking, not nudging

    // the grunt — a short vowel through a formant-ish bandpass. A normal
    // shove falls away; the last heave pushes up, because he means it.
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    const f = audioCtx.createBiquadFilter();
    o.type = 'sawtooth';
    const f0 = (back ? 150 : 195) * (0.9 + Math.random() * 0.2);
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(hard ? f0 * 1.5 : f0 * 0.62, now + (hard ? 0.26 : 0.16));
    f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(back ? 520 : 780, now);
    f.frequency.exponentialRampToValueAtTime(back ? 300 : 460, now + 0.2);
    const lvl = heave ? 0.30 : snatch ? 0.26 : back ? 0.20 : 0.16;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(lvl, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, now + (hard ? 0.34 : 0.20));
    o.connect(f); f.connect(g); g.connect(fx.dry); g.connect(fx.verb);
    o.start(now); o.stop(now + 0.38);

    // claws dragging along the rim
    const n = audioCtx.createBufferSource();
    n.buffer = getNoiseBuffer(); n.loop = true;
    n.playbackRate.value = 0.5 + Math.random() * 0.4;
    const nf = audioCtx.createBiquadFilter();
    nf.type = 'bandpass'; nf.Q.value = 1.1;
    nf.frequency.setValueAtTime(hard ? 1200 : 2000, now);
    nf.frequency.exponentialRampToValueAtTime(hard ? 3400 : 1100, now + 0.22);
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(hard ? 0.20 : 0.10, now + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0005, now + (hard ? 0.40 : 0.24));
    n.connect(nf); nf.connect(ng); ng.connect(fx.dry); ng.connect(fx.verb);
    n.start(now); n.stop(now + 0.45);
}

/* Him taking his hands off: claws unhooking from the rim, and the little
   ring of a wheel left to its own devices. Deliberately small — the point of
   the fake stop is that nothing is happening. */
function playGoblinLetGo() {
    if (!audioCtx) return;
    const fx  = getFxBus();
    const now = audioCtx.currentTime;

    const n = audioCtx.createBufferSource();
    n.buffer = getNoiseBuffer(); n.loop = true;
    n.playbackRate.value = 1.4;
    const nf = audioCtx.createBiquadFilter();
    nf.type = 'bandpass'; nf.Q.value = 2.2;
    nf.frequency.setValueAtTime(2600, now);
    nf.frequency.exponentialRampToValueAtTime(5200, now + 0.12);
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
    ng.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);
    n.connect(nf); nf.connect(ng); ng.connect(fx.dry); ng.connect(fx.verb);
    n.start(now); n.stop(now + 0.2);

    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1180, now);
    o.frequency.exponentialRampToValueAtTime(940, now + 0.5);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.55);
    o.connect(g); g.connect(fx.dry); g.connect(fx.verb);
    o.start(now); o.stop(now + 0.6);
}

// A laugh is a rhythm, not a tone: short syllables tumbling down in pitch,
// each one breathed rather than beeped. Four syllables is a snigger, eight
// is the one he leaves on.
function playGoblinCackle(count) {
    if (!audioCtx) return;
    const fx  = getFxBus();
    const now = audioCtx.currentTime;
    const syllables = count || (7 + Math.floor(Math.random() * 3));
    let t = now;

    for (let i = 0; i < syllables; i++) {
        const u   = i / (syllables - 1);
        const f0  = 640 * Math.pow(0.865, i) * (0.95 + Math.random() * 0.12);
        const dur = 0.072 + Math.random() * 0.032;
        const lvl = 0.26 * (1 - u * 0.45);

        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        const bp = audioCtx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * 1.12, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.84, t + dur);
        bp.type = 'bandpass'; bp.Q.value = 2.6;
        bp.frequency.setValueAtTime(f0 * 2.4, t);
        bp.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(lvl, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
        o.connect(bp); bp.connect(g); g.connect(fx.dry); g.connect(fx.verb);
        o.start(t); o.stop(t + dur + 0.02);

        // the breath behind the syllable
        const n = audioCtx.createBufferSource();
        n.buffer = getNoiseBuffer(); n.loop = true;
        const nf = audioCtx.createBiquadFilter();
        nf.type = 'bandpass'; nf.Q.value = 1.6;
        nf.frequency.setValueAtTime(f0 * 3.2, t);
        const ng = audioCtx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(lvl * 0.42, t + 0.01);
        ng.gain.exponentialRampToValueAtTime(0.0005, t + dur * 0.9);
        n.connect(nf); nf.connect(ng); ng.connect(fx.dry); ng.connect(fx.verb);
        n.start(t, Math.random() * 0.3); n.stop(t + dur + 0.02);

        t += dur + 0.026 + Math.random() * 0.024;
    }
}

/* ------------------------------------------------------------------
   Winner fanfare
   ------------------------------------------------------------------
   Bare sine tones are the sound of a test signal, which is why the old
   one felt cheap. This one is arranged instead of beeped:

     impact  - a sub thump and a cymbal splash, so the win lands
     stabs   - detuned sawtooths through a resonant filter that snaps
               open: harmonics and movement, roughly brass-shaped
     bells   - FM voices (inharmonic modulator) for glockenspiel shine
     room    - everything sits in a generated hall reverb

   Voices are spread across the stereo field and share a limiter, so all
   the layers can pile up without turning into a clipped mush.
------------------------------------------------------------------ */
let winFx = null;

// Exponentially decaying noise makes a serviceable hall impulse.
function makeHallIR(seconds, decay) {
    const len = Math.floor(audioCtx.sampleRate * seconds);
    const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
            const room = Math.pow(1 - i / len, decay);
            d[i] = (Math.random() * 2 - 1) * room * (i < 60 ? i / 60 : 1);
        }
    }
    return buf;
}

function getFxBus() {
    if (!winFx) {
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -15; comp.knee.value = 18; comp.ratio.value = 5;
        comp.attack.value = 0.004; comp.release.value = 0.25;
        const master = audioCtx.createGain(); master.gain.value = 0.95;
        comp.connect(master); master.connect(audioCtx.destination);

        const verb = audioCtx.createConvolver();
        verb.buffer = makeHallIR(1.9, 2.6);
        const wet = audioCtx.createGain(); wet.gain.value = 0.38;
        verb.connect(wet); wet.connect(comp);

        winFx = { dry: comp, verb };
    }
    return winFx;
}

// Send one voice to the room and the front at once.
function winOut(node, pan) {
    const fx = getFxBus();
    const p = audioCtx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    node.connect(p);
    p.connect(fx.dry);
    p.connect(fx.verb);
}

// Brass-ish stab: two detuned saws through a resonant lowpass that opens
// hard on the attack and closes as the note decays.
function winStab(t, freq, dur, level, pan) {
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = 6;
    filt.frequency.setValueAtTime(420, t);
    filt.frequency.exponentialRampToValueAtTime(Math.min(freq * 8, 7500), t + 0.055);
    filt.frequency.exponentialRampToValueAtTime(Math.max(freq * 2.2, 500), t + dur);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.018);
    g.gain.setValueAtTime(level, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);

    filt.connect(g);
    winOut(g, pan);

    [-8, 8].forEach(cents => {
        const o = audioCtx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq, t);
        o.detune.setValueAtTime(cents, t);
        o.connect(filt);
        o.start(t); o.stop(t + dur + 0.06);
    });
}

// FM bell — a sine carrier bent by an inharmonic sine, which is what makes
// metal sound like metal rather than like a flute.
function winBell(t, freq, dur, level, pan, ratio) {
    const car = audioCtx.createOscillator();
    car.type = 'sine'; car.frequency.setValueAtTime(freq, t);

    const mod = audioCtx.createOscillator();
    mod.type = 'sine'; mod.frequency.setValueAtTime(freq * (ratio || 3.47), t);
    const mg = audioCtx.createGain();
    mg.gain.setValueAtTime(freq * 2.4, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur * 0.45);
    mod.connect(mg); mg.connect(car.frequency);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);

    car.connect(g);
    winOut(g, pan);
    car.start(t); car.stop(t + dur + 0.05);
    mod.start(t); mod.stop(t + dur + 0.05);
}

// The hit itself: sub drop plus a splash, so the chord has something to
// land on instead of just appearing.
function winImpact(t) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.26);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); g.connect(getFxBus().dry);
    o.start(t); o.stop(t + 0.5);

    const n = audioCtx.createBufferSource();
    n.buffer = getNoiseBuffer(); n.loop = true;
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 5000;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.9);
    n.connect(hp); hp.connect(ng);
    winOut(ng, 0);
    n.start(t); n.stop(t + 1.0);
}

// windowMs = how long the winner card is up for. Big tables autospin
// through in 600ms, so the tail is trimmed rather than left ringing over
// the next spin.
function playFanfare(windowMs) {
    if (!audioCtx) return;
    const t0   = audioCtx.currentTime + 0.02;
    const room = Math.max(600, windowMs || 2000);
    const full = room >= 1200;

    winImpact(t0);

    // Rising call into the chord: G C E G, alternating across the stereo.
    [392.00, 523.25, 659.25, 783.99].forEach((f, i) => {
        winStab(t0 + i * 0.085, f, 0.14, 0.2, i % 2 ? 0.28 : -0.28);
    });

    // Landing chord: C major add9 — the 9th is what stops it sounding
    // like a doorbell.
    const chordT = t0 + 0.36;
    const hold   = full ? 1.5 : 0.8;
    [261.63, 329.63, 392.00, 523.25, 587.33].forEach((f, i) => {
        winStab(chordT, f, hold, 0.15, (i - 2) * 0.16);
    });
    const sub = audioCtx.createOscillator(), sg = audioCtx.createGain();
    sub.type = 'sine'; sub.frequency.setValueAtTime(130.81, chordT);
    sg.gain.setValueAtTime(0.0001, chordT);
    sg.gain.exponentialRampToValueAtTime(0.42, chordT + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0006, chordT + hold);
    sub.connect(sg); sg.connect(getFxBus().dry);
    sub.start(chordT); sub.stop(chordT + hold + 0.05);

    // Bells doubling the chord an octave up, struck in a quick roll.
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        winBell(chordT + i * 0.025, f, full ? 1.5 : 0.85, 0.15, (i - 1.5) * 0.34);
    });

    // Coin shower over the tail — a payout trickling out of the machine.
    if (full) {
        const scale  = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349, 2637];
        const spread = Math.min(1.25, room / 1000 - 0.45);
        for (let i = 0; i < 15; i++) {
            const t = chordT + 0.22 + Math.random() * spread;
            const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 2 : 1);
            winBell(t, f, 0.26, 0.05 + Math.random() * 0.045,
                    (Math.random() * 2 - 1) * 0.85, 5.4);   // clinkier ratio
        }
    }
}


/* -- Pop-off sounds -- */
function noiseBurst(dur, freq, gain, q) {
    const len  = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buf  = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(audioCtx.destination);
    src.start(); src.stop(audioCtx.currentTime + dur + 0.02);
}

function playPopSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(150, now);
    o.frequency.exponentialRampToValueAtTime(1400, now + 0.11);
    o.frequency.exponentialRampToValueAtTime(320, now + 0.34);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.38, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 0.38);
    noiseBurst(0.22, 2600, 0.35, 0.7);
}

function playClank() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    [1180, 1790].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f * (0.94 + Math.random() * 0.12), now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.22 - i * 0.08, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(now); o.stop(now + 0.18);
    });
    noiseBurst(0.06, 3400, 0.2, 1.4);
}

// Heavy, wooden landing when the wheel meets the floor.
function playThud() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, now);
    o.frequency.exponentialRampToValueAtTime(34, now + 0.22);
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 0.42);
    noiseBurst(0.09, 260, 0.4, 0.6);
}

// Low looping rumble while it rolls, tracked to how fast it is going.
function startRumble() {
    if (!audioCtx || popOff.rumble) return;
    const src = audioCtx.createBufferSource();
    src.buffer = getNoiseBuffer(); src.loop = true;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 210; lp.Q.value = 0.8;
    const g = audioCtx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(audioCtx.destination);
    src.start();
    popOff.rumble = { src, g };
}

function setRumble(speed) {
    if (!popOff.rumble) return;
    const target = Math.min(Math.abs(speed) * 0.42, 0.4);
    popOff.rumble.g.gain.setTargetAtTime(target, audioCtx.currentTime, 0.04);
}

function stopRumble() {
    if (!popOff.rumble) return;
    const { src, g } = popOff.rumble;
    popOff.rumble = null;
    try {
        g.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
        src.stop(audioCtx.currentTime + 0.3);
    } catch (err) {}
}

function playReseatSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, now);
    o.frequency.exponentialRampToValueAtTime(48, now + 0.28);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 0.36);
    noiseBurst(0.12, 900, 0.28, 0.8);
}


function playPanicSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    for (let k = 0; k < 2; k++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(440, now + k * 0.24);
        o.frequency.linearRampToValueAtTime(650, now + k * 0.24 + 0.12);
        o.frequency.linearRampToValueAtTime(440, now + k * 0.24 + 0.24);
        g.gain.setValueAtTime(0.0001, now + k * 0.24);
        g.gain.linearRampToValueAtTime(0.3, now + k * 0.24 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, now + k * 0.24 + 0.22);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(now + k * 0.24); o.stop(now + k * 0.24 + 0.26);
    }
}

// Timber rattling — a clipped rail, not a clean note.
function playHurdleHit() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    [196, 262, 147].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        const t = now + i * 0.045;
        o.type = 'square';
        o.frequency.setValueAtTime(f * (0.9 + Math.random() * 0.2), t);
        o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.09);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22 - i * 0.05, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0006, t + 0.12);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + 0.14);
    });
    noiseBurst(0.14, 900, 0.3, 0.9);
}

function playFinishPing() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(880, now); o.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.22, now + 0.015); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now + 0.22);
}


function playPowerUpSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    [523.25, 659.25, 880].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, now + i * 0.07);
        g.gain.setValueAtTime(0, now + i * 0.07);
        g.gain.linearRampToValueAtTime(0.25, now + i * 0.07 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.18);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.2);
    });
}
