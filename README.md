# Fadenwelt 🧶

Ein eigenständiger Bastel-Plattformer im Browser: Pappe, Stoff, Filz und Knöpfe.
Du spielst **Knopf**, ein Wollknäuel mit Knopfaugen und Bommelmütze.

## Starten

Keine Installation nötig. Entweder `index.html` direkt im Browser öffnen oder einen kleinen Server starten:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Funktionen

- **3 Story-Level**: Pappwiesen (Tutorial), Garnfabrik, Knopfgipfel
- **3 Tiefenebenen**: Wechsle zwischen vorne, Mitte und hinten. Ebenen vor der Figur werden durchsichtig.
- Kisten **schieben und greifen**, Sprungfedern, bewegliche Plattformen und Aufzüge, Stoffbretter zum Durchspringen
- Feuer, Stacheln und Filzkäfer (die man zertreten kann)
- Punkteperlen mit **Kombo-Multiplikator** bis ×5, versteckte Preisblasen, Checkpoints, 1–3 Sterne, Rekorde
- **Level-Editor** mit 18 Werkzeugen, 3 Ebenen, Rückgängig/Wiederholen, Themen, Größe ändern, Schildern mit eigenem Text, Testen, Speichern sowie Import/Export (Text oder Datei)
- **Kostüm**: Farben für Wolle, Mütze und Knopfaugen
- Tastatur, **Gamepad** und **Touch-Steuerung**
- Selbst erzeugte Soundeffekte und Musik (WebAudio, keine Dateien)

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
| `js/render.js` | Prozedurale Grafik, Partikel, HUD |
| `js/audio.js` | Synthetisierte Klänge & Musik |
| `js/editor.js` | Level-Editor |
| `js/main.js` | Menüs, Eingabe, Spielschleife, Speichern |
