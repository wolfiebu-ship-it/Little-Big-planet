/*
 * Craft World – Klänge und A-cappella-Musik. Alles wird live mit WebAudio erzeugt (keine Dateien).
 */
(function (root) {
  'use strict';
  const FW = (root.FW = root.FW || {});
  const A = (FW.Audio = {});
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true;
  let musicTimer = null, nextNote = 0, noteIdx = 0;

  A.init = function () {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return;
    }
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxOn ? 0.5 : 0;
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = musicOn ? MUSIC_VOL : 0;
    musicGain.connect(master);
    startMusic();
  };

  A.setMusic = function (on) {
    musicOn = !!on;
    if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, ctx.currentTime, 0.1);
  };
  A.setSfx = function (on) {
    sfxOn = !!on;
    if (sfxGain) sfxGain.gain.setTargetAtTime(sfxOn ? 0.5 : 0, ctx.currentTime, 0.05);
  };
  A.musicOn = () => musicOn;
  A.sfxOn = () => sfxOn;

  function tone(freq, dur, type, vol, when, slideTo, dest) {
    if (!ctx) return;
    const t0 = when || ctx.currentTime;
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn);
    gn.connect(dest || sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const gn = ctx.createGain();
    gn.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(gn);
    gn.connect(sfxGain);
    src.start();
  }

  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  A.play = function (name, p) {
    if (!ctx || !sfxOn) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'collect': {
        const i = Math.min(PENTA.length - 1, ((p && p.chain) || 1) - 1);
        tone(midi(72 + PENTA[i % PENTA.length]), 0.12, 'sine', 0.25);
        tone(midi(84 + PENTA[i % PENTA.length]), 0.08, 'triangle', 0.08, t + 0.02);
        break;
      }
      case 'prize':
        [72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.25, 'triangle', 0.25, t + i * 0.07));
        break;
      case 'jump':
        tone(300, 0.14, 'square', 0.06, t, 520);
        break;
      case 'land':
        noise(0.08, 0.12, 600);
        break;
      case 'step':
        noise(0.035, 0.05, 420);
        break;
      case 'die':
        tone(500, 0.45, 'sawtooth', 0.12, t, 80);
        noise(0.3, 0.2, 900);
        break;
      case 'respawn':
        tone(400, 0.2, 'sine', 0.15, t, 900);
        break;
      case 'checkpoint':
        [67, 72, 76].forEach((n, i) => tone(midi(n), 0.3, 'triangle', 0.22, t + i * 0.09));
        break;
      case 'goal':
        [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.35, 'triangle', 0.22, t + i * 0.09));
        break;
      case 'spring':
        tone(200, 0.3, 'sine', 0.25, t, 900);
        break;
      case 'stomp':
        tone(180, 0.15, 'square', 0.12, t, 60);
        noise(0.1, 0.15, 800);
        break;
      case 'layer':
        tone(600, 0.12, 'sine', 0.1, t, 400);
        break;
      case 'bump':
        tone(120, 0.1, 'square', 0.06);
        break;
      case 'grab':
        tone(250, 0.07, 'triangle', 0.15);
        break;
      case 'click':
        tone(800, 0.05, 'triangle', 0.12);
        break;
      case 'place':
        tone(520, 0.05, 'sine', 0.12);
        break;
      case 'erase':
        tone(260, 0.06, 'sine', 0.1);
        break;
    }
  };

  /* ------------------------------------------------------------------ */
  /* A-cappella-Musik: künstliche Stimmen (Formant-Synthese) + Beatbox   */
  /* Eigene Komposition: Frauenstimme (Melodie), Männerstimme (Bass),     */
  /* Chor („Uuh“-Akkorde) und Mund-Schlagzeug.                           */
  /* ------------------------------------------------------------------ */
  const MUSIC_VOL = 0.55;

  // Formanten [Frequenz, Bandbreite, Pegel] einer Männerstimme
  const VOWELS = {
    a: [[730, 90, 1], [1090, 110, 0.55], [2440, 170, 0.28]],
    e: [[530, 70, 1], [1840, 110, 0.5], [2480, 170, 0.3]],
    i: [[300, 60, 1], [2250, 120, 0.45], [3000, 200, 0.3]],
    o: [[520, 80, 1], [880, 90, 0.55], [2400, 170, 0.22]],
    u: [[320, 60, 1], [800, 80, 0.4], [2250, 160, 0.18]]
  };
  const ONSET = {
    b: { f: [240, 0.82, 0.9], glide: 0.045 },
    bl: { f: [330, 1150, 2650], abs: true, glide: 0.085 },
    br: { f: [360, 1100, 1550], abs: true, glide: 0.095 },
    d: { f: [290, 1700, 2650], abs: true, glide: 0.035 }
  };
  const VOICE = {
    m: { scale: 1, gain: 1, vib: 5.2 },
    f: { scale: 1.17, gain: 0.85, vib: 5.8 },
    c: { scale: 1.1, gain: 0.5, vib: 4.6 }
  };

  let noiseBuf = null;
  function getNoise(ac) {
    if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function noiseSrc(ac, t, dur) {
    const s = ac.createBufferSource();
    s.buffer = getNoise(ac);
    s.start(t, Math.random() * 1.5, dur + 0.05);
    return s;
  }
  function makeImpulse(ac, secs, decay) {
    const len = Math.floor(ac.sampleRate * secs);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Ein gesungener Laut wie „blam“, „brum“, „bim“ oder „uu“
  function sing(B, t, midi, dur, syl, voiceType, vol) {
    const ac = B.ac;
    const m = /^(bl|br|b|d)?([aeiou])(m)?$/.exec(syl) || [null, null, 'u', null];
    const onset = m[1] ? ONSET[m[1]] : null, vowel = VOWELS[m[2]], coda = m[3];
    const V = VOICE[voiceType];
    const f0 = hz(midi) * Math.pow(2, ((Math.random() - 0.5) * 14) / 1200);
    const end = t + dur;

    // Stimmbänder: Sägezahn mit leichtem Hochziehen in den Ton und Vibrato
    const src = ac.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0, t);
    src.detune.setValueAtTime(-70, t);
    src.detune.linearRampToValueAtTime(0, t + 0.07);
    const lfo = ac.createOscillator();
    lfo.frequency.value = V.vib + Math.random() * 0.6;
    const lfoG = ac.createGain();
    lfoG.gain.setValueAtTime(0, t);
    lfoG.gain.linearRampToValueAtTime(dur > 0.35 ? 22 : 7, t + Math.min(dur, 0.45));
    lfo.connect(lfoG);
    lfoG.connect(src.detune);
    // Atem
    const br = noiseSrc(ac, t, dur);
    const brF = ac.createBiquadFilter();
    brF.type = 'highpass';
    brF.frequency.value = 1800;
    const brG = ac.createGain();
    brG.gain.value = 0.05;
    br.connect(brF);
    brF.connect(brG);

    const tilt = ac.createBiquadFilter();
    tilt.type = 'lowpass';
    tilt.Q.value = 0.5;
    tilt.frequency.setValueAtTime(3200, t);
    src.connect(tilt);
    brG.connect(tilt);

    // Mundraum: drei Formant-Filter
    const sum = ac.createGain();
    sum.gain.value = 0.9;
    vowel.forEach((fm, i) => {
      const target = fm[0] * V.scale;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = target / fm[1];
      if (onset) {
        const start = onset.abs ? onset.f[i] * V.scale : onset.f[i] * (i === 0 ? V.scale : target);
        bp.frequency.setValueAtTime(start, t);
        bp.frequency.linearRampToValueAtTime(target, t + onset.glide);
      } else bp.frequency.setValueAtTime(target, t);
      if (coda) {
        // „-m“: Mund schließt, es wird gesummt
        const cs = t + dur * 0.62;
        bp.frequency.setValueAtTime(target, cs);
        bp.frequency.linearRampToValueAtTime([260, 1000, 2200][i] * V.scale, cs + 0.06);
      }
      const g = ac.createGain();
      g.gain.value = fm[2] * 3;
      tilt.connect(bp);
      bp.connect(g);
      g.connect(sum);
    });
    if (coda) {
      tilt.frequency.setValueAtTime(3200, t + dur * 0.62);
      tilt.frequency.linearRampToValueAtTime(650, t + dur * 0.62 + 0.07);
    }

    // Lautstärke-Hüllkurve
    const env = ac.createGain();
    const v = vol * V.gain;
    const att = onset ? 0.012 : 0.12;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(v, t + att + 0.02);
    if (coda) env.gain.linearRampToValueAtTime(v * 0.55, t + dur * 0.62 + 0.08);
    env.gain.setValueAtTime(coda ? v * 0.55 : v, Math.max(t + att + 0.03, end - 0.07));
    env.gain.linearRampToValueAtTime(0, end);
    sum.connect(env);
    env.connect(B.bus);
    env.connect(B.rev);

    // Lippenplosiv „b“
    if (onset) {
      const p = noiseSrc(ac, t, 0.03);
      const pf = ac.createBiquadFilter();
      pf.type = 'lowpass';
      pf.frequency.value = m[1] === 'd' ? 2600 : 700;
      const pg = ac.createGain();
      pg.gain.setValueAtTime(v * 0.7, t);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      p.connect(pf);
      pf.connect(pg);
      pg.connect(B.bus);
    }
    src.start(t);
    lfo.start(t);
    src.stop(end + 0.05);
    lfo.stop(end + 0.05);
  }

  // Mund-Schlagzeug
  function beat(B, t, kind, vol) {
    const ac = B.ac;
    if (kind === 'b') {
      // Bass-„b“ mit den Lippen
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.13);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g);
      g.connect(B.bus);
      o.start(t);
      o.stop(t + 0.22);
      const n = noiseSrc(ac, t, 0.03);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(vol * 0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      n.connect(f);
      f.connect(ng);
      ng.connect(B.bus);
    } else if (kind === 'k') {
      // „Pff/K“-Snare
      const n = noiseSrc(ac, t, 0.18);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2300;
      f.Q.value = 0.7;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      n.connect(f);
      f.connect(g);
      g.connect(B.bus);
      g.connect(B.rev);
    } else {
      // „ts“-Hi-Hat
      const n = noiseSrc(ac, t, 0.06);
      const f = ac.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6500;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tss' ? 0.12 : 0.04));
      n.connect(f);
      f.connect(g);
      g.connect(B.bus);
    }
  }

  // Eigene Kompositionen. Jede Zeile = ein Takt mit 8 Achteln: [MIDI-Ton, Silbe, Länge in Achteln].
  // Bass: [Achtel, Silbe, Länge, Halbtöne über dem Grundton].
  const SONGS = {
    menu: {
      name: 'Sternenstaub', bpm: 84, swing: 0.06,
      chords: [[48, 64, 67], [41, 65, 69], [45, 64, 69], [43, 62, 67]],
      lead: [
        [[72, 'u', 4], null, null, null, [71, 'blim', 2], null, [67, 'bum', 2], null],
        [[69, 'o', 4], null, null, null, [72, 'blam', 2], null, [69, 'bum', 2], null],
        [[65, 'u', 4], null, null, null, [69, 'blim', 2], null, [72, 'bum', 2], null],
        [[71, 'o', 4], null, null, null, [74, 'blam', 2], null, [71, 'bum', 2], null]
      ],
      answer: null,
      bass: [[0, 'bum', 3, 0], [4, 'bom', 3, 7]],
      kick: [0], snare: [4], hats: 'quarter', choirFrom: 0, leadVol: 0.5
    },
    l1: {
      name: 'Pappwiesen-Hüpfer', bpm: 104, swing: 0.12,
      chords: [[48, 64, 67], [45, 64, 69], [41, 65, 69], [43, 62, 67]],
      lead: [
        [[72, 'bam', 2], null, [76, 'blim', 1], [74, 'blam', 2], null, [72, 'bum', 1], [67, 'bram', 2], null],
        [[69, 'blum', 2], null, [72, 'blam', 1], [76, 'blim', 1], [74, 'blam', 2], null, [72, 'bum', 2], null],
        [[69, 'bram', 1], [72, 'brum', 1], [74, 'brum', 1], [72, 'brum', 2], null, [69, 'blam', 1], [67, 'blum', 2], null],
        [[71, 'blam', 2], null, [74, 'blam', 1], [71, 'blum', 1], [67, 'bam', 2], null, [67, 'bum', 2], null]
      ],
      answer: [
        [null, null, null, null, [60, 'bram', 1], [64, 'brum', 1], [62, 'brum', 1], [60, 'brum', 1]],
        [null, null, null, null, [57, 'blam', 1], [60, 'blum', 1], [57, 'blam', 1], [55, 'blam', 1]],
        [null, null, null, null, [57, 'bram', 1], [60, 'brum', 1], [62, 'brum', 1], [60, 'brum', 1]],
        [null, null, null, null, [59, 'blam', 1], [62, 'blum', 1], [55, 'bam', 1], [55, 'bum', 1]]
      ],
      bass: [[0, 'bum', 2, 0], [3, 'bom', 1, 7], [4, 'bum', 2, 0], [6, 'bam', 1, 12], [7, 'bom', 1, 7]],
      kick: [0, 5], snare: [2, 6], hats: 'eighth', choirFrom: 1, leadVol: 0.62
    },
    l2: {
      name: 'Garnfabrik-Groove', bpm: 116, swing: 0,
      chords: [[45, 60, 64], [41, 60, 65], [48, 64, 67], [40, 59, 68]],
      lead: [
        [[69, 'dam', 1], [69, 'dam', 1], null, [72, 'dim', 1], null, [71, 'dum', 1], [69, 'dam', 2], null],
        [[65, 'dam', 1], [65, 'dam', 1], null, [69, 'dim', 1], null, [67, 'dum', 1], [65, 'dam', 2], null],
        [[67, 'bram', 1], [72, 'brum', 1], null, [71, 'bram', 1], [72, 'brum', 1], null, [76, 'dim', 2], null],
        [[68, 'dam', 2], null, [71, 'dim', 1], [74, 'dum', 2], null, [71, 'dam', 1], [68, 'dum', 1]]
      ],
      answer: [
        [null, null, null, null, [57, 'dum', 1], null, [57, 'dum', 1], [60, 'dam', 1]],
        [null, null, null, null, [53, 'dum', 1], null, [53, 'dum', 1], [57, 'dam', 1]],
        [null, null, null, null, [55, 'dum', 1], null, [60, 'dum', 1], [64, 'dam', 1]],
        [null, null, null, null, [52, 'dum', 1], [56, 'dum', 1], [59, 'dam', 1], [56, 'dum', 1]]
      ],
      bass: [[0, 'dum', 1, 0], [2, 'dum', 1, 0], [3, 'dom', 1, 12], [4, 'dum', 1, 0], [6, 'dum', 1, 7], [7, 'dom', 1, 12]],
      kick: [0, 3, 4], snare: [2, 6], hats: 'eighth', choirFrom: 2, leadVol: 0.58
    },
    l3: {
      name: 'Gipfelwind', bpm: 92, swing: 0.1,
      chords: [[41, 65, 69], [48, 64, 67], [50, 65, 69], [46, 65, 70]],
      lead: [
        [[72, 'bla', 3], null, null, [69, 'blim', 1], [72, 'blam', 2], null, [77, 'a', 2], null],
        [[76, 'blo', 3], null, null, [72, 'bim', 1], [67, 'bam', 4], null, null, null],
        [[74, 'bra', 3], null, null, [77, 'brim', 1], [74, 'blam', 2], null, [72, 'bum', 2], null],
        [[70, 'blo', 2], null, [74, 'blim', 2], null, [72, 'bla', 4], null, null, null]
      ],
      answer: [
        [null, null, null, null, null, null, [60, 'bum', 1], [64, 'bum', 1]],
        [null, null, null, null, null, null, [55, 'bum', 1], [60, 'bum', 1]],
        [null, null, null, null, null, null, [57, 'bum', 1], [62, 'bum', 1]],
        [null, null, null, null, null, null, [58, 'bum', 1], [62, 'bom', 1]]
      ],
      bass: [[0, 'bom', 4, 0], [4, 'bum', 2, 7], [6, 'bum', 2, 12]],
      kick: [0], snare: [4], hats: 'quarter', choirFrom: 0, leadVol: 0.6
    },
    l4: {
      name: 'Nadelsturm', bpm: 128, swing: 0,
      chords: [[40, 64, 67], [48, 64, 67], [50, 66, 69], [47, 66, 71]],
      lead: [
        [[76, 'bram', 1], [76, 'bram', 1], [74, 'brum', 1], [71, 'bram', 1], [67, 'brum', 1], [71, 'bram', 1], [74, 'brum', 2], null],
        [[72, 'bram', 1], [72, 'bram', 1], [71, 'brum', 1], [67, 'bram', 1], [64, 'brum', 1], [67, 'bram', 1], [72, 'brum', 2], null],
        [[74, 'dam', 1], [74, 'dam', 1], [78, 'dim', 1], [74, 'dam', 1], [69, 'dum', 1], [74, 'dam', 1], [78, 'dim', 2], null],
        [[75, 'blam', 2], null, [71, 'blim', 1], [75, 'blam', 1], [78, 'blim', 2], null, [71, 'bum', 2], null]
      ],
      answer: [
        [null, null, null, null, null, null, [52, 'dum', 1], [52, 'dum', 1]],
        [null, null, null, null, null, null, [55, 'dum', 1], [55, 'dum', 1]],
        [null, null, null, null, null, null, [57, 'dum', 1], [57, 'dum', 1]],
        [null, null, null, null, [59, 'dum', 1], [59, 'dum', 1], [63, 'dum', 1], [66, 'dam', 1]]
      ],
      bass: [[0, 'dum', 1, 0], [1, 'dum', 1, 0], [2, 'dom', 1, 12], [3, 'dum', 1, 0], [4, 'dum', 1, 0], [5, 'dum', 1, 0], [6, 'dom', 1, 12], [7, 'dum', 1, 7]],
      kick: [0, 2, 4, 6], snare: [2, 6], hats: 'eighth', choirFrom: 1, leadVol: 0.55
    }
  };
  A.SONGS = SONGS;
  let song = SONGS.menu, pendingSong = null;

  function scheduleStep(B, t, n, S) {
    const STEP = 60 / S.bpm / 2;
    const bar = Math.floor(n / 8) % 4;
    const st = n % 8;
    const round = Math.floor(n / 32);
    const jit = () => (Math.random() - 0.5) * 0.012;
    // Mund-Schlagzeug
    if (S.kick.includes(st)) beat(B, t + jit(), 'b', 0.85);
    if (S.snare.includes(st)) beat(B, t + jit(), 'k', 0.48);
    if (S.hats === 'eighth' || st % 2 === 0) beat(B, t + jit(), st === 7 ? 'tss' : 'ts', st % 2 ? 0.15 : 0.22);
    // Männerstimme: Bass
    const root = S.chords[bar][0];
    const bassVol = S.bass.length > 6 ? 0.42 : 0.55;
    for (const [s, syl, len, off] of S.bass) {
      if (s === st) sing(B, t + jit(), root + off, STEP * len * 0.9, syl, 'm', bassVol);
    }
    // Chor
    if (st === 0 && round >= S.choirFrom) {
      const ch = S.chords[bar];
      sing(B, t + 0.02 + Math.random() * 0.03, ch[1], STEP * 7.6, 'u', 'c', 0.32);
      sing(B, t + 0.03 + Math.random() * 0.03, ch[2], STEP * 7.6, 'o', 'c', 0.28);
      sing(B, t + 0.01 + Math.random() * 0.03, ch[0] + 12, STEP * 7.6, 'u', 'm', 0.18);
    }
    // Frauenstimme: Melodie (jede dritte Runde Pause)
    if (round % 3 !== 2) {
      const ln = S.lead[bar][st];
      if (ln) sing(B, t + jit(), ln[0], STEP * ln[2] * 0.9, ln[1], 'f', S.leadVol);
    }
    // Männerstimme: Antwort in jeder zweiten Runde
    if (S.answer && round % 2 === 1) {
      const an = S.answer[bar][st];
      if (an) sing(B, t + jit(), an[0], STEP * an[2] * 0.85, an[1], 'm', 0.42);
    }
  }

  function makeBus(ac, dest) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    comp.connect(dest);
    const bus = ac.createGain();
    bus.gain.value = 0.6;
    bus.connect(comp);
    const conv = ac.createConvolver();
    conv.buffer = makeImpulse(ac, 1.6, 2.6);
    const rev = ac.createGain();
    rev.gain.value = 0.22;
    rev.connect(conv);
    conv.connect(comp);
    return { ac, bus, rev };
  }

  let B = null;
  function startMusic() {
    if (musicTimer || !ctx) return;
    B = makeBus(ctx, musicGain);
    nextNote = ctx.currentTime + 0.25;
    noteIdx = 0;
    musicTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      if (nextNote < ctx.currentTime) nextNote = ctx.currentTime + 0.05;
      while (nextNote < ctx.currentTime + 0.35) {
        if (pendingSong && noteIdx % 8 === 0) {
          song = SONGS[pendingSong] || song;
          pendingSong = null;
          noteIdx = 0;
        }
        const STEP = 60 / song.bpm / 2;
        if (musicOn) scheduleStep(B, nextNote + (noteIdx % 2 ? STEP * song.swing : 0), noteIdx, song);
        nextNote += STEP;
        noteIdx++;
      }
    }, 90);
  }

  // Für Tests: rendert die Musik offline und liefert Pegel-Werte
  // Lied wechseln (passiert am nächsten Taktanfang, damit es nicht holpert)
  A.setSong = function (id) {
    if (!SONGS[id]) id = 'l1';
    if (song === SONGS[id] && !pendingSong) return;
    pendingSong = id;
    if (!musicTimer) {
      song = SONGS[id];
      pendingSong = null;
    }
  };
  A.currentSong = () => (pendingSong || Object.keys(SONGS).find((k) => SONGS[k] === song));

  A.renderTest = async function (seconds, id) {
    const S = SONGS[id || 'l1'];
    const STEP = 60 / S.bpm / 2;
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const sr = 44100;
    const off = new OAC(2, Math.ceil(sr * seconds), sr);
    const TB = makeBus(off, off.destination);
    const steps = Math.floor(seconds / STEP);
    for (let n = 0; n < steps; n++) scheduleStep(TB, 0.1 + n * STEP + (n % 2 ? STEP * S.swing : 0), n, S);
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0, nan = 0;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!isFinite(v)) nan++;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / d.length), nan, buffer: buf };
  };
})(typeof window !== 'undefined' ? window : globalThis);
