/*
 * Craft World – eingebaute Story-Level.
 * Die Level werden mit einem kleinen Baukasten erzeugt, damit Koordinaten
 * exakt stimmen. Ergebnis ist dasselbe Format, das auch der Editor speichert.
 */
(function (root) {
  'use strict';
  const FW = (root.FW = root.FW || {});

  function builder(name, theme, w, h) {
    const layers = [0, 1, 2].map(() => Array.from({ length: h }, () => new Array(w).fill('.')));
    const signs = {};
    const api = {
      set(z, x, y, ch) {
        if (x >= 0 && x < w && y >= 0 && y < h) layers[z][y][x] = ch;
        return api;
      },
      fill(z, x1, y1, x2, y2, ch) {
        for (let y = Math.max(0, y1); y <= Math.min(h - 1, y2); y++) {
          for (let x = Math.max(0, x1); x <= Math.min(w - 1, x2); x++) layers[z][y][x] = ch;
        }
        return api;
      },
      all(fn) {
        for (let z = 0; z < 3; z++) fn(z);
        return api;
      },
      ground(z, x1, x2, top) {
        return api.fill(z, x1, top, x2, h - 1, '#');
      },
      row(z, x1, x2, y, ch) {
        return api.fill(z, x1, y, x2, y, ch);
      },
      sign(z, x, y, text) {
        api.set(z, x, y, 'T');
        signs[z + ',' + x + ',' + y] = text;
        return api;
      },
      build() {
        return { name, theme, w, h, layers: layers.map((l) => l.map((r) => r.join(''))), signs };
      }
    };
    return api;
  }
  FW.levelBuilder = builder;

  /* ---------------- Level 1: Pappwiesen (Tutorial) ---------------- */
  function level1() {
    const b = builder('Pappwiesen', 0, 112, 18);
    b.all((z) => {
      b.ground(z, 0, 15, 15);
      b.ground(z, 19, 62, 15);
      b.ground(z, 71, 111, 15);
      b.fill(z, 41, 11, 58, 17, '#'); // hohe Kante (nur mit Kiste erreichbar)
    });
    // Hintergrund-Deko in der hinteren Ebene
    b.fill(2, 5, 12, 7, 14, '#');
    b.fill(2, 30, 13, 31, 14, 'H');
    b.fill(2, 78, 12, 80, 14, '#');

    b.set(0, 2, 14, 'S');
    b.sign(0, 4, 14, 'Willkommen in Craft World! Laufe mit A/D oder ←/→ und springe mit der Leertaste.');
    b.row(0, 6, 9, 13, 'o');
    b.fill(0, 11, 13, 12, 14, '#');
    b.row(0, 11, 12, 11, 'o');
    b.sign(0, 14, 14, 'Spring über die Lücke – unten wartet nur der Abgrund!');
    b.set(0, 16, 12, 'o').set(0, 17, 11, 'o').set(0, 18, 12, 'o');

    // Wand: Ebenenwechsel lernen
    b.sign(0, 21, 14, 'Eine Wand! Drück W/↑, um in die hintere Ebene zu gehen. Mit S/↓ kommst du wieder nach vorne.');
    b.fill(0, 24, 9, 25, 14, '#');
    b.fill(2, 24, 9, 25, 14, '#');
    b.row(1, 22, 27, 13, 'o');
    b.set(0, 30, 14, 'C');

    // Kistenrätsel
    b.sign(0, 33, 14, 'Kisten kannst du schieben. Halte Shift/E zum Greifen und Ziehen. Schieb sie an die hohe Kante!');
    b.set(0, 36, 14, 'B');
    b.row(0, 31, 34, 12, 'o');
    b.row(0, 43, 46, 10, 'o');
    b.row(1, 43, 47, 10, 'o');

    // Sprungfeder
    b.sign(0, 48, 10, 'Federn katapultieren dich in die Höhe!');
    b.set(0, 52, 10, 'J');
    b.row(0, 48, 56, 5, '=');
    b.row(0, 49, 51, 4, 'o');
    b.set(0, 54, 4, '*');

    // Bewegliche Plattform über dem Abgrund
    b.sign(0, 60, 14, 'Diese Plattform fährt hin und her. Steig auf und lass dich tragen!');
    b.set(0, 62, 13, 'M');
    b.row(0, 64, 69, 11, 'o');

    b.set(0, 74, 14, 'C');
    b.sign(0, 77, 14, 'Achtung, Filzkäfer! Spring ihnen auf den Kopf.');
    b.row(0, 78, 81, 13, 'o');
    b.set(0, 84, 14, 'E');
    b.sign(0, 87, 14, 'Feuer ist heiß! Spring einfach drüber.');
    b.set(0, 90, 14, 'f').set(0, 91, 14, 'f');
    b.row(0, 89, 92, 11, 'o');

    b.sign(0, 94, 14, 'Ganz hinten glitzert etwas … zweimal W/↑!');
    b.fill(0, 97, 12, 97, 14, 'H');
    b.row(0, 98, 100, 10, 'o');
    b.row(2, 95, 103, 13, 'o');
    b.set(2, 104, 13, '*');
    b.row(0, 104, 106, 13, 'o');
    b.set(0, 47, 10, 'E'); // Käfer auf der hohen Kante
    b.set(0, 101, 14, '^').set(0, 102, 14, '^');
    b.set(0, 99, 14, 'E');
    b.set(0, 108, 14, 'G');
    return b.build();
  }

  /* ---------------- Level 2: Garnfabrik ---------------- */
  function level2() {
    const b = builder('Garnfabrik', 1, 120, 20);
    b.all((z) => {
      b.ground(z, 0, 11, 17);
      b.fill(z, 12, 9, 44, 19, '#'); // obere Etage
      b.ground(z, 45, 70, 17);
      b.fill(z, 58, 13, 70, 19, '#');
      b.ground(z, 71, 81, 17);
      b.row(z, 71, 81, 16, 'f'); // Feuermeer
      b.fill(z, 82, 13, 95, 19, '#');
      b.ground(z, 96, 119, 17);
      b.row(z, 99, 108, 16, '^'); // Stachelfeld
    });
    // Holz-Deko
    b.fill(0, 12, 9, 12, 16, 'H');
    b.fill(1, 2, 13, 3, 16, 'H');
    b.fill(2, 5, 11, 8, 16, 'H');

    b.set(0, 2, 16, 'S');
    b.sign(0, 4, 16, 'Willkommen in der Garnfabrik – hier ist alles in Bewegung!');
    b.sign(0, 7, 16, 'Der Aufzug fährt nach oben. Spring rauf und dann auf die Etage!');
    b.set(0, 9, 15, 'V');
    b.row(0, 5, 8, 15, 'o');
    b.fill(0, 10, 10, 11, 10, 'o');

    b.row(0, 14, 19, 7, 'o');
    b.set(0, 18, 8, 'E');
    b.set(0, 20, 8, '^');
    b.sign(0, 21, 8, 'Feuer! Spring drüber – oder weich in die hintere Ebene aus.');
    b.fill(0, 24, 8, 26, 8, 'f');
    b.row(0, 24, 26, 5, 'o');
    b.row(1, 23, 27, 8, 'o');
    b.set(0, 30, 8, 'E');
    b.sign(0, 31, 8, 'Diese Wand reicht weit nach hinten. Geh ganz nach hinten: zweimal W/↑!');
    b.fill(0, 33, 0, 35, 8, 'H');
    b.fill(1, 33, 0, 35, 8, 'H');
    b.row(2, 32, 42, 7, 'o');
    b.set(2, 40, 8, 'E');
    b.set(0, 41, 8, 'C');

    b.sign(0, 46, 16, 'Schieb die Kiste an die Kante, um hochzuklettern.');
    b.set(0, 49, 16, 'B');
    b.row(0, 51, 55, 15, 'o');
    b.set(0, 60, 12, 'C');
    // optionale Kiste für den Preis
    b.set(0, 62, 12, 'B');
    b.row(0, 64, 67, 9, '=');
    b.set(0, 65, 8, '*');
    b.set(0, 66, 8, 'o').set(0, 64, 8, 'o');

    b.sign(0, 68, 12, 'Spring von Plattform zu Plattform – nicht ins Feuer fallen!');
    b.set(0, 71, 12, 'M');
    b.set(0, 75, 12, 'M');
    b.row(0, 72, 80, 9, 'o');

    b.set(0, 84, 12, 'C');
    b.set(0, 86, 12, '^');
    b.set(0, 91, 12, '^');
    b.set(0, 89, 12, 'E');
    b.set(0, 93, 12, 'E');
    b.row(0, 87, 94, 10, 'o');

    b.set(0, 97, 16, 'C');
    b.sign(0, 96, 16, 'Stacheln! Hüpf über die Stoffbretter.');
    b.row(0, 100, 101, 14, '=');
    b.row(0, 104, 104, 13, '=');
    b.row(0, 108, 109, 14, '=');
    b.row(0, 100, 101, 12, 'o');
    b.row(0, 104, 104, 11, 'o');
    b.row(0, 108, 109, 12, 'o');
    b.row(2, 110, 114, 16, 'o');
    b.set(2, 113, 15, '*');
    b.set(0, 116, 16, 'G');
    return b.build();
  }

  /* ---------------- Level 3: Knopfgipfel ---------------- */
  function level3() {
    const b = builder('Knopfgipfel', 2, 60, 44);
    b.all((z) => {
      b.ground(z, 0, 59, 41);
      b.row(z, 21, 35, 21, 'H'); // mittlere Etage
      b.row(z, 18, 29, 5, 'H'); // Gipfel
    });
    b.set(0, 2, 40, 'S');
    b.sign(0, 4, 40, 'Der Gipfel ruft! Lauf über die Feder und lass dich hochschleudern.');
    b.set(0, 8, 40, 'J');
    b.row(0, 20, 30, 40, '^');
    b.row(0, 20, 30, 37, 'o');
    b.set(0, 36, 40, 'E');
    b.row(0, 6, 13, 34, '=');
    b.row(0, 9, 12, 33, 'o');
    b.row(0, 15, 17, 31, '=');
    b.set(0, 12, 33, '^');
    b.row(0, 15, 18, 30, 'o');
    b.row(0, 12, 15, 28, '=');
    b.row(0, 12, 14, 27, 'o');
    b.sign(0, 13, 27, 'Warte, bis der Aufzug oben ist, und spring dann auf die Etage.');
    b.set(0, 18, 27, 'V');
    b.row(0, 18, 19, 21, 'o');

    b.sign(0, 23, 20, 'Die Wand steht nur vorne – geh nach hinten (W/↑)!');
    b.fill(0, 29, 15, 30, 20, '#');
    b.set(1, 33, 20, 'E');
    b.row(1, 26, 32, 20, 'o');
    b.set(1, 28, 17, '*');
    b.fill(2, 26, 17, 28, 20, '#');
    b.set(0, 33, 20, 'C');
    b.row(0, 36, 38, 18, '=');
    b.row(0, 40, 42, 15, '=');
    b.set(0, 41, 14, 'J');
    b.row(0, 36, 38, 17, 'o');
    b.row(0, 41, 41, 10, 'o');
    b.row(0, 36, 46, 8, '=');
    b.set(0, 43, 7, 'E');
    b.set(0, 38, 7, '^');
    b.set(0, 46, 7, '*');
    b.row(0, 37, 40, 7, 'o');
    b.row(0, 30, 35, 5, '=');
    b.row(0, 30, 35, 4, 'o');
    b.set(0, 29, 4, 'C');
    b.row(2, 19, 27, 4, 'o');
    b.set(2, 25, 3, '*');
    b.set(0, 21, 4, 'G');
    return b.build();
  }

  /* ---------------- Level 4: Nadelschlucht (schwer) ---------------- */
  function level4() {
    const b = builder('Nadelschlucht', 1, 100, 20);
    b.all((z) => {
      b.ground(z, 0, 8, 17);
      b.ground(z, 9, 20, 17);
      b.row(z, 9, 20, 16, '^');
      b.ground(z, 44, 55, 17);
      b.row(z, 44, 55, 16, '^');
      b.fill(z, 56, 10, 70, 19, '#');
      b.ground(z, 71, 99, 17);
      b.row(z, 78, 99, 16, '^');
      b.row(z, 85, 99, 9, 'H');
    });
    b.ground(0, 21, 43, 17);
    b.ground(1, 21, 43, 17);
    b.ground(2, 21, 33, 17);
    b.ground(2, 41, 43, 17);
    // Säulen über den Stacheln
    b.all((z) => {
      b.fill(z, 11, 14, 11, 16, 'H');
      b.fill(z, 14, 13, 14, 16, 'H');
      b.fill(z, 17, 14, 17, 16, 'H');
      b.fill(z, 51, 13, 51, 16, 'H');
    });
    b.set(0, 2, 16, 'S');
    b.sign(0, 4, 16, 'Profi-Level! Hier zählt jeder Sprung. Viel Glück!');
    b.set(0, 11, 12, 'o').set(0, 14, 11, 'o').set(0, 17, 12, 'o');
    b.set(0, 14, 9, '*');
    b.set(0, 22, 16, 'C');
    b.set(0, 26, 16, 'E');
    b.set(0, 29, 16, 'f');
    b.set(0, 32, 16, 'E');
    b.row(0, 25, 33, 13, 'o');
    b.set(2, 27, 16, '*');
    b.row(2, 23, 31, 15, 'o');
    // Ebenen-Rätsel: vorne Wand, mitte Stacheln, hinten Abgrund
    b.sign(0, 34, 16, 'Vorne eine Wand, hinten ein Loch – nimm die Mitte und spring!');
    b.fill(0, 36, 6, 37, 16, 'H');
    b.set(1, 36, 16, '^').set(1, 37, 16, '^');
    b.row(1, 35, 38, 13, 'o');
    b.set(0, 40, 16, 'C');
    // Fahrt über das Stachelbett
    b.set(0, 43, 14, 'M');
    b.row(0, 45, 49, 12, 'o');
    b.set(0, 53, 15, 'V');
    b.row(0, 53, 54, 9, 'o');
    b.set(0, 57, 9, 'C');
    b.set(0, 61, 9, 'E');
    b.set(0, 63, 9, '^');
    b.set(0, 67, 9, 'E');
    b.row(0, 59, 69, 7, 'o');
    b.set(1, 68, 9, '*');
    // Feder zum Ziel
    b.sign(0, 72, 16, 'Die Feder bringt dich nach oben. Unten warten nur Nadeln!');
    b.set(0, 74, 16, 'J');
    b.row(0, 76, 84, 9, '=');
    b.set(0, 80, 8, 'E');
    b.row(0, 77, 83, 6, 'o');
    b.row(0, 86, 92, 7, 'o');
    b.set(0, 96, 8, 'G');
    return b.build();
  }

  FW.LEVELS = [
    { id: 'l1', blurb: 'Lerne laufen, springen, Ebenen wechseln und Kisten schieben.', data: level1() },
    { id: 'l2', blurb: 'Aufzüge, Feuer und Käfer in einer verrückten Fabrik.', data: level2() },
    { id: 'l3', blurb: 'Ein hoher Kletterberg mit Federn und Plattformen.', data: level3() },
    { id: 'l4', blurb: 'Schwer! Säulensprünge über Nadeln, Ebenen-Rätsel und Fahrten über das Stachelbett.', data: level4() }
  ];

  // Leeres Level für den Editor
  FW.blankLevel = function (name) {
    const b = builder(name || 'Mein Level', 0, 60, 18);
    b.all((z) => b.ground(z, 0, 59, 15));
    b.set(0, 2, 14, 'S');
    b.set(0, 56, 14, 'G');
    return b.build();
  };
})(typeof window !== 'undefined' ? window : globalThis);
