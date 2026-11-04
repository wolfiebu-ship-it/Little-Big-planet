/*
 * Automatische Prüfung der Fadenwelt.
 *  1. Level-Format & Normalisierung
 *  2. Physik-Grundtests
 *  3. Ein Such-Bot spielt jedes Story-Level mit der echten Engine durch
 *     und beweist so, dass jedes Level schaffbar ist.
 *
 * Aufruf: node tools/verify.js [levelIndex]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Math, Object, Array, JSON, Number, String, isFinite };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['engine.js', 'levels.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const FW = ctx.FW;
const C = FW.C;
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else {
    console.log('  ✗ ' + msg);
    failures++;
  }
}

/* ---------- 1. Format ---------- */
console.log('Level-Format');
for (const lv of FW.LEVELS) {
  const d = lv.data;
  const n = FW.normalizeLevel(JSON.parse(JSON.stringify(d)));
  check(JSON.stringify(n.layers) === JSON.stringify(d.layers), lv.id + ': Normalisierung verlustfrei');
  let s = 0, gl = 0;
  for (const layer of d.layers) for (const row of layer) for (const ch of row) {
    if (ch === 'S') s++;
    if (ch === 'G') gl++;
  }
  check(s === 1 && gl === 1, lv.id + ': genau ein Start und ein Ziel');
  const missing = [];
  d.layers.forEach((layer, z) => layer.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === 'T' && !d.signs[z + ',' + x + ',' + y]) missing.push(z + ',' + x + ',' + y);
  })));
  check(missing.length === 0, lv.id + ': alle Schilder haben Text ' + missing.join(' '));
}
const junk = FW.normalizeLevel({ w: 'x', h: 9999, layers: [['#Q#']], signs: { '0,0,0': 'a', 'bad': 'b' } });
check(junk.w === 60 && junk.h === C.MAX_H && junk.layers[0][0].startsWith('#.#') && Object.keys(junk.signs).length === 0, 'Ungültige Importe werden bereinigt');

