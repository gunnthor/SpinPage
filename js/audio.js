/* ══════════════════════════════════════
   Audio
══════════════════════════════════════ */
let audioCtx = null;

function ensureAudio() {
    if (!soundOn) return;                    // muted: don't even wake the context
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // The reverb is costly to build: do it now, while names are being
            // typed, rather than on top of the first winner's fanfare.
            setTimeout(() => { if (soundOn) try { getFxBus(); } catch (e) {} }, 300);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }         // no Web Audio: play silently
}

// Every sound asks this first. Muting stops new sounds at the source rather
// than suspending the context, which would queue them up and fire them all
// at once on unmute.
function sfx() { return !!audioCtx && soundOn; }

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
// the pins between them: a shade lower, louder, with weight under it.
function playTick(accent) {
    if (!sfx()) return;
    const t    = audioCtx.currentTime;
    const i    = Math.min(Math.max(tickIntensity, 0), 1);
    const slow = 1 - i;
    const bus  = getTickBus();

    // 1. The snap: the flapper's edge leaving the pin. Bright and tight.
    tickSnap(t, bus, (accent ? 0.5 : 0.36) * (0.75 + 0.25 * i), 2600 + 2200 * i, 0.006 + 0.008 * slow);

    // 2. The tok: the flapper itself ringing, a hard little woody note that
    //    drops a touch as it rings. Flat out they are thin; the last slow
    //    ones get their body back, which is what makes a landing land.
    const f = (accent ? 1150 : 1500) * (0.95 + Math.random() * 0.1) * (0.9 + 0.2 * i);
    [[1, 1], [2.76, 0.3]].forEach(([mult, lvl], k) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * mult * 1.25, t);
        o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.012);
        const peak = (accent ? 0.26 : 0.16) * lvl * (0.6 + 0.6 * slow);
        const dec  = (0.03 + 0.05 * slow) * (k ? 0.5 : 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + dec + 0.02);
    });

    // 3. A slice going past: a little thump of weight underneath.
    if (accent) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(210, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.05);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22 * (0.5 + 0.5 * slow), t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + 0.09);
    }

    // 4. Slow enough to hear it, the flapper bounces off the pin: a second,
    //    softer snap just behind the first.
    if (i < 0.25) tickSnap(t + 0.014 + Math.random() * 0.006, bus, 0.12, 3000, 0.006);
}

function tickSnap(t, bus, level, freq, decay) {
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    noise.playbackRate.value = 0.9 + Math.random() * 0.4;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq + Math.random() * 400; bp.Q.value = 1.1;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(level, t);
    ng.gain.exponentialRampToValueAtTime(0.0006, t + decay);
    noise.connect(bp); bp.connect(ng); ng.connect(bus);
    noise.start(t, Math.random() * 0.3); noise.stop(t + decay + 0.03);
}

// Wheel speed (rad/ms) -> click character. 0.03 rad/ms is about a
// full-blooded flick, which is where the tone tops out.
function setTickSpeed(radPerMs) {
    tickIntensity = Math.min(Math.abs(radPerMs) / 0.03, 1);
}


