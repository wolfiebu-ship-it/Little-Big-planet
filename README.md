# Craft World 🧶

Ein eigenständiger Bastel-Plattformer im Browser: Pappe, Stoff, Filz und Knöpfe.
Du spielst **Knopf**, ein Wollknäuel mit Knopfaugen und Bommelmütze.

## Auf dem iPad spielen (ohne Mac)

1. In Safari öffnen: **https://wolfiebu-ship-it.github.io/Little-Big-planet/**
2. Teilen-Symbol (□↑) → **„Zum Home-Bildschirm“** → Hinzufügen.
3. Craft World über das neue Icon starten: Vollbild, funktioniert danach auch offline.

Die Seite wird bei jedem Push automatisch neu veröffentlicht (`.github/workflows/pages.yml`).
Einmalig muss GitHub Pages aktiviert sein: Repo → *Settings* → *Pages* → *Source*: **GitHub Actions**.

## iOS-App mit Xcode (optional, braucht einen Mac)

Im Ordner `ios/` liegt eine native SwiftUI-App:

1. Auf einem Mac `ios/CraftWorld.xcodeproj` in **Xcode 15 oder neuer** öffnen.
2. Links das Projekt **CraftWorld** wählen → *Signing & Capabilities* → dein **Team** (Apple-ID) eintragen.
   Falls Xcode meckert, die *Bundle Identifier* auf etwas Eigenes ändern, z. B. `de.deinname.craftworld`.
3. iPhone per Kabel anschließen (oder einen Simulator wählen) und auf ▶ drücken.

Die App zeigt beim Start ein Neon-Logo, läuft komplett offline, speichert Spielstände und eigene Level,
nutzt Haptik (Vibration bei Missgeschicken, Ziel, Federn …) und teilt exportierte Level über das iOS-Teilen-Menü.
Auf dem iPhone läuft sie im Querformat, auf dem iPad in jeder Ausrichtung. Mindestversion: iOS 16.

Die Spieldateien (`index.html`, `css/`, `js/`) werden direkt aus dem Repo ins App-Bundle kopiert.
Änderungen am Spiel landen also automatisch in der App.

## Im Browser starten

Keine Installation nötig. Entweder `index.html` direkt im Browser öffnen oder einen kleinen Server starten:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Funktionen

- **2.5D-Grafik**: echte 3D-Welt mit Licht und Schatten (Three.js), gespielt wird seitlich auf 3 Ebenen
- **4 eigene Stoffpuppen** zur Auswahl: Knopf, Fransi, Socki, Bolzen, jeweils mit eigenen Farben
- **4 Story-Level**: Pappwiesen (Tutorial), Garnfabrik, Knopfgipfel, Nadelschlucht (schwer)
- **3 Tiefenebenen**: Wechsle zwischen vorne, Mitte und hinten. Ebenen vor der Figur werden durchsichtig.
- Kisten **schieben und greifen**, Sprungfedern, bewegliche Plattformen und Aufzüge, Stoffbretter zum Durchspringen
- Feuer, Stacheln und Filzkäfer (die man zertreten kann)
- Punkteperlen mit **Kombo-Multiplikator** bis ×5, versteckte Preisblasen, Checkpoints, 1–3 Sterne, Rekorde
- **Level-Editor** mit 18 Werkzeugen, 3 Ebenen, Rückgängig/Wiederholen, Themen, Größe ändern, Schildern mit eigenem Text, Testen, Speichern sowie Import/Export (Text oder Datei)
- **Kostüm**: Farben für Wolle, Mütze und Knopfaugen
- Tastatur, **Gamepad** und **Touch-Steuerung mit Joystick** (oben/unten wechselt die Ebene)
- **A-cappella-Musik**: künstliche Männer-, Frauen- und Chorstimmen („bam, blim, brum“) plus Mund-Schlagzeug, eigene Komposition, live per WebAudio erzeugt

## Steuerung

| Aktion | Tastatur |
|---|---|
| Laufen | A/D oder ←/→ |
| Springen | Leertaste (länger halten = höher) |
| Ebene nach hinten / vorne | W/↑ bzw. S/↓ |
| Greifen | Shift oder E halten |
| Pause | Esc oder P |

## Tests

```bash
node tools/verify.js
```

Geprüft werden Level-Format, Physik (Springen, Wände, Ebenen, Kisten, Feuer, Federn, Käfer, Punkte, Checkpoints, Ziel, Plattformen). Außerdem spielt ein **Such-Bot** jedes Story-Level mit der echten Engine komplett durch und beweist so, dass jedes Level schaffbar ist.

## Aufbau

| Datei | Inhalt |
|---|---|
| `js/engine.js` | Physik & Spiellogik (ohne DOM, läuft auch in Node) |
| `js/levels.js` | Story-Level |
| `js/render3d.js` | 3D-Welt, Stoffpuppen, Effekte (2.5D) |
| `js/render.js` | HUD, Editor-Ansicht und 2D-Ersatzgrafik, falls kein WebGL |
| `vendor/three.min.js` | Three.js r128 (MIT-Lizenz, siehe `vendor/three.LICENSE`) |
| `js/audio.js` | Synthetisierte Klänge & Musik |
| `js/editor.js` | Level-Editor |
| `js/main.js` | Menüs, Eingabe, Spielschleife, Speichern |
| `ios/` | Native iOS-App (SwiftUI): Neon-Startbildschirm, Spielansicht, Haptik, Teilen |
| `tools/check_xcodeproj.py` | Prüft das Xcode-Projekt auf Syntax- und Verweisfehler |
