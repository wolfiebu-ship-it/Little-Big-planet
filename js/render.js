/*
 * Craft World – Renderer (Canvas 2D). Alles wird prozedural gezeichnet:
 * Pappe, Stoff, Filz, Knöpfe – keine externen Grafiken nötig.
 */
(function (root) {
  'use strict';
  const FW = (root.FW = root.FW || {});
  const C = FW.C;
  const T = C.T;
  const R = (FW.Render = {});

  const THEMES = [
    {
      name: 'Wiese',
      sky: ['#7cc8f5', '#e8f6ff'],
      hill: ['#a8d98f', '#86c470'],
      ground: '#d39a55',
      groundShade: 'rgba(110,60,20,0.10)',
      groundDark: '#8a5a26',
      top: '#5fb83d',
      topDark: '#3f8a26',
      wood: '#a8693a',
      woodDark: '#6e4021',
      cloth: ['#e2574c', '#fff3e0'],
      fog: 'rgba(200,230,255,0.07)',
      patch: ['#e76f51', '#2a9d8f', '#e9c46a', '#8e5fc4'],
      flowers: ['#ff5d8f', '#ffd166', '#ffffff', '#9b5de5'],
      tuft: '#4f9a35',
      sun: '#ffd84d'
    },
    {
      name: 'Fabrik',
      sky: ['#4b3470', '#f0a46b'],
      hill: ['#6a4c82', '#4d3863'],
      ground: '#b49478',
      groundShade: 'rgba(60,40,30,0.15)',
      groundDark: '#7a5f49',
      top: '#8c7bb8',
      topDark: '#5f4f8c',
      wood: '#946038',
      woodDark: '#5e391c',
      cloth: ['#3d8ed9', '#f6e7c8'],
      fog: 'rgba(70,40,90,0.08)',
      patch: ['#3d8ed9', '#e76f51', '#f2c14e', '#2a9d8f'],
      flowers: ['#ffd166', '#ff8fab', '#90e0ef'],
      tuft: '#5f4f8c',
      sun: '#ffb36b'
    },
    {
      name: 'Gipfel',
      sky: ['#5d9be0', '#e4f2ff'],
      hill: ['#c3d3ea', '#9fb5d8'],
      ground: '#b98f63',
      groundShade: 'rgba(90,60,30,0.13)',
      groundDark: '#87613a',
      top: '#ffffff',
      topDark: '#c9dcef',
      wood: '#9a5f34',
      woodDark: '#633a1b',
      cloth: ['#9b59d0', '#ffffff'],
      fog: 'rgba(235,244,255,0.08)',
      patch: ['#9b59d0', '#3d8ed9', '#e63946', '#2a9d8f'],
      flowers: ['#ffffff', '#a0c4ff', '#ffc6ff'],
      tuft: '#dbe9f7',
      snow: true,
      sun: '#fff1a8'
    }
  ];
  R.THEMES = THEMES;

  let cv, g, Wd = 800, Hd = 600, dpr = 1;
  let tmp, tg; // Hilfs-Canvas für das Guckloch
  R.cam = { x: 0, y: 0, zoom: 1, look: 0 };
  R.bottomPad = 0; // Platz für Touch-Knöpfe (Bildschirm-Pixel)
  R.look = { body: '#e8743b', hat: '#3a7bd5', eye: '#fdf6e3' };

  R.init = function (canvas) {
    cv = canvas;
    g = cv.getContext('2d');
    tmp = document.createElement('canvas');
    tg = tmp.getContext('2d');
    R.resize();
  };

  R.resize = function () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    Wd = window.innerWidth;
    Hd = window.innerHeight;
    cv.width = Math.round(Wd * dpr);
    cv.height = Math.round(Hd * dpr);
    cv.style.width = Wd + 'px';
    cv.style.height = Hd + 'px';
    tmp.width = cv.width;
    tmp.height = cv.height;
    R.cam.zoom = R.autoZoom();
    const cs = Math.max(1, Math.min(1.5, R.cam.zoom * dpr));
    if (Math.abs(cs - chunkScale) > 0.01) {
      chunkScale = cs;
      cache.clear();
      shadowCache.clear();
    }
  };
  R.size = () => ({ w: Wd, h: Hd });
  R.autoZoom = function () {
    return Math.max(0.55, Math.min(2.0, Math.min(Hd / 450, Wd / 620)));
  };

  /* ------------------------------------------------------------------ */
  /* Kachel-Chunks (Cache)                                              */
  /* ------------------------------------------------------------------ */
  const CH = 8; // Kacheln pro Chunk-Kante
  const cache = new Map();
  let chunkScale = 1;
  let curL = null;
  const MAX_CHUNKS = 90;

  const shadowCache = new Map();
  function getShadow(L, z, cx, cy) {
    const c = getChunk(L, z, cx, cy);
    if (!c) return null;
    const key = z + ':' + cx + ':' + cy;
    let sh = shadowCache.get(key);
    if (sh && sh.src === c) return sh.cv;
    const cv2 = document.createElement('canvas');
    cv2.width = c.width;
    cv2.height = c.height;
    const sg = cv2.getContext('2d');
    sg.drawImage(c, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = 'rgba(25,12,0,1)';
    sg.fillRect(0, 0, cv2.width, cv2.height);
    shadowCache.set(key, { src: c, cv: cv2 });
    if (shadowCache.size > MAX_CHUNKS) shadowCache.delete(shadowCache.keys().next().value);
    return cv2;
  }

  R.setLevel = function (L) {
    curL = L;
    cache.clear();
    shadowCache.clear();
  };
  R.invalidate = function (z, x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = Math.floor((x + dx) / CH), cy = Math.floor((y + dy) / CH);
        cache.delete(z + ':' + cx + ':' + cy);
      }
    }
  };
  R.invalidateAll = function () {
    cache.clear();
    shadowCache.clear();
  };

  function solidAt(L, z, x, y) {
    if (x < 0 || x >= L.w) return true;
    if (y < 0 || y >= L.h) return y >= L.h ? true : false;
    return FW.isSolid(L.grid[z][y][x]);
  }
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function getChunk(L, z, cx, cy) {
    const key = z + ':' + cx + ':' + cy;
    let c = cache.get(key);
    if (c) {
      cache.delete(key);
      cache.set(key, c); // LRU: ans Ende
      return c;
    }
    const x0 = cx * CH, y0 = cy * CH;
    let any = false;
    for (let y = y0; y < y0 + CH && !any; y++) {
      if (y < 0 || y >= L.h) continue;
      for (let x = x0; x < x0 + CH; x++) {
        if (x < 0 || x >= L.w) continue;
        const ch = L.grid[z][y][x];
        if (ch === '#' || ch === 'H' || ch === '=' || ch === '^') {
          any = true;
          break;
        }
      }
    }
    if (!any) {
      c = null;
    } else {
      c = document.createElement('canvas');
      const px = Math.ceil(CH * T * chunkScale);
      c.width = px;
      c.height = px;
      const cg = c.getContext('2d');
      cg.scale(chunkScale, chunkScale);
      const th = THEMES[L.theme] || THEMES[0];
      for (let y = y0; y < y0 + CH; y++) {
        if (y < 0 || y >= L.h) continue;
        for (let x = x0; x < x0 + CH; x++) {
          if (x < 0 || x >= L.w) continue;
          drawStaticTile(cg, L, z, x, y, L.grid[z][y][x], (x - x0) * T, (y - y0) * T, th);
        }
      }
    }
    cache.set(key, c);
    if (cache.size > MAX_CHUNKS) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
    return c;
  }

  function stitch(g2, x1, y1, x2, y2, color, w) {
    g2.save();
    g2.strokeStyle = color;
    g2.lineWidth = w || 1.6;
    g2.setLineDash([4, 4]);
    g2.lineCap = 'round';
    g2.beginPath();
    g2.moveTo(x1, y1);
    g2.lineTo(x2, y2);
    g2.stroke();
    g2.restore();
  }

  function drawStaticTile(g2, L, z, x, y, ch, px, py, th) {
    if (ch === '#' || ch === 'H') {
      const wood = ch === 'H';
      const up = solidAt(L, z, x, y - 1), dn = solidAt(L, z, x, y + 1);
      const lf = solidAt(L, z, x - 1, y), rt = solidAt(L, z, x + 1, y);
      let depth = 0;
      while (depth < 5 && y - depth - 1 >= 0 && solidAt(L, z, x, y - depth - 1)) depth++;
      const base = wood ? th.wood : th.ground;
      g2.fillStyle = shade(base, -Math.min(depth, 5) * 0.045);
      g2.fillRect(px, py, T, T);
      const hv = hash(x, y);
      if (wood) {
        g2.strokeStyle = 'rgba(50,25,8,0.28)';
        g2.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const yy = py + 8 + i * 12 + hash(x, y + i) * 4;
          g2.beginPath();
          g2.moveTo(px + 2, yy);
          g2.bezierCurveTo(px + 14, yy - 3, px + 26, yy + 3, px + T - 2, yy);
          g2.stroke();
        }
        g2.fillStyle = 'rgba(40,20,5,0.4)';
        g2.fillRect(px, py + T / 2 - 1, T, 2);
        g2.fillStyle = 'rgba(255,255,255,0.08)';
        g2.fillRect(px, py + 1, T, 3);
        g2.fillStyle = '#e8d6b0';
        g2.beginPath();
        g2.arc(px + 6, py + 6, 2.2, 0, 7);
        g2.arc(px + T - 6, py + T - 6, 2.2, 0, 7);
        g2.fill();
      } else {
        // feine Wellpappe
        g2.fillStyle = th.groundShade;
        for (let i = 0; i < 8; i++) g2.fillRect(px + 1 + i * 5, py, 2, T);
        if (depth >= 1 && hv > 0.88) {
          // aufgenähter Stoff-Flicken
          const col = th.patch[Math.floor(hash(x + 3, y + 9) * th.patch.length)];
          const ox = px + 5 + hash(x, y + 1) * 6, oy = py + 5 + hash(x + 1, y) * 6;
          g2.save();
          g2.translate(ox + 13, oy + 11);
          g2.rotate((hash(x + 5, y) - 0.5) * 0.5);
          g2.fillStyle = 'rgba(0,0,0,0.18)';
          g2.beginPath();
          roundRect(g2, -12, -9, 27, 23, 4);
          g2.fill();
          g2.fillStyle = col;
          g2.beginPath();
          roundRect(g2, -13, -11, 26, 22, 4);
          g2.fill();
          g2.restore();
          g2.save();
          g2.translate(ox + 13, oy + 11);
          g2.rotate((hash(x + 5, y) - 0.5) * 0.5);
          g2.strokeStyle = 'rgba(255,255,255,0.8)';
          g2.lineWidth = 1.3;
          g2.setLineDash([3, 3]);
          g2.beginPath();
          roundRect(g2, -10, -8, 20, 16, 3);
          g2.stroke();
          g2.restore();
        } else if (depth >= 1 && hv > 0.82) {
          // eingenähter Knopf
          const col = th.patch[Math.floor(hash(x + 11, y + 2) * th.patch.length)];
          const bx = px + 12 + hash(x, y + 4) * 16, by = py + 12 + hash(x + 4, y) * 16;
          g2.fillStyle = 'rgba(0,0,0,0.2)';
          g2.beginPath();
          g2.arc(bx + 1.5, by + 2, 7, 0, 7);
          g2.fill();
          g2.fillStyle = col;
          g2.beginPath();
          g2.arc(bx, by, 7, 0, 7);
          g2.fill();
          g2.strokeStyle = 'rgba(0,0,0,0.25)';
          g2.lineWidth = 1.2;
          g2.beginPath();
          g2.arc(bx, by, 5, 0, 7);
          g2.stroke();
          g2.fillStyle = 'rgba(0,0,0,0.45)';
          for (let i = 0; i < 4; i++) {
            g2.beginPath();
            g2.arc(bx + (i % 2 ? 1.6 : -1.6), by + (i < 2 ? -1.6 : 1.6), 0.9, 0, 7);
            g2.fill();
          }
        } else if (hv < 0.12) {
          g2.fillStyle = 'rgba(255,240,210,0.12)';
          g2.fillRect(px + 6 + hv * 60, py + 10, 12, 9);
        }
      }
      // Kanten
      const dark = wood ? th.woodDark : th.groundDark;
      g2.fillStyle = dark;
      if (!lf) g2.fillRect(px, py, 4, T);
      if (!rt) g2.fillRect(px + T - 4, py, 4, T);
      if (!dn) g2.fillRect(px, py + T - 4, T, 4);
      g2.fillStyle = 'rgba(255,255,255,0.13)';
      if (!lf) g2.fillRect(px + 4, py, 2, T);
      const sc = 'rgba(255,240,210,0.6)';
      if (!lf) stitch(g2, px + 9, py + (up ? 0 : 16), px + 9, py + T - (dn ? 0 : 9), sc);
      if (!rt) stitch(g2, px + T - 9, py + (up ? 0 : 16), px + T - 9, py + T - (dn ? 0 : 9), sc);
      if (!dn) stitch(g2, px + (lf ? 0 : 9), py + T - 9, px + T - (rt ? 0 : 9), py + T - 9, sc);
      if (!up) {
        if (wood) {
          g2.fillStyle = dark;
          g2.fillRect(px, py, T, 5);
          g2.fillStyle = 'rgba(255,255,255,0.18)';
          g2.fillRect(px, py + 5, T, 2);
        } else {
          // Filz-Grasdecke mit Zickzack-Kante (Zackenschere)
          g2.fillStyle = 'rgba(0,0,0,0.18)';
          g2.beginPath();
          g2.moveTo(px, py);
          g2.lineTo(px + T, py);
          for (let i = 8; i >= 0; i--) g2.lineTo(px + i * 5, py + (i % 2 ? 17 : 13));
          g2.closePath();
          g2.fill();
          g2.fillStyle = th.top;
          g2.beginPath();
          g2.moveTo(px, py - 2);
          g2.lineTo(px + T, py - 2);
          for (let i = 8; i >= 0; i--) g2.lineTo(px + i * 5, py + (i % 2 ? 14 : 10));
          g2.closePath();
          g2.fill();
          g2.fillStyle = 'rgba(255,255,255,0.28)';
          g2.fillRect(px, py - 2, T, 3);
          g2.fillStyle = th.topDark;
          g2.fillRect(px, py + 7, T, 1.5);
          stitch(g2, px, py + 4, px + T, py + 4, 'rgba(255,255,255,0.85)', 1.4);
          // Deko oben drauf (nur innerhalb des Chunks sichtbar)
          if (y % CH !== 0) {
            const dv = hash(x * 3 + 1, y * 7 + z);
            if (!th.snow && dv > 0.72) {
              const fx = px + 8 + hash(x, y + 2) * 24;
              const col = th.flowers[Math.floor(hash(x + 2, y) * th.flowers.length)];
              g2.strokeStyle = th.topDark;
              g2.lineWidth = 2;
              g2.beginPath();
              g2.moveTo(fx, py);
              g2.quadraticCurveTo(fx + 2, py - 7, fx, py - 13);
              g2.stroke();
              g2.fillStyle = col;
              for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                g2.beginPath();
                g2.arc(fx + Math.cos(a) * 3.6, py - 14 + Math.sin(a) * 3.6, 2.8, 0, 7);
                g2.fill();
              }
              g2.fillStyle = '#ffcf3f';
              g2.beginPath();
              g2.arc(fx, py - 14, 2.2, 0, 7);
              g2.fill();
            } else if (dv > 0.35) {
              g2.fillStyle = th.tuft;
              const n = 2 + Math.floor(dv * 3);
              for (let i = 0; i < n; i++) {
                const tx = px + 4 + hash(x + i, y * 5) * 32;
                const h = 5 + hash(x * 7 + i, y) * 6;
                g2.beginPath();
                if (th.snow) {
                  g2.arc(tx, py, h * 0.6, Math.PI, 0);
                } else {
                  g2.moveTo(tx - 3, py + 1);
                  g2.lineTo(tx, py - h);
                  g2.lineTo(tx + 3, py + 1);
                }
                g2.fill();
              }
            }
          }
        }
      }
    } else if (ch === '=') {
      const lf = L.grid[z][y][x - 1] === '=', rt = x + 1 < L.w && L.grid[z][y][x + 1] === '=';
      g2.save();
      g2.beginPath();
      roundRect(g2, px + (lf ? 0 : 1), py, T - (lf ? 0 : 1) - (rt ? 0 : 1), 14, { tl: lf ? 0 : 6, tr: rt ? 0 : 6, br: rt ? 0 : 6, bl: lf ? 0 : 6 });
      g2.clip();
      for (let i = 0; i < 4; i++) {
        g2.fillStyle = th.cloth[(x * 4 + i) % 2];
        g2.fillRect(px + i * 10, py, 10, 14);
      }
      g2.fillStyle = 'rgba(0,0,0,0.18)';
      g2.fillRect(px, py + 11, T, 3);
      g2.restore();
      stitch(g2, px + (lf ? 0 : 5), py + 3.5, px + T - (rt ? 0 : 5), py + 3.5, 'rgba(60,30,30,0.6)', 1.3);
      g2.fillStyle = 'rgba(0,0,0,0.12)';
      g2.fillRect(px + 2, py + 14, T - 4, 3);
    } else if (ch === '^') {
      g2.fillStyle = '#5b6470';
      g2.fillRect(px + 1, py + 35, T - 2, 5);
      for (let i = 0; i < 3; i++) {
        const bx = px + 2 + i * 12;
        g2.beginPath();
        g2.moveTo(bx, py + 37);
        g2.lineTo(bx + 6, py + 16);
        g2.lineTo(bx + 12, py + 37);
        g2.closePath();
        g2.fillStyle = '#d5dce4';
        g2.fill();
        g2.strokeStyle = '#6b7380';
        g2.lineWidth = 1.5;
        g2.stroke();
        g2.fillStyle = 'rgba(255,255,255,0.7)';
        g2.beginPath();
        g2.moveTo(bx + 6, py + 19);
        g2.lineTo(bx + 4, py + 33);
        g2.lineTo(bx + 6, py + 33);
        g2.fill();
      }
    }
  }

  function roundRect(g2, x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    g2.moveTo(x + r.tl, y);
    g2.lineTo(x + w - r.tr, y);
    g2.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    g2.lineTo(x + w, y + h - r.br);
    g2.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    g2.lineTo(x + r.bl, y + h);
    g2.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    g2.lineTo(x, y + r.tl);
    g2.quadraticCurveTo(x, y, x + r.tl, y);
    g2.closePath();
  }
  R.roundRect = roundRect;

  /* ------------------------------------------------------------------ */
  /* Projektion                                                          */
  /* ------------------------------------------------------------------ */
  function layerScale(z, zoom) {
    return zoom * (1 - 0.1 * z);
  }
  function setLayerTransform(g2, z, cam) {
    const s = layerScale(z, cam.zoom);
    g2.setTransform(dpr * s, 0, 0, dpr * s, dpr * (Wd / 2 - cam.x * s), dpr * (Hd / 2 - cam.y * s - z * 14 * cam.zoom));
    return s;
  }
  function toScreen(wx, wy, z, cam) {
    const s = layerScale(z, cam.zoom);
    return { x: Wd / 2 + (wx - cam.x) * s, y: Hd / 2 + (wy - cam.y) * s - z * 14 * cam.zoom, s };
  }
  R.toScreen = (wx, wy, z) => toScreen(wx, wy, z, R.cam);
  function visibleTiles(z, cam, L) {
    const s = layerScale(z, cam.zoom);
    const oy = z * 14 * cam.zoom;
    const x0 = Math.floor((cam.x - Wd / 2 / s) / T) - 1;
    const x1 = Math.ceil((cam.x + Wd / 2 / s) / T) + 1;
    const y0 = Math.floor((cam.y + (-Hd / 2 + oy) / s) / T) - 2;
    const y1 = Math.ceil((cam.y + (Hd / 2 + oy) / s) / T) + 1;
    return { x0: Math.max(0, x0), x1: Math.min(L.w - 1, x1), y0: Math.max(0, y0), y1: Math.min(L.h - 1, y1) };
  }

  /* ------------------------------------------------------------------ */
  /* Kamera                                                              */
  /* ------------------------------------------------------------------ */
  R.resetCamera = function (W) {
    const P = W.player;
    R.cam.zoom = R.autoZoom();
    R.cam.look = 0;
    R.cam.x = P.x + P.w / 2;
    R.cam.y = P.y + P.h / 2 - 30 + R.bottomPad / 2 / R.cam.zoom;
    clampCam(W.L, R.cam);
  };
  R.updateCamera = function (W, dt) {
    const P = W.player;
    const cam = R.cam;
    cam.zoom = R.autoZoom();
    if (P.dead <= 0) {
      cam.look += (P.facing * 60 - cam.look) * Math.min(1, dt * 1.5);
      const tx = P.x + P.w / 2 + cam.look;
      const ty = P.y + P.h / 2 - 30 + R.bottomPad / 2 / cam.zoom;
      cam.x += (tx - cam.x) * Math.min(1, dt * 5);
      cam.y += (ty - cam.y) * Math.min(1, dt * (Math.abs(ty - cam.y) > 120 ? 6 : 3.5));
    }
    clampCam(W.L, cam);
  };
  function clampCam(L, cam) {
    const hw = Wd / 2 / cam.zoom, hh = Hd / 2 / cam.zoom;
    const minX = hw, maxX = L.w * T - hw;
    cam.x = minX > maxX ? (L.w * T) / 2 : Math.max(minX, Math.min(maxX, cam.x));
    const minY = hh - 60, maxY = L.h * T - hh + 10 + R.bottomPad / cam.zoom;
    cam.y = minY > maxY ? (L.h * T) / 2 : Math.max(minY, Math.min(maxY, cam.y));
  }

  /* ------------------------------------------------------------------ */
  /* Hintergrund                                                         */
  /* ------------------------------------------------------------------ */
  function drawBackground(theme, cam, t) {
    const th = THEMES[theme] || THEMES[0];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, Hd);
    grd.addColorStop(0, th.sky[0]);
    grd.addColorStop(1, th.sky[1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, Wd, Hd);

    // Sonne aus Filz
    const sx = Wd * 0.78 - cam.x * 0.02, sy = Hd * 0.2 - cam.y * 0.02;
    g.fillStyle = th.sun;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(sx, sy, 46, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.setLineDash([5, 5]);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(sx, sy, 38, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    // Wolken
    for (let i = 0; i < 5; i++) {
      const span = Wd + 400;
      const cx = ((((i * 397 + t * (8 + i * 3) - cam.x * 0.08) % span) + span) % span) - 200;
      const cy = 60 + ((i * 73) % 140) - cam.y * 0.04;
      drawCloud(cx, cy, 0.7 + (i % 3) * 0.25, theme);
    }

    // Hügel / Silhouetten (Parallax)
    for (let layer = 0; layer < 2; layer++) {
      const par = layer === 0 ? 0.12 : 0.25;
      const base = Hd * (layer === 0 ? 0.62 : 0.74) - cam.y * par * 0.3;
      const off = cam.x * par;
      g.fillStyle = th.hill[layer];
      if (theme === 1) {
        drawFactorySilhouette(base, off, layer, t, th);
      } else if (theme === 2) {
        drawMountains(base, off, layer, th);
      } else {
        g.beginPath();
        g.moveTo(0, Hd);
        for (let x = 0; x <= Wd + 20; x += 20) {
          const wx = x + off;
          const y = base - Math.sin(wx * 0.004 + layer * 2) * 40 - Math.sin(wx * 0.011 + layer) * 18;
          g.lineTo(x, y);
        }
        g.lineTo(Wd, Hd);
        g.closePath();
        g.fill();
        g.save();
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.setLineDash([6, 6]);
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x <= Wd + 20; x += 20) {
          const wx = x + off;
          const y = base + 10 - Math.sin(wx * 0.004 + layer * 2) * 40 - Math.sin(wx * 0.011 + layer) * 18;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.restore();
      }
    }
  }

  function drawCloud(x, y, s, theme) {
    g.fillStyle = theme === 1 ? 'rgba(255,220,200,0.55)' : 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.arc(x, y, 22 * s, 0, 7);
    g.arc(x + 24 * s, y - 10 * s, 26 * s, 0, 7);
    g.arc(x + 52 * s, y, 20 * s, 0, 7);
    g.fill();
    g.fillRect(x, y, 52 * s, 20 * s);
  }

  function drawFactorySilhouette(base, off, layer, t, th) {
    const span = 420;
    const start = -((off % span) + span) % span - span;
    for (let x = start; x < Wd + span; x += span) {
      const k = Math.round((x + off) / span);
      g.fillStyle = th.hill[layer];
      const hgt = 120 + (Math.abs(k * 37) % 80);
      g.fillRect(x, base - hgt, 160, Hd);
      g.fillRect(x + 30, base - hgt - 90, 26, 100);
      g.fillRect(x + 180, base - 60, 200, Hd);
      // Zahnrad
      const gx = x + 280, gy = base - 90, r = 40;
      g.save();
      g.translate(gx, gy);
      g.rotate(t * (layer ? 0.5 : -0.3) + k);
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 ? r : r + 10;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.fillStyle = th.sky[1];
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(0, 0, 12, 0, 7);
      g.fill();
      g.globalAlpha = 1;
      g.restore();
      // Rauch
      g.fillStyle = 'rgba(255,230,220,0.25)';
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.3 + i / 3) % 1;
        g.beginPath();
        g.arc(x + 43 + p * 30, base - hgt - 100 - p * 80, 10 + p * 18, 0, 7);
        g.fill();
      }
    }
  }

  function drawMountains(base, off, layer, th) {
    const span = 300;
    const start = -((off % span) + span) % span - span;
    for (let x = start; x < Wd + span; x += span) {
      const k = Math.round((x + off) / span);
      const hgt = 160 + (Math.abs(k * 53 + layer * 17) % 110);
      g.fillStyle = th.hill[layer];
      g.beginPath();
      g.moveTo(x - 60, Hd);
      g.lineTo(x + span / 2, base - hgt);
      g.lineTo(x + span + 60, Hd);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      const px = x + span / 2, py = base - hgt;
      g.moveTo(px, py);
      g.lineTo(px - 45, py + 55);
      g.lineTo(px - 20, py + 45);
      g.lineTo(px, py + 60);
      g.lineTo(px + 22, py + 44);
      g.lineTo(px + 45, py + 55);
      g.closePath();
      g.fill();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Dynamische Kacheln                                                  */
  /* ------------------------------------------------------------------ */
  const springAnim = {};

  function drawBubble(g2, cx, cy, r, t, gold) {
    g2.fillStyle = gold ? 'rgba(255,200,60,0.35)' : 'rgba(120,215,255,0.25)';
    g2.beginPath();
    g2.arc(cx, cy, r + 4, 0, Math.PI * 2);
    g2.fill();
    g2.fillStyle = gold ? 'rgba(255,215,90,0.6)' : 'rgba(150,225,255,0.7)';
    g2.beginPath();
    g2.arc(cx, cy, r, 0, Math.PI * 2);
    g2.fill();
    g2.strokeStyle = gold ? 'rgba(255,240,180,0.95)' : 'rgba(255,255,255,0.95)';
    g2.lineWidth = 2;
    g2.stroke();
    g2.fillStyle = 'rgba(255,255,255,0.85)';
    g2.beginPath();
    g2.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.17, -0.6, 0, Math.PI * 2);
    g2.fill();
    if (gold) {
      g2.save();
      g2.translate(cx, cy);
      g2.rotate(Math.sin(t * 2) * 0.3);
      starPath(g2, 0, 0, r * 0.62, r * 0.28, 5);
      g2.fillStyle = '#ffb703';
      g2.fill();
      g2.strokeStyle = '#b5651d';
      g2.lineWidth = 1.5;
      g2.stroke();
      g2.restore();
    } else {
      g2.strokeStyle = 'rgba(255,255,255,0.6)';
      g2.lineWidth = 1.5;
      g2.beginPath();
      g2.arc(cx + 1, cy + 1, r * 0.4, 0.3, 3.6);
      g2.stroke();
    }
  }

  function starPath(g2, cx, cy, ro, ri, n) {
    g2.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? ri : ro;
      g2.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g2.closePath();
  }
  R.starPath = starPath;

  // Zeichnet eine einzelne dynamische Kachel / Figur in Weltkoordinaten.
  function drawDynamic(g2, ch, x, y, t, st) {
    const px = x * T, py = y * T;
    switch (ch) {
      case 'o': {
        const bob = Math.sin(t * 3 + x * 0.7 + y) * 3;
        drawBubble(g2, px + 20, py + 20 + bob, 10, t, false);
        break;
      }
      case '*': {
        const bob = Math.sin(t * 2 + x) * 4;
        drawBubble(g2, px + 20, py + 20 + bob, 16, t, true);
        break;
      }
      case 'f':
        drawFire(g2, px, py, t + x * 1.7);
        break;
      case 'C':
        drawCheckpoint(g2, px, py, t, st && st.active);
        break;
      case 'G':
        drawGoal(g2, px, py, t);
        break;
      case 'S':
        drawStartPad(g2, px, py);
        break;
      case 'J':
        drawSpring(g2, px, py, st ? st.comp : 0);
        break;
      case 'T':
        drawSign(g2, px, py);
        break;
      case 'B':
        drawBox(g2, px, py, false);
        break;
      case 'E':
        drawEnemy(g2, { x: px + (T - C.EW) / 2, y: py + T - C.EH, w: C.EW, h: C.EH, vx: -1, alive: true }, t);
        break;
      case 'M':
      case 'V':
        drawPlatTrack(g2, ch, px, py);
        drawPlat(g2, px, py, ch);
        break;
    }
  }
  R.drawDynamic = drawDynamic;

  function drawFire(g2, px, py, t) {
    g2.fillStyle = '#3b2a20';
    g2.beginPath();
    roundRect(g2, px + 4, py + 33, T - 8, 7, 3);
    g2.fill();
    const cols = ['#ff5a1f', '#ffa21f', '#fff0a0'];
    for (let layer = 0; layer < 3; layer++) {
      g2.fillStyle = cols[layer];
      for (let i = 0; i < 3; i++) {
        const fx = px + 10 + i * 10;
        const h = (26 - layer * 7) * (0.8 + 0.25 * Math.sin(t * 9 + i * 2.1 + layer));
        const w = 9 - layer * 2.5;
        g2.beginPath();
        g2.moveTo(fx - w, py + 36);
        g2.quadraticCurveTo(fx - w, py + 36 - h * 0.6, fx + Math.sin(t * 7 + i) * 3, py + 36 - h);
        g2.quadraticCurveTo(fx + w, py + 36 - h * 0.6, fx + w, py + 36);
        g2.closePath();
        g2.fill();
      }
    }
  }

  function drawCheckpoint(g2, px, py, t, active) {
    g2.fillStyle = '#7d5a3a';
    g2.fillRect(px + 18, py - 26, 4, 66);
    g2.fillStyle = active ? '#4cc96b' : '#d8574c';
    const wave = Math.sin(t * 5) * 3;
    g2.beginPath();
    g2.moveTo(px + 22, py - 26);
    g2.quadraticCurveTo(px + 32, py - 22 + wave, px + 44, py - 18 + wave);
    g2.lineTo(px + 22, py - 8);
    g2.closePath();
    g2.fill();
    stitch(g2, px + 24, py - 23, px + 38, py - 17 + wave, 'rgba(255,255,255,0.7)', 1.2);
    g2.fillStyle = active ? '#9be7a9' : '#b9a48a';
    g2.beginPath();
    g2.ellipse(px + 20, py + 38, 16, 5, 0, 0, Math.PI * 2);
    g2.fill();
    if (active) {
      g2.strokeStyle = 'rgba(120,255,160,' + (0.4 + 0.3 * Math.sin(t * 4)) + ')';
      g2.lineWidth = 3;
      g2.beginPath();
      g2.ellipse(px + 20, py + 38, 20, 7, 0, 0, Math.PI * 2);
      g2.stroke();
    }
    g2.fillStyle = '#f2d16b';
    g2.beginPath();
    g2.arc(px + 20, py - 28, 4, 0, 7);
    g2.fill();
  }

  function drawGoal(g2, px, py, t) {
    g2.fillStyle = '#6b4a2e';
    g2.fillRect(px - 8, py - 52, 6, 92);
    g2.fillRect(px + T + 2, py - 52, 6, 92);
    // karierter Banner
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 2; j++) {
        g2.fillStyle = (i + j) % 2 ? '#222' : '#fff';
        g2.fillRect(px - 2 + i * 6.3, py - 54 + j * 7 + Math.sin(t * 3 + i * 0.6) * 1.5, 6.3, 7);
      }
    }
    // Wimpel
    const cols = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
    for (let i = 0; i < 5; i++) {
      g2.fillStyle = cols[i];
      const bx = px - 4 + i * 10;
      const by = py - 38 + Math.sin(i * 1.3) * 2;
      g2.beginPath();
      g2.moveTo(bx, by);
      g2.lineTo(bx + 9, by);
      g2.lineTo(bx + 4.5, by + 10 + Math.sin(t * 6 + i) * 1.5);
      g2.closePath();
      g2.fill();
    }
    g2.fillStyle = 'rgba(255,240,150,' + (0.25 + 0.15 * Math.sin(t * 3)) + ')';
    g2.beginPath();
    g2.ellipse(px + 20, py + 38, 26, 7, 0, 0, Math.PI * 2);
    g2.fill();
  }

  function drawStartPad(g2, px, py) {
    g2.fillStyle = '#e9c46a';
    g2.beginPath();
    g2.ellipse(px + 20, py + 37, 18, 5, 0, 0, Math.PI * 2);
    g2.fill();
    g2.fillStyle = '#9c6b1f';
    for (let i = 0; i < 4; i++) {
      g2.beginPath();
      g2.arc(px + 15 + (i % 2) * 10, py + 35.5 + Math.floor(i / 2) * 3, 1.3, 0, 7);
      g2.fill();
    }
  }

  function drawSpring(g2, px, py, comp) {
    const top = py + 18 + comp * 10;
    g2.fillStyle = '#5b6470';
    g2.fillRect(px + 6, py + 36, T - 12, 4);
    g2.strokeStyle = '#9aa4b2';
    g2.lineWidth = 3;
    g2.beginPath();
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const yy = py + 36 - ((py + 36 - (top + 4)) * i) / n;
      g2.lineTo(px + (i % 2 ? 28 : 12), yy);
    }
    g2.stroke();
    g2.fillStyle = '#e63946';
    g2.beginPath();
    roundRect(g2, px + 4, top - 2, T - 8, 7, 3);
    g2.fill();
    stitch(g2, px + 8, top + 1.5, px + T - 8, top + 1.5, 'rgba(255,255,255,0.8)', 1.2);
  }

  function drawSign(g2, px, py) {
    g2.fillStyle = '#7d5a3a';
    g2.fillRect(px + 18, py + 18, 4, 22);
    g2.fillStyle = '#d9a86c';
    g2.beginPath();
    roundRect(g2, px + 4, py + 2, 32, 20, 4);
    g2.fill();
    g2.strokeStyle = '#8a5c2f';
    g2.lineWidth = 2;
    g2.stroke();
    g2.fillStyle = '#5a3a1d';
    g2.font = 'bold 15px Fredoka, ui-rounded, sans-serif';
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillText('?', px + 20, py + 13);
  }

  function drawBox(g2, x, y, grabbed) {
    g2.fillStyle = '#d9a55f';
    g2.fillRect(x + 1, y + 1, T - 2, T - 2);
    g2.fillStyle = 'rgba(120,70,20,0.15)';
    g2.fillRect(x + 1, y + 1, T - 2, 8);
    g2.fillStyle = '#efd9a8';
    g2.fillRect(x + 16, y + 1, 8, T - 2);
    g2.strokeStyle = '#8a5a26';
    g2.lineWidth = 2;
    g2.strokeRect(x + 2, y + 2, T - 4, T - 4);
    g2.strokeStyle = 'rgba(120,70,20,0.4)';
    g2.lineWidth = 1;
    g2.beginPath();
    g2.moveTo(x + 2, y + 9);
    g2.lineTo(x + T - 2, y + 9);
    g2.stroke();
    // Griffloch
    g2.fillStyle = '#5c3a14';
    g2.beginPath();
    roundRect(g2, x + 6, y + 20, 7, 4, 2);
    roundRect(g2, x + T - 13, y + 20, 7, 4, 2);
    g2.fill();
    if (grabbed) {
      g2.strokeStyle = 'rgba(255,255,255,0.9)';
      g2.lineWidth = 3;
      g2.setLineDash([5, 4]);
      g2.strokeRect(x - 1, y - 1, T + 2, T + 2);
      g2.setLineDash([]);
    }
  }

  function drawPlatTrack(g2, kind, px, py) {
    g2.save();
    g2.strokeStyle = 'rgba(80,60,40,0.35)';
    g2.lineWidth = 3;
    g2.setLineDash([6, 6]);
    g2.beginPath();
    if (kind === 'M') {
      g2.moveTo(px + C.PLAT_W / 2, py + 8);
      g2.lineTo(px + C.PLAT_W / 2 + C.PLAT_RANGE, py + 8);
    } else {
      g2.moveTo(px + C.PLAT_W / 2, py + 8);
      g2.lineTo(px + C.PLAT_W / 2, py + 8 - C.PLAT_RANGE);
    }
    g2.stroke();
    g2.restore();
  }

  function drawPlat(g2, x, y, kind) {
    g2.fillStyle = 'rgba(0,0,0,0.15)';
    g2.beginPath();
    roundRect(g2, x + 3, y + 4, C.PLAT_W - 2, C.PLAT_H, 6);
    g2.fill();
    g2.fillStyle = '#2a9d8f';
    g2.beginPath();
    roundRect(g2, x, y, C.PLAT_W, C.PLAT_H, 6);
    g2.fill();
    g2.fillStyle = '#3fc1b0';
    g2.fillRect(x + 4, y + 2, C.PLAT_W - 8, 4);
    stitch(g2, x + 6, y + 9, x + C.PLAT_W - 6, y + 9, 'rgba(255,255,255,0.8)', 1.4);
    g2.fillStyle = '#f1faee';
    g2.font = 'bold 10px sans-serif';
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillText(kind === 'M' ? '◀ ▶' : '▲ ▼', x + C.PLAT_W / 2, y + 12);
  }

  function drawEnemy(g2, e, t) {
    const dead = !e.alive;
    const f = e.vx >= 0 ? 1 : -1;
    g2.save();
    g2.translate(e.x + e.w / 2, e.y + e.h);
    if (dead) {
      const a = Math.max(0, 1 - e.deadT / 0.7);
      g2.globalAlpha = a;
      g2.scale(1.2, 0.35);
    }
    g2.scale(f, 1);
    // Beinchen
    g2.strokeStyle = '#3d2459';
    g2.lineWidth = 2.5;
    g2.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ph = Math.sin(t * 14 + i * 2) * 3;
      g2.beginPath();
      g2.moveTo(-8 + i * 8, -4);
      g2.lineTo(-10 + i * 8 + ph, 0);
      g2.stroke();
    }
    // Panzer
    g2.fillStyle = '#7b4fb5';
    g2.beginPath();
    g2.ellipse(-2, -9, 14, 11, 0, Math.PI, 0);
    g2.lineTo(12, -4);
    g2.lineTo(-16, -4);
    g2.closePath();
    g2.fill();
    g2.fillStyle = '#a678e0';
    g2.beginPath();
    g2.arc(-6, -13, 3, 0, 7);
    g2.arc(2, -15, 2.5, 0, 7);
    g2.arc(-1, -8, 2, 0, 7);
    g2.fill();
    stitch(g2, -2, -19, -2, -5, 'rgba(255,255,255,0.6)', 1.2);
    // Kopf
    g2.fillStyle = '#4b2c70';
    g2.beginPath();
    g2.arc(12, -8, 6.5, 0, Math.PI * 2);
    g2.fill();
    g2.fillStyle = '#fff';
    g2.beginPath();
    g2.arc(14, -10, 2.6, 0, 7);
    g2.fill();
    g2.fillStyle = '#222';
    g2.beginPath();
    g2.arc(14.8, -10, 1.2, 0, 7);
    g2.fill();
    // Fühler
    g2.strokeStyle = '#4b2c70';
    g2.lineWidth = 1.5;
    g2.beginPath();
    g2.moveTo(13, -14);
    g2.quadraticCurveTo(16, -22, 20, -20 + Math.sin(t * 6));
    g2.stroke();
    g2.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Spielfigur „Knopf“                                                  */
  /* ------------------------------------------------------------------ */
  const anim = { phase: 0, squash: 0, blink: 0, nextBlink: 2, wave: 0 };

  function drawCharacter(g2, look, opts) {
    // Ursprung: Mitte unten (Füße). Blickrichtung rechts.
    const ph = opts.phase || 0, run = opts.run || 0, air = !!opts.air, grab = !!opts.grab;
    const bodyDark = shade(look.body, -0.28);
    // Füße
    g2.fillStyle = bodyDark;
    const step = Math.sin(ph) * 5 * run;
    const lift1 = air ? -3 : Math.max(0, Math.sin(ph)) * -3 * run;
    const lift2 = air ? -1 : Math.max(0, -Math.sin(ph)) * -3 * run;
    g2.beginPath();
    g2.ellipse(-6 + step, -3 + lift1, 6, 4, 0, 0, Math.PI * 2);
    g2.ellipse(6 - step, -3 + lift2, 6, 4, 0, 0, Math.PI * 2);
    g2.fill();
    // hinterer Arm
    g2.fillStyle = bodyDark;
    const sw = Math.sin(ph + Math.PI) * 4 * run;
    g2.beginPath();
    g2.arc(-14, -17 + sw, 4.5, 0, 7);
    g2.fill();
    // Körper (Wollknäuel)
    g2.save();
    g2.beginPath();
    g2.arc(0, -19, 15, 0, Math.PI * 2);
    g2.fillStyle = look.body;
    g2.fill();
    g2.lineWidth = 3;
    g2.strokeStyle = shade(look.body, -0.5);
    g2.stroke();
    g2.beginPath();
    g2.arc(0, -19, 14, 0, Math.PI * 2);
    g2.clip();
    g2.strokeStyle = bodyDark;
    g2.globalAlpha = 0.45;
    g2.lineWidth = 1.6;
    for (let i = -3; i <= 3; i++) {
      g2.beginPath();
      g2.ellipse(i * 5, -19, 4, 18, 0.5, 0, Math.PI * 2);
      g2.stroke();
    }
    g2.globalAlpha = 0.25;
    g2.strokeStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      g2.beginPath();
      g2.arc(-4, -26, 6 + i * 4, 3.4, 4.6);
      g2.stroke();
    }
    g2.restore();
    // Augen: Knöpfe
    const blink = opts.blink ? 0.15 : 1;
    for (const ex of [3, 10.5]) {
      g2.save();
      g2.translate(ex, -22);
      g2.scale(1, blink);
      g2.fillStyle = look.eye;
      g2.beginPath();
      g2.arc(0, 0, 4.4, 0, Math.PI * 2);
      g2.fill();
      g2.strokeStyle = '#2b2b2b';
      g2.lineWidth = 1.4;
      g2.stroke();
      g2.fillStyle = '#2b2b2b';
      for (let i = 0; i < 4; i++) {
        g2.beginPath();
        g2.arc((i % 2 ? 1.3 : -1.3) + 0.6, i < 2 ? -1.3 : 1.3, 0.9, 0, 7);
        g2.fill();
      }
      g2.restore();
    }
    // Mund
    g2.strokeStyle = '#3a1f12';
    g2.lineWidth = 1.6;
    g2.lineCap = 'round';
    g2.beginPath();
    if (opts.happy) g2.arc(7, -15, 3.2, 0.1, Math.PI - 0.1);
    else g2.arc(7, -14.5, 2.5, 0.3, Math.PI - 0.3);
    g2.stroke();
    // Wangen
    g2.fillStyle = 'rgba(255,120,120,0.35)';
    g2.beginPath();
    g2.arc(13, -15, 2.4, 0, 7);
    g2.fill();
    // vorderer Arm
    g2.fillStyle = bodyDark;
    g2.beginPath();
    if (grab) g2.arc(16, -14, 4.5, 0, 7);
    else g2.arc(13, -15 + Math.sin(ph) * 4 * run + (opts.wave ? Math.sin(opts.wave * 12) * 6 - 8 : 0), 4.5, 0, 7);
    g2.fill();
    // Bommelmütze
    g2.fillStyle = look.hat;
    g2.beginPath();
    g2.arc(0, -29, 11, Math.PI, 0);
    g2.closePath();
    g2.fill();
    g2.lineWidth = 2;
    g2.strokeStyle = shade(look.hat, -0.45);
    g2.stroke();
    g2.fillStyle = shade(look.hat, -0.25);
    g2.beginPath();
    roundRect(g2, -12, -31, 24, 5, 2.5);
    g2.fill();
    stitch(g2, -9, -28.5, 9, -28.5, 'rgba(255,255,255,0.7)', 1.1);
    g2.fillStyle = '#fffaf0';
    g2.beginPath();
    g2.arc(0, -41, 4.5, 0, Math.PI * 2);
    g2.fill();
    g2.lineWidth = 1.5;
    g2.strokeStyle = 'rgba(0,0,0,0.25)';
    g2.stroke();
  }
  R.drawCharacter = drawCharacter;

  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((f - r) * p + r);
    gg = Math.round((f - gg) * p + gg);
    b = Math.round((f - b) * p + b);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
  }
  R.shade = shade;

  function drawPlayer(g2, W, t) {
    const P = W.player;
    if (P.dead > 0) return;
    const run = P.grounded ? Math.min(1, Math.abs(P.vx) / C.RUN) : 0;
    let sx = 1, sy = 1;
    if (!P.grounded) {
      sy = 1 + Math.min(Math.abs(P.vy) / 4000, 0.1);
      sx = 1 / sy;
    }
    sy *= 1 - anim.squash;
    sx *= 1 + anim.squash;
    g2.save();
    g2.translate(P.x + P.w / 2, P.y + P.h);
    // Schatten
    if (P.grounded) {
      g2.fillStyle = 'rgba(0,0,0,0.18)';
      g2.beginPath();
      g2.ellipse(0, 0, 14, 3, 0, 0, Math.PI * 2);
      g2.fill();
    }
    g2.scale(P.facing * sx, sy);
    drawCharacter(g2, R.look, {
      phase: anim.phase,
      run,
      air: !P.grounded,
      grab: !!P.grab,
      blink: anim.blink > 0,
      happy: W.finished || W.mult > 1,
      wave: W.finished ? t : 0
    });
    g2.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Partikel & Effekte                                                   */
  /* ------------------------------------------------------------------ */
  const parts = [];
  let shakeT = 0;
  R.clearFx = function () {
    parts.length = 0;
    shakeT = 0;
    anim.squash = 0;
    for (const k in springAnim) delete springAnim[k];
  };
  function addPart(p) {
    if (parts.length > 400) parts.shift();
    p.life = p.max = p.max || 0.8;
    parts.push(p);
  }
  const CONF = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'];

  R.handleEvent = function (e, W) {
    const P = W.player;
    switch (e.type) {
      case 'collect':
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          addPart({ kind: 'spark', x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, max: 0.4, color: '#bff0ff', size: 3 });
        }
        addPart({ kind: 'text', x: e.x, y: e.y - 10, z: e.z, vx: 0, vy: -50, max: 0.8, text: '+' + e.value, color: e.value > 10 ? '#ffd166' : '#ffffff' });
        break;
      case 'prize':
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          addPart({ kind: 'star', x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, max: 0.7, color: '#ffd166', size: 6 });
        }
        addPart({ kind: 'text', x: e.x, y: e.y - 16, z: e.z, vx: 0, vy: -40, max: 1.2, text: 'Preis! +' + e.value, color: '#ffd166' });
        break;
      case 'jump':
        anim.squash = -0.14;
        dust(P.x + P.w / 2, P.y + P.h, P.z, 3);
        break;
      case 'land':
        anim.squash = Math.min(0.28, e.v / 3200);
        dust(P.x + P.w / 2, P.y + P.h, P.z, 6);
        break;
      case 'boxland':
        dust(e.x, e.y, e.z, 6);
        break;
      case 'die':
        shakeT = 0.35;
        for (let i = 0; i < 22; i++) {
          const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
          addPart({ kind: 'fluff', x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, max: 0.9 + Math.random() * 0.4, color: i % 3 ? R.look.body : R.look.hat, size: 4 + Math.random() * 5, grav: 300 });
        }
        break;
      case 'respawn':
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          addPart({ kind: 'spark', x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, max: 0.5, color: '#ffffff', size: 3 });
        }
        break;
      case 'checkpoint':
        for (let i = 0; i < 24; i++) {
          addPart({ kind: 'conf', x: e.x, y: e.y - 20, z: e.z, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 300 - 60, max: 1.2, color: CONF[i % CONF.length], size: 4, grav: 600, rot: Math.random() * 6 });
        }
        addPart({ kind: 'text', x: e.x, y: e.y - 50, z: e.z, vx: 0, vy: -30, max: 1.3, text: 'Checkpoint!', color: '#9be7a9' });
        break;
      case 'goal':
        for (let i = 0; i < 90; i++) {
          addPart({ kind: 'conf', x: e.x + (Math.random() - 0.5) * 60, y: e.y - 40, z: e.z, vx: (Math.random() - 0.5) * 500, vy: -Math.random() * 600 - 100, max: 2.2, color: CONF[i % CONF.length], size: 5, grav: 700, rot: Math.random() * 6 });
        }
        break;
      case 'spring':
        springAnim[e.key] = 0.25;
        anim.squash = -0.2;
        break;
      case 'stomp':
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          addPart({ kind: 'fluff', x: e.x, y: e.y + 8, z: e.z, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60, max: 0.7, color: '#7b4fb5', size: 4, grav: 400 });
        }
        addPart({ kind: 'text', x: e.x, y: e.y - 10, z: e.z, vx: 0, vy: -50, max: 0.9, text: '+' + e.value, color: '#ffffff' });
        break;
      case 'layer':
        for (let i = 0; i < 8; i++) {
          addPart({ kind: 'spark', x: P.x + Math.random() * P.w, y: P.y + Math.random() * P.h, z: e.z, vx: 0, vy: -30, max: 0.4, color: 'rgba(255,255,255,0.9)', size: 2.5 });
        }
        break;
      case 'boxreset':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          addPart({ kind: 'spark', x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, max: 0.5, color: '#ffe8b0', size: 3 });
        }
        break;
    }
  };

  function dust(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      addPart({ kind: 'fluff', x: x + (Math.random() - 0.5) * 16, y: y - 2, z, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, max: 0.45, color: 'rgba(255,255,255,0.8)', size: 3 + Math.random() * 3, grav: 0 });
    }
  }

  R.update = function (dt, W) {
    anim.squash += (0 - anim.squash) * Math.min(1, dt * 12);
    if (W) {
      const P = W.player;
      if (P.grounded) anim.phase += (Math.abs(P.vx) / 26) * dt;
      anim.nextBlink -= dt;
      if (anim.nextBlink <= 0) {
        anim.blink = 0.12;
        anim.nextBlink = 2 + Math.random() * 3;
      }
      if (anim.blink > 0) anim.blink -= dt;
    }
    for (const k in springAnim) {
      springAnim[k] -= dt;
      if (springAnim[k] <= 0) delete springAnim[k];
    }
    if (shakeT > 0) shakeT -= dt;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.kind === 'spark' || p.kind === 'star') {
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
      }
      if (p.kind === 'conf') {
        p.vx *= 1 - dt * 1.5;
        p.rot += dt * 8;
      }
    }
  };

  function drawParts(z0, z1) {
    for (const p of parts) {
      if (p.z < z0 || p.z > z1) continue;
      const a = Math.max(0, p.life / p.max);
      g.globalAlpha = a;
      if (p.kind === 'text') {
        g.font = 'bold 18px Fredoka, ui-rounded, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(60,30,10,0.7)';
        g.strokeText(p.text, p.x, p.y);
        g.fillStyle = p.color;
        g.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'star') {
        starPath(g, p.x, p.y, p.size, p.size * 0.45, 5);
        g.fillStyle = p.color;
        g.fill();
      } else if (p.kind === 'conf') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
        g.restore();
      } else {
        g.fillStyle = p.color;
        g.beginPath();
        const s = p.kind === 'fluff' ? p.size * (1.3 - a * 0.3) : p.size;
        g.arc(p.x, p.y, s, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ */
  /* Spielwelt zeichnen                                                  */
  /* ------------------------------------------------------------------ */
  function drawLayer(g2, W, z, cam, t) {
    const L = W.L;
    setLayerTransform(g2, z, cam);
    const v = visibleTiles(z, cam, L);
    // statische Kacheln aus dem Cache
    const cx0 = Math.floor(v.x0 / CH), cx1 = Math.floor(v.x1 / CH);
    const cy0 = Math.floor(v.y0 / CH), cy1 = Math.floor(v.y1 / CH);
    g2.globalAlpha = 0.28;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const sh = getShadow(L, z, cx, cy);
        if (sh) g2.drawImage(sh, cx * CH * T + 7, cy * CH * T + 9, CH * T + 0.5, CH * T + 0.5);
      }
    }
    g2.globalAlpha = 1;
    if (z > 0 && 'filter' in g2) g2.filter = z === 1 ? 'brightness(0.86) saturate(0.95)' : 'brightness(0.72) saturate(0.85)';
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = getChunk(L, z, cx, cy);
        if (c) g2.drawImage(c, cx * CH * T, cy * CH * T, CH * T + 0.5, CH * T + 0.5);
      }
    }
    if (z > 0 && 'filter' in g2) g2.filter = 'none';
    // Plattform-Schienen
    for (const p of W.plats) if (p.z === z) drawPlatTrack(g2, p.kind, p.x0, p.y0);
    // dynamische Kacheln
    for (let y = v.y0; y <= v.y1; y++) {
      const row = L.grid[z][y];
      for (let x = v.x0; x <= v.x1; x++) {
        const ch = row[x];
        if (ch === '.' || ch === '#' || ch === 'H' || ch === '=' || ch === '^') continue;
        let st = null;
        if (ch === 'o' || ch === '*') {
          if (W.collected[z + ',' + x + ',' + y]) continue;
        } else if (ch === 'C') {
          st = { active: W.checkpoint.key === z + ',' + x + ',' + y };
        } else if (ch === 'J') {
          const k = springAnim[z + ',' + x + ',' + y];
          st = { comp: k ? Math.sin((k / 0.25) * Math.PI) : 0 };
        }
        drawDynamic(g2, ch, x, y, t, st);
      }
    }
    for (const p of W.plats) if (p.z === z) drawPlat(g2, p.x, p.y, p.kind);
    const grabId = W.player.grab ? W.player.grab.id : -1;
    for (const b of W.boxes) if (b.z === z) drawBox(g2, b.x, b.y, b.id === grabId);
    for (const e of W.enemies) if (e.z === z && (e.alive || e.deadT < 0.7)) drawEnemy(g2, e, t);
  }

  R.drawGame = function (W, t) {
    const cam = R.cam;
    let ox = 0, oy = 0;
    if (shakeT > 0) {
      ox = (Math.random() - 0.5) * 10 * shakeT;
      oy = (Math.random() - 0.5) * 10 * shakeT;
    }
    const scam = { x: cam.x + ox, y: cam.y + oy, zoom: cam.zoom };
    drawBackground(W.L.theme, scam, t);
    const P = W.player;
    const th = THEMES[W.L.theme] || THEMES[0];
    const pLayer = Math.ceil(P.zf - 0.001);
    const ps = toScreen(P.x + P.w / 2, P.y + P.h / 2, P.zf, scam);
    for (let z = C.LAYERS - 1; z >= 0; z--) {
      const behind = P.dead <= 0 && P.zf > z + 0.05;
      if (behind) {
        // Ebene liegt vor der Figur: mit Guckloch zeichnen
        tg.setTransform(1, 0, 0, 1, 0, 0);
        tg.clearRect(0, 0, tmp.width, tmp.height);
        drawLayer(tg, W, z, scam, t);
        tg.setTransform(dpr, 0, 0, dpr, 0, 0);
        tg.globalCompositeOperation = 'destination-out';
        const r = 80 * ps.s;
        const grd = tg.createRadialGradient(ps.x, ps.y, r * 0.2, ps.x, ps.y, r);
        grd.addColorStop(0, 'rgba(0,0,0,0.72)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        tg.fillStyle = grd;
        tg.fillRect(ps.x - r, ps.y - r, r * 2, r * 2);
        tg.globalCompositeOperation = 'source-over';
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(tmp, 0, 0);
      } else {
        drawLayer(g, W, z, scam, t);
      }
      setLayerTransform(g, z, scam);
      drawParts(z, z);
      if (pLayer === z) {
        setLayerTransform(g, P.zf, scam);
        drawPlayer(g, W, t);
      }
      if (z > 0) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = th.fog;
        g.fillRect(0, 0, Wd, Hd);
      }
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVignette();
  };

  let vig = null, vigKey = '';
  function drawVignette() {
    const k = Wd + 'x' + Hd;
    if (k !== vigKey) {
      vigKey = k;
      const r = Math.hypot(Wd, Hd) / 2;
      vig = g.createRadialGradient(Wd / 2, Hd / 2, r * 0.55, Wd / 2, Hd / 2, r);
      vig.addColorStop(0, 'rgba(20,10,0,0)');
      vig.addColorStop(1, 'rgba(20,10,0,0.32)');
    }
    g.fillStyle = vig;
    g.fillRect(0, 0, Wd, Hd);
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */
  function panel(x, y, w, h, color) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    roundRect(g, x + 2, y + 3, w, h, 12);
    g.fill();
    g.fillStyle = color || '#fff6e6';
    g.beginPath();
    roundRect(g, x, y, w, h, 12);
    g.fill();
    g.save();
    g.strokeStyle = 'rgba(140,90,40,0.55)';
    g.setLineDash([5, 4]);
    g.lineWidth = 1.6;
    g.beginPath();
    roundRect(g, x + 5, y + 5, w - 10, h - 10, 8);
    g.stroke();
    g.restore();
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  R.fmtTime = fmtTime;

  R.drawHUD = function (W, t, opts) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sm = Wd < 600;
    const top = opts && opts.top ? opts.top : 12;
    // Punkte
    const pw = sm ? 128 : 170;
    panel(12, top, pw, sm ? 44 : 52);
    g.fillStyle = '#5a3a1d';
    g.font = 'bold ' + (sm ? 22 : 28) + 'px Fredoka, ui-rounded, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(String(W.score), 26, top + (sm ? 22 : 26));
    if (W.mult > 1) {
      const bx = 12 + pw + 8, by = top + 4;
      g.fillStyle = '#ff9f1c';
      g.beginPath();
      g.arc(bx + 20, by + 20, 20 + Math.sin(t * 10) * 1.5, 0, 7);
      g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 18px Fredoka, ui-rounded, sans-serif';
      g.textAlign = 'center';
      g.fillText('x' + W.mult, bx + 20, by + 21);
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(bx + 20, by + 20, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, W.chainT / C.CHAIN_TIME));
      g.stroke();
    }
    // rechte Seite: Perlen, Preise, Zeit
    const rw = sm ? 150 : 250;
    const rx = Wd - rw - 12 - (opts && opts.rightPad ? opts.rightPad : 0);
    panel(rx, top, rw, sm ? 44 : 52);
    g.textBaseline = 'middle';
    const cy = top + (sm ? 22 : 26);
    drawBubble(g, rx + 22, cy, 9, t, false);
    g.fillStyle = '#5a3a1d';
    g.font = 'bold ' + (sm ? 15 : 18) + 'px Fredoka, ui-rounded, sans-serif';
    g.textAlign = 'left';
    g.fillText(W.bubbles + '/' + W.totalBubbles, rx + 36, cy + 1);
    const sx = rx + (sm ? 100 : 118);
    starPath(g, sx, cy, 10, 4.5, 5);
    g.fillStyle = '#ffb703';
    g.fill();
    g.fillStyle = '#5a3a1d';
    g.fillText(W.prizes + '/' + W.totalPrizes, sx + 13, cy + 1);
    if (!sm) {
      g.textAlign = 'right';
      g.fillText(fmtTime(W.time), rx + rw - 16, cy + 1);
    }
    // Ebenenanzeige
    const P = W.player;
    const lx = Wd / 2 - 30, ly = top + 6;
    for (let z = C.LAYERS - 1; z >= 0; z--) {
      const w = 44 - z * 8;
      g.fillStyle = z === P.z ? '#ffd166' : 'rgba(255,255,255,0.55)';
      g.beginPath();
      roundRect(g, lx + 30 - w / 2, ly + (2 - z) * 9, w, 7, 3);
      g.fill();
    }
    // Schild-Hinweis
    const sign = nearbySign(W);
    if (sign && !W.finished) drawHint(sign);
  };

  function nearbySign(W) {
    const P = W.player;
    if (P.dead > 0) return null;
    const L = W.L;
    const cx = Math.floor((P.x + P.w / 2) / T), cy = Math.floor((P.y + P.h / 2) / T);
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
        if (L.grid[P.z][y][x] === 'T') {
          const dx = x * T + T / 2 - (P.x + P.w / 2);
          if (Math.abs(dx) < 56) return L.signs[P.z + ',' + x + ',' + y] || '…';
        }
      }
    }
    return null;
  }

  function wrapText(text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (g.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawHint(text) {
    const sm = Wd < 600;
    g.font = (sm ? 15 : 19) + 'px Fredoka, ui-rounded, sans-serif';
    const maxW = Math.min(560, Wd - 60);
    const lines = wrapText(text, maxW);
    const lh = sm ? 20 : 25;
    const h = lines.length * lh + 26;
    const w = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 40;
    const x = Wd / 2 - w / 2;
    const y = Hd * (sm ? 0.18 : 0.16) + 24;
    panel(x, y, w, h, '#fffdf5');
    g.fillStyle = '#4a2f17';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, Wd / 2, y + 13 + lh / 2 + i * lh));
  }

  /* ------------------------------------------------------------------ */
  /* Editor-Ansicht                                                      */
  /* ------------------------------------------------------------------ */
  R.drawEditor = function (L, cam, st, t) {
    drawBackground(L.theme, { x: cam.x, y: cam.y, zoom: cam.zoom }, t);
    const s = cam.zoom;
    const order = [2, 1, 0];
    for (const z of order) {
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (Wd / 2 - cam.x * s), dpr * (Hd / 2 - cam.y * s));
      g.globalAlpha = z === st.layer ? 1 : 0.22;
      const x0 = Math.max(0, Math.floor((cam.x - Wd / 2 / s) / T) - 1);
      const x1 = Math.min(L.w - 1, Math.ceil((cam.x + Wd / 2 / s) / T) + 1);
      const y0 = Math.max(0, Math.floor((cam.y - Hd / 2 / s) / T) - 1);
      const y1 = Math.min(L.h - 1, Math.ceil((cam.y + Hd / 2 / s) / T) + 1);
      for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) {
        for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
          const c = getChunk(L, z, cx, cy);
          if (c) g.drawImage(c, cx * CH * T, cy * CH * T, CH * T + 0.5, CH * T + 0.5);
        }
      }
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const ch = L.raw[z][y][x];
          if (ch === '.' || ch === '#' || ch === 'H' || ch === '=' || ch === '^') continue;
          drawDynamic(g, ch, x, y, t, null);
        }
      }
      if (z === st.layer) {
        // Raster
        g.strokeStyle = 'rgba(60,40,20,0.13)';
        g.lineWidth = 1 / s;
        g.beginPath();
        for (let x = x0; x <= x1 + 1; x++) {
          g.moveTo(x * T, y0 * T);
          g.lineTo(x * T, (y1 + 1) * T);
        }
        for (let y = y0; y <= y1 + 1; y++) {
          g.moveTo(x0 * T, y * T);
          g.lineTo((x1 + 1) * T, y * T);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (Wd / 2 - cam.x * s), dpr * (Hd / 2 - cam.y * s));
    // Levelrand
    g.strokeStyle = 'rgba(90,40,10,0.8)';
    g.lineWidth = 3 / s;
    g.setLineDash([10 / s, 6 / s]);
    g.strokeRect(0, 0, L.w * T, L.h * T);
    g.setLineDash([]);
    // Hover
    if (st.hover && st.hover.x >= 0 && st.hover.y >= 0 && st.hover.x < L.w && st.hover.y < L.h) {
      const hx = st.hover.x * T, hy = st.hover.y * T;
      if (st.tool !== '.' && st.tool !== 'pan') {
        g.globalAlpha = 0.55;
        if (FW.isSolid(st.tool) || st.tool === '=' || st.tool === '^') {
          const th = THEMES[L.theme] || THEMES[0];
          drawStaticTile(g, L, st.layer, st.hover.x, st.hover.y, st.tool, hx, hy, th);
        } else drawDynamic(g, st.tool, st.hover.x, st.hover.y, t, null);
        g.globalAlpha = 1;
      }
      g.strokeStyle = st.tool === '.' ? '#e63946' : '#ffffff';
      g.lineWidth = 3 / s;
      g.strokeRect(hx, hy, T, T);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /* Kleine Vorschau der Figur (Kostüm-Menü) */
  R.drawPreview = function (canvas, look, t) {
    const pg = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    pg.setTransform(1, 0, 0, 1, 0, 0);
    pg.clearRect(0, 0, w, h);
    pg.translate(w / 2, h * 0.86);
    const sc = h / 70;
    pg.scale(sc, sc);
    pg.fillStyle = 'rgba(0,0,0,0.15)';
    pg.beginPath();
    pg.ellipse(0, 0, 16, 3.5, 0, 0, Math.PI * 2);
    pg.fill();
    const bounce = Math.abs(Math.sin(t * 3)) * 3;
    pg.translate(0, -bounce);
    drawCharacter(pg, look, { phase: t * 6, run: 0.4, happy: true, blink: t % 3 < 0.12, wave: t });
  };

  /* Icon für die Editor-Palette */
  R.drawIcon = function (canvas, ch, theme) {
    const ig = canvas.getContext('2d');
    const size = canvas.width;
    ig.setTransform(1, 0, 0, 1, 0, 0);
    ig.clearRect(0, 0, size, size);
    if (ch === '.') {
      ig.strokeStyle = '#e63946';
      ig.lineWidth = size / 10;
      ig.lineCap = 'round';
      ig.beginPath();
      ig.moveTo(size * 0.25, size * 0.25);
      ig.lineTo(size * 0.75, size * 0.75);
      ig.moveTo(size * 0.75, size * 0.25);
      ig.lineTo(size * 0.25, size * 0.75);
      ig.stroke();
      return;
    }
    const big = ch === 'M' || ch === 'V' || ch === 'G' || ch === 'C';
    const sc = size / (big ? T * 2.2 : T * 1.15);
    ig.translate(size / 2, size / 2);
    ig.scale(sc, sc);
    const fake = {
      w: 3,
      h: 3,
      grid: [0, 1, 2].map(() => [['.', '.', '.'], ['.', ch, '.'], ['.', '.', '.']]),
      theme: theme || 0
    };
    if (ch === '#' || ch === 'H' || ch === '=' || ch === '^') {
      drawStaticTile(ig, fake, 0, 1, 1, ch, -T / 2, -T / 2, THEMES[theme || 0]);
    } else if (ch === 'M' || ch === 'V') {
      drawPlat(ig, -C.PLAT_W / 2, -8, ch);
    } else if (ch === 'G' || ch === 'C') {
      ig.translate(-T / 2, -T / 2 + 6);
      drawDynamic(ig, ch, 0, 0, 0, { active: true });
    } else {
      ig.translate(-T / 2, -T / 2);
      drawDynamic(ig, ch, 0, 0, 0.5, null);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