function playStampSound() {
    if (!sfx()) return;
    const now = audioCtx.currentTime;
    // Deep thud
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    g.gain.setValueAtTime(0.8, now);
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
    if (!sfx()) return;
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
    if (!sfx()) return;
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
    if (!sfx()) return;
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
    if (!sfx()) return;
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
    if (!sfx()) return;
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
    if (!sfx()) return;
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

/* -- Mallets --
   A marimba bar is a sine with a quiet fourth partial (about 3.93x) that
   dies far faster, struck with a soft knock. Warm, round, and quick to
   get out of the way: every sound that should feel like a reward is
   built on it. */
function mallet(t, freq, dur, level, pan) {
    [[1, level, dur], [3.93, level * 0.35, Math.min(dur, 0.12)]].forEach(([mult, lvl, d]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(freq * mult, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(lvl, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0004, t + d);
        o.connect(g); winOut(g, pan);
        o.start(t); o.stop(t + d + 0.05);
    });
}

// A burst of the shared noise, filtered, at time t, into the room.
function noiseAt(t, dur, freq, gain, q, type) {
    const src = audioCtx.createBufferSource();
    src.buffer = getNoiseBuffer(); src.loop = true;
    const f = audioCtx.createBiquadFilter();
    f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    src.connect(f); f.connect(g); g.connect(getFxBus().dry);
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
}

// A falling pitch through a decaying gain: kicks, thumps, clunks.
function thump(t, from, to, dur, level, pan) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    const p = audioCtx.createStereoPanner();
    p.pan.value = pan || 0;
    o.connect(g); g.connect(p); p.connect(getFxBus().dry);
    o.start(t); o.stop(t + dur + 0.03);
}

// Many machines can stop inside the same few milliseconds: one sound of a
// kind per window is plenty, and keeps a big table from turning to mush.
const lastPlayed = {};
function throttled(key, sec) {
    const now = audioCtx.currentTime;
    if (now - (lastPlayed[key] ?? -1) < sec) return true;
    lastPlayed[key] = now;
    return false;
}

// C major pentatonic, two octaves up from C5: anything climbing it sounds
// like progress.
const PENTA   = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
const SPARKLE = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349, 2637];

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
    if (!sfx()) return;
    const t0   = audioCtx.currentTime + 0.02;
    const room = Math.max(600, windowMs || 2000);
    const full = room >= 1200;

    winImpact(t0);

    // Rising call into the chord: G C E G on mallets an octave up, with the
    // brass under them, alternating across the stereo. The mallets are the
    // round, satisfying part; the brass gives them a bit of swagger.
    [392.00, 523.25, 659.25, 783.99].forEach((f, i) => {
        const t = t0 + i * 0.075, pan = i % 2 ? 0.28 : -0.28;
        mallet(t, f * 2, 0.45, 0.2, pan);
        winStab(t, f, 0.12, 0.13, pan);
    });

    // Landing chord: C major add9 — the 9th is what stops it sounding
    // like a doorbell.
    const chordT = t0 + 0.32;
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

    // A sparkle running up the scale over the top, left to right.
    SPARKLE.forEach((f, i) => winBell(chordT + 0.06 + i * 0.028, f, 0.45, 0.05, (i / 7 - 0.5) * 1.2, 3.5));

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


