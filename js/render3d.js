/*
 * Craft World – 3D-Renderer (2.5D): Die Spiellogik bleibt seitlich mit 3 Ebenen,
 * dargestellt wird alles in echtem 3D mit Licht und Schatten (Three.js).
 * Alle Figuren und Texturen sind eigene, prozedural erzeugte Entwürfe.
 */
(function (root) {
  'use strict';
  const FW = (root.FW = root.FW || {});
  const R3 = (FW.Render3D = { ok: false });
  if (typeof THREE === 'undefined') return;
  const C = FW.C;
  const T = C.T;
  const LAYER_GAP = 1.3;
  const DEPTH = 1.16;
  const LZ = (z) => -z * LAYER_GAP;

  let renderer = null, scene, camera, sun, hemi, canvasEl;
  let levelGroup = null, curL = null, curTheme = -1;
  let layerMeshes = [], layerMats = [], layerFade = [1, 1, 1];
  let items = [], plats = {}, boxes = {}, enemies = {};
  let doll = null, dollKey = '';
  const cam = { x: 0, y: 0, z: 0, look: 0, inited: false };
  const anim = { phase: 0, squash: 0, blink: 0, nextBlink: 2, turn: 0 };
  const springAnim = {};
  let shakeT = 0;
  const texCache = {};

  /* ------------------------------------------------------------------ */
  /* Hilfen                                                              */
  /* ------------------------------------------------------------------ */
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function canvasTex(key, w, h, draw, repeat) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (renderer) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    texCache[key] = t;
    return t;
  }
  function std(opts) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, opts));
    m.color.convertSRGBToLinear();
    m.emissive.convertSRGBToLinear();
    return m;
  }
  function basic(opts) {
    const m = new THREE.MeshBasicMaterial(opts);
    m.color.convertSRGBToLinear();
    return m;
  }
  const lin = (c) => new THREE.Color(c).convertSRGBToLinear();
  function themeOf(i) {
    return FW.Render.THEMES[i] || FW.Render.THEMES[0];
  }
  function stitchLine(g, x1, y1, x2, y2, col, w, dash) {
    g.save();
    g.strokeStyle = col;
    g.lineWidth = w || 3;
    g.setLineDash(dash || [8, 7]);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Texturen                                                            */
  /* ------------------------------------------------------------------ */
  function texCardboard(ti) {
    const th = themeOf(ti);
    return canvasTex('card' + ti, 512, 512, (g, w, h) => {
      g.fillStyle = th.ground;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 64; i++) {
        g.fillStyle = i % 2 ? 'rgba(90,50,15,0.10)' : 'rgba(255,240,210,0.06)';
        g.fillRect(i * 8, 0, 4, h);
      }
      for (let i = 0; i < 900; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(60,30,5,0.08)' : 'rgba(255,255,255,0.06)';
        g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 1 + Math.random() * 2);
      }
      // aufgenähte Flicken und Knöpfe
      const spots = [[70, 320, 0], [330, 110, 1], [390, 400, 2], [180, 170, 3]];
      for (const [x, y, k] of spots) {
        g.save();
        g.translate(x, y);
        g.rotate((k - 1.5) * 0.25);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect(-36, -26, 76, 58);
        g.fillStyle = th.patch[k % th.patch.length];
        g.fillRect(-40, -30, 76, 58);
        stitchLine(g, -32, -22, 28, -22, 'rgba(255,255,255,0.85)', 3, [7, 6]);
        stitchLine(g, 28, -22, 28, 20, 'rgba(255,255,255,0.85)', 3, [7, 6]);
        stitchLine(g, 28, 20, -32, 20, 'rgba(255,255,255,0.85)', 3, [7, 6]);
        stitchLine(g, -32, 20, -32, -22, 'rgba(255,255,255,0.85)', 3, [7, 6]);
        g.restore();
      }
      for (const [x, y, k] of [[250, 300, 0], [460, 220, 1], [110, 470, 2]]) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.arc(x + 3, y + 4, 18, 0, 7);
        g.fill();
        g.fillStyle = th.patch[(k + 1) % th.patch.length];
        g.beginPath();
        g.arc(x, y, 18, 0, 7);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, 13, 0, 7);
        g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.5)';
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.arc(x + (i % 2 ? 4 : -4), y + (i < 2 ? -4 : 4), 2.3, 0, 7);
          g.fill();
        }
      }
    }, true);
  }
  function texFelt(key, color, fibers) {
    return canvasTex(key, 256, 256, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI;
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
        g.stroke();
      }
      if (fibers) {
        for (let i = 0; i < 40; i++) {
          g.fillStyle = fibers;
          g.beginPath();
          g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 0, 7);
          g.fill();
        }
      }
    }, true);
  }
  function texLip(ti) {
    const th = themeOf(ti);
    return canvasTex('lip' + ti, 256, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = th.top;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(w, 0);
      const n = 16;
      for (let i = n; i >= 0; i--) g.lineTo((i / n) * w, i % 2 ? 52 : 38);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(0, 0, w, 6);
      g.fillStyle = th.topDark;
      g.fillRect(0, 30, w, 3);
      stitchLine(g, 0, 17, w, 17, 'rgba(255,255,255,0.9)', 3.5, [10, 8]);
    }, true);
  }
  function texWood(ti) {
    const th = themeOf(ti);
    return canvasTex('wood' + ti, 256, 256, (g, w, h) => {
      g.fillStyle = th.wood;
      g.fillRect(0, 0, w, h);
      for (let p = 0; p < 4; p++) {
        g.fillStyle = 'rgba(40,20,5,0.45)';
        g.fillRect(0, p * 64, w, 3);
        g.strokeStyle = 'rgba(50,25,8,0.3)';
        g.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const yy = p * 64 + 12 + i * 13;
          g.beginPath();
          g.moveTo(0, yy);
          g.bezierCurveTo(80, yy - 6, 170, yy + 6, w, yy);
          g.stroke();
        }
        g.fillStyle = '#e8d6b0';
        g.beginPath();
        g.arc(14, p * 64 + 32, 4, 0, 7);
        g.arc(w - 14, p * 64 + 32, 4, 0, 7);
        g.fill();
      }
    }, true);
  }
  function texCloth(ti) {
    const th = themeOf(ti);
    return canvasTex('cloth' + ti, 128, 128, (g, w, h) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = th.cloth[i % 2];
        g.fillRect(i * 16, 0, 16, h);
      }
      for (let i = 0; i < 300; i++) {
        g.fillStyle = 'rgba(0,0,0,0.06)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      stitchLine(g, 0, 18, w, 18, 'rgba(60,30,30,0.6)', 3, [8, 6]);
    }, true);
  }
  // Graustufen-Strickmuster, wird über die Materialfarbe eingefärbt
  function texKnit(stripe) {
    return canvasTex('knit' + (stripe || ''), 128, 128, (g, w, h) => {
      const rows = 8, cols = 8;
      for (let r = 0; r < rows; r++) {
        if (stripe) g.fillStyle = r % 4 < 2 ? stripe : '#ffffff';
        else g.fillStyle = '#e6e6e6';
        g.fillRect(0, r * 16, w, 16);
        for (let c = 0; c < cols; c++) {
          const x = c * 16 + 8, y = r * 16 + 8;
          for (const s of [-1, 1]) {
            const grd = g.createLinearGradient(x + s * 4, y - 6, x, y + 6);
            grd.addColorStop(0, 'rgba(255,255,255,0.35)');
            grd.addColorStop(1, 'rgba(0,0,0,0.30)');
            g.fillStyle = grd;
            g.save();
            g.translate(x + s * 3.5, y);
            g.rotate(s * 0.55);
            g.beginPath();
            g.ellipse(0, 0, 3.6, 7.5, 0, 0, 7);
            g.fill();
            g.restore();
          }
        }
      }
    }, true);
  }
  function texBox() {
    return canvasTex('box', 256, 256, (g, w, h) => {
      g.fillStyle = '#d9a55f';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 32; i++) {
        g.fillStyle = 'rgba(120,70,20,0.08)';
        g.fillRect(i * 8, 0, 4, h);
      }
      g.fillStyle = '#efdcae';
      g.fillRect(100, 0, 56, h);
      g.strokeStyle = '#8a5a26';
      g.lineWidth = 10;
      g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#5c3a14';
      g.fillRect(36, 120, 34, 16);
      g.fillRect(w - 70, 120, 34, 16);
    });
  }
  function texSign() {
    return canvasTex('sign', 256, 160, (g, w, h) => {
      g.fillStyle = '#d9a86c';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#8a5c2f';
      g.lineWidth = 12;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#5a3a1d';
      g.font = 'bold 110px Fredoka, ui-rounded, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', w / 2, h / 2 + 6);
    });
  }
  function texChecker() {
    return canvasTex('checker', 256, 64, (g, w, h) => {
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 4; j++) {
          g.fillStyle = (i + j) % 2 ? '#222' : '#fff';
          g.fillRect(i * 16, j * 16, 16, 16);
        }
      }
    });
  }
  function texCircle() {
    return canvasTex('circle', 64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.8)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
  }
  function texSky(ti) {
    const th = themeOf(ti);
    return canvasTex('sky' + ti, 4, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, th.sky[0]);
      grd.addColorStop(1, th.sky[1]);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
  }
  function texHills(ti, layer) {
    const th = themeOf(ti);
    return canvasTex('hills' + ti + '_' + layer, 1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = th.hill[layer];
      if (ti === 2) {
        for (let i = -1; i < 6; i++) {
          const cx = i * 200 + (layer ? 100 : 0), hh = 150 + ((i * 53 + layer * 31) % 90);
          g.fillStyle = th.hill[layer];
          g.beginPath();
          g.moveTo(cx - 170, h);
          g.lineTo(cx, h - hh);
          g.lineTo(cx + 170, h);
          g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.moveTo(cx, h - hh);
          g.lineTo(cx - 40, h - hh + 50);
          g.lineTo(cx - 12, h - hh + 38);
          g.lineTo(cx + 14, h - hh + 52);
          g.lineTo(cx + 40, h - hh + 50);
          g.fill();
        }
      } else if (ti === 1) {
        for (let i = 0; i < 6; i++) {
          const x = i * 175 + layer * 60, hh = 90 + ((i * 41) % 70);
          g.fillRect(x, h - hh, 110, hh);
          g.fillRect(x + 20, h - hh - 60, 20, 60);
          g.fillRect(x + 120, h - 50, 60, 50);
        }
      } else {
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = h - 90 - Math.sin((x / w) * Math.PI * 4 + layer * 2) * 40 - Math.sin((x / w) * Math.PI * 10 + layer) * 14;
          g.lineTo(x, y);
        }
        g.lineTo(w, h);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 4;
        g.setLineDash([12, 10]);
        g.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = h - 74 - Math.sin((x / w) * Math.PI * 4 + layer * 2) * 40 - Math.sin((x / w) * Math.PI * 10 + layer) * 14;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }, true);
  }

  /* ------------------------------------------------------------------ */
  /* Initialisierung                                                     */
  /* ------------------------------------------------------------------ */
  R3.init = function (canvas) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      renderer = null;
      return false;
    }
    if (!renderer.getContext()) return false;
    canvasEl = canvas;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    hemi = new THREE.HemisphereLight(0xeaf6ff, 0x8a6a48, 0.8);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xfff1d6, 1.15);
    sun.castShadow = true;
    const sm = Math.min(window.innerWidth, window.innerHeight) < 600 ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    R3.ok = true;
    R3.resize();
    return true;
  };

  R3.resize = function () {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    canvasEl.style.width = window.innerWidth + 'px';
    canvasEl.style.height = window.innerHeight + 'px';
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  };

  /* ------------------------------------------------------------------ */
  /* Level aufbauen                                                      */
  /* ------------------------------------------------------------------ */
  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  function makeLayerMaterials(ti, z) {
    const dim = [1, 0.8, 0.64][z];
    const tint = new THREE.Color(dim, dim, dim * 1.04);
    const mk = (opts) => {
      const m = std(Object.assign({ vertexColors: true }, opts));
      m.color.multiply(tint);
      return m;
    };
    return [
      mk({ map: texCardboard(ti) }), // 0 Pappe vorne
      mk({ map: texFelt('grass' + ti, themeOf(ti).top, themeOf(ti).snow ? null : 'rgba(255,255,255,0.12)'), roughness: 1 }), // 1 Gras oben
      mk({ map: texCardboard(ti), color: 0xc8c0b8 }), // 2 Pappe Seite
      mk({ map: texWood(ti) }), // 3 Holz
      mk({ map: texCloth(ti), roughness: 0.85 }), // 4 Stoffbrett
      mk({ map: texLip(ti), transparent: true, alphaTest: 0.5, roughness: 1 }) // 5 Graskante
    ];
  }

  function buildLayerGeometry(L, z) {
    const bufs = [0, 1, 2, 3, 4, 5].map(() => ({ p: [], n: [], u: [], c: [] }));
    const zc = LZ(z), zf = zc + DEPTH / 2, zb = zc - DEPTH / 2;
    const S = (x, y) => x >= 0 && x < L.w && y >= 0 && y < L.h && FW.isSolid(L.grid[z][y][x]);
    const isSolidOrEdge = (x, y) => x < 0 || x >= L.w || (y >= L.h ? true : S(x, y));
    function quad(m, a, b, c, d, n, ua, ub, uc, ud, sh) {
      const B = bufs[m];
      B.p.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let i = 0; i < 6; i++) B.n.push(...n);
      B.u.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
      const k = sh || [1, 1, 1, 1];
      for (const i of [0, 1, 2, 0, 2, 3]) B.c.push(k[i], k[i], k[i]);
    }
    // Tiefe unter der Oberfläche -> nach unten dunkler
    const depthAt = (x, y) => {
      let d = 0;
      while (d < 6 && y - d - 1 >= 0 && S(x, y - d - 1)) d++;
      return d;
    };
    const shadeOf = (d) => Math.max(0.55, 1 - d * 0.085);
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        const ch = L.grid[z][y][x];
        const x0 = x, x1 = x + 1, yt = -y, yb = -y - 1;
        if (ch === '#' || ch === 'H') {
          const wood = ch === 'H';
          const fm = wood ? 3 : 0, sm = wood ? 3 : 2;
          const s = 0.25;
          const d = depthAt(x, y), st = shadeOf(d), sb = shadeOf(d + 1);
          quad(fm, [x0, yb, zf], [x1, yb, zf], [x1, yt, zf], [x0, yt, zf], [0, 0, 1], [x0 * s, yb * s], [x1 * s, yb * s], [x1 * s, yt * s], [x0 * s, yt * s], [sb, sb, st, st]);
          if (!S(x, y - 1)) {
            quad(wood ? 3 : 1, [x0, yt, zf], [x1, yt, zf], [x1, yt, zb], [x0, yt, zb], [0, 1, 0], [x0 * s, 0], [x1 * s, 0], [x1 * s, DEPTH * s], [x0 * s, DEPTH * s]);
            if (!wood) {
              // Grasdecke hängt vorne und an den Seiten über
              const lz = zf + 0.004;
              quad(5, [x0, yt - 0.26, lz], [x1, yt - 0.26, lz], [x1, yt + 0.02, lz], [x0, yt + 0.02, lz], [0, 0, 1], [x0, 0], [x1, 0], [x1, 1], [x0, 1]);
            }
          }
          if (!isSolidOrEdge(x - 1, y)) quad(sm, [x0, yb, zb], [x0, yb, zf], [x0, yt, zf], [x0, yt, zb], [-1, 0, 0], [zb * s, yb * s], [zf * s, yb * s], [zf * s, yt * s], [zb * s, yt * s], [sb, sb, st, st]);
          if (!isSolidOrEdge(x + 1, y)) quad(sm, [x1, yb, zf], [x1, yb, zb], [x1, yt, zb], [x1, yt, zf], [1, 0, 0], [zf * s, yb * s], [zb * s, yb * s], [zb * s, yt * s], [zf * s, yt * s], [sb, sb, st, st]);
          if (y + 1 < L.h && !S(x, y + 1)) quad(sm, [x0, yb, zb], [x1, yb, zb], [x1, yb, zf], [x0, yb, zf], [0, -1, 0], [x0 * s, 0], [x1 * s, 0], [x1 * s, 1], [x0 * s, 1]);
        } else if (ch === '=') {
          const th = 0.3, bt = yt - th;
          const pf = zc + DEPTH * 0.46, pb = zc - DEPTH * 0.46;
          const lf = x > 0 && L.grid[z][y][x - 1] === '=';
          const rt = x + 1 < L.w && L.grid[z][y][x + 1] === '=';
          quad(4, [x0, bt, pf], [x1, bt, pf], [x1, yt, pf], [x0, yt, pf], [0, 0, 1], [x0, 0], [x1, 0], [x1, 0.3], [x0, 0.3]);
          quad(4, [x0, yt, pf], [x1, yt, pf], [x1, yt, pb], [x0, yt, pb], [0, 1, 0], [x0, 0], [x1, 0], [x1, 1], [x0, 1]);
          quad(4, [x0, bt, pb], [x1, bt, pb], [x1, bt, pf], [x0, bt, pf], [0, -1, 0], [x0, 0], [x1, 0], [x1, 1], [x0, 1]);
          if (!lf) quad(4, [x0, bt, pb], [x0, bt, pf], [x0, yt, pf], [x0, yt, pb], [-1, 0, 0], [0, 0], [1, 0], [1, 0.3], [0, 0.3]);
          if (!rt) quad(4, [x1, bt, pf], [x1, bt, pb], [x1, yt, pb], [x1, yt, pf], [1, 0, 0], [0, 0], [1, 0], [1, 0.3], [0, 0.3]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    const P = [], N = [], U = [], CO = [];
    let start = 0;
    bufs.forEach((B, m) => {
      const count = B.p.length / 3;
      if (count) {
        geo.addGroup(start, count, m);
        start += count;
        P.push(...B.p);
        N.push(...B.n);
        U.push(...B.u);
        CO.push(...B.c);
      }
    });
    if (!start) return null;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(CO, 3));
    return geo;
  }

  // gemeinsam genutzte Geometrien/Materialien für Objekte
  let G = null;
  function shared() {
    if (G) return G;
    G = {
      bubble: new THREE.SphereGeometry(0.26, 20, 14),
      prize: new THREE.SphereGeometry(0.38, 24, 16),
      shine: new THREE.SphereGeometry(0.07, 8, 6),
      bubbleMat: std({ color: 0xbff0ff, emissive: 0x2a8fc4, emissiveIntensity: 0.45, transparent: true, opacity: 0.62, roughness: 0.08 }),
      prizeMat: std({ color: 0xffe08a, emissive: 0xc77a00, emissiveIntensity: 0.35, transparent: true, opacity: 0.5, roughness: 0.1 }),
      white: basic({ color: 0xffffff }),
      gold: std({ color: 0xffb703, metalness: 0.6, roughness: 0.3, emissive: 0x7a4a00, emissiveIntensity: 0.4 }),
      flame: [0xff4d1a, 0xffa21f, 0xfff0a0].map((c) => basic({ color: c, transparent: true, opacity: 0.92 })),
      cone: new THREE.ConeGeometry(0.16, 0.6, 10),
      log: new THREE.CylinderGeometry(0.07, 0.07, 0.8, 8),
      logMat: std({ color: 0x4a2f1c }),
      metal: std({ color: 0xd5dce4, metalness: 0.7, roughness: 0.3 }),
      metalDark: std({ color: 0x5b6470, metalness: 0.5, roughness: 0.5 }),
      spike: new THREE.ConeGeometry(0.12, 0.5, 8),
      pole: new THREE.CylinderGeometry(0.04, 0.04, 1.7, 8),
      poleMat: std({ color: 0x7d5a3a }),
      disc: new THREE.CylinderGeometry(0.4, 0.42, 0.07, 24),
      flag: new THREE.PlaneGeometry(0.55, 0.36),
      red: std({ color: 0xe63946, side: THREE.DoubleSide }),
      green: std({ color: 0x4cc96b, emissive: 0x1d7a35, emissiveIntensity: 0.4, side: THREE.DoubleSide }),
      padRed: std({ color: 0xe63946 }),
      tor: new THREE.TorusGeometry(0.2, 0.04, 8, 20),
      box: new THREE.BoxGeometry(1, 1, 0.96),
      boxMat: std({ map: texBox() }),
      plat: new THREE.BoxGeometry(2, 0.4, 1.0),
      platMat: std({ map: texFelt('platfelt', '#2a9d8f', 'rgba(255,255,255,0.15)') }),
      sphere: new THREE.SphereGeometry(1, 16, 12),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
      sign: new THREE.BoxGeometry(0.8, 0.5, 0.08),
      signMats: null,
      circle: texCircle()
    };
    const wood = std({ color: 0xa8763f });
    G.signMats = [wood, wood, wood, wood, std({ map: texSign() }), wood];
    return G;
  }

  function mesh(geo, mat, cast) {
    const m = new THREE.Mesh(geo, mat);
    if (cast !== false) m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function starGeo() {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 0.1 : 0.24;
      if (i === 0) s.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    g.center();
    return g;
  }

  function makeItem(ch, x, y, z) {
    const S = shared();
    const zc = LZ(z);
    const g = new THREE.Group();
    const cx = x + 0.5, base = -y - 1;
    g.position.set(cx, base, zc);
    const it = { ch, x, y, z, key: z + ',' + x + ',' + y, obj: g };
    switch (ch) {
      case 'o': {
        const b = mesh(S.bubble, S.bubbleMat, false);
        b.position.y = 0.5;
        const sh = new THREE.Mesh(S.shine, S.white);
        sh.position.set(-0.09, 0.62, 0.17);
        g.add(b, sh);
        break;
      }
      case '*': {
        const b = mesh(S.prize, S.prizeMat, false);
        b.position.y = 0.5;
        const st = mesh(G.star || (G.star = starGeo()), S.gold);
        st.position.y = 0.5;
        it.star = st;
        g.add(b, st);
        break;
      }
      case 'f': {
        const log1 = mesh(S.log, S.logMat);
        log1.rotation.z = Math.PI / 2;
        log1.rotation.y = 0.4;
        log1.position.y = 0.07;
        const log2 = log1.clone();
        log2.rotation.y = -0.4;
        g.add(log1, log2);
        it.flames = [];
        for (let i = 0; i < 3; i++) {
          for (let k = 0; k < 3; k++) {
            const f = new THREE.Mesh(S.cone, S.flame[k]);
            const sc = 1 - k * 0.3;
            f.scale.set(sc, sc, sc);
            f.position.set((i - 1) * 0.28, 0.32 - k * 0.04, (k - 1) * 0.04);
            f.userData.base = sc;
            g.add(f);
            it.flames.push(f);
          }
        }
        break;
      }
      case '^': {
        const plate = mesh(new THREE.BoxGeometry(1, 0.08, DEPTH * 0.9), S.metalDark);
        plate.position.y = 0.04;
        g.add(plate);
        for (let i = 0; i < 3; i++) {
          for (let k = 0; k < 2; k++) {
            const sp = mesh(S.spike, S.metal);
            sp.position.set((i - 1) * 0.32, 0.32, (k - 0.5) * 0.5);
            g.add(sp);
          }
        }
        break;
      }
      case 'C': {
        const pole = mesh(S.pole, S.poleMat);
        pole.position.set(0, 0.85, 0);
        const flag = mesh(S.flag, S.red);
        flag.position.set(0.29, 1.5, 0);
        const disc = mesh(S.disc, std({ color: 0xb9a48a }));
        disc.position.y = 0.035;
        g.add(pole, flag, disc);
        it.flag = flag;
        it.disc = disc;
        break;
      }
      case 'G': {
        const p1 = mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), S.poleMat);
        p1.position.set(-0.65, 1.2, 0);
        const p2 = p1.clone();
        p2.position.x = 0.65;
        const banner = mesh(new THREE.PlaneGeometry(1.36, 0.36), std({ map: texChecker(), side: THREE.DoubleSide }));
        banner.position.set(0, 2.2, 0);
        g.add(p1, p2, banner);
        const cols = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93];
        const tri = new THREE.ConeGeometry(0.1, 0.24, 3);
        for (let i = 0; i < 6; i++) {
          const b = mesh(tri, std({ color: cols[i % 5] }));
          b.rotation.x = Math.PI;
          b.position.set(-0.55 + i * 0.22, 1.88, 0);
          g.add(b);
        }
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.04, 28), basic({ color: 0xfff09a, transparent: true, opacity: 0.45 }));
        glow.position.y = 0.02;
        g.add(glow);
        it.banner = banner;
        break;
      }
      case 'J': {
        const base2 = mesh(S.disc, S.metalDark);
        base2.scale.set(0.8, 1, 0.8);
        base2.position.y = 0.035;
        g.add(base2);
        const coil = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const t = mesh(S.tor, S.metal);
          t.rotation.x = Math.PI / 2;
          t.position.y = 0.12 + i * 0.13;
          coil.add(t);
        }
        const pad = mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.1, 20), S.padRed);
        pad.position.y = 0.5;
        coil.add(pad);
        g.add(coil);
        it.coil = coil;
        break;
      }
      case 'T': {
        const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), S.poleMat);
        post.position.y = 0.5;
        const board = mesh(S.sign, S.signMats);
        board.position.set(0, 0.95, 0.05);
        g.add(post, board);
        break;
      }
      case 'S': {
        const pad = mesh(S.disc, std({ color: 0xe9c46a }));
        pad.position.y = 0.035;
        g.add(pad);
        break;
      }
      default:
        return null;
    }
    return it;
  }

  function makeEnemy() {
    const g = new THREE.Group();
    const felt = std({ map: texFelt('beetle', '#7b4fb5', 'rgba(255,255,255,0.18)') });
    const shell = mesh(new THREE.SphereGeometry(0.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt);
    shell.scale.set(1, 0.75, 0.85);
    shell.position.y = 0.1;
    const spotMat = std({ color: 0xc9a2f0 });
    for (const [x, y, z] of [[-0.1, 0.36, 0.15], [0.12, 0.32, -0.12], [-0.05, 0.3, -0.22]]) {
      const s = mesh(G.sphere, spotMat);
      s.scale.setScalar(0.07);
      s.position.set(x, y, z);
      g.add(s);
    }
    const head = mesh(G.sphere, std({ color: 0x4b2c70 }));
    head.scale.setScalar(0.17);
    head.position.set(0.38, 0.2, 0);
    const eyeW = basic({ color: 0xffffff });
    const eyeB = basic({ color: 0x111111 });
    for (const zz of [-0.08, 0.08]) {
      const e = new THREE.Mesh(G.sphere, eyeW);
      e.scale.setScalar(0.055);
      e.position.set(0.5, 0.26, zz);
      const p = new THREE.Mesh(G.sphere, eyeB);
      p.scale.setScalar(0.028);
      p.position.set(0.545, 0.265, zz);
      g.add(e, p);
    }
    const legs = [];
    const legMat = std({ color: 0x3d2459 });
    for (let i = 0; i < 3; i++) {
      for (const zz of [-0.28, 0.28]) {
        const l = mesh(G.cyl, legMat);
        l.scale.set(0.03, 0.18, 0.03);
        l.position.set(-0.2 + i * 0.2, 0.06, zz);
        l.rotation.x = zz > 0 ? 0.5 : -0.5;
        g.add(l);
        legs.push(l);
      }
    }
    g.add(shell, head);
    g.userData.legs = legs;
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* Spielfiguren (eigene Stoffpuppen)                                    */
  /* ------------------------------------------------------------------ */
  const CHARACTERS = [
    { id: 'knopf', name: 'Knopf', body: '#e8743b', acc: '#3a7bd5', blurb: 'Strickpuppe mit Knopfaugen und Bommelmütze' },
    { id: 'fransi', name: 'Fransi', body: '#8e5fc4', acc: '#f2c14e', blurb: 'Filzpuppe mit Wollzöpfen und Blüte' },
    { id: 'socki', name: 'Socki', body: '#e63946', acc: '#2a9d8f', blurb: 'Ringelsocke mit Zipfelmütze' },
    { id: 'bolzen', name: 'Bolzen', body: '#3d6fa8', acc: '#f4a261', blurb: 'Jeans-Puppe mit Schweißerbrille und Antenne' }
  ];
  R3.CHARACTERS = CHARACTERS;
  FW.CHARACTERS = CHARACTERS;

  function buildDoll(look) {
    shared();
    const ch = CHARACTERS.find((c) => c.id === look.char) || CHARACTERS[0];
    const bodyCol = new THREE.Color(look.body || ch.body);
    const accCol = new THREE.Color(look.hat || ch.acc);
    const stripe = ch.id === 'socki';
    const knit = std({ map: stripe ? texKnit('#' + bodyCol.getHexString()) : texKnit(), color: stripe ? 0xffffff : bodyCol, roughness: 1 });
    if (knit.map) {
      knit.map.repeat.set(3, 2);
    }
    const dark = std({ color: bodyCol.clone().multiplyScalar(0.55), roughness: 1 });
    const acc = std({ map: texKnit(), color: accCol, roughness: 1 });
    const black = std({ color: 0x1b1b1b, roughness: 0.4 });
    const white = std({ color: 0xffffff, roughness: 0.5 });
    const root2 = new THREE.Group();
    const body = new THREE.Group();
    root2.add(body);
    const sph = G.sphere, cyl = G.cyl;

    function limb(x, y, len, r, mat) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const l = mesh(cyl, mat);
      l.scale.set(r, len, r);
      l.position.y = -len / 2;
      const end = mesh(sph, mat);
      end.scale.setScalar(r * 1.25);
      end.position.y = -len;
      pivot.add(l, end);
      body.add(pivot);
      return { pivot, end };
    }
    const legL = limb(-0.11, 0.36, 0.28, 0.085, knit);
    const legR = limb(0.11, 0.36, 0.28, 0.085, knit);
    for (const lg of [legL, legR]) {
      const foot = mesh(sph, dark);
      foot.scale.set(0.11, 0.07, 0.15);
      foot.position.set(0, -0.31, 0.04);
      lg.pivot.add(foot);
    }
    const torso = mesh(sph, knit);
    torso.scale.set(0.27, 0.3, 0.22);
    torso.position.y = 0.56;
    body.add(torso);
    const armL = limb(-0.27, 0.72, 0.28, 0.066, knit);
    const armR = limb(0.27, 0.72, 0.28, 0.066, knit);
    armL.pivot.rotation.z = -0.35;
    armR.pivot.rotation.z = 0.35;
    const head = new THREE.Group();
    head.position.y = 1.04;
    body.add(head);
    const skull = mesh(sph, knit);
    skull.scale.set(0.34, 0.32, 0.31);
    head.add(skull);
    // Naht über den Kopf
    const seam = mesh(new THREE.TorusGeometry(0.325, 0.012, 6, 40, Math.PI), dark, false);
    seam.rotation.y = Math.PI / 2;
    head.add(seam);
    const eyes = [];
    const face = (x, y) => new THREE.Vector3(x, y, 0.29 - Math.abs(x) * 0.35 - Math.abs(y) * 0.2);

    if (ch.id === 'knopf') {
      const eyeMat = std({ color: new THREE.Color(look.eye || '#fdf6e3'), roughness: 0.35 });
      for (const ex of [-0.11, 0.11]) {
        const e = new THREE.Group();
        const disc = mesh(cyl, eyeMat);
        disc.scale.set(0.075, 0.025, 0.075);
        disc.rotation.x = Math.PI / 2;
        const rim = mesh(new THREE.TorusGeometry(0.072, 0.012, 6, 20), black, false);
        e.add(disc, rim);
        for (let i = 0; i < 4; i++) {
          const h = mesh(sph, black, false);
          h.scale.setScalar(0.013);
          h.position.set(i % 2 ? 0.022 : -0.022, i < 2 ? 0.022 : -0.022, 0.014);
          e.add(h);
        }
        e.position.copy(face(ex, 0.04));
        e.rotation.y = ex * 1.2;
        head.add(e);
        eyes.push(e);
      }
      // Bommelmütze
      const cap = mesh(new THREE.SphereGeometry(0.35, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), acc);
      cap.position.y = 0.08;
      cap.scale.set(1, 0.85, 0.98);
      const brim = mesh(new THREE.TorusGeometry(0.33, 0.06, 8, 24), acc);
      brim.rotation.x = Math.PI / 2;
      brim.position.y = 0.09;
      const pom = mesh(sph, white);
      pom.scale.setScalar(0.09);
      pom.position.y = 0.4;
      head.add(cap, brim, pom);
    } else {
      for (const ex of [-0.1, 0.1]) {
        const e = new THREE.Group();
        const ball = mesh(sph, black, false);
        ball.scale.set(0.045, 0.06, 0.03);
        const glint = mesh(sph, white, false);
        glint.scale.setScalar(0.014);
        glint.position.set(0.012, 0.02, 0.025);
        e.add(ball, glint);
        e.position.copy(face(ex, 0.05));
        e.rotation.y = ex * 1.2;
        head.add(e);
        eyes.push(e);
      }
    }
    // Mund: gestickter Bogen
    const mouth = mesh(new THREE.TorusGeometry(0.06, 0.011, 6, 16, Math.PI), black, false);
    mouth.rotation.z = Math.PI;
    mouth.position.copy(face(0, -0.09));
    head.add(mouth);
    const cheekMat = std({ color: 0xff8a8a, transparent: true, opacity: 0.7 });
    for (const cx of [-0.18, 0.18]) {
      const ck = mesh(sph, cheekMat, false);
      ck.scale.set(0.04, 0.025, 0.01);
      ck.position.copy(face(cx, -0.05));
      ck.rotation.y = cx * 1.4;
      head.add(ck);
    }

    if (ch.id === 'fransi') {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const b = mesh(sph, acc);
          b.scale.setScalar(0.075 - i * 0.008);
          b.position.set(side * (0.3 + i * 0.015), 0.05 - i * 0.12, -0.04);
          head.add(b);
        }
        const tie = mesh(sph, std({ color: 0xff5d8f }));
        tie.scale.setScalar(0.04);
        tie.position.set(side * 0.35, -0.4, -0.04);
        head.add(tie);
      }
      const fringe = mesh(new THREE.SphereGeometry(0.345, 20, 8, 0, Math.PI * 2, 0, Math.PI / 3), acc);
      fringe.position.y = 0.02;
      head.add(fringe);
      const petal = std({ color: 0xff5d8f });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = mesh(sph, petal);
        p.scale.setScalar(0.045);
        p.position.set(0.2 + Math.cos(a) * 0.05, 0.25 + Math.sin(a) * 0.05, 0.18);
        head.add(p);
      }
      const ctr = mesh(sph, std({ color: 0xffd166 }));
      ctr.scale.setScalar(0.035);
      ctr.position.set(0.2, 0.25, 0.21);
      head.add(ctr);
    } else if (ch.id === 'socki') {
      const hat = mesh(new THREE.ConeGeometry(0.3, 0.6, 18), std({ map: texKnit('#' + accCol.getHexString()), roughness: 1 }));
      hat.scale.set(1.15, 1.25, 1.15);
      hat.position.set(-0.05, 0.47, 0);
      hat.rotation.z = 0.35;
      const tip = mesh(sph, white);
      tip.scale.setScalar(0.09);
      tip.position.set(-0.3, 0.83, 0);
      const band = mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 24), std({ color: 0xffffff }));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.13;
      head.add(hat, tip, band);
    } else if (ch.id === 'bolzen') {
      const ring = new THREE.TorusGeometry(0.075, 0.022, 8, 20);
      const brass = std({ color: 0xc9a227, metalness: 0.7, roughness: 0.35 });
      const glass = std({ color: 0x9fdcff, transparent: true, opacity: 0.45, roughness: 0.05 });
      for (const ex of [-0.1, 0.1]) {
        const r = mesh(ring, brass, false);
        r.position.copy(face(ex, 0.05));
        r.position.z += 0.02;
        r.rotation.y = ex * 1.2;
        const gl = mesh(sph, glass, false);
        gl.scale.set(0.07, 0.07, 0.02);
        gl.position.copy(r.position);
        gl.rotation.y = ex * 1.2;
        head.add(r, gl);
      }
      const strap = mesh(new THREE.TorusGeometry(0.33, 0.02, 6, 30), dark, false);
      strap.rotation.x = Math.PI / 2;
      strap.position.y = 0.05;
      head.add(strap);
      const ant = mesh(cyl, black);
      ant.scale.set(0.012, 0.22, 0.012);
      ant.position.y = 0.42;
      const knob = mesh(sph, std({ color: new THREE.Color(look.hat || ch.acc), emissive: new THREE.Color(look.hat || ch.acc), emissiveIntensity: 0.4 }));
      knob.scale.setScalar(0.06);
      knob.position.y = 0.55;
      head.add(ant, knob);
      const patch = mesh(new THREE.BoxGeometry(0.16, 0.13, 0.03), acc);
      patch.position.set(0.06, 0.6, 0.2);
      patch.rotation.z = 0.2;
      body.add(patch);
    }

    root2.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return { group: root2, body, head, legL: legL.pivot, legR: legR.pivot, armL: armL.pivot, armR: armR.pivot, eyes };
  }
  R3.buildDoll = buildDoll;

  function poseDoll(d, o, dt) {
    const run = o.run || 0, ph = o.phase || 0;
    const sw = Math.sin(ph) * 0.75 * run;
    let lL = sw, lR = -sw, aL = -sw * 0.8, aR = sw * 0.8, aZ = 0.35;
    if (o.air) {
      lL = 0.5;
      lR = -0.3;
      aZ = 1.1 + (o.vy < 0 ? 0.6 : 0);
      aL = aR = 0;
    }
    if (o.grab) {
      aL = aR = -1.35;
      aZ = 0.15;
    }
    const k = Math.min(1, dt * 14);
    d.legL.rotation.x += (lL - d.legL.rotation.x) * k;
    d.legR.rotation.x += (lR - d.legR.rotation.x) * k;
    d.armL.rotation.x += (aL - d.armL.rotation.x) * k;
    d.armR.rotation.x += (aR - d.armR.rotation.x) * k;
    let zl = -aZ, zr = aZ;
    if (o.wave) zr = 2.4 + Math.sin(o.wave * 10) * 0.4;
    d.armL.rotation.z += (zl - d.armL.rotation.z) * k;
    d.armR.rotation.z += (zr - d.armR.rotation.z) * k;
    const bob = run > 0.1 ? Math.abs(Math.sin(ph)) * 0.04 * run : Math.sin((o.t || 0) * 2.2) * 0.012;
    d.body.position.y = bob;
    d.head.rotation.z = Math.sin((o.t || 0) * 1.3) * 0.05;
    for (const e of d.eyes) e.scale.y = o.blink ? 0.15 : 1;
  }

  /* ------------------------------------------------------------------ */
  /* Level-Aufbau                                                        */
  /* ------------------------------------------------------------------ */
  function buildBackground(L) {
    const ti = L.theme;
    const th = themeOf(ti);
    scene.background = texSky(ti);
    scene.fog = new THREE.Fog(lin(th.sky[1]), 40, 110);
    const bg = new THREE.Group();
    const span = L.w + 80;
    for (const [layer, z, hgt, yOff] of [[0, -26, 14, -2], [1, -16, 9, -3]]) {
      const tex = texHills(ti, layer).clone();
      tex.needsUpdate = true;
      tex.repeat.set(span / 40, 1);
      tex.wrapS = THREE.RepeatWrapping;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(span * 1.6, hgt), basic({ map: tex, transparent: true, depthWrite: false, fog: true }));
      m.position.set(L.w / 2, -L.h + hgt / 2 + yOff + (layer === 0 ? 3 : 0), z);
      bg.add(m);
    }
    // Boden-Teppich weit hinten, damit unten nichts leer wirkt
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 60), basic({ color: new THREE.Color(th.hill[1]) }));
    floor.position.set(L.w / 2, -L.h - 28, -14);
    bg.add(floor);
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: shared().circle, color: lin(th.sun), fog: false, depthWrite: false }));
    sunSprite.scale.set(9, 9, 1);
    sunSprite.position.set(L.w * 0.7, 6, -45);
    bg.add(sunSprite);
    const cloudMat = new THREE.SpriteMaterial({ map: shared().circle, color: lin(ti === 1 ? 0xffd6c8 : 0xffffff), transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < Math.ceil(L.w / 8); i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Sprite(cloudMat);
        s.scale.set(3 + k * 0.4, 2.4, 1);
        s.position.set(k * 1.4, Math.sin(k * 1.7) * 0.5, 0);
        c.add(s);
      }
      c.position.set(i * 9 + hash(i, 3) * 5 - 10, 4 + hash(i, 7) * 6, -30 - hash(i, 9) * 6);
      bg.add(c);
    }
    return bg;
  }

  function addDecor(L, z, group) {
    const th = themeOf(L.theme);
    if (th.snow) return;
    const stem = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5);
    const stemMat = std({ color: new THREE.Color(th.topDark) });
    const petalMats = th.flowers.map((c) => std({ color: new THREE.Color(c) }));
    const ctrMat = std({ color: 0xffcf3f });
    const sph = shared().sphere;
    for (let y = 1; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (!FW.isSolid(L.grid[z][y][x]) || L.grid[z][y][x] !== '#' || L.grid[z][y - 1][x] !== '.') continue;
        const hv = hash(x * 3 + 1, y * 7 + z);
        if (hv < 0.62) continue;
        const f = new THREE.Group();
        const s = mesh(stem, stemMat);
        s.position.y = 0.15;
        f.add(s);
        const pm = petalMats[Math.floor(hash(x + 2, y) * petalMats.length)];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const p = mesh(sph, pm);
          p.scale.set(0.055, 0.055, 0.02);
          p.position.set(Math.cos(a) * 0.06, 0.32 + Math.sin(a) * 0.06, 0);
          f.add(p);
        }
        const c = mesh(sph, ctrMat);
        c.scale.setScalar(0.035);
        c.position.set(0, 0.32, 0.01);
        f.add(c);
        f.position.set(x + 0.2 + hash(x, y + 2) * 0.6, -y, LZ(z) + (hash(x, y + 5) - 0.5) * DEPTH * 0.7);
        f.rotation.y = (hash(x + 9, y) - 0.5) * 0.8;
        group.add(f);
      }
    }
  }

  function buildLevel(W) {
    const L = W.L;
    if (levelGroup) {
      scene.remove(levelGroup);
      disposeGroup(levelGroup);
    }
    levelGroup = new THREE.Group();
    scene.add(levelGroup);
    curL = L;
    curTheme = L.theme;
    shared();
    levelGroup.add(buildBackground(L));
    layerMeshes = [];
    layerMats = [];
    layerFade = [1, 1, 1];
    for (let z = 0; z < C.LAYERS; z++) {
      const mats = makeLayerMaterials(L.theme, z);
      layerMats.push(mats);
      const geo = buildLayerGeometry(L, z);
      if (geo) {
        const m = new THREE.Mesh(geo, mats);
        m.castShadow = true;
        m.receiveShadow = true;
        levelGroup.add(m);
        layerMeshes.push(m);
      } else layerMeshes.push(null);
      addDecor(L, z, levelGroup);
    }
    items = [];
    for (let z = 0; z < C.LAYERS; z++) {
      for (let y = 0; y < L.h; y++) {
        for (let x = 0; x < L.w; x++) {
          const ch = L.grid[z][y][x];
          if ('o*f^CGJTS'.indexOf(ch) < 0) continue;
          const it = makeItem(ch, x, y, z);
          if (it) {
            levelGroup.add(it.obj);
            items.push(it);
          }
        }
      }
    }
    plats = {};
    for (const p of W.plats) {
      const m = mesh(G.plat, G.platMat);
      levelGroup.add(m);
      const track = new THREE.Mesh(new THREE.BoxGeometry(p.kind === 'M' ? C.PLAT_RANGE / T + 2 : 0.06, p.kind === 'V' ? C.PLAT_RANGE / T + 0.4 : 0.06, 0.06), basic({ color: 0x5a4632, transparent: true, opacity: 0.35 }));
      if (p.kind === 'M') track.position.set(p.x0 / T + (C.PLAT_RANGE / T + 2) / 2, -p.y0 / T - 0.2, LZ(p.z) - 0.52);
      else track.position.set(p.x0 / T + 1, -p.y0 / T + C.PLAT_RANGE / T / 2 - 0.2, LZ(p.z) - 0.52);
      levelGroup.add(track);
      plats[p.id] = m;
    }
    boxes = {};
    for (const b of W.boxes) {
      const m = mesh(G.box, G.boxMat);
      levelGroup.add(m);
      boxes[b.id] = m;
    }
    enemies = {};
    for (const e of W.enemies) {
      const m = makeEnemy();
      levelGroup.add(m);
      enemies[e.id] = m;
    }
    dollKey = '';
    cam.inited = false;
  }

  function ensureDoll() {
    const look = FW.Render.look;
    const key = JSON.stringify(look);
    if (doll && key === dollKey && doll.group.parent === scene) return;
    if (doll) scene.remove(doll.group);
    doll = buildDoll(look);
    dollKey = key;
    scene.add(doll.group);
  }

  /* ------------------------------------------------------------------ */
  /* Effekte                                                             */
  /* ------------------------------------------------------------------ */
  const parts = [];
  const textCache = {};
  function textTex(text, color) {
    const k = text + color;
    if (textCache[k]) return textCache[k];
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 44px Fredoka, ui-rounded, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(60,30,10,0.85)';
    g.strokeText(text, 128, 34);
    g.fillStyle = color;
    g.fillText(text, 128, 34);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    textCache[k] = t;
    return t;
  }
  function addPart(p) {
    if (!scene) return;
    if (parts.length > 260) {
      const old = parts.shift();
      scene.remove(old.s);
      old.s.material.dispose();
    }
    const mat = p.text
      ? new THREE.SpriteMaterial({ map: textTex(p.text, p.color), transparent: true, depthTest: false })
      : new THREE.SpriteMaterial({ map: shared().circle, color: lin(p.color), transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat);
    const size = p.text ? 1 : p.size;
    s.scale.set(p.text ? 1.6 : size, p.text ? 0.4 : size, 1);
    s.position.set(p.x, p.y, p.z);
    if (p.text) s.renderOrder = 10;
    scene.add(s);
    p.s = s;
    p.life = p.max;
    parts.push(p);
  }
  const CONF = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ffffff'];
  function burst(x, y, z, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed || 3) * (0.4 + Math.random() * 0.6);
      addPart({
        x, y, z: z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.up || 0), vz: (Math.random() - 0.5) * (o.speed || 3) * 0.5,
        max: (o.life || 0.6) * (0.7 + Math.random() * 0.5),
        color: Array.isArray(o.color) ? o.color[i % o.color.length] : o.color,
        size: o.size || 0.15,
        grav: o.grav || 0
      });
    }
  }

  R3.handleEvent = function (e, W) {
    const P = W.player;
    const wx = (v) => v / T, wy = (v) => -v / T;
    switch (e.type) {
      case 'collect':
        burst(wx(e.x), wy(e.y), LZ(e.z), 8, { color: '#bff0ff', speed: 2.5, life: 0.4, size: 0.12 });
        addPart({ x: wx(e.x), y: wy(e.y) + 0.4, z: LZ(e.z) + 0.3, vx: 0, vy: 1.2, vz: 0, max: 0.8, text: '+' + e.value, color: e.value > 10 ? '#ffd166' : '#ffffff' });
        break;
      case 'prize':
        burst(wx(e.x), wy(e.y), LZ(e.z), 24, { color: ['#ffd166', '#ffffff'], speed: 4, life: 0.8, size: 0.2 });
        addPart({ x: wx(e.x), y: wy(e.y) + 0.6, z: LZ(e.z) + 0.3, vx: 0, vy: 1, vz: 0, max: 1.3, text: 'Preis! +' + e.value, color: '#ffd166' });
        break;
      case 'jump':
        anim.squash = -0.14;
        burst(wx(P.x + P.w / 2), wy(P.y + P.h), LZ(P.z), 4, { color: '#ffffff', speed: 1.2, life: 0.35, size: 0.14 });
        break;
      case 'land':
        anim.squash = Math.min(0.28, e.v / 3200);
        burst(wx(P.x + P.w / 2), wy(P.y + P.h), LZ(P.z), 7, { color: '#ffffff', speed: 1.6, life: 0.4, size: 0.16 });
        break;
      case 'boxland':
        burst(wx(e.x), wy(e.y), LZ(e.z), 7, { color: '#f3e3c8', speed: 1.6, life: 0.4, size: 0.18 });
        break;
      case 'die':
        shakeT = 0.35;
        burst(wx(e.x), wy(e.y), LZ(e.z), 30, { color: [FW.Render.look.body, FW.Render.look.hat, '#ffffff'], speed: 5, life: 1.1, size: 0.2, grav: -7, up: 2 });
        break;
      case 'respawn':
        burst(wx(e.x), wy(e.y), LZ(e.z), 14, { color: '#ffffff', speed: 2, life: 0.5, size: 0.12 });
        break;
      case 'checkpoint':
        burst(wx(e.x), wy(e.y) + 1, LZ(e.z), 30, { color: CONF, speed: 4, life: 1.2, size: 0.13, grav: -8, up: 3 });
        addPart({ x: wx(e.x), y: wy(e.y) + 2, z: LZ(e.z) + 0.3, vx: 0, vy: 0.6, vz: 0, max: 1.4, text: 'Checkpoint!', color: '#9be7a9' });
        break;
      case 'goal':
        burst(wx(e.x), wy(e.y) + 1.5, LZ(e.z), 110, { color: CONF, speed: 7, life: 2.2, size: 0.15, grav: -9, up: 5 });
        break;
      case 'spring':
        springAnim[e.key] = 0.25;
        anim.squash = -0.2;
        break;
      case 'stomp':
        burst(wx(e.x), wy(e.y), LZ(e.z), 14, { color: '#7b4fb5', speed: 3, life: 0.7, size: 0.16, grav: -6 });
        addPart({ x: wx(e.x), y: wy(e.y) + 0.3, z: LZ(e.z) + 0.3, vx: 0, vy: 1.2, vz: 0, max: 0.9, text: '+' + e.value, color: '#ffffff' });
        break;
      case 'layer':
        burst(wx(P.x + P.w / 2), wy(P.y + P.h / 2), LZ(e.z), 10, { color: '#ffffff', speed: 1.5, life: 0.4, size: 0.1 });
        break;
      case 'boxreset':
        burst(wx(e.x), wy(e.y), LZ(e.z), 12, { color: '#ffe8b0', speed: 2, life: 0.5, size: 0.14 });
        break;
    }
  };

  R3.clearFx = function () {
    for (const p of parts) {
      scene.remove(p.s);
      p.s.material.dispose();
    }
    parts.length = 0;
    shakeT = 0;
    anim.squash = 0;
    for (const k in springAnim) delete springAnim[k];
  };

  R3.update = function (dt, W) {
    anim.squash += (0 - anim.squash) * Math.min(1, dt * 12);
    if (W) {
      const P = W.player;
      if (P.grounded) anim.phase += (Math.abs(P.vx) / 32) * dt;
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
        scene.remove(p.s);
        p.s.material.dispose();
        parts.splice(i, 1);
        continue;
      }
      p.vy += (p.grav || 0) * dt;
      if (!p.text) {
        p.vx *= 1 - dt * 2;
        p.vz *= 1 - dt * 2;
      }
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.material.opacity = Math.min(1, (p.life / p.max) * 1.6);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Zeichnen                                                            */
  /* ------------------------------------------------------------------ */
  function setLayerFade(z, target, dt) {
    const f = layerFade[z] + (target - layerFade[z]) * Math.min(1, dt * 8);
    layerFade[z] = Math.abs(f - target) < 0.01 ? target : f;
    const mats = layerMats[z];
    if (!mats) return;
    const transparent = layerFade[z] < 0.999;
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (i === 5) {
        m.opacity = layerFade[z];
        continue;
      }
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.depthWrite = !transparent;
        m.needsUpdate = true;
      }
      m.opacity = layerFade[z];
    }
    if (layerMeshes[z]) layerMeshes[z].castShadow = layerFade[z] > 0.6;
  }

  function viewSize() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const visH = Math.max(8.2, 7.6 / aspect);
    return { visH, visW: visH * aspect, dist: visH / (2 * Math.tan((camera.fov * Math.PI) / 360)) };
  }

  function placeCamera(tx, ty, tz, dt, snap) {
    const v = viewSize();
    const L = curL;
    const hw = v.visW / 2 - 0.5, hh = v.visH / 2;
    let x = tx, y = ty;
    if (L) {
      x = L.w > 2 * hw ? Math.max(hw, Math.min(L.w - hw, x)) : L.w / 2;
      const top = 1.5, bottom = -L.h + hh - 0.6 - (FW.Render.bottomPad || 0) / Math.max(1, window.innerHeight) * v.visH;
      y = Math.max(bottom, Math.min(top - hh + 3, y));
    }
    if (snap || !cam.inited) {
      cam.x = x;
      cam.y = y;
      cam.z = tz;
      cam.inited = true;
    } else {
      const k = Math.min(1, dt * 4.5);
      cam.x += (x - cam.x) * k;
      cam.y += (y - cam.y) * Math.min(1, dt * 3.5);
      cam.z += (tz - cam.z) * k;
    }
    let sx = 0, sy = 0;
    if (shakeT > 0) {
      sx = (Math.random() - 0.5) * 0.3 * shakeT;
      sy = (Math.random() - 0.5) * 0.3 * shakeT;
    }
    camera.position.set(cam.x + sx, cam.y + 3.2 + sy, cam.z + v.dist);
    camera.lookAt(cam.x + sx, cam.y + 0.35 + sy, cam.z - 1.3);
    sun.position.set(cam.x - 7, cam.y + 15, cam.z + 12);
    sun.target.position.set(cam.x, cam.y - 1, -1.3);
  }

  function updateObjects(W, t, dt) {
    for (const it of items) {
      const o = it.obj;
      switch (it.ch) {
        case 'o':
          o.visible = !W.collected[it.key];
          if (o.visible) {
            o.children[0].position.y = 0.5 + Math.sin(t * 3 + it.x * 0.7) * 0.07;
            o.children[1].position.y = o.children[0].position.y + 0.12;
          }
          break;
        case '*':
          o.visible = !W.collected[it.key];
          if (o.visible) {
            it.star.rotation.y = t * 2;
            const b = 0.5 + Math.sin(t * 2 + it.x) * 0.1;
            o.children[0].position.y = b;
            it.star.position.y = b;
          }
          break;
        case 'f':
          for (let i = 0; i < it.flames.length; i++) {
            const f = it.flames[i];
            const s = f.userData.base * (0.8 + 0.3 * Math.sin(t * 11 + i * 1.9 + it.x));
            f.scale.set(f.userData.base, s, f.userData.base);
          }
          break;
        case 'C': {
          const active = W.checkpoint.key === it.key;
          it.flag.material = active ? G.green : G.red;
          it.flag.rotation.y = Math.sin(t * 4 + it.x) * 0.25;
          break;
        }
        case 'G':
          it.banner.position.y = 2.2 + Math.sin(t * 3) * 0.03;
          break;
        case 'J': {
          const k = springAnim[it.key];
          it.coil.scale.y = k ? 1 - Math.sin((k / 0.25) * Math.PI) * 0.45 : 1;
          break;
        }
      }
    }
    for (const p of W.plats) {
      const m = plats[p.id];
      if (m) m.position.set(p.x / T + 1, -p.y / T - 0.2, LZ(p.z));
    }
    const grabId = W.player.grab ? W.player.grab.id : -1;
    for (const b of W.boxes) {
      const m = boxes[b.id];
      if (!m) continue;
      m.position.set(b.x / T + 0.5, -b.y / T - 0.5, LZ(b.z));
      m.scale.setScalar(b.id === grabId ? 1.03 : 1);
    }
    for (const e of W.enemies) {
      const m = enemies[e.id];
      if (!m) continue;
      const vis = e.alive || e.deadT < 0.7;
      m.visible = vis;
      if (!vis) continue;
      m.position.set(e.x / T + e.w / T / 2, -(e.y + e.h) / T, LZ(e.z));
      m.rotation.y = e.vx >= 0 ? -0.35 : Math.PI + 0.35;
      if (!e.alive) {
        m.scale.set(1.2, Math.max(0.2, 0.35 - e.deadT * 0.2), 1.2);
      } else {
        m.scale.set(1, 1, 1);
        m.userData.legs.forEach((l, i) => (l.rotation.z = Math.sin(t * 14 + i * 2) * 0.5));
      }
    }
    // Spielfigur
    ensureDoll();
    const P = W.player;
    doll.group.visible = P.dead <= 0;
    if (P.dead <= 0) {
      const run = P.grounded ? Math.min(1, Math.abs(P.vx) / C.RUN) : 0;
      const target = Math.abs(P.vx) > 20 || P.grab ? P.facing * 1.05 : P.facing * 0.45;
      anim.turn += (target - anim.turn) * Math.min(1, dt * 10);
      doll.group.position.set((P.x + P.w / 2) / T, -(P.y + P.h) / T, LZ(P.zf));
      doll.group.rotation.y = anim.turn;
      let sx = 1, sy = 1;
      if (!P.grounded) {
        sy = 1 + Math.min(Math.abs(P.vy) / 4000, 0.1);
        sx = 1 / sy;
      }
      sy *= 1 - anim.squash;
      sx *= 1 + anim.squash;
      const base = 0.86;
      doll.group.scale.set(base * sx, base * sy, base * sx);
      poseDoll(doll, { run, phase: anim.phase, air: !P.grounded, vy: P.vy, grab: !!P.grab, blink: anim.blink > 0, t, wave: W.finished ? t : 0 }, dt);
    }
  }

  R3.render = function (W, t, dt, opts) {
    if (!renderer) return;
    if (W.L !== curL) buildLevel(W);
    const P = W.player;
    for (let z = 0; z < C.LAYERS; z++) setLayerFade(z, P.dead <= 0 && P.zf > z + 0.05 ? 0.32 : 1, dt || 0.016);
    updateObjects(W, t, dt || 0.016);
    if (opts && opts.demoX !== undefined) {
      placeCamera(opts.demoX, -W.L.h + 6, 0, dt, false);
    } else {
      cam.look += (P.facing * 1.4 - cam.look) * Math.min(1, (dt || 0.016) * 1.5);
      placeCamera((P.x + P.w / 2) / T + cam.look, -(P.y + P.h / 2) / T, LZ(P.zf) * 0.6, dt || 0.016, false);
    }
    renderer.render(scene, camera);
  };

  R3.resetCamera = function (W) {
    if (W.L !== curL) buildLevel(W);
    const P = W.player;
    cam.look = P.facing * 1.4;
    placeCamera((P.x + P.w / 2) / T + cam.look, -(P.y + P.h / 2) / T, LZ(P.zf) * 0.6, 0, true);
  };

  // Vorschau einer Figur in einem eigenen kleinen Canvas (Kostüm-Auswahl)
  R3.createPreview = function (canvas) {
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      return null;
    }
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.NoToneMapping;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a6a4a, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(2, 4, 5);
    sc.add(dl);
    const cm = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cm.position.set(0, 0.75, 3.6);
    cm.lookAt(0, 0.6, 0);
    let d = null, key = '';
    return {
      render(look, t) {
        const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
        if (canvas.width !== Math.round(w * r.getPixelRatio())) r.setSize(w, h, false);
        const k = JSON.stringify(look);
        if (k !== key) {
          if (d) sc.remove(d.group);
          d = buildDoll(look);
          sc.add(d.group);
          key = k;
        }
        d.group.rotation.y = Math.sin(t * 0.8) * 0.6;
        d.group.position.y = Math.abs(Math.sin(t * 3)) * 0.05;
        poseDoll(d, { run: 0.5, phase: t * 7, t, blink: t % 3 < 0.12, wave: (t % 6) < 2 ? t : 0 }, 0.016);
        r.render(sc, cm);
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
