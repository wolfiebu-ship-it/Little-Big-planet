/*
 * Craft World – Level-Editor ("Erstellen"-Modus)
 */
(function (root) {
  'use strict';
  const FW = (root.FW = root.FW || {});
  const C = FW.C, T = C.T;
  const E = (FW.Editor = {});

  const TOOLS = [
    { ch: 'pan', label: 'Schieben', ico: '✋' },
    { ch: '.', label: 'Radierer' },
    { ch: '#', label: 'Pappe' },
    { ch: 'H', label: 'Holz' },
    { ch: '=', label: 'Stoffbrett' },
    { ch: 'o', label: 'Perle' },
    { ch: '*', label: 'Preis' },
    { ch: 'B', label: 'Kiste' },
    { ch: 'J', label: 'Feder' },
    { ch: 'M', label: 'Fahrt ↔' },
    { ch: 'V', label: 'Aufzug ↕' },
    { ch: '^', label: 'Stacheln' },
    { ch: 'f', label: 'Feuer' },
    { ch: 'E', label: 'Käfer' },
    { ch: 'C', label: 'Checkpoint' },
    { ch: 'T', label: 'Schild' },
    { ch: 'S', label: 'Start' },
    { ch: 'G', label: 'Ziel' }
  ];
  const TIPS = {
    pan: 'Ziehen, um die Ansicht zu verschieben',
    '.': 'Entfernt Teile (auch: Rechtsklick)',
    '#': 'Feste Pappe – zum Laufen und als Wand',
    H: 'Festes Holz – sieht anders aus, verhält sich wie Pappe',
    '=': 'Stoffbrett: von unten durchspringbar',
    o: 'Punkteperle: 10 Punkte, Kombos bis ×5',
    '*': 'Preisblase: 300 Punkte, zählt für 3 Sterne',
    B: 'Kiste: schieben, greifen, draufklettern',
    J: 'Sprungfeder: schleudert ca. 8 Felder hoch',
    M: 'Plattform fährt 4 Felder nach rechts und zurück',
    V: 'Aufzug fährt 4 Felder nach oben und zurück',
    '^': 'Stacheln: tödlich bei Berührung',
    f: 'Feuer: tödlich bei Berührung',
    E: 'Filzkäfer: läuft hin und her, draufspringen besiegt ihn',
    C: 'Checkpoint: hier geht es nach einem Missgeschick weiter',
    T: 'Schild mit eigenem Hinweistext',
    S: 'Startpunkt (nur einer pro Level)',
    G: 'Ziel (nur eines pro Level)'
  };

  let G = null; // Verweis auf die Hauptsteuerung (main.js)
  let R = null;
  let L = null; // kompiliertes Level, wird direkt bearbeitet
  let st = null;

  E.setup = function (main) {
    G = main;
    R = FW.Render;
    buildPalette();
    document.querySelectorAll('#ed-layers button').forEach((b) => {
      b.addEventListener('click', () => {
        setLayer(+b.dataset.layer);
        FW.Audio.play('click');
      });
    });
    document.querySelectorAll('#ed-top [data-ed]').forEach((b) => {
      b.addEventListener('click', () => {
        FW.Audio.play('click');
        command(b.dataset.ed);
      });
    });
    const cv = document.getElementById('game');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => {
      if (st && !st.pointers.size) st.hover = null;
    });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  function buildPalette() {
    const pal = document.getElementById('ed-palette');
    pal.innerHTML = '';
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.dataset.tool = t.ch;
      b.title = t.label + ' – ' + TIPS[t.ch];
      if (t.ico) {
        const s = document.createElement('span');
        s.className = 'ico';
        s.textContent = t.ico;
        b.appendChild(s);
      } else {
        const c = document.createElement('canvas');
        c.width = 76;
        c.height = 76;
        b.appendChild(c);
      }
      const l = document.createElement('span');
      l.textContent = t.label;
      b.appendChild(l);
      b.addEventListener('click', () => {
        setTool(t.ch);
        FW.Audio.play('click');
      });
      pal.appendChild(b);
    }
  }
  function refreshIcons() {
    document.querySelectorAll('#ed-palette button').forEach((b) => {
      const c = b.querySelector('canvas');
      if (c) R.drawIcon(c, b.dataset.tool, L ? L.theme : 0);
    });
  }

  /* ------------------------------------------------------------------ */
  E.open = function (data, slotId) {
    const src = FW.normalizeLevel(data || FW.blankLevel());
    L = FW.compileLevel(src);
    st = {
      id: slotId || null,
      layer: 0,
      tool: '#',
      cam: { x: 0, y: 0, zoom: 1 },
      hover: null,
      stroke: null,
      undo: [],
      redo: [],
      keys: {},
      pointers: new Map(),
      pinch: null,
      dirty: false,
      lastSaved: null
    };
    // Kamera auf den Start
    let sx = 2, sy = L.h - 4;
    L.raw.forEach((layer, z) => layer.forEach((row, y) => row.forEach((ch, x) => {
      if (ch === 'S') {
        sx = x;
        sy = y;
      }
    })));
    st.cam.zoom = defaultZoom();
    const sz = R.size();
    st.cam.x = sx * T + sz.w / 2 / st.cam.zoom - 3 * T;
    st.cam.y = sy * T - 2 * T;
    clampCam();
    R.setLevel(L);
    refreshIcons();
    setTool('#');
    setLayer(0);
    updateName();
    st.lastSaved = snapshot();
  };

  E.resume = function () {
    if (!L) return E.open(null);
    R.setLevel(L);
    st.pointers.clear();
    st.stroke = null;
    st.pinch = null;
  };

  E.hasLevel = () => !!L;
  E.data = function () {
    return {
      name: L.name,
      theme: L.theme,
      w: L.w,
      h: L.h,
      layers: L.raw.map((layer) => layer.map((r) => r.join(''))),
      signs: Object.assign({}, L.signs)
    };
  };
  E.slotId = () => (st ? st.id : null);
  E.isDirty = () => !!(st && L && snapshot() !== st.lastSaved);

  function defaultZoom() {
    const sz = R.size();
    return Math.max(0.45, Math.min(1.4, Math.min(sz.h / 640, sz.w / 900)));
  }

  function updateName() {
    document.getElementById('ed-name').textContent = L.name;
  }
  function setTool(ch) {
    st.tool = ch;
    document.querySelectorAll('#ed-palette button').forEach((b) => b.classList.toggle('on', b.dataset.tool === ch));
    showTip(TIPS[ch]);
  }
  function setLayer(z) {
    st.layer = z;
    document.querySelectorAll('#ed-layers button').forEach((b) => b.classList.toggle('on', +b.dataset.layer === z));
    showTip('Ebene: ' + ['Vorne', 'Mitte', 'Hinten'][z]);
  }
  let tipTimer = null;
  function showTip(text) {
    const el = document.getElementById('ed-tip');
    if (!G || G.mode !== 'editor') return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  /* ------------------------------------------------------------------ */
  /* Bearbeiten                                                          */
  /* ------------------------------------------------------------------ */
  function snapshot() {
    return JSON.stringify(E.data());
  }
  function restore(json) {
    const d = FW.normalizeLevel(JSON.parse(json));
    L = FW.compileLevel(d);
    R.setLevel(L);
    updateName();
    refreshIcons();
    clampCam();
  }
  function pushUndo() {
    st.undo.push(snapshot());
    if (st.undo.length > 80) st.undo.shift();
    st.redo.length = 0;
  }
  function undo() {
    if (!st.undo.length) return showTip('Nichts zum Rückgängigmachen');
    st.redo.push(snapshot());
    restore(st.undo.pop());
    showTip('Rückgängig');
  }
  function redo() {
    if (!st.redo.length) return showTip('Nichts zum Wiederholen');
    st.undo.push(snapshot());
    restore(st.redo.pop());
    showTip('Wiederholt');
  }

  function setTile(z, x, y, ch) {
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return false;
    const old = L.raw[z][y][x];
    if (old === ch) return false;
    if (old === 'T') delete L.signs[z + ',' + x + ',' + y];
    L.raw[z][y][x] = ch;
    L.grid[z][y][x] = FW.TILES[ch].entity ? '.' : ch;
    R.invalidate(z, x, y);
    return true;
  }

  function removeAll(ch) {
    for (let z = 0; z < C.LAYERS; z++) {
      for (let y = 0; y < L.h; y++) {
        for (let x = 0; x < L.w; x++) if (L.raw[z][y][x] === ch) setTile(z, x, y, '.');
      }
    }
  }

  function paintCell(x, y, erase) {
    const ch = erase ? '.' : st.tool;
    if (ch === 'pan') return;
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    if (L.raw[st.layer][y][x] === ch) return;
    if (!st.stroke.pushed) {
      pushUndo();
      st.stroke.pushed = true;
    }
    if (ch === 'S' || ch === 'G') removeAll(ch);
    if (setTile(st.layer, x, y, ch)) {
      st.stroke.changed = true;
      if (ch === 'T') st.stroke.signs.push(st.layer + ',' + x + ',' + y);
      FW.Audio.play(ch === '.' ? 'erase' : 'place');
    }
  }

  function screenToCell(sx, sy) {
    const sz = R.size();
    const wx = st.cam.x + (sx - sz.w / 2) / st.cam.zoom;
    const wy = st.cam.y + (sy - sz.h / 2) / st.cam.zoom;
    return { x: Math.floor(wx / T), y: Math.floor(wy / T) };
  }

  function lineCells(a, b, fn) {
    let x0 = a.x, y0 = a.y;
    const x1 = b.x, y1 = b.y;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 500; i++) {
      fn(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function clampCam() {
    if (!st) return;
    st.cam.x = Math.max(-200, Math.min(L.w * T + 200, st.cam.x));
    st.cam.y = Math.max(-200, Math.min(L.h * T + 200, st.cam.y));
    st.cam.zoom = Math.max(0.3, Math.min(2.5, st.cam.zoom));
  }

  /* ------------------------------------------------------------------ */
  /* Eingabe                                                             */
  /* ------------------------------------------------------------------ */
  function active() {
    return G && G.mode === 'editor' && !G.modalOpen();
  }

  function onDown(e) {
    if (!active()) return;
    e.preventDefault();
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignorieren */
    }
    FW.Audio.init();
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pointers.size === 2) {
      // Zwei Finger: Verschieben/Zoomen. Einen gerade begonnenen Strich zurücknehmen.
      if (st.stroke && st.stroke.pushed && performance.now() - st.stroke.t0 < 300) {
        restore(st.undo.pop());
      }
      st.stroke = null;
      const pts = [...st.pointers.values()];
      st.pinch = { d: dist(pts[0], pts[1]), mid: mid(pts[0], pts[1]), zoom: st.cam.zoom, cx: st.cam.x, cy: st.cam.y };
      return;
    }
    if (st.pointers.size > 2) return;
    const pan = e.button === 1 || st.tool === 'pan' || st.keys.Space;
    const erase = e.button === 2 || st.tool === '.';
    st.stroke = { pan, erase, last: screenToCell(e.clientX, e.clientY), sx: e.clientX, sy: e.clientY, cx: st.cam.x, cy: st.cam.y, pushed: false, changed: false, signs: [], t0: performance.now() };
    if (!pan) paintCell(st.stroke.last.x, st.stroke.last.y, erase);
  }

  function onMove(e) {
    if (!active()) return;
    if (st.pointers.has(e.pointerId)) st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'mouse') st.hover = screenToCell(e.clientX, e.clientY);
    if (st.pinch && st.pointers.size >= 2) {
      const pts = [...st.pointers.values()];
      const d = dist(pts[0], pts[1]);
      const m = mid(pts[0], pts[1]);
      st.cam.zoom = st.pinch.zoom * (d / Math.max(10, st.pinch.d));
      clampCam();
      st.cam.x = st.pinch.cx - (m.x - st.pinch.mid.x) / st.cam.zoom;
      st.cam.y = st.pinch.cy - (m.y - st.pinch.mid.y) / st.cam.zoom;
      clampCam();
      return;
    }
    const s = st.stroke;
    if (!s) return;
    if (s.pan) {
      st.cam.x = s.cx - (e.clientX - s.sx) / st.cam.zoom;
      st.cam.y = s.cy - (e.clientY - s.sy) / st.cam.zoom;
      clampCam();
      return;
    }
    const c = screenToCell(e.clientX, e.clientY);
    if (c.x === s.last.x && c.y === s.last.y) return;
    // Einzelobjekte nicht „verschmieren“
    const single = ['S', 'G', 'C', 'T', 'M', 'V', 'E', 'B', 'J'].includes(st.tool) && !s.erase;
    if (single) {
      s.last = c;
      return;
    }
    lineCells(s.last, c, (x, y) => paintCell(x, y, s.erase));
    s.last = c;
  }

  function onUp(e) {
    if (!st) return;
    st.pointers.delete(e.pointerId);
    if (st.pointers.size < 2) st.pinch = null;
    if (!active()) return;
    const s = st.stroke;
    st.stroke = null;
    if (s && s.signs.length) editSignText(s.signs[s.signs.length - 1]);
    else if (s && !s.pan && !s.changed && !s.erase && st.tool === 'T') {
      const c = s.last;
      const key = st.layer + ',' + c.x + ',' + c.y;
      if (L.raw[st.layer][c.y] && L.raw[st.layer][c.y][c.x] === 'T') editSignText(key);
    }
  }

  function onWheel(e) {
    if (!active()) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const before = screenToWorld(e.clientX, e.clientY);
      st.cam.zoom *= Math.exp(-e.deltaY * 0.0025);
      clampCam();
      const after = screenToWorld(e.clientX, e.clientY);
      st.cam.x += before.x - after.x;
      st.cam.y += before.y - after.y;
    } else {
      const k = e.deltaMode === 1 ? 30 : 1;
      if (e.shiftKey) st.cam.x += (e.deltaY * k) / st.cam.zoom;
      else {
        st.cam.x += (e.deltaX * k) / st.cam.zoom;
        st.cam.y += (e.deltaY * k) / st.cam.zoom;
      }
    }
    clampCam();
  }
  function screenToWorld(sx, sy) {
    const sz = R.size();
    return { x: st.cam.x + (sx - sz.w / 2) / st.cam.zoom, y: st.cam.y + (sy - sz.h / 2) / st.cam.zoom };
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  E.onKey = function (e, down) {
    if (!st) return false;
    st.keys[e.code] = down;
    if (!down) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') {
      if (e.shiftKey) redo();
      else undo();
      return true;
    }
    if (ctrl && e.code === 'KeyY') {
      redo();
      return true;
    }
    if (ctrl && e.code === 'KeyS') {
      command('save');
      return true;
    }
    if (e.code === 'Digit1') setLayer(0);
    else if (e.code === 'Digit2') setLayer(1);
    else if (e.code === 'Digit3') setLayer(2);
    else if (e.code === 'Escape') command('menu');
    else return e.code === 'Space';
    return true;
  };

  E.update = function (dt) {
    if (!st) return;
    const k = st.keys;
    const sp = (700 * dt) / st.cam.zoom;
    if (k.ArrowLeft || k.KeyA) st.cam.x -= sp;
    if (k.ArrowRight || k.KeyD) st.cam.x += sp;
    if (k.ArrowUp || k.KeyW) st.cam.y -= sp;
    if (k.ArrowDown || k.KeyS) st.cam.y += sp;
    clampCam();
  };
  E.releaseKeys = function () {
    if (st) st.keys = {};
  };

  E.draw = function (t) {
    if (!L) return;
    R.drawEditor(L, st.cam, { layer: st.layer, tool: st.tool, hover: st.hover }, t);
  };

  /* ------------------------------------------------------------------ */
  /* Befehle                                                             */
  /* ------------------------------------------------------------------ */
  function count(ch) {
    let n = 0;
    for (const layer of L.raw) for (const row of layer) for (const c of row) if (c === ch) n++;
    return n;
  }

  async function editSignText(key) {
    const cur = L.signs[key] || '';
    const r = await G.dialog({
      title: 'Schild beschriften',
      text: 'Was soll auf dem Schild stehen?',
      input: { value: cur, placeholder: 'z. B. Spring hier besonders hoch!', max: 200 },
      buttons: [
        { label: 'Übernehmen', value: 'ok', cls: 'green' },
        { label: 'Abbrechen', value: 'cancel', cls: 'grey' }
      ]
    });
    if (r.value === 'ok') {
      const [z, x, y] = key.split(',').map(Number);
      if (L.raw[z] && L.raw[z][y] && L.raw[z][y][x] === 'T') L.signs[key] = r.text.trim().slice(0, 200) || '…';
    }
  }

  async function command(cmd) {
    if (!st) return;
    switch (cmd) {
      case 'undo':
        undo();
        break;
      case 'redo':
        redo();
        break;
      case 'test': {
        if (!count('S')) return G.alert('Kein Start', 'Setze zuerst einen Startpunkt (Werkzeug „Start“).');
        if (!count('G')) return G.alert('Kein Ziel', 'Setze noch ein Ziel (Werkzeug „Ziel“), damit man das Level beenden kann.');
        G.playLevel(E.data(), { source: 'editor' });
        break;
      }
      case 'rename': {
        const r = await G.dialog({
          title: 'Level benennen',
          input: { value: L.name, max: 40 },
          buttons: [
            { label: 'Übernehmen', value: 'ok', cls: 'green' },
            { label: 'Abbrechen', value: 'cancel', cls: 'grey' }
          ]
        });
        if (r.value === 'ok' && r.text.trim()) {
          pushUndo();
          L.name = r.text.trim().slice(0, 40);
          updateName();
        }
        break;
      }
      case 'save':
        await save();
        break;
      case 'menu': {
        if (E.isDirty()) {
          const r = await G.dialog({
            title: 'Editor verlassen?',
            text: 'Es gibt ungespeicherte Änderungen.',
            buttons: [
              { label: 'Speichern & verlassen', value: 'save', cls: 'green' },
              { label: 'Ohne Speichern verlassen', value: 'leave', cls: '' },
              { label: 'Weiter bearbeiten', value: 'cancel', cls: 'grey' }
            ]
          });
          if (r.value === 'cancel') return;
          if (r.value === 'save' && !(await save())) return;
        }
        L = null;
        G.showScreen('title');
        break;
      }
      case 'more':
        await settings();
        break;
    }
  }

  async function save() {
    if (!st.id) {
      const r = await G.dialog({
        title: 'Level speichern',
        text: 'Wie soll dein Level heißen?',
        input: { value: L.name, max: 40 },
        buttons: [
          { label: 'Speichern', value: 'ok', cls: 'green' },
          { label: 'Abbrechen', value: 'cancel', cls: 'grey' }
        ]
      });
      if (r.value !== 'ok') return false;
      if (r.text.trim()) L.name = r.text.trim().slice(0, 40);
      updateName();
    }
    const id = G.saveMyLevel(st.id, E.data());
    if (!id) {
      G.alert('Speichern fehlgeschlagen', 'Der Browser erlaubt hier keinen Speicher. Nutze „Exportieren“ im ⚙-Menü, um dein Level als Text zu sichern.');
      return false;
    }
    st.id = id;
    st.lastSaved = snapshot();
    showTip('Gespeichert ✓');
    return true;
  }

  function resize(dw, dh) {
    const nw = Math.max(C.MIN_W, Math.min(C.MAX_W, L.w + dw));
    const nh = Math.max(C.MIN_H, Math.min(C.MAX_H, L.h + dh));
    if (nw === L.w && nh === L.h) return false;
    pushUndo();
    const d = E.data();
    const shift = nh - L.h; // Zeilen werden oben ergänzt/entfernt
    const layers = d.layers.map((rows) => {
      let r = rows.slice();
      if (shift > 0) r = Array.from({ length: shift }, () => '.'.repeat(L.w)).concat(r);
      else if (shift < 0) r = r.slice(-shift);
      return r.map((row) => (nw > L.w ? row + '.'.repeat(nw - L.w) : row.slice(0, nw)));
    });
    const signs = {};
    for (const k of Object.keys(d.signs)) {
      const [z, x, y] = k.split(',').map(Number);
      const ny = y + shift;
      if (x < nw && ny >= 0 && ny < nh) signs[z + ',' + x + ',' + ny] = d.signs[k];
    }
    L = FW.compileLevel({ name: d.name, theme: d.theme, w: nw, h: nh, layers, signs });
    R.setLevel(L);
    st.cam.y += shift * T;
    clampCam();
    return true;
  }

  async function settings() {
    for (;;) {
      const themeName = FW.Render.THEMES[L.theme].name;
      const r = await G.dialog({
        title: 'Einstellungen',
        text: 'Größe: ' + L.w + ' × ' + L.h + ' Felder · Thema: ' + themeName,
        inline: true,
        buttons: [
          { label: '🎨 Thema wechseln', value: 'theme', cls: 'purple' },
          { label: '⟷ Breiter', value: 'w+', cls: 'blue' },
          { label: '⟷ Schmaler', value: 'w-', cls: 'blue' },
          { label: '↕ Höher', value: 'h+', cls: 'blue' },
          { label: '↕ Niedriger', value: 'h-', cls: 'blue' },
          { label: '⇧ Exportieren', value: 'export', cls: 'green' },
          { label: '⇩ Importieren', value: 'import', cls: 'green' },
          { label: '🗋 Neues Level', value: 'new', cls: '' },
          { label: 'Schließen', value: 'cancel', cls: 'grey' }
        ]
      });
      if (r.value === 'theme') {
        pushUndo();
        L.theme = (L.theme + 1) % FW.Render.THEMES.length;
        R.setLevel(L);
        refreshIcons();
      } else if (r.value === 'w+') resize(10, 0);
      else if (r.value === 'w-') resize(-10, 0);
      else if (r.value === 'h+') resize(0, 2);
      else if (r.value === 'h-') resize(0, -2);
      else if (r.value === 'export') {
        await G.exportDialog(E.data());
        return;
      } else if (r.value === 'import') {
        const d = await G.importDialog();
        if (d) {
          pushUndo();
          L = FW.compileLevel(d);
          R.setLevel(L);
          updateName();
          refreshIcons();
          clampCam();
          showTip('Importiert ✓');
        }
        return;
      } else if (r.value === 'new') {
        const c = await G.dialog({
          title: 'Neues Level?',
          text: 'Das aktuelle Level wird geschlossen. Nicht gespeicherte Änderungen gehen verloren.',
          buttons: [
            { label: 'Neu anfangen', value: 'ok', cls: '' },
            { label: 'Abbrechen', value: 'cancel', cls: 'grey' }
          ]
        });
        if (c.value === 'ok') E.open(null, null);
        return;
      } else return;
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