/* ------------------------------------------------------------------
   The reveal
   ------------------------------------------------------------------
   The wheel stops and the name comes up. Three beats, timed to the
   nameplate rising (340ms, with an overshoot):

     lock    - the wheel settling: a woody clunk and the latch catching
     swoosh  - air rushing up as the plate rises
     ta-DAA  - a pickup note, then a big D major add9 on brass, mallets
               and bells as the plate arrives, glitter falling after it

   A pick past the winner slots gets the same lock and swoosh but a
   lighter "ding-ding", so the room can hear a winner without looking.
   The race results keep the C major fanfare above, so the two moments
   never sound alike.
------------------------------------------------------------------ */
// windowMs = how long the plate is up: a fast autospin trims the tail.
function playReveal(windowMs, winner) {
    if (!sfx()) return;
    const t0   = audioCtx.currentTime + 0.01;
    const room = Math.max(600, windowMs || 2000);
    const full = room >= 1200;
    const hit  = t0 + 0.14;                  // the plate is all but up

    // 1. The lock.
    thump(t0, 260, 90, 0.14, 0.45);
    mallet(t0, 330, 0.16, 0.16, 0);
    noiseAt(t0, 0.012, 3400, 0.22, 1.6);
    noiseAt(t0 + 0.035, 0.008, 4200, 0.1, 2);

    // 2. The swoosh.
    const src = audioCtx.createBufferSource(), bp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
    src.buffer = getNoiseBuffer(); src.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(500, t0);
    bp.frequency.exponentialRampToValueAtTime(5500, hit);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14, hit - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, hit + 0.1);
    src.connect(bp); bp.connect(g); winOut(g, 0);
    src.start(t0); src.stop(hit + 0.12);

    if (!winner) {
        // Ding-ding: up a fourth, on mallets with a bell over each.
        [880, 1174.66].forEach((f, i) => {
            const t = hit + i * 0.11, pan = i ? 0.2 : -0.2;
            mallet(t, f, full ? 0.8 : 0.5, 0.32, pan);
            winBell(t, f * 2, full ? 0.9 : 0.5, 0.07, pan, 3.5);
        });
        [293.66, 440].forEach(f => winStab(hit + 0.11, f, full ? 0.7 : 0.4, 0.06, 0));
        return;
    }

    // 3. Ta-DAA.
    winStab(hit - 0.11, 440, 0.09, 0.16, -0.15);
    mallet(hit - 0.11, 880, 0.2, 0.14, -0.15);
    winImpact(hit);
    const hold = full ? 1.4 : 0.75;
    [293.66, 369.99, 440, 587.33, 659.25].forEach((f, i) => winStab(hit, f, hold, 0.11, (i - 2) * 0.18));
    [587.33, 739.99, 880, 1174.66].forEach((f, i) => mallet(hit + i * 0.018, f, 0.9, 0.15, (i - 1.5) * 0.3));
    [1174.66, 1479.98, 1760].forEach((f, i) => winBell(hit + 0.03 + i * 0.03, f, full ? 1.4 : 0.8, 0.1, (i - 1) * 0.4));
    const sub = audioCtx.createOscillator(), sg = audioCtx.createGain();
    sub.type = 'sine'; sub.frequency.setValueAtTime(73.42, hit);
    sg.gain.setValueAtTime(0.0001, hit);
    sg.gain.exponentialRampToValueAtTime(0.3, hit + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0006, hit + hold);
    sub.connect(sg); sg.connect(getFxBus().dry);
    sub.start(hit); sub.stop(hit + hold + 0.05);

    // 4. Glitter falling down the scale over the tail, side to side.
    if (full) {
        const fall = [2349.3, 1975.5, 1760, 1480, 1318.5, 1174.7, 987.8, 880];
        const span = Math.min(1, room / 1000 - 0.5);
        fall.forEach((f, i) => winBell(hit + 0.25 + i * span / fall.length, f, 0.35, 0.06 - i * 0.004, i % 2 ? 0.5 : -0.5, 3.5));
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
    if (!sfx()) return;
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
    if (!sfx()) return;
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
    if (!sfx()) return;
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
    if (!sfx() || popOff.rumble) return;
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
    if (!sfx()) return;
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


/* -- No One Is Safe --
   The fanfare's own brass, turned sour: two stabs on D, then a diminished
   chord that hangs while the wheel turns over to the drafted seats. Same
   voices and room as the win, so it sounds like the same show going wrong. */
function playSeatAlarm() {
    if (!sfx()) return;
    const t0 = audioCtx.currentTime + 0.02;
    winStab(t0,        146.83, 0.15, 0.24, -0.25);
    winStab(t0 + 0.21, 146.83, 0.15, 0.24,  0.25);
    const chordT = t0 + 0.46, hold = 1.4;
    winImpact(chordT);
    [146.83, 174.61, 207.65, 293.66].forEach((f, i) => winStab(chordT, f, hold, 0.12, (i - 1.5) * 0.2));
    const sub = audioCtx.createOscillator(), sg = audioCtx.createGain();
    sub.type = 'sine'; sub.frequency.setValueAtTime(73.42, chordT);
    sg.gain.setValueAtTime(0.0001, chordT);
    sg.gain.exponentialRampToValueAtTime(0.3, chordT + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0006, chordT + hold);
    sub.connect(sg); sg.connect(getFxBus().dry);
    sub.start(chordT); sub.stop(chordT + hold + 0.05);
}

/* -- PANIC --
   The floor drops out: a hit, two blasts of a klaxon bending up, and a
   sub falling away under them. */
function playPanicSound() {
    if (!sfx()) return;
    const fx  = getFxBus();
    const now = audioCtx.currentTime + 0.01;
    winImpact(now);
    for (let k = 0; k < 2; k++) {
        const t  = now + k * 0.28;
        const bp = audioCtx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.4;
        const g  = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.34, t + 0.02);
        g.gain.setValueAtTime(0.34, t + 0.19);
        g.gain.exponentialRampToValueAtTime(0.0006, t + 0.26);
        bp.connect(g); g.connect(fx.dry); g.connect(fx.verb);
        [-14, 14].forEach(cents => {
            const o = audioCtx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(392, t);
            o.frequency.linearRampToValueAtTime(587.33, t + 0.14);
            o.frequency.linearRampToValueAtTime(523.25, t + 0.24);
            o.detune.setValueAtTime(cents, t);
            o.connect(bp); o.start(t); o.stop(t + 0.28);
        });
    }
    thump(now, 98, 38, 0.8, 0.5);
}

