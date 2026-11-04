/*
 * Craft World – Spiel-Engine (Physik & Spiellogik)
 * Diese Datei kennt kein DOM. Sie läuft im Browser und in Node (für Tests).
 */
(function (root) {
  'use strict';
  const FW = (root.FW = root.FW || {});

  const T = 40; // Kachelgröße in Pixeln
  const C = {
    T,
    GRAV: 2200,
    MAXFALL: 1100,
    RUN: 270,
    ACC_G: 2600,
    ACC_A: 1700,
    FRIC_G: 3000,
    FRIC_A: 500,
    JUMP_V: 800,
    JUMP_CUT: 0.45,
    SPRING_V: 1180,
    COYOTE: 0.1,
    JBUF: 0.13,
    PW: 26,
    PH: 34,
    BOX_PUSH: 125,
    BOX_DRAG: 165,
    ENEMY_V: 60,
    EW: 30,
    EH: 22,
    PLAT_PERIOD: 5,
    PLAT_RANGE: 4 * T,
    PLAT_W: 2 * T,
    PLAT_H: 16,
    STOMP_V: 560,
    DEAD_TIME: 1.1,
    LAYERS: 3,
    STEP: 1 / 120,
    CHAIN_TIME: 1.2,
    MIN_W: 30,
    MAX_W: 200,
    MIN_H: 14,
    MAX_H: 48
  };
  FW.C = C;
  const EPS = 0.001;

  // Kachel-Katalog (wird von Engine, Renderer und Editor benutzt)
  const TILES = {
    '.': { name: 'Leer' },
    '#': { name: 'Pappe', solid: true },
    'H': { name: 'Holz', solid: true },
    '=': { name: 'Stoffbrett', oneway: true },
    '^': { name: 'Stacheln', hazard: true },
    'f': { name: 'Feuer', hazard: true },
    'o': { name: 'Punkteperle' },
    '*': { name: 'Preisblase' },
    'C': { name: 'Checkpoint' },
    'S': { name: 'Start' },
    'G': { name: 'Ziel' },
    'J': { name: 'Sprungfeder' },
    'T': { name: 'Schild' },
    'B': { name: 'Kiste', entity: true },
    'M': { name: 'Plattform ↔', entity: true },
    'V': { name: 'Plattform ↕', entity: true },
    'E': { name: 'Filzkäfer', entity: true }
  };
  FW.TILES = TILES;

  function isSolid(ch) {
    return ch === '#' || ch === 'H';
  }
  FW.isSolid = isSolid;

  /* ------------------------------------------------------------------ */
  /* Level kompilieren                                                   */
  /* ------------------------------------------------------------------ */

  function clampInt(v, lo, hi, def) {
    v = Math.round(Number(v));
    if (!isFinite(v)) v = def;
    return Math.max(lo, Math.min(hi, v));
  }

  // Bringt ein (evtl. fremdes / importiertes) Level in ein sauberes Format.
  function normalizeLevel(src) {
    src = src && typeof src === 'object' ? src : {};
    const w = clampInt(src.w, C.MIN_W, C.MAX_W, 60);
    const h = clampInt(src.h, C.MIN_H, C.MAX_H, 18);
    const layers = [];
    for (let z = 0; z < C.LAYERS; z++) {
      const rows = Array.isArray(src.layers) && Array.isArray(src.layers[z]) ? src.layers[z] : [];
      const out = [];
      for (let y = 0; y < h; y++) {
        const line = typeof rows[y] === 'string' ? rows[y] : '';
        let s = '';
        for (let x = 0; x < w; x++) {
          const ch = line[x];
          s += ch && TILES[ch] ? ch : '.';
        }
        out.push(s);
      }
      layers.push(out);
    }
    const signs = {};
    if (src.signs && typeof src.signs === 'object') {
      for (const k of Object.keys(src.signs)) {
        const m = /^(\d+),(\d+),(\d+)$/.exec(k);
        if (!m) continue;
        const z = +m[1], x = +m[2], y = +m[3];
        if (z < C.LAYERS && x < w && y < h && layers[z][y][x] === 'T') {
          signs[k] = String(src.signs[k]).slice(0, 200);
        }
      }
    }
    return {
      name: typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 40) : 'Unbenanntes Level',
      theme: clampInt(src.theme, 0, 2, 0),
      w,
      h,
      layers,
      signs
    };
  }
  FW.normalizeLevel = normalizeLevel;

  function compileLevel(src) {
    const n = normalizeLevel(src);
    const grid = [], raw = [];
    for (let z = 0; z < C.LAYERS; z++) {
      const g = [], r = [];
      for (let y = 0; y < n.h; y++) {
        const line = n.layers[z][y];
        const gr = new Array(n.w), rr = new Array(n.w);
        for (let x = 0; x < n.w; x++) {
          const ch = line[x];
          rr[x] = ch;
          gr[x] = TILES[ch].entity ? '.' : ch;
        }
        g.push(gr);
        r.push(rr);
      }
      grid.push(g);
      raw.push(r);
    }
    return { name: n.name, theme: n.theme, w: n.w, h: n.h, grid, raw, signs: n.signs, src: n };
  }
  FW.compileLevel = compileLevel;

  function tileAt(L, z, x, y) {
    if (x < 0 || x >= L.w) return '#';
    if (y < 0 || y >= L.h || z < 0 || z >= C.LAYERS) return '.';
    return L.grid[z][y][x];
  }
  FW.tileAt = tileAt;

  /* ------------------------------------------------------------------ */
  /* Welt erzeugen                                                       */
  /* ------------------------------------------------------------------ */

  function createWorld(src) {
    const L = src && src.grid ? src : compileLevel(src);
    const W = {
      L,
      t: 0,
      time: 0,
      boxes: [],
      plats: [],
      enemies: [],
      collected: {},
      score: 0,
      chain: 0,
      chainT: 0,
      mult: 1,
      prizes: 0,
      bubbles: 0,
      deaths: 0,
      totalBubbles: 0,
      totalPrizes: 0,
      finished: false,
      events: [],
      checkpoint: null
    };
    let id = 1;
    let start = null;
    for (let z = 0; z < C.LAYERS; z++) {
      for (let y = 0; y < L.h; y++) {
        for (let x = 0; x < L.w; x++) {
          const ch = L.raw[z][y][x];
          switch (ch) {
            case 'S':
              if (!start) start = { x, y, z };
              break;
            case 'o':
              W.totalBubbles++;
              break;
            case '*':
              W.totalPrizes++;
              break;
            case 'B':
              W.boxes.push({ id: id++, x: x * T, y: y * T, w: T, h: T, x0: x * T, y0: y * T, vx: 0, vy: 0, z, push: 0, grounded: false, ground: null, dx: 0, dy: 0 });
              break;
            case 'M':
            case 'V':
              W.plats.push({ id: id++, kind: ch, x0: x * T, y0: y * T, x: x * T, y: y * T, w: C.PLAT_W, h: C.PLAT_H, z, dx: 0, dy: 0 });
              break;
            case 'E':
              W.enemies.push({ id: id++, x: x * T + (T - C.EW) / 2, y: y * T + T - C.EH, w: C.EW, h: C.EH, vx: -C.ENEMY_V, vy: 0, z, alive: true, deadT: 0, grounded: false, ground: null });
              break;
          }
        }
      }
    }
    if (!start) start = { x: 1, y: 0, z: 0 };
    W.start = start;
    W.checkpoint = cpFromTile(start.x, start.y, start.z, 'start');
    W.player = {
      x: W.checkpoint.x,
      y: W.checkpoint.y,
      w: C.PW,
      h: C.PH,
      vx: 0,
      vy: 0,
      z: start.z,
      zf: start.z,
      grounded: false,
      ground: null,
      coyote: 0,
      jbuf: 0,
      jumping: false,
      facing: 1,
      grab: null,
      dead: 0
    };
    updatePlats(W);
    return W;
  }
  FW.createWorld = createWorld;

  function cpFromTile(x, y, z, key) {
    return { x: x * T + (T - C.PW) / 2, y: y * T + T - C.PH, z, key };
  }

  // Schneller Klon für die Pfadsuche in den Tests
  function cloneWorld(W) {
    const c = Object.assign({}, W);
    c.boxes = W.boxes.map((b) => Object.assign({}, b));
    c.plats = W.plats.map((p) => Object.assign({}, p));
    c.enemies = W.enemies.map((e) => Object.assign({}, e));
    c.collected = Object.assign({}, W.collected);
    c.player = Object.assign({}, W.player);
    if (W.player.grab) c.player.grab = Object.assign({}, W.player.grab);
    c.events = [];
    return c;
  }
  FW.cloneWorld = cloneWorld;

  function ev(W, type, props) {
    const e = props || {};
    e.type = type;
    W.events.push(e);
  }

  /* ------------------------------------------------------------------ */
  /* Kollision                                                          */
  /* ------------------------------------------------------------------ */

  function overlap(a, b) {
    return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
  }
  FW.overlap = overlap;

  function rectHitsSolid(L, z, x, y, w, h) {
    const x0 = Math.floor((x + EPS) / T), x1 = Math.floor((x + w - EPS) / T);
    const y0 = Math.floor((y + EPS) / T), y1 = Math.floor((y + h - EPS) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (isSolid(tileAt(L, z, tx, ty))) return true;
      }
    }
    return false;
  }

  function boxById(W, id) {
    for (const b of W.boxes) if (b.id === id) return b;
    return null;
  }
  function platById(W, id) {
    for (const p of W.plats) if (p.id === id) return p;
    return null;
  }

  // Horizontale Bewegung mit Kollision. Gibt 'tile', eine Kiste oder null zurück.
  function moveX(W, b, dx, ignoreId) {
    if (dx === 0) return null;
    const L = W.L;
    const prevX = b.x;
    b.x += dx;
    let hit = null;
    const y0 = Math.floor((b.y + EPS) / T), y1 = Math.floor((b.y + b.h - EPS) / T);
    if (dx > 0) {
      const tx = Math.floor((b.x + b.w - EPS) / T);
      for (let ty = y0; ty <= y1; ty++) {
        if (isSolid(tileAt(L, b.z, tx, ty))) {
          b.x = tx * T - b.w;
          hit = 'tile';
          break;
        }
      }
    } else {
      const tx = Math.floor((b.x + EPS) / T);
      for (let ty = y0; ty <= y1; ty++) {
        if (isSolid(tileAt(L, b.z, tx, ty))) {
          b.x = (tx + 1) * T;
          hit = 'tile';
          break;
        }
      }
    }
    for (const k of W.boxes) {
      if (k === b || k.id === ignoreId || k.z !== b.z) continue;
      if (!overlap(b, k)) continue;
      if (dx > 0 && k.x >= prevX + b.w - 0.5) {
        b.x = k.x - b.w;
        hit = k;
      } else if (dx < 0 && k.x + k.w <= prevX + 0.5) {
        b.x = k.x + k.w;
        hit = k;
      }
    }
    return hit;
  }

  // Vertikale Bewegung. Gibt {land: ref|null, bonk: bool} zurück.
  function moveY(W, b, dy, opts) {
    const L = W.L;
    const prevTop = b.y, prevBottom = b.y + b.h;
    b.y += dy;
    const res = { land: null, bonk: false };
    if (dy === 0) return res;
    const x0 = Math.floor((b.x + EPS) / T), x1 = Math.floor((b.x + b.w - EPS) / T);
    if (dy > 0) {
      let best = Infinity, ref = null;
      const ty = Math.floor((b.y + b.h - EPS) / T);
      const top = ty * T;
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tileAt(L, b.z, tx, ty);
        if (isSolid(ch) || (ch === '=' && prevBottom <= top + 0.5)) {
          if (top < best) {
            best = top;
            ref = { t: 'tile' };
          }
        }
      }
      for (const p of W.plats) {
        if (p.z !== b.z) continue;
        if (b.x < p.x + p.w - EPS && b.x + b.w > p.x + EPS && prevBottom <= p.y + 2 && b.y + b.h > p.y) {
          if (p.y < best) {
            best = p.y;
            ref = { t: 'plat', id: p.id };
          }
        }
      }
      for (const k of W.boxes) {
        if (k === b || k.z !== b.z) continue;
        if (overlap(b, k) && prevBottom <= k.y + k.h / 2) {
          if (k.y < best) {
            best = k.y;
            ref = { t: 'box', id: k.id };
          }
        }
      }
      if (opts && opts.onPlayer) {
        const P = W.player;
        if (P.dead <= 0 && P.z === b.z && overlap(b, P) && prevBottom <= P.y + 4) {
          if (P.y < best) {
            best = P.y;
            ref = { t: 'player' };
          }
        }
      }
      if (ref) {
        b.y = best - b.h;
        res.land = ref;
      }
    } else {
      let best = -Infinity;
      const ty = Math.floor((b.y + EPS) / T);
      for (let tx = x0; tx <= x1; tx++) {
        if (isSolid(tileAt(L, b.z, tx, ty))) {
          best = Math.max(best, (ty + 1) * T);
        }
      }
      for (const k of W.boxes) {
        if (k === b || k.z !== b.z) continue;
        if (overlap(b, k) && prevTop >= k.y + k.h / 2) best = Math.max(best, k.y + k.h);
      }
      if (best > -Infinity) {
        b.y = best;
        res.bonk = true;
      }
    }
    return res;
  }

  function pointSupported(W, z, px, py) {
    const ch = tileAt(W.L, z, Math.floor(px / T), Math.floor(py / T));
    if (isSolid(ch) || ch === '=') return true;
    for (const p of W.plats) if (p.z === z && px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return true;
    for (const k of W.boxes) if (k.z === z && px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h) return true;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Schritt                                                             */
  /* ------------------------------------------------------------------ */

  function platOffset(t) {
    return (C.PLAT_RANGE * (1 - Math.cos((2 * Math.PI * t) / C.PLAT_PERIOD))) / 2;
  }

  function updatePlats(W) {
    const off = platOffset(W.t);
    for (const p of W.plats) {
      const nx = p.kind === 'M' ? p.x0 + off : p.x0;
      const ny = p.kind === 'V' ? p.y0 - off : p.y0;
      p.dx = nx - p.x;
      p.dy = ny - p.y;
      p.x = nx;
      p.y = ny;
    }
  }

  function carry(W, b) {
    if (!b.ground) return;
    if (b.ground.t === 'plat') {
      const p = platById(W, b.ground.id);
      if (p && p.z === b.z) {
        b.x += p.dx;
        b.y += p.dy;
      }
    } else if (b.ground.t === 'box') {
      const k = boxById(W, b.ground.id);
      if (k && k.z === b.z) {
        b.x += k.dx;
        b.y += k.dy;
      }
    }
  }

  const NO_INPUT = {};

  function step(W, inp, dt) {
    inp = inp || NO_INPUT;
    W.t += dt;
    updatePlats(W);
    if (W.finished) return;
    W.time += dt;
    const P = W.player;
    if (P.dead <= 0) carry(W, P);
    for (const b of W.boxes) carry(W, b);
    for (const e of W.enemies) if (e.alive) carry(W, e);
    updatePlayer(W, inp, dt);
    updateBoxes(W, dt);
    updateEnemies(W, dt);
    if (P.dead <= 0) interactions(W);
    if (W.chainT > 0) {
      W.chainT -= dt;
      if (W.chainT <= 0) {
        W.chain = 0;
        W.mult = 1;
      }
    }
  }
  FW.step = step;

  function tryLayer(W, nz) {
    const P = W.player;
    if (nz < 0 || nz >= C.LAYERS) return false;
    if (rectHitsSolid(W.L, nz, P.x, P.y, P.w, P.h)) {
      ev(W, 'bump');
      return false;
    }
    for (const k of W.boxes) {
      if (k.z === nz && overlap(P, k)) {
        ev(W, 'bump');
        return false;
      }
    }
    P.z = nz;
    P.ground = null;
    if (P.grab) {
      P.grab = null;
      ev(W, 'release');
    }
    ev(W, 'layer', { z: nz });
    return true;
  }

  function updatePlayer(W, inp, dt) {
    const P = W.player;
    P.zf += (P.z - P.zf) * Math.min(1, dt * 12);
    if (Math.abs(P.z - P.zf) < 0.002) P.zf = P.z;
    if (P.dead > 0) {
      P.dead -= dt;
      if (P.dead <= 0) respawn(W);
      return;
    }

    if (inp.upP) tryLayer(W, P.z + 1);
    if (inp.downP) tryLayer(W, P.z - 1);

    // Greifen beginnen
    if (inp.grabP && !P.grab) {
      for (const k of W.boxes) {
        if (k.z !== P.z) continue;
        if (!(k.y < P.y + P.h - 4 && k.y + k.h > P.y + 4)) continue;
        const right = P.x + P.w >= k.x - 6 && P.x + P.w <= k.x + 2;
        const left = P.x >= k.x + k.w - 2 && P.x <= k.x + k.w + 6;
        if (right || left) {
          P.grab = { id: k.id, off: k.x - P.x };
          P.facing = right ? 1 : -1;
          ev(W, 'grab');
          break;
        }
      }
    }

    let dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let mag = 1;
    // Analoger Joystick: Auslenkung bestimmt das Tempo
    if (typeof inp.axis === 'number' && Math.abs(inp.axis) > 0.15) {
      dir = inp.axis > 0 ? 1 : -1;
      mag = Math.min(1, 0.35 + ((Math.abs(inp.axis) - 0.15) / 0.6) * 0.65);
    }
    const acc = P.grounded ? C.ACC_G : C.ACC_A;
    const maxV = (P.grab ? C.BOX_DRAG : C.RUN) * mag;
    if (dir !== 0) {
      if (P.vx * dir < 0 && P.grounded) P.vx += dir * C.FRIC_G * dt;
      P.vx += dir * acc * dt;
      if (P.vx > maxV) P.vx = maxV;
      if (P.vx < -maxV) P.vx = -maxV;
      if (!P.grab) P.facing = dir;
    } else {
      const f = (P.grounded ? C.FRIC_G : C.FRIC_A) * dt;
      if (Math.abs(P.vx) <= f) P.vx = 0;
      else P.vx -= Math.sign(P.vx) * f;
    }
    if (P.grab && Math.abs(P.vx) > maxV) P.vx = Math.sign(P.vx) * maxV;

    // Springen (mit Coyote-Time und Sprungpuffer)
    if (inp.jumpP) P.jbuf = C.JBUF;
    else if (P.jbuf > 0) P.jbuf -= dt;
    if (P.grounded) P.coyote = C.COYOTE;
    else if (P.coyote > 0) P.coyote -= dt;
    if (P.jbuf > 0 && P.coyote > 0) {
      P.vy = -C.JUMP_V;
      P.jbuf = 0;
      P.coyote = 0;
      P.grounded = false;
      P.ground = null;
      P.jumping = true;
      ev(W, 'jump');
    }
    if (P.jumping && !inp.jump && P.vy < 0) {
      P.vy *= C.JUMP_CUT;
      P.jumping = false;
    }
    if (P.vy >= 0) P.jumping = false;

    P.vy = Math.min(P.vy + C.GRAV * dt, C.MAXFALL);

    // Horizontal
    const grabId = P.grab ? P.grab.id : -1;
    const prevX = P.x;
    const hit = moveX(W, P, P.vx * dt, grabId);
    if (hit) {
      if (hit !== 'tile' && P.grounded && dir !== 0 && Math.sign(P.vx) === dir) {
        hit.push = dir * C.BOX_PUSH;
        if (Math.abs(P.vx) > C.BOX_PUSH) P.vx = dir * C.BOX_PUSH;
      } else {
        P.vx = 0;
      }
    }

    // Gegriffene Kiste mitziehen
    if (P.grab) {
      const k = boxById(W, P.grab.id);
      const misaligned = !k || k.z !== P.z || Math.abs(k.y + k.h - (P.y + P.h)) > 14;
      if (!inp.grab || misaligned) {
        P.grab = null;
        ev(W, 'release');
      } else {
        const target = P.x + P.grab.off;
        const d = target - k.x;
        if (d !== 0) {
          const pre = k.x;
          moveX(W, k, d, -1);
          // Kiste darf nicht in den Spieler geschoben werden
          if (overlap(k, P)) k.x = pre;
          P.x = k.x - P.grab.off;
          if (overlap(P, k) || rectHitsSolid(W.L, P.z, P.x, P.y, P.w, P.h)) {
            P.x = prevX;
            k.x = pre;
          }
        }
        if (P.x === prevX) P.vx = 0;
      }
    }

    // Vertikal
    const wasGrounded = P.grounded;
    const vyBefore = P.vy;
    const r = moveY(W, P, P.vy * dt);
    if (r.land) {
      if (!wasGrounded && vyBefore > 250) ev(W, 'land', { v: vyBefore });
      P.vy = 0;
      P.grounded = true;
      P.ground = r.land;
      P.jumping = false;
    } else {
      P.grounded = false;
      P.ground = null;
      if (r.bonk && P.vy < 0) {
        P.vy = 0;
        P.jumping = false;
      }
    }
  }

  function updateBoxes(W, dt) {
    const P = W.player;
    const grabId = P.grab ? P.grab.id : -1;
    for (const b of W.boxes) {
      const ox = b.x, oy = b.y;
      b.vy = Math.min(b.vy + C.GRAV * dt, C.MAXFALL);
      if (b.id === grabId) {
        b.vx = 0;
      } else if (b.push) {
        b.vx = b.push;
      } else if (b.grounded) {
        const f = 2400 * dt;
        b.vx = Math.abs(b.vx) <= f ? 0 : b.vx - Math.sign(b.vx) * f;
      }
      if (b.vx !== 0) {
        const pre = b.x;
        const hit = moveX(W, b, b.vx * dt, -1);
        if (hit) b.vx = 0;
        if (P.dead <= 0 && P.z === b.z && overlap(b, P)) {
          b.x = pre;
          b.vx = 0;
        }
      }
      b.push = 0;
      const r = moveY(W, b, b.vy * dt, { onPlayer: true });
      if (r.land) {
        if (!b.grounded && b.vy > 300) ev(W, 'boxland', { x: b.x + b.w / 2, y: b.y + b.h, z: b.z });
        b.vy = 0;
        b.grounded = true;
        b.ground = r.land.t === 'player' ? null : r.land;
      } else {
        b.grounded = false;
        b.ground = null;
        if (r.bonk && b.vy < 0) b.vy = 0;
      }
      if (b.y > W.L.h * T + 300) {
        // Kiste ist heruntergefallen: zurück an den Ursprung
        b.x = b.x0;
        b.y = b.y0;
        b.vx = b.vy = 0;
        b.ground = null;
        if (P.grab && P.grab.id === b.id) P.grab = null;
        ev(W, 'boxreset', { x: b.x + b.w / 2, y: b.y + b.h / 2, z: b.z });
      }
      b.dx = b.x - ox;
      b.dy = b.y - oy;
    }
  }

  function updateEnemies(W, dt) {
    for (const e of W.enemies) {
      if (!e.alive) {
        e.deadT += dt;
        continue;
      }
      e.vy = Math.min(e.vy + C.GRAV * dt, C.MAXFALL);
      const hit = moveX(W, e, e.vx * dt, -1);
      if (hit) e.vx = -e.vx;
      const r = moveY(W, e, e.vy * dt);
      if (r.land) {
        e.vy = 0;
        e.grounded = true;
        e.ground = r.land;
        const fx = e.vx > 0 ? e.x + e.w + 2 : e.x - 2;
        if (!pointSupported(W, e.z, fx, e.y + e.h + 3)) e.vx = -e.vx;
      } else {
        e.grounded = false;
        e.ground = null;
      }
      if (e.y > W.L.h * T + 200) {
        e.alive = false;
        e.deadT = 99;
      }
    }
  }

  function rectCircle(r, cx, cy, rad) {
    const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
    const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < rad * rad;
  }
  function rectRect(r, x, y, w, h) {
    return r.x < x + w && r.x + r.w > x && r.y < y + h && r.y + r.h > y;
  }

  function die(W, cause) {
    const P = W.player;
    if (P.dead > 0 || W.finished) return;
    P.dead = C.DEAD_TIME;
    W.deaths++;
    W.chain = 0;
    W.chainT = 0;
    W.mult = 1;
    if (P.grab) P.grab = null;
    ev(W, 'die', { x: P.x + P.w / 2, y: P.y + P.h / 2, z: P.z, cause });
    P.vx = 0;
    P.vy = 0;
  }
  FW.die = die;

  function respawn(W) {
    const P = W.player, cp = W.checkpoint;
    P.x = cp.x;
    P.y = cp.y;
    P.z = cp.z;
    P.zf = cp.z;
    P.vx = P.vy = 0;
    P.grounded = false;
    P.ground = null;
    P.jumping = false;
    P.dead = 0;
    P.jbuf = 0;
    P.coyote = 0;
    // Nicht in einer Kiste wiederbeleben
    for (const k of W.boxes) {
      if (k.z === P.z && overlap(P, k)) {
        k.x = k.x0;
        k.y = k.y0;
        k.vx = k.vy = 0;
        k.ground = null;
      }
    }
    ev(W, 'respawn', { x: P.x + P.w / 2, y: P.y + P.h / 2, z: P.z });
  }

  function interactions(W) {
    const P = W.player, L = W.L;
    if (P.y > L.h * T + 120) {
      die(W, 'fall');
      return;
    }
    const x0 = Math.floor((P.x - T) / T), x1 = Math.floor((P.x + P.w + T) / T);
    const y0 = Math.floor((P.y - T) / T), y1 = Math.floor((P.y + P.h + T) / T);
    const z = P.z;
    for (let ty = Math.max(0, y0); ty <= Math.min(L.h - 1, y1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(L.w - 1, x1); tx++) {
        const ch = L.grid[z][ty][tx];
        if (ch === '.' || ch === '#' || ch === 'H' || ch === '=') continue;
        const px = tx * T, py = ty * T;
        if (ch === 'o' || ch === '*') {
          const key = z + ',' + tx + ',' + ty;
          if (W.collected[key]) continue;
          const rad = ch === 'o' ? 12 : 16;
          if (rectCircle(P, px + T / 2, py + T / 2, rad)) {
            W.collected[key] = true;
            if (ch === 'o') {
              W.chain++;
              W.chainT = C.CHAIN_TIME;
              W.mult = Math.min(1 + Math.floor((W.chain - 1) / 5), 5);
              const v = 10 * W.mult;
              W.score += v;
              W.bubbles++;
              ev(W, 'collect', { x: px + T / 2, y: py + T / 2, z, value: v, chain: W.chain });
            } else {
              W.score += 300;
              W.prizes++;
              ev(W, 'prize', { x: px + T / 2, y: py + T / 2, z, value: 300 });
            }
          }
        } else if (ch === '^') {
          if (rectRect(P, px + 5, py + 20, T - 10, T - 20)) {
            die(W, 'spikes');
            return;
          }
        } else if (ch === 'f') {
          if (rectRect(P, px + 7, py + 10, T - 14, T - 10)) {
            die(W, 'fire');
            return;
          }
        } else if (ch === 'C') {
          const key = z + ',' + tx + ',' + ty;
          if (W.checkpoint.key !== key && rectRect(P, px + 6, py - T, T - 12, 2 * T)) {
            W.checkpoint = cpFromTile(tx, ty, z, key);
            ev(W, 'checkpoint', { x: px + T / 2, y: py, z });
          }
        } else if (ch === 'G') {
          if (rectRect(P, px + 4, py - T, T - 8, 2 * T)) {
            W.finished = true;
            P.vx = 0;
            ev(W, 'goal', { x: px + T / 2, y: py, z });
            return;
          }
        } else if (ch === 'J') {
          const bottom = P.y + P.h;
          if (P.vy >= 0 && bottom >= py + 18 && bottom <= py + T + 1 && P.x < px + T - 4 && P.x + P.w > px + 4) {
            P.vy = -C.SPRING_V;
            P.y = Math.min(P.y, py + 18 - P.h);
            P.grounded = false;
            P.ground = null;
            P.jumping = false;
            P.coyote = 0;
            ev(W, 'spring', { key: z + ',' + tx + ',' + ty, x: px + T / 2, y: py + 20, z });
          }
        }
      }
    }
    // Gegner
    for (const e of W.enemies) {
      if (!e.alive || e.z !== z) continue;
      if (!overlap(P, e)) continue;
      if (P.vy > 40 && P.y + P.h - e.y < 16) {
        e.alive = false;
        e.deadT = 0;
        P.vy = -C.STOMP_V;
        P.jumping = false;
        W.score += 50;
        ev(W, 'stomp', { x: e.x + e.w / 2, y: e.y, z, value: 50 });
      } else {
        die(W, 'enemy');
        return;
      }
    }
  }

  // Bewertung eines abgeschlossenen Levels: 1 bis 3 Sterne
  function rating(W) {
    const pct = W.totalBubbles ? W.bubbles / W.totalBubbles : 1;
    let stars = 1;
    if (pct >= 0.6) stars = 2;
    if (pct >= 0.9 && W.prizes >= W.totalPrizes) stars = 3;
    return { stars, pct };
  }
  FW.rating = rating;
})(typeof window !== 'undefined' ? window : globalThis);
