/*
 * Craft World – Hauptsteuerung: Menüs, Eingabe, Spielschleife, Speichern.
 */
(function () {
  'use strict';
  const FW = window.FW;
  const C = FW.C, R = FW.Render, R3 = FW.Render3D, A = FW.Audio, E = FW.Editor;

  /* ---------------- Speicher (robust, falls blockiert) ---------------- */
  const Store = {
    get(k, def) {
      try {
        const v = window.localStorage.getItem(k);
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(k, v) {
      try {
        window.localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // Brücke zur nativen iOS-App (Craft World für iPhone/iPad). Im Browser ohne Wirkung.
  const native = (name, payload) => {
    try {
      const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[name];
      if (!h) return false;
      h.postMessage(payload);
      return true;
    } catch (e) {
      return false;
    }
  };
  const isNativeApp = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.haptic);

  const G = {
    mode: 'menu',
    screen: 'title',
    W: null,
    play: null,
    paused: false,
    finishT: 0,
    resultShown: false,
    touch: false,
    demo: null
  };
  window.CraftWorldGame = G;

  /* ---------------- Einstellungen & Kostüm ---------------- */
  const HEX = /^#[0-9a-f]{6}$/i;
  const PALETTE = {
    body: ['#e8743b', '#e63946', '#f4a261', '#2a9d8f', '#3d8ed9', '#8e5fc4', '#f2c14e', '#7cb342', '#ff8fab', '#8d6e63'],
    hat: ['#3a7bd5', '#e63946', '#2a9d8f', '#f2c14e', '#8e5fc4', '#333333', '#ffffff', '#ff8fab', '#7cb342', '#e8743b'],
    eye: ['#fdf6e3', '#ffd166', '#90e0ef', '#ffadad', '#caffbf', '#bdb2ff']
  };
  const savedLook = Store.get('fw_look', null);
  if (savedLook && typeof savedLook === 'object') {
    for (const k of ['body', 'hat', 'eye']) if (HEX.test(savedLook[k])) R.look[k] = savedLook[k];
    if (FW.CHARACTERS && FW.CHARACTERS.some((c) => c.id === savedLook.char)) R.look.char = savedLook.char;
  }
  const settings = Object.assign({ music: true, sfx: true }, Store.get('fw_settings', {}));
  A.setMusic(settings.music !== false);
  A.setSfx(settings.sfx !== false);

  function updateSoundLabels() {
    $('#t-music').textContent = '♪ Musik: ' + (A.musicOn() ? 'an' : 'aus');
    $('#t-sfx').textContent = '🔊 Effekte: ' + (A.sfxOn() ? 'an' : 'aus');
  }

  /* ---------------- Eingabe ---------------- */
  const NAMES = ['left', 'right', 'jump', 'grab', 'up', 'down'];
  const src = { key: {}, touch: {}, pad: {} };
  const held = {};
  const latch = { jumpP: false, upP: false, downP: false, grabP: false };
  const LATCH_OF = { jump: 'jumpP', up: 'upP', down: 'downP', grab: 'grabP' };

  function recompute() {
    for (const n of NAMES) {
      const on = !!(src.key[n] || src.touch[n] || src.pad[n]);
      if (on && !held[n] && LATCH_OF[n]) latch[LATCH_OF[n]] = true;
      held[n] = on;
    }
  }
  function releaseAll() {
    for (const s of Object.values(src)) for (const k in s) s[k] = false;
    recompute();
    for (const k in latch) latch[k] = false;
    $$('.tbtn.on').forEach((b) => b.classList.toggle('on', false));
    if (G.releaseJoy) G.releaseJoy();
    E.releaseKeys();
  }
  G.releaseInput = releaseAll;

  function frameInput() {
    const inp = {
      left: held.left,
      right: held.right,
      jump: held.jump,
      grab: held.grab,
      jumpP: latch.jumpP,
      upP: latch.upP,
      downP: latch.downP,
      grabP: latch.grabP
    };
    if (joy.active) inp.axis = joy.ax;
    else if (padAxis !== null) inp.axis = padAxis;
    latch.jumpP = latch.upP = latch.downP = latch.grabP = false;
    return inp;
  }

  const KEYMAP = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'jump',
    KeyZ: 'jump',
    KeyK: 'jump',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ShiftLeft: 'grab',
    ShiftRight: 'grab',
    KeyE: 'grab',
    KeyX: 'grab',
    KeyL: 'grab'
  };

  function onKey(e, down) {
    const tgt = e.target;
    const typing = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA');
    if (G.modalOpen()) {
      if (down && e.code === 'Escape') {
        e.preventDefault();
        closeModal(modalEsc);
      }
      return;
    }
    if (typing) return;
    if (down) A.init();
    if (G.mode === 'editor') {
      if (E.onKey(e, down)) e.preventDefault();
      return;
    }
    if (G.mode === 'play') {
      if (down && !e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) {
        e.preventDefault();
        openPause();
        return;
      }
      const n = KEYMAP[e.code];
      if (n) {
        e.preventDefault();
        if (down && e.repeat) return;
        src.key[n] = down;
        recompute();
      }
      return;
    }
    // Menüs
    if (down && e.code === 'Escape' && G.screen !== 'title') {
      e.preventDefault();
      A.play('click');
      showScreen('title');
    }
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseAll();
      if (G.mode === 'play' && G.W && !G.W.finished && !G.modalOpen()) openPause();
    }
  });

  // Gamepad
  let padPause = false;
  let padAxis = null;
  const joy = { active: false, ax: 0, id: null };
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null;
    for (const x of pads || []) if (x && x.connected) {
      p = x;
      break;
    }
    if (!p) {
      padAxis = null;
      if (Object.values(src.pad).some(Boolean)) {
        src.pad = {};
        recompute();
      }
      return;
    }
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    padAxis = Math.abs(ax) > 0.2 ? ax : null;
    src.pad = {
      left: b(14),
      right: b(15),
      jump: b(0),
      grab: b(2) || b(5) || b(7),
      up: b(12) || ay < -0.85,
      down: b(13) || ay > 0.85
    };
    if (G.mode === 'play' && !G.modalOpen()) recompute();
    const pz = b(9);
    if (pz && !padPause && G.mode === 'play' && !G.modalOpen()) openPause();
    padPause = pz;
  }

  // Touch-Steuerung
  function setupTouch() {
    $$('.tbtn').forEach((btn) => {
      const k = btn.dataset.k;
      const on = (e) => {
        e.preventDefault();
        A.init();
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (err) {
          /* ignorieren */
        }
        src.touch[k] = true;
        btn.classList.add('on');
        recompute();
      };
      const off = (e) => {
        if (e) e.preventDefault();
        src.touch[k] = false;
        btn.classList.remove('on');
        recompute();
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', () => off());
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    // Joystick: links/rechts laufen (analog), nach oben = Ebene nach hinten, nach unten = nach vorne
    const base = $('#joy'), knob = $('#joy-knob');
    const joyMove = (e) => {
      const r = base.getBoundingClientRect();
      const rad = r.width / 2;
      let dx = (e.clientX - (r.left + rad)) / rad, dy = (e.clientY - (r.top + rad)) / rad;
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      knob.style.transform = 'translate(' + dx * rad * 0.62 + 'px,' + dy * rad * 0.62 + 'px)';
      joy.ax = dx;
      const vertical = Math.abs(dy) > Math.abs(dx) * 0.8;
      src.touch.up = src.touch.up ? dy < -0.35 : dy < -0.62 && vertical;
      src.touch.down = src.touch.down ? dy > 0.35 : dy > 0.62 && vertical;
      base.classList.toggle('up', !!src.touch.up);
      base.classList.toggle('down', !!src.touch.down);
      recompute();
    };
    const joyEnd = (e) => {
      if (e && joy.id !== e.pointerId) return;
      joy.active = false;
      joy.id = null;
      joy.ax = 0;
      knob.style.transform = '';
      src.touch.up = src.touch.down = false;
      base.classList.toggle('up', false);
      base.classList.toggle('down', false);
      base.classList.toggle('on', false);
      recompute();
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      A.init();
      try {
        base.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignorieren */
      }
      joy.active = true;
      joy.id = e.pointerId;
      base.classList.add('on');
      joyMove(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (joy.active && e.pointerId === joy.id) joyMove(e);
    });
    base.addEventListener('pointerup', joyEnd);
    base.addEventListener('pointercancel', joyEnd);
    base.addEventListener('lostpointercapture', joyEnd);
    G.releaseJoy = () => joyEnd();
    G.touch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !G.touch) {
        G.touch = true;
        updateGameUI();
      }
    });
  }

  /* ---------------- Dialoge ---------------- */
  const modal = $('#modal');
  let modalResolve = null, modalEsc = 'cancel', modalInput = null;
  G.modalOpen = () => !modal.classList.contains('hidden');

  function closeModal(value) {
    if (!modalResolve) return;
    const res = modalResolve;
    modalResolve = null;
    const text = modalInput ? modalInput.value : '';
    modal.classList.add('hidden');
    modalInput = null;
    releaseAll();
    res({ value, text });
  }

  G.dialog = function (opts) {
    if (modalResolve) closeModal('cancel');
    return new Promise((resolve) => {
      releaseAll();
      $('#m-title').textContent = opts.title || '';
      const body = $('#m-body');
      body.innerHTML = '';
      if (opts.text) body.appendChild(el('p', '', opts.text));
      if (opts.body) body.appendChild(opts.body);
      modalInput = null;
      if (opts.input) {
        const inp = document.createElement(opts.input.multiline ? 'textarea' : 'input');
        if (!opts.input.multiline) inp.type = 'text';
        inp.value = opts.input.value || '';
        if (opts.input.max) inp.maxLength = opts.input.max;
        if (opts.input.placeholder) inp.placeholder = opts.input.placeholder;
        if (opts.input.readOnly) inp.readOnly = true;
        inp.spellcheck = false;
        body.appendChild(inp);
        modalInput = inp;
        if (!opts.input.multiline) {
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              closeModal(opts.buttons[0].value);
            }
          });
        }
      }
      const bt = $('#m-buttons');
      bt.innerHTML = '';
      bt.classList.toggle('inline', !!opts.inline);
      for (const b of opts.buttons || [{ label: 'OK', value: 'ok' }]) {
        const btn = el('button', 'btn ' + (b.cls || ''), b.label);
        btn.addEventListener('click', () => {
          A.play('click');
          closeModal(b.value);
        });
        bt.appendChild(btn);
      }
      modalEsc = opts.escValue || 'cancel';
      modal.classList.remove('hidden');
      modalResolve = resolve;
      setTimeout(() => {
        if (modalInput) {
          modalInput.focus();
          if (!opts.input.readOnly) modalInput.select();
        } else {
          const f = bt.querySelector('button');
          if (f) f.focus();
        }
      }, 30);
    });
  };
  G.alert = (title, text) => G.dialog({ title, text, buttons: [{ label: 'OK', value: 'ok', cls: 'green' }] });

  G.exportDialog = async function (data) {
    const json = JSON.stringify(data);
    let note = 'Kopiere diesen Text, um dein Level zu sichern oder zu teilen.';
    for (;;) {
      const r = await G.dialog({
        title: 'Level exportieren',
        text: note,
        input: { value: json, multiline: true, readOnly: true },
        inline: true,
        buttons: [
          { label: '📋 Kopieren', value: 'copy', cls: 'blue' },
          { label: isNativeApp ? '📤 Teilen' : '💾 Als Datei', value: 'file', cls: 'green' },
          { label: 'Schließen', value: 'cancel', cls: 'grey' }
        ]
      });
      if (r.value === 'copy') {
        let ok = native('copy', json);
        if (!ok) {
          try {
            await navigator.clipboard.writeText(json);
            ok = true;
          } catch (e) {
            ok = false;
          }
        }
        note = ok ? 'Kopiert ✓ – füge den Text z. B. in eine Nachricht ein.' : 'Kopieren wurde vom Browser blockiert. Markiere den Text und kopiere ihn von Hand.';
      } else if (r.value === 'file') {
        if (native('share', { name: (data.name || 'level').replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.craftworld.json', text: json })) {
          note = 'Teilen-Menü geöffnet ✓';
          continue;
        }
        try {
          const blob = new Blob([json], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = (data.name || 'level').replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.craftworld.json';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            URL.revokeObjectURL(a.href);
            a.remove();
          }, 1000);
          note = 'Datei wurde heruntergeladen ✓';
        } catch (e) {
          note = 'Download nicht möglich. Kopiere den Text stattdessen.';
        }
      } else return;
    }
  };

  function parseLevel(text) {
    try {
      const d = JSON.parse(text);
      if (!d || typeof d !== 'object' || !Array.isArray(d.layers)) return null;
      return FW.normalizeLevel(d);
    } catch (e) {
      return null;
    }
  }

  function pickFile() {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json,text/plain';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result || ''));
        rd.onerror = () => resolve(null);
        rd.readAsText(f);
      };
      inp.click();
    });
  }

  G.importDialog = async function () {
    let note = 'Füge hier einen exportierten Level-Text ein oder öffne eine Datei.';
    let text = '';
    for (;;) {
      const r = await G.dialog({
        title: 'Level importieren',
        text: note,
        input: { value: text, multiline: true, placeholder: '{"name": … }' },
        inline: true,
        buttons: [
          { label: '⇩ Importieren', value: 'ok', cls: 'green' },
          { label: '📂 Datei öffnen', value: 'file', cls: 'blue' },
          { label: 'Abbrechen', value: 'cancel', cls: 'grey' }
        ]
      });
      if (r.value === 'cancel') return null;
      if (r.value === 'file') {
        const t = await pickFile();
        if (t == null) {
          note = 'Keine Datei gewählt.';
          continue;
        }
        text = t;
      } else text = r.text;
      const d = parseLevel(text);
      if (d) return d;
      note = '⚠ Das sieht nicht nach einem Craft-World-Level aus. Bitte prüfe den Text.';
    }
  };

  /* ---------------- Eigene Level ---------------- */
  function myLevels() {
    const l = Store.get('fw_levels', []);
    return Array.isArray(l) ? l.filter((x) => x && x.id && x.data) : [];
  }
  G.saveMyLevel = function (id, data) {
    const list = myLevels();
    const now = Date.now();
    if (id) {
      const e = list.find((x) => x.id === id);
      if (e) {
        e.data = data;
        e.name = data.name;
        e.updated = now;
      } else list.push({ id, name: data.name, data, updated: now });
    } else {
      id = 'u' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      list.push({ id, name: data.name, data, updated: now });
    }
    return Store.set('fw_levels', list) ? id : null;
  };

  /* ---------------- Bildschirme ---------------- */
  const SCREENS = { title: '#scr-title', story: '#scr-story', my: '#scr-my', costume: '#scr-costume', help: '#scr-help' };

  function updateGameUI() {
    const play = G.mode === 'play';
    $('#btn-pause').classList.toggle('hidden', !play);
    $('#touch').classList.toggle('hidden', !(play && G.touch));
    R.bottomPad = play && G.touch ? Math.min(150, window.innerHeight * 0.24) : 0;
    const ed = G.mode === 'editor';
    ['#ed-top', '#ed-layers', '#ed-palette'].forEach((s) => $(s).classList.toggle('hidden', !ed));
    if (!ed) $('#ed-tip').classList.add('hidden');
  }

  function showScreen(name) {
    for (const k in SCREENS) $(SCREENS[k]).classList.toggle('hidden', k !== name);
    G.screen = name;
    if (SCREENS[name]) {
      A.setSong('menu');
      G.mode = 'menu';
      G.W = null;
      if (!G.demo) G.demo = FW.createWorld(FW.LEVELS[0].data);
      R.setLevel(G.demo.L);
    }
    if (name === 'story') renderStory();
    if (name === 'my') renderMy();
    if (name === 'costume') renderCostume();
    if (name === 'title') updateSoundLabels();
    releaseAll();
    updateGameUI();
  }
  G.showScreen = showScreen;

  function progress() {
    const p = Store.get('fw_progress', {});
    return p && typeof p === 'object' ? p : {};
  }
  function starsEl(n, big) {
    const s = el('div', big ? 'big-stars' : 'stars');
    for (let i = 0; i < 3; i++) s.appendChild(el('span', i < n ? 'on' : '', '★'));
    return s;
  }

  function levelSong(data, meta) {
    if (meta && meta.source === 'story' && meta.id) return meta.id;
    return ['l1', 'l2', 'l3'][(data && data.theme) || 0] || 'l1';
  }

  function renderWorldCard() {
    const i = G.hubSel || 0;
    const lv = FW.LEVELS[i];
    const pr = progress()[lv.id];
    $('#w-num').textContent = 'Level ' + (i + 1) + ' von ' + FW.LEVELS.length;
    $('#w-name').textContent = lv.data.name;
    $('#w-blurb').textContent = lv.blurb;
    const st = $('#w-stars');
    st.innerHTML = '';
    st.appendChild(starsEl(pr ? pr.stars : 0));
    $('#w-stats').textContent = pr ? 'Rekord: ' + pr.best + ' Punkte · ' + R.fmtTime(pr.time || 0) : 'Noch nicht gespielt';
  }
  function selectWorld(i) {
    const n = FW.LEVELS.length;
    G.hubSel = ((i % n) + n) % n;
    R3.hubSelect(G.hubSel);
    renderWorldCard();
  }
  function playSelected() {
    const i = G.hubSel || 0;
    const lv = FW.LEVELS[i];
    A.play('click');
    G.playLevel(lv.data, { source: 'story', index: i, id: lv.id });
  }

  function renderStory() {
    const worldMode = use3D && R3.hubShow(FW.LEVELS.length);
    $('#scr-story').classList.toggle('world-mode', !!worldMode);
    $('#world').classList.toggle('hidden', !worldMode);
    $('#story-list').classList.toggle('hidden', !!worldMode);
    $('#story-back').classList.toggle('hidden', !!worldMode);
    $('#story-title').textContent = worldMode ? 'Planet Saturn' : 'Story-Level';
    if (worldMode) {
      if (G.hubSel === undefined) {
        const prog = progress();
        const firstOpen = FW.LEVELS.findIndex((l) => !prog[l.id]);
        G.hubSel = firstOpen < 0 ? 0 : firstOpen;
      }
      selectWorld(G.hubSel);
      return;
    }
    const list = $('#story-list');
    list.innerHTML = '';
    const prog = progress();
    FW.LEVELS.forEach((lv, i) => {
      const c = el('div', 'card lvl');
      c.appendChild(el('div', 'num', 'Level ' + (i + 1)));
      c.appendChild(el('h3', '', lv.data.name));
      c.appendChild(el('p', '', lv.blurb));
      const pr = prog[lv.id];
      c.appendChild(starsEl(pr ? pr.stars : 0));
      c.appendChild(el('div', 'stats', pr ? 'Rekord: ' + pr.best + ' Punkte · ' + R.fmtTime(pr.time || 0) : 'Noch nicht gespielt'));
      const b = el('button', 'btn green', '▶ Spielen');
      b.addEventListener('click', () => {
        A.play('click');
        G.playLevel(lv.data, { source: 'story', index: i, id: lv.id });
      });
      c.appendChild(b);
      list.appendChild(c);
    });
  }

  function renderMy() {
    const list = $('#my-list');
    list.innerHTML = '';
    const levels = myLevels().sort((a, b) => (b.updated || 0) - (a.updated || 0));
    if (!levels.length) {
      list.appendChild(el('p', 'empty', 'Du hast noch keine eigenen Level. Klicke auf „Neues Level“ und leg los!'));
      return;
    }
    const prog = progress();
    for (const lv of levels) {
      const c = el('div', 'card lvl');
      const d = FW.normalizeLevel(lv.data);
      c.appendChild(el('div', 'num', d.w + ' × ' + d.h + ' · ' + R.THEMES[d.theme].name));
      c.appendChild(el('h3', '', d.name));
      const pr = prog['my:' + lv.id];
      c.appendChild(starsEl(pr ? pr.stars : 0));
      c.appendChild(el('div', 'stats', 'Bearbeitet: ' + new Date(lv.updated || Date.now()).toLocaleDateString('de-DE')));
      const row = el('div', 'row');
      const bp = el('button', 'btn small green', '▶ Spielen');
      bp.addEventListener('click', () => {
        A.play('click');
        G.playLevel(d, { source: 'my', id: lv.id });
      });
      const be = el('button', 'btn small blue', '✎ Bearbeiten');
      be.addEventListener('click', () => {
        A.play('click');
        openEditor(d, lv.id);
      });
      const bd = el('button', 'btn small grey', '🗑');
      bd.title = 'Löschen';
      bd.addEventListener('click', async () => {
        const r = await G.dialog({
          title: 'Level löschen?',
          text: '„' + d.name + '“ wird endgültig gelöscht.',
          buttons: [
            { label: 'Löschen', value: 'ok', cls: '' },
            { label: 'Abbrechen', value: 'cancel', cls: 'grey' }
          ]
        });
        if (r.value === 'ok') {
          Store.set('fw_levels', myLevels().filter((x) => x.id !== lv.id));
          renderMy();
        }
      });
      row.append(bp, be, bd);
      c.appendChild(row);
      list.appendChild(c);
    }
  }

  function saveLook() {
    Store.set('fw_look', R.look);
  }
  function renderCostume() {
    const list = $('#char-list');
    list.innerHTML = '';
    for (const ch of FW.CHARACTERS || []) {
      const b = el('button', 'char' + ((R.look.char || 'knopf') === ch.id ? ' on' : ''));
      b.appendChild(el('b', '', ch.name));
      b.appendChild(el('span', '', ch.blurb));
      b.addEventListener('click', () => {
        R.look.char = ch.id;
        R.look.body = ch.body;
        R.look.hat = ch.acc;
        saveLook();
        A.play('place');
        renderCostume();
      });
      list.appendChild(b);
    }
    $('#eye-row').classList.toggle('hidden', (R.look.char || 'knopf') !== 'knopf');
    $$('.sw').forEach((box) => {
      const part = box.dataset.part;
      box.innerHTML = '';
      for (const col of PALETTE[part]) {
        const b = el('button', col.toLowerCase() === String(R.look[part]).toLowerCase() ? 'on' : '');
        b.style.background = col;
        b.setAttribute('aria-label', part + ' ' + col);
        b.addEventListener('click', () => {
          R.look[part] = col;
          saveLook();
          A.play('place');
          renderCostume();
        });
        box.appendChild(b);
      }
    });
  }

  function openEditor(data, id) {
    for (const k in SCREENS) $(SCREENS[k]).classList.add('hidden');
    G.mode = 'editor';
    G.screen = 'editor';
    G.W = null;
    releaseAll();
    updateGameUI();
    if (data !== undefined) E.open(data, id);
    else E.resume();
  }

  /* ---------------- Spielen ---------------- */
  G.playLevel = function (data, meta) {
    for (const k in SCREENS) $(SCREENS[k]).classList.add('hidden');
    G.play = { data, meta: meta || { source: 'story' } };
    A.setSong(levelSong(data, G.play.meta));
    if (G.play.meta.source === 'story') G.hubSel = G.play.meta.index;
    G.W = FW.createWorld(data);
    R.setLevel(G.W.L);
    R.clearFx();
    R.resetCamera(G.W);
    if (use3D) {
      R3.clearFx();
      R3.resetCamera(G.W);
    }
    G.mode = 'play';
    G.screen = 'play';
    G.paused = false;
    G.finishT = 0;
    G.resultShown = false;
    acc = 0;
    releaseAll();
    updateGameUI();
    A.init();
  };
  function restart() {
    if (G.play) G.playLevel(G.play.data, G.play.meta);
  }

  async function openPause() {
    if (G.mode !== 'play' || G.modalOpen()) return;
    G.paused = true;
    const fromEditor = G.play.meta.source === 'editor';
    const buttons = [
      { label: '▶ Weiter', value: 'resume', cls: 'green' },
      { label: '↻ Neu starten', value: 'restart', cls: 'blue' }
    ];
    if (fromEditor) buttons.push({ label: '✎ Zurück zum Editor', value: 'editor', cls: 'purple' });
    buttons.push({ label: (A.musicOn() ? '♪ Musik aus' : '♪ Musik an'), value: 'music', cls: 'grey' });
    buttons.push({ label: fromEditor ? '☰ Hauptmenü' : '☰ Level verlassen', value: 'quit', cls: '' });
    const r = await G.dialog({ title: 'Pause', text: G.play.data.name, buttons, escValue: 'resume' });
    G.paused = false;
    if (r.value === 'restart') restart();
    else if (r.value === 'editor') openEditor();
    else if (r.value === 'music') {
      A.setMusic(!A.musicOn());
      settings.music = A.musicOn();
      Store.set('fw_settings', settings);
      openPause();
    } else if (r.value === 'quit') leaveLevel();
  }
  $('#btn-pause').addEventListener('click', () => {
    A.play('click');
    openPause();
  });

  function leaveLevel() {
    const m = G.play ? G.play.meta : { source: 'story' };
    if (m.source === 'editor') {
      if (E.isDirty()) {
        openEditor();
        return;
      }
      showScreen('title');
    } else showScreen(m.source === 'my' ? 'my' : 'story');
  }

  async function showFailed() {
    const m = G.play.meta;
    const buttons = [{ label: '↻ Nochmal versuchen', value: 'restart', cls: 'green' }];
    if (m.source === 'editor') buttons.push({ label: '✎ Zurück zum Editor', value: 'editor', cls: 'purple' });
    else buttons.push({ label: m.source === 'my' ? '☰ Meine Level' : '☰ Level-Auswahl', value: 'list', cls: 'grey' });
    const r = await G.dialog({
      title: 'Alle Lichter aus!',
      text: 'Am Tor sind keine Leben mehr übrig. Jedes Tor hat 4 Lichter – ein neues Tor füllt sie wieder auf.',
      buttons,
      escValue: 'restart'
    });
    if (r.value === 'restart') restart();
    else if (r.value === 'editor') openEditor();
    else showScreen(m.source === 'my' ? 'my' : 'story');
  }

  async function showResults() {
    const W = G.W, m = G.play.meta;
    const rt = FW.rating(W);
    let record = false;
    if (m.source !== 'editor') {
      const key = m.source === 'my' ? 'my:' + m.id : m.id;
      const prog = progress();
      const old = prog[key];
      record = !!old && W.score > old.best;
      prog[key] = {
        best: Math.max(W.score, old ? old.best : 0),
        stars: Math.max(rt.stars, old ? old.stars : 0),
        prizes: Math.max(W.prizes, old ? old.prizes : 0),
        time: old && old.best >= W.score ? old.time : W.time
      };
      Store.set('fw_progress', prog);
    }
    const body = el('div');
    body.appendChild(starsEl(rt.stars, true));
    if (record) body.appendChild(el('div', 'record', '★ Neuer Rekord! ★'));
    const grid = el('div', 'result-grid');
    const rows = [
      ['Punkte', String(W.score)],
      ['Perlen', W.bubbles + ' / ' + W.totalBubbles + ' (' + Math.round(rt.pct * 100) + '%)'],
      ['Preise', W.prizes + ' / ' + W.totalPrizes],
      ['Zeit', R.fmtTime(W.time)],
      ['Missgeschicke', String(W.deaths)]
    ];
    for (const [a, b] of rows) {
      grid.appendChild(el('span', '', a));
      grid.appendChild(el('b', '', b));
    }
    body.appendChild(grid);
    if (rt.stars < 3) body.appendChild(el('p', '', 'Tipp: Für 3 Sterne brauchst du 90 % der Perlen und alle Preise.'));
    const buttons = [];
    const hasNext = m.source === 'story' && m.index + 1 < FW.LEVELS.length;
    if (m.source === 'editor') buttons.push({ label: '✎ Zurück zum Editor', value: 'editor', cls: 'purple' });
    if (hasNext) buttons.push({ label: '▶ Nächstes Level', value: 'next', cls: 'green' });
    buttons.push({ label: '↻ Nochmal', value: 'restart', cls: 'blue' });
    if (m.source !== 'editor') buttons.push({ label: m.source === 'my' ? '☰ Meine Level' : '☰ Level-Auswahl', value: 'list', cls: 'grey' });
    const r = await G.dialog({ title: 'Geschafft!', text: G.play.data.name, body, buttons, escValue: m.source === 'editor' ? 'editor' : 'list' });
    if (r.value === 'next') {
      const nx = FW.LEVELS[m.index + 1];
      G.playLevel(nx.data, { source: 'story', index: m.index + 1, id: nx.id });
    } else if (r.value === 'restart') restart();
    else if (r.value === 'editor') openEditor();
    else showScreen(m.source === 'my' ? 'my' : 'story');
  }

  const SFX = { collect: 'collect', prize: 'prize', jump: 'jump', die: 'die', respawn: 'respawn', checkpoint: 'checkpoint', goal: 'goal', spring: 'spring', stomp: 'stomp', layer: 'layer', bump: 'bump', grab: 'grab', boxland: 'land' };
  const HAPTIC = { failed: 'error', die: 'error', goal: 'success', stomp: 'heavy', spring: 'heavy', prize: 'success', checkpoint: 'light', bump: 'light' };
  function drain(W) {
    for (const e of W.events) {
      if (isNativeApp && HAPTIC[e.type]) native('haptic', HAPTIC[e.type]);
      if (use3D) R3.handleEvent(e, W);
      else R.handleEvent(e, W);
      if (e.type === 'land') {
        if (e.v > 500) A.play('land');
      } else if (SFX[e.type]) A.play(SFX[e.type], e);
    }
    W.events.length = 0;
  }

  /* ---------------- Menü-Knöpfe ---------------- */
  $$('[data-act]').forEach((b) => {
    b.addEventListener('click', async () => {
      A.init();
      A.play('click');
      switch (b.dataset.act) {
        case 'story':
          showScreen('story');
          break;
        case 'create':
          openEditor(E.hasLevel() ? undefined : null, null);
          break;
        case 'create-new':
          openEditor(null, null);
          break;
        case 'mylevels':
          showScreen('my');
          break;
        case 'costume':
          showScreen('costume');
          break;
        case 'help':
          showScreen('help');
          break;
        case 'back':
          showScreen('title');
          break;
        case 'toggle-music':
          A.setMusic(!A.musicOn());
          settings.music = A.musicOn();
          Store.set('fw_settings', settings);
          updateSoundLabels();
          break;
        case 'toggle-sfx':
          A.setSfx(!A.sfxOn());
          settings.sfx = A.sfxOn();
          Store.set('fw_settings', settings);
          updateSoundLabels();
          break;
        case 'import': {
          const d = await G.importDialog();
          if (d) {
            const id = G.saveMyLevel(null, d);
            if (!id) G.alert('Speichern nicht möglich', 'Der Browser blockiert den Speicher. Du kannst das Level aber im Editor öffnen.');
            renderMy();
          }
          break;
        }
      }
    });
  });

  /* ---------------- Hauptschleife ---------------- */
  const canvas = $('#game');
  R.init(canvas);
  const canvas3d = $('#game3d');
  let use3D = false;
  try {
    use3D = !!(R3 && R3.init && R3.init(canvas3d));
  } catch (e) {
    use3D = false;
  }
  if (!use3D) canvas3d.classList.add('hidden');
  G.use3D = use3D;
  let titlePrev = null, costumePrev = null;
  if (use3D) {
    titlePrev = R3.createPreview($('#title-char'));
    costumePrev = R3.createPreview($('#costume-char'));
  }
  E.setup(G);
  setupTouch();
  window.addEventListener('resize', () => {
    R.resize();
    if (use3D) R3.resize();
  });
  window.addEventListener('orientationchange', () => setTimeout(() => R.resize(), 200));
  document.addEventListener('pointerdown', () => A.init(), { once: true });

  let last = performance.now(), acc = 0;
  const T0 = last;
  const titleChar = $('#title-char'), costumeChar = $('#costume-char');

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    const t = (now - T0) / 1000;
    pollPad();
    try {
      if (G.mode === 'play' && G.W) {
        const W = G.W;
        if (!G.paused && !G.modalOpen()) {
          acc += dt;
          let n = 0;
          while (acc >= C.STEP && n < 14) {
            FW.step(W, frameInput(), C.STEP);
            drain(W);
            acc -= C.STEP;
            n++;
          }
          if (n >= 14) acc = 0;
          if (use3D) R3.update(dt, W);
          else {
            R.update(dt, W);
            R.updateCamera(W, dt);
          }
          if (W.finished || W.failed) {
            G.finishT += dt;
            if (G.finishT > (W.failed ? 1.4 : 1.6) && !G.resultShown) {
              G.resultShown = true;
              if (W.failed) showFailed();
              else showResults();
            }
          }
        }
        if (use3D) {
          canvas3d.classList.toggle('hidden', false);
          R3.render(W, t, dt);
          R.clearOverlay();
        } else R.drawGame(W, t);
        R.drawHUD(W, t, { rightPad: 56 });
      } else if (G.mode === 'editor') {
        if (use3D) canvas3d.classList.toggle('hidden', true);
        E.update(dt);
        E.draw(t);
      } else if (G.demo) {
        // Menü-Hintergrund: Kamera schwebt durch Level 1
        const D = G.demo;
        FW.step(D, null, dt);
        D.events.length = 0;
        R.cam.zoom = R.autoZoom();
        const sz = R.size();
        const hw = sz.w / 2 / R.cam.zoom;
        const span = Math.max(0, D.L.w * C.T - 2 * hw);
        R.cam.x = hw + span * (0.5 - 0.5 * Math.cos(t * 0.03));
        R.cam.y = D.L.h * C.T - sz.h / 2 / R.cam.zoom + 10;
        if (use3D && G.screen === 'story' && !$('#world').classList.contains('hidden')) {
          canvas3d.classList.toggle('hidden', false);
          R3.hubRender(t, dt);
          R.clearOverlay();
        } else if (use3D) {
          canvas3d.classList.toggle('hidden', false);
          R3.update(dt, D);
          const span = Math.max(0, D.L.w - 14);
          R3.render(D, t, dt, { demoX: 7 + span * (0.5 - 0.5 * Math.cos(t * 0.03)) });
          R.clearOverlay();
        } else {
          R.update(dt, D);
          R.drawGame(D, t);
        }
        if (G.screen === 'title') titlePrev ? titlePrev.render(R.look, t) : R.drawPreview(titleChar, R.look, t);
        if (G.screen === 'costume') costumePrev ? costumePrev.render(R.look, t) : R.drawPreview(costumeChar, R.look, t);
      }
    } catch (err) {
      // Ein Fehler beim Zeichnen darf das Spiel nicht einfrieren
      if (!frame.warned) {
        frame.warned = true;
        console.error(err);
      }
    }
  }

  // Planet: wischen zum Drehen, Fähnchen antippen zum Auswählen
  let hubDown = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (G.mode !== 'menu' || G.screen !== 'story' || !use3D || G.modalOpen()) return;
    hubDown = true;
    A.init();
    R3.hubDragStart(e.clientX);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (hubDown) R3.hubDragMove(e.clientX);
  });
  const hubUp = (e) => {
    if (!hubDown) return;
    hubDown = false;
    const r = R3.hubDragEnd(e.clientX, e.clientY);
    if (r >= 0) {
      if (r === G.hubSel) playSelected();
      else {
        selectWorld(r);
        A.play('click');
      }
    } else if (r <= -2) {
      G.hubSel = -2 - r;
      renderWorldCard();
    }
  };
  canvas.addEventListener('pointerup', hubUp);
  canvas.addEventListener('pointercancel', hubUp);
  $('#w-prev').addEventListener('click', () => {
    A.play('click');
    selectWorld((G.hubSel || 0) - 1);
  });
  $('#w-next').addEventListener('click', () => {
    A.play('click');
    selectWorld((G.hubSel || 0) + 1);
  });
  $('#w-play').addEventListener('click', playSelected);

  showScreen('title');
  requestAnimationFrame(frame);

  // Offline-Speicher für die installierte App (nur über https/localhost möglich)
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch (e) {
    /* nicht verfügbar – Spiel läuft trotzdem */
  }
})();