/* -- The horse race -- */
// The call to the post, more or less: a bugle figure on the brass, then
// the bell as the gates open.
function playStartBell() {
    if (!sfx()) return;
    const t0 = audioCtx.currentTime + 0.03;
    [[392, 0, 0.11], [523.25, 0.12, 0.11], [659.25, 0.24, 0.11], [783.99, 0.36, 0.24],
     [659.25, 0.64, 0.09], [783.99, 0.75, 0.42]].forEach(([f, at, d]) => winStab(t0 + at, f, d, 0.15, 0));
    [0, 0.16, 0.32].forEach(at => winBell(t0 + 1.25 + at, 1318.5, 0.5, 0.12, 0, 2.76));
}

// One hoof on turf: a dull thud and a scuff of dirt. Three and a gap is a
// gallop (the race keeps the rhythm).
function playHoofbeat(weight) {
    if (!sfx()) return;
    const t = audioCtx.currentTime + Math.random() * 0.006;
    thump(t, 120 * (0.9 + Math.random() * 0.2), 55, 0.09, 0.42 * weight, (Math.random() - 0.5) * 0.4);
    noiseAt(t, 0.05, 700 + Math.random() * 400, 0.2 * weight, 0.7, 'lowpass');
}

// A rail knocked flat: wooden knocks tumbling over each other, and dirt.
function playHurdleHit() {
    if (!sfx()) return;
    const now = audioCtx.currentTime + 0.005;
    [0, 0.05, 0.11].forEach((dt, i) => {
        mallet(now + dt, (430 - i * 70) * (0.9 + Math.random() * 0.2), 0.14, 0.45 - i * 0.1, (Math.random() - 0.5) * 0.6);
    });
    noiseAt(now, 0.16, 700, 0.42, 0.8);
}

// Home and safe: a note per place, climbing the scale as the safe seats
// fill, so the race sounds like it is getting somewhere.
function playFinishBell(rank) {
    if (!sfx()) return;
    const t = audioCtx.currentTime + 0.01;
    const f = PENTA[Math.min(Math.max(rank, 1) - 1, PENTA.length - 1)];
    mallet(t, f, 0.5, 0.45, 0);
    winBell(t, f * 2, 0.6, 0.11, 0, 3.5);
}

/* -- Power-ups --
   Each one sounds like what it does: a hot seat climbs, a curse sinks,
   and a wildcard rattles the dice before it chimes. */
