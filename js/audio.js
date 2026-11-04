/*
 * Craft World – Klänge. Alles wird live mit WebAudio erzeugt (keine Dateien).
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
    musicGain.gain.value = musicOn ? 0.16 : 0;
    musicGain.connect(master);
    startMusic();
  };

  A.setMusic = function (on) {
    musicOn = !!on;
    if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? 0.16 : 0, ctx.currentTime, 0.1);
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

  // Kleine fröhliche Endlos-Melodie (eigene Komposition, pentatonisch)
  const MELODY = [72, 74, 76, 79, 76, 74, 72, null, 74, 76, 79, 81, 79, 76, 74, null, 76, 79, 81, 84, 81, 79, 76, 74, 72, 74, 76, 74, 72, null, 67, null];
  const BASS = [48, 48, 55, 55, 50, 50, 57, 57];
  function startMusic() {
    if (musicTimer || !ctx) return;
    nextNote = ctx.currentTime + 0.2;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      while (nextNote < ctx.currentTime + 0.3) {
        const beat = 0.24;
        const m = MELODY[noteIdx % MELODY.length];
        if (m) tone(midi(m), beat * 0.9, 'triangle', 0.25, nextNote, null, musicGain);
        if (noteIdx % 4 === 0) {
          const b = BASS[Math.floor(noteIdx / 4) % BASS.length];
          tone(midi(b), beat * 3.5, 'sine', 0.35, nextNote, null, musicGain);
        }
        if (noteIdx % 2 === 1) tone(midi(96), 0.03, 'square', 0.03, nextNote, null, musicGain);
        nextNote += beat;
        noteIdx++;
      }
    }, 100);
  }
})(typeof window !== 'undefined' ? window : globalThis);