/* ---------- 2. Physik ---------- */
console.log('Physik');
function flat(extra) {
  const b = FW.levelBuilder('t', 0, 40, 14);
  b.all((z) => b.ground(z, 0, 39, 11));
  b.set(0, 2, 10, 'S');
  if (extra) extra(b);
  return FW.createWorld(b.build());
}
function run(W, inp, secs) {
  const n = Math.round(secs / C.STEP);
  for (let i = 0; i < n; i++) {
    const a = typeof inp === 'function' ? inp(i) : inp;
    FW.step(W, a, C.STEP);
  }
}
{
  const W = flat();
  run(W, {}, 0.5);
  check(W.player.grounded && Math.abs(W.player.y + C.PH - 440) < 0.01, 'Figur steht auf dem Boden');
  run(W, { right: true }, 1);
  check(W.player.x > 2 * 40 + 200, 'Figur läuft nach rechts');
  let maxH = 0;
  const y0 = W.player.y;
  run(W, (i) => ({ jump: true, jumpP: i === 0 }), 0.8);
  W.events.length = 0;
  const W2 = flat();
  run(W2, {}, 0.3);
  const base = W2.player.y;
  for (let i = 0; i < 120; i++) {
    FW.step(W2, { jump: true, jumpP: i === 0 }, C.STEP);
    maxH = Math.max(maxH, base - W2.player.y);
  }
  check(maxH > 140 && maxH < 150, 'Sprunghöhe ~145px (' + maxH.toFixed(1) + ')');
}
{
  const W = flat((b) => b.fill(0, 6, 8, 6, 10, '#'));
  run(W, { right: true }, 2);
  check(W.player.x + C.PW <= 6 * 40 + 0.01, 'Wände blockieren');
  run(W, { upP: true }, C.STEP);
  check(W.player.z === 1, 'Ebenenwechsel nach hinten möglich');
  run(W, { right: true }, 1);
  check(W.player.x > 6 * 40, 'In Ebene 1 an der Wand vorbei');
}
{
  const W = flat((b) => b.fill(0, 6, 8, 6, 10, '#'));
  run(W, { right: true }, 0.3);
  const x = W.player.x;
  run(W, { upP: true }, C.STEP);
  run(W, { right: true }, 0.2);
  run(W, { downP: true }, C.STEP);
  check(W.player.z === 1 || W.player.x > x, 'Ebenenwechsel in Wand wird verhindert');
}
{
  const W = flat((b) => b.set(0, 5, 10, 'B'));
  run(W, { right: true }, 2);
  const box = W.boxes[0];
  check(box.x > 5 * 40 + 60, 'Kiste lässt sich schieben');
  run(W, {}, 0.5);
  // Greifen und ziehen
  run(W, { grab: true, grabP: true }, C.STEP);
  check(!!W.player.grab, 'Kiste greifen');
  const bx = box.x;
  run(W, { grab: true, left: true }, 1);
  check(box.x < bx - 60 && W.player.grab, 'Kiste ziehen');
  run(W, { left: true }, 0.2);
  check(!W.player.grab, 'Loslassen');
}
{
  const W = flat((b) => b.set(0, 6, 10, 'f'));
  run(W, { right: true }, 0.8);
  check(W.deaths === 1, 'Feuer ist tödlich');
  run(W, {}, 1.5);
  check(W.player.dead <= 0 && Math.abs(W.player.x - (2 * 40 + 7)) < 1, 'Wiederbelebung am Start');
}
{
  const W = flat((b) => {
    b.set(0, 4, 10, 'J');
  });
  let minY = 1e9;
  run(W, (i) => {
    minY = Math.min(minY, W.player.y);
    return { right: i < 25 };
  }, 1.5);
  check(440 - C.PH - minY > 280, 'Sprungfeder schleudert hoch (' + (440 - C.PH - minY).toFixed(0) + 'px)');
}
{
  const W = flat((b) => {
    b.set(0, 8, 10, 'E');
  });
  run(W, { right: true }, 1);
  check(W.deaths === 1, 'Seitlicher Käferkontakt ist tödlich');
  const W2 = flat((b) => {
    b.set(0, 7, 10, 'E');
    b.fill(0, 3, 8, 4, 10, '#');
  });
  run(W2, {}, 0.1);
  W2.player.x = 3 * 40 + 5;
  W2.player.y = 8 * 40 - C.PH;
  W2.enemies[0].x = 5 * 40 + 5;
  W2.enemies[0].vx = 0;
  run(W2, () => ({ right: W2.player.x < 190 }), 1);
  check(!W2.enemies[0].alive && W2.deaths === 0, 'Käfer lässt sich zertreten');
}
{
  const W = flat((b) => {
    b.row(0, 5, 9, 10, 'o');
    b.set(0, 12, 10, '*');
    b.set(0, 14, 10, 'C');
    b.set(0, 20, 10, 'G');
  });
  run(W, { right: true }, 4);
  check(W.bubbles === 5 && W.prizes === 1, 'Perlen und Preis eingesammelt');
  check(W.score === 10 * 5 + 300, 'Punkte korrekt (' + W.score + ')');
  check(W.checkpoint.key === '0,14,10', 'Checkpoint aktiviert');
  check(W.finished, 'Ziel erreicht');
}
{
  const b = FW.levelBuilder('t', 0, 40, 14);
  b.all((z) => b.ground(z, 0, 39, 11));
  b.set(0, 2, 10, 'S').set(0, 4, 9, 'M');
  const W = FW.createWorld(b.build());
  W.player.x = 4 * 40 + 20;
  W.player.y = 9 * 40 - C.PH - 5;
  run(W, {}, 2);
  check(W.player.ground && W.player.ground.t === 'plat' && W.player.x > 4 * 40 + 60, 'Plattform trägt die Figur');
}

/* ---------- 3. Such-Bot ---------- */
const CHUNK = 14; // Schritte pro Aktion (≈0.117 s)
const ACTIONS = [
  { right: 1 }, { left: 1 }, {}, { right: 1, jump: 1 }, { left: 1, jump: 1 }, { jump: 1 }, { up: 1 }, { down: 1 }
];
function applyAction(W, a) {
  for (let i = 0; i < CHUNK; i++) {
    const inp = { left: !!a.left, right: !!a.right, jump: !!a.jump, jumpP: !!a.jump && i === 0, upP: !!a.up && i === 0, downP: !!a.down && i === 0 };
    FW.step(W, inp, C.STEP);
    if (W.player.dead > 0 || W.finished) return;
  }
}
function key(W) {
  const P = W.player;
  let k = Math.round(P.x / 8) + ',' + Math.round(P.y / 8) + ',' + P.z + ',' + (P.grounded ? 1 : 0) + ',' + Math.round(P.vy / 150);
  if (W.plats.length) k += ',' + Math.round(((W.t % C.PLAT_PERIOD) / C.PLAT_PERIOD) * 24) % 24;
  for (const b of W.boxes) k += ',' + Math.round(b.x / 10) + ':' + Math.round(b.y / 10);
  for (const e of W.enemies) k += e.alive ? '1' : '0';
  return k;
}
class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}
// Wegpunkte (Kachel x, Kachel y der Standfläche-1, Ebene). Der Bot spielt
// trotzdem am Stück: jeder Abschnitt startet im echten Zustand des vorherigen.
const WAYPOINTS = {
  l1: [[30, 14], [44, 10], [74, 14]],
  l2: [[14, 8], [42, 8], [47, 16], [57, 15], [60, 12], [84, 12], [97, 16]],
  l3: [[12, 33], [13, 27], [24, 20], [33, 20]]
};