function playPowerUpSound(type) {
    if (!sfx()) return;
    const t = audioCtx.currentTime + 0.01;
    if (type === 'cursed') {
        [783.99, 659.25, 554.37, 466.16].forEach((f, i) => mallet(t + i * 0.07, f, 0.3, 0.22, (1.5 - i) * 0.3));
        const o = audioCtx.createOscillator(), lp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(233, t + 0.26);
        o.frequency.exponentialRampToValueAtTime(155, t + 0.75);
        lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
        g.gain.setValueAtTime(0.0001, t + 0.26);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.32);
        g.gain.exponentialRampToValueAtTime(0.0006, t + 0.8);
        o.connect(lp); lp.connect(g); winOut(g, 0);
        o.start(t + 0.26); o.stop(t + 0.85);
        return;
    }
    if (type === 'wildcard') {
        for (let i = 0; i < 7; i++) noiseAt(t + i * 0.034 + Math.random() * 0.016, 0.02, 2200 + Math.random() * 1600, 0.22, 2.5);
        [0, 1, 2].forEach(i => mallet(t + 0.3 + i * 0.06, PENTA[2 + Math.floor(Math.random() * 7)], 0.4, 0.2, (i - 1) * 0.4));
        return;
    }
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => mallet(t + i * 0.045, f, 0.35, 0.21, (i - 2) * 0.25));
    winBell(t + 0.23, 2093, 0.7, 0.1, 0, 5.4);
    const src = audioCtx.createBufferSource(), bp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
    src.buffer = getNoiseBuffer(); src.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(800, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.26);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.32);
    src.connect(bp); bp.connect(g); winOut(g, 0);
    src.start(t); src.stop(t + 0.35);
}

// A void spin: the game-show "wrong" before the stamp comes down.
function playBuzzer() {
    if (!sfx()) return;
    const t0 = audioCtx.currentTime + 0.01;
    [0, 0.19].forEach(at => {
        const t = t0 + at, lp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 1500;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
        g.gain.setValueAtTime(0.15, t + 0.13);
        g.gain.exponentialRampToValueAtTime(0.0006, t + 0.16);
        lp.connect(g); g.connect(getFxBus().dry);
        [146.83, 155.56].forEach(f => {
            const o = audioCtx.createOscillator();
            o.type = 'square'; o.frequency.setValueAtTime(f, t);
            o.connect(lp); o.start(t); o.stop(t + 0.18);
        });
    });
}

/* -- The names --
   Adding a name is a little bubble that pops a note higher for every
   name on the wheel, so filling a table plays up a scale. Taking one off
   drops back down. */
function playAddPop(count) {
    if (!sfx()) return;
    const t = audioCtx.currentTime + 0.005;
    const f = PENTA[Math.max(0, count - 1) % 8] / 2;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.13);
    o.connect(g); g.connect(getFxBus().dry);
    o.start(t); o.stop(t + 0.15);
    mallet(t + 0.012, f * 2, 0.22, 0.07, 0);
}

function playRemovePop() {
    if (!sfx()) return;
    const t = audioCtx.currentTime + 0.005;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    o.connect(g); g.connect(getFxBus().dry);
    o.start(t); o.stop(t + 0.14);
}

/* -- The slot machines --
   The lever's ratchet and clunk, one whirr for every reel in the room,
   a clunk as each reel stops, a bell for a 7 (higher for the second), a
   drum roll under a last reel with two 7s showing, the sad trombone when
   it misses, and the payout when it doesn't. */
function playLeverPull() {
    if (!sfx()) return;
    const t = audioCtx.currentTime + 0.005;
    for (let i = 0; i < 5; i++) noiseAt(t + i * 0.024, 0.012, 2600 + i * 180, 0.2, 2.2);
    thump(t + 0.13, 150, 60, 0.2, 0.5);
    noiseAt(t + 0.13, 0.05, 500, 0.28, 0.8, 'lowpass');
}

let whirr = null;
function startReelWhirr() {
    if (!sfx() || whirr) return;
    const t   = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = getNoiseBuffer(); src.loop = true;
    const bp  = audioCtx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
    // the symbols clattering past the window, ~26 a second
    const am  = audioCtx.createGain(); am.gain.value = 0.5;
    const lfo = audioCtx.createOscillator(), depth = audioCtx.createGain();
    lfo.type = 'square'; lfo.frequency.value = 26; depth.gain.value = 0.5;
    lfo.connect(depth); depth.connect(am.gain);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(0.08, t + 0.15, 0.03);
    src.connect(bp); bp.connect(am); am.connect(g); g.connect(getFxBus().dry);
    src.start(t); lfo.start(t);
    whirr = { src, lfo, g };
}