function findGoal(W) {
  let goal = null;
  W.L.raw.forEach((layer, z) => layer.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'G') goal = { x: x * 40 + 20, y: y * 40 + 20 }; })));
  return goal;
}

// Sucht von W0 aus einen Weg zum Wegpunkt (oder zum Ziel, wenn target null ist).
function solveFrom(W0, target, maxNodes) {
  const goal = target ? { x: target[0] * 40 + 20, y: target[1] * 40 + 20 } : findGoal(W0);
  const reached = (W) => target && W.player.grounded && Math.abs(W.player.x + 13 - goal.x) < 40 && Math.floor((W.player.y + C.PH - 1) / 40) === target[1] && (target[2] === undefined || W.player.z === target[2]);
  const h = (W) => Math.abs(W.player.x - goal.x) / 270 + Math.abs(W.player.y - goal.y) / 200;
  const open = new Heap();
  const seen = new Set();
  open.push({ W: W0, f: h(W0), g: 0, path: [] });
  seen.add(key(W0));
  let expanded = 0;
  let best = { h: Infinity };
  while (open.size && expanded < maxNodes) {
    const n = open.pop();
    expanded++;
    const hn = h(n.W);
    if (hn < best.h) best = { h: hn, x: n.W.player.x, y: n.W.player.y, z: n.W.player.z };
    for (let ai = 0; ai < ACTIONS.length; ai++) {
      const a = ACTIONS[ai];
      if ((a.up || a.down) && !n.W.player.grounded) continue;
      const W = FW.cloneWorld(n.W);
      const deaths = W.deaths;
      applyAction(W, a);
      if (W.deaths > deaths || W.player.dead > 0) continue;
      if (W.finished || reached(W)) return { ok: true, path: n.path.concat(ai), expanded, W };
      const k = key(W);
      if (seen.has(k)) continue;
      seen.add(k);
      const g = n.g + 1;
      open.push({ W, f: h(W) * 2.2 + g * 0.117, g, path: n.path.concat(ai) });
    }
  }
  return { ok: false, expanded, best };
}

function solveLevel(lv, maxNodes) {
  let W = FW.createWorld(lv.data);
  for (let i = 0; i < 30; i++) FW.step(W, {}, C.STEP);
  const targets = (WAYPOINTS[lv.id] || []).concat([null]);
  let expanded = 0, steps = 0;
  for (const t of targets) {
    const r = solveFrom(W, t, maxNodes);
    expanded += r.expanded;
    if (!r.ok) return { ok: false, expanded, best: r.best, at: t };
    steps += r.path.length;
    W = r.W;
  }
  return { ok: W.finished, expanded, steps, W };
}

const only = process.argv[2] !== undefined ? +process.argv[2] : null;
console.log('Such-Bot (spielt jedes Level komplett durch)');
FW.LEVELS.forEach((lv, i) => {
  if (only !== null && only !== i) return;
  const t0 = Date.now();
  const r = solveLevel(lv, 200000);
  const secs = r.ok ? (r.steps * CHUNK * C.STEP).toFixed(1) : '-';
  check(r.ok, lv.data.name + ' ist schaffbar (Knoten: ' + r.expanded + ', Spielzeit Bot: ' + secs + 's, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's Rechenzeit)');
  if (r.ok) console.log('   Bot-Ergebnis: ' + r.W.score + ' Punkte, ' + r.W.bubbles + '/' + r.W.totalBubbles + ' Perlen, ' + r.W.deaths + ' Missgeschicke');
  else console.log('   Hängt fest vor Wegpunkt ' + JSON.stringify(r.at) + ', weitester Punkt: Kachel ' + Math.floor((r.best.x + 13) / 40) + ',' + Math.floor((r.best.y + 17) / 40) + ' Ebene ' + r.best.z);
});

console.log(failures ? '\n' + failures + ' Fehler' : '\nAlle Prüfungen bestanden.');
process.exit(failures ? 1 : 0);