function stopReelWhirr() {
    if (!whirr) return;
    const { src, lfo, g } = whirr;
    whirr = null;
    try {
        const t = audioCtx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(0, t, 0.04);
        src.stop(t + 0.3); lfo.stop(t + 0.3);
    } catch (e) {}
}

function playReelStop(reel) {
    if (!sfx() || throttled('reel', 0.035)) return;
    const t = audioCtx.currentTime + 0.003;
    thump(t, 210 - reel * 20, 85, 0.11, 0.38, (reel - 1) * 0.35);
    noiseAt(t, 0.018, 3000, 0.15, 1.4);
}

function playSevenHold(sevens) {
    if (!sfx() || throttled('seven', 0.06)) return;
    const t = audioCtx.currentTime + 0.005;
    thump(t, 200, 85, 0.1, 0.3);
    const f = sevens >= 2 ? 1046.5 : 783.99;
    mallet(t, f, 0.6, 0.3, 0);
    winBell(t, f * 2, 0.7, 0.1, 0, 3.5);
    if (sevens >= 2) mallet(t + 0.07, 1318.51, 0.5, 0.22, 0.2);
}

let teaseUntil = 0;
function playSlotTease(sec) {
    if (!sfx()) return;
    const now = audioCtx.currentTime;
    if (now < teaseUntil) return;                    // one drum roll at a time
    sec = Math.min(Math.max(sec, 0.3), 3);
    teaseUntil = now + sec;
    for (let t = 0; t < sec; t += 0.045) noiseAt(now + t, 0.03, 1800, 0.04 + 0.16 * (t / sec), 0.9);
    const o = audioCtx.createOscillator(), lp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(440, now + sec);
    lp.type = 'lowpass'; lp.frequency.value = 1200;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07, now + sec * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0005, now + sec + 0.06);
    o.connect(lp); lp.connect(g); winOut(g, 0);
    o.start(now); o.stop(now + sec + 0.1);
}

function playNearMiss() {
    if (!sfx() || throttled('miss', 0.4)) return;
    const t0 = audioCtx.currentTime + 0.02;
    [[311.13, 0, 0.24, 0.97], [277.18, 0.26, 0.55, 0.85]].forEach(([f, at, d, sag], i) => {
        const t = t0 + at;
        const o = audioCtx.createOscillator(), lp = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * sag, t + d);
        if (i) {                                     // the last note wobbles as it gives up
            const lfo = audioCtx.createOscillator(), lg = audioCtx.createGain();
            lfo.frequency.value = 6; lg.gain.value = f * 0.02;
            lfo.connect(lg); lg.connect(o.frequency);
            lfo.start(t); lfo.stop(t + d + 0.05);
        }
        lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0006, t + d);
        o.connect(lp); lp.connect(g); winOut(g, 0);
        o.start(t); o.stop(t + d + 0.05);
    });
}

// 7-7-7: ka-ching, up the arpeggio (a step higher for every seat already
// claimed), and coins tumbling into the tray.
function playJackpot(rank) {
    if (!sfx()) return;
    const t0 = audioCtx.currentTime + 0.01;
    noiseAt(t0, 0.08, 6000, 0.24, 0.8, 'highpass');
    winBell(t0, 2637, 0.5, 0.13, 0, 5.4);
    const lift = Math.pow(2, Math.min(Math.max(rank, 1) - 1, 6) * 2 / 12);
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => mallet(t0 + 0.05 + i * 0.055, f * lift, 0.5, 0.23, (i - 2) * 0.25));
    for (let i = 0; i < 12; i++) {
        winBell(t0 + 0.3 + Math.random() * 0.8, 2093 * (1 + Math.random() * 0.5), 0.18,
                0.05 + Math.random() * 0.04, (Math.random() * 2 - 1) * 0.7, 5.4);
    }
}
