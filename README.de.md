🇩🇪 Deutsch (diese Datei) · 🇬🇧 [English](README.md)

# Parametric Pedal Board — STEP edition

Dieser Fork ergänzt STEP-Export für Einzelteile, eine eingebettete Baugruppe und ein Mehrkörperteil. Die Konstruktionslogik bleibt erhalten. Start: `start-step.bat` mit Python 3.12. Siehe [STEP-Anleitung und SolidWorks-Import](STEP.md). Der ursprüngliche Live-Konfigurator enthält diesen lokalen STEP-Export nicht.

**[▶ Live-Konfigurator öffnen](https://maxxs78.github.io/ParametricPedalBoard/?lang=de)** · [🇬🇧 in English](https://maxxs78.github.io/ParametricPedalBoard/?lang=en)

Browserbasierter Generator für 3D-druckbare Gitarren-Pedalboards im Stil von Rockboard, ModBoard und Co. Du stellst die Maße ein und prüfst live, ob alle Teile aufs Druckbett passen. Danach exportierst du die STL-Dateien samt Stückliste.

## Starten

ES-Module und WebAssembly laufen nicht über `file://`. Deshalb braucht der Konfigurator einen kleinen lokalen Webserver:

```bat
start.bat
```

Alternativ `python -m http.server 8123` im Projektordner ausführen und dann http://localhost:8123 öffnen. Three.js und JSZip kommen aus dem CDN. Der Geometrie-Kern (manifold-3d) liegt lokal in `lib/`.

## Wie solche Boards aufgebaut sind

| Vorbild | Aufbau | Übernommene Features |
|---|---|---|
| Rockboard (kommerziell) | Alu-Rahmen, geneigt, Querstreben mit Lücken | Neigung, Kabellücken zwischen den Schienen, Netzteil unter dem Board, Gummifüße, Klettband |
| ModBoard Lite/Ultra (Hardwire Design) | 20er-Nutprofile als Schienen, gedruckte Seitenteile | Variante B: Profile 2020/2040/3030/4040, Befestigung über Kernbohrung und Nutensteine |
| Modular Pedalboard (Erasing), FunkyCN u. a. | vollständig gedruckt, modular aus Segmenten | Variante A: Schienen werden an Zwischenstützen gestoßen, damit jedes Segment aufs Bett passt |

## Aufbau des generierten Boards

- **Endkappen links/rechts**: Keilförmige Seitenteile mit Taschen, in denen die Schienen stecken. Verschraubt wird von außen durch eine Senkung, bei Alu in die Kernbohrung (Gewinde schneiden).
- **Stützen**: Zwischenfüße, sobald die Spannweite überschritten ist oder die Schienen zu lang für das Bett wären. Die Schienen werden von unten verschraubt, bei Alu über Nutensteine in der unteren Nut. Das Feld für das Netzteil wird bei Bedarf automatisch verbreitert.
- **Stufen (optional, 2–3, nur Bauart A/B)**: Das Board bekommt ein Treppenprofil statt einer einzelnen Neigung. Stufe 1 verhält sich wie ein normales Board (Höhe vorne/hinten, Tiefe); jede weitere Stufe ist ein eigener flacher Keil mit eigener Tiefe, eigenem Absatz (Höhensprung) und eigener Vorder-/Rückhöhe, und beginnt automatisch genau auf der Absatzoberkante der vorherigen Stufe. Auf jeder Stufe müssen mindestens 2 Schienen Platz finden, sonst meldet die Prüfung einen Fehler.
  - Endkappen und Stützen bekommen dasselbe treppenförmige Profil; Schienen jeder Stufe werden in dieselben Teile eingesetzt wie bisher.
  - Das Netzteil kann auf einer beliebigen Stufe sitzen (Parameter „Stufe“).
  - **Noch nicht möglich bei mehreren Stufen**: Bauart C (Druckplatte), Leichtbau-Fenster, Streben, Biegung, PedalClips. Diese werden bei aktivierten Stufen automatisch ignoriert bzw. Bauart C ist gesperrt.
- **Biegung (optional, nur Bauart A/C)**: Das Board knickt an jeder Stütze um denselben Winkel ab – symmetrisch um die Board-Mitte, konkav zum Musiker. Die Vorderkante (dem Musiker zugewandt) bleibt dabei nahezu auf einer Linie, die Rückwand-Seite fächert nach hinten auf; es entsteht ein flacher Kreisbogen, wie er vor dem Musiker auf dem Boden liegt.
  - Nur bei durchgehend gedruckten Schienen bzw. Platten-Rippen möglich; ein durchgehendes Alu-Profil (Bauart B) kann sich nicht biegen.
  - Die **Stützen werden zum Keil** (wie eine Gehrung): Beide Stützen-Hälften sind je um den halben Winkel gegeneinander gedreht und zu einem Vollkörper vereinigt. Jede Außenfläche steht so samt Schwalbenschwanz-Tasche, Schrauben und Bohrungen rechtwinklig zu den Schienen ihres Feldes. Nach vorne bleibt die Stütze so dick wie eingestellt, nach hinten wird sie dicker. Gedruckt wird sie auf einer Keilfläche liegend.
  - Konkav (positiver Winkel) sind bis zu 20° je Stütze möglich. Konvex (negativer Winkel) wird die Stütze nach hinten dünner; dann begrenzt der Generator den Winkel, damit sich die Taschen der hintersten Schiene nicht berühren (mehr geht mit einer dickeren Stütze).
  - Schienen, Platten, Streben, Netzteilhalter und Endkappen bleiben dieselben Druckteile wie ungebogen. Die technische Zeichnung zeigt das gebogene Board in allen drei Ansichten (als Schattenrisse der tatsächlichen Teile, mit Biegewinkel im Titel der Draufsicht und einem Hinweis über dem Schriftfeld); Teilemaße, Schienenlänge und Stücklisten bleiben abgewickelt.
- **Leichtbau-Fenster (optional)**: Aussparungen in Endkappen und Stützen, mit verrundeten Ecken.
  - Randabstand und Stegbreite sind einzeln einstellbar. Die Fenster reichen dadurch bis dicht an die Außenkante, auch in den vorderen (niedrigen) Bereich der Endkappen.
  - Um die Schienentaschen, Strebentaschen, Gummifüße und Rückwand-Schrauben bleibt automatisch die volle Wandstärke stehen, senkrechte Pfosten stützen jede Schiene, breite Felder bekommen eine diagonale Rippe, und jedes große, noch annähernd rechteckige Fenster wird zusätzlich durch eine Diagonalstrebe (unten hinten → oben vorne) ausgesteift – die Teile bleiben so trotz weniger Material stabil.
- **Schienen**: immer schwarz dargestellt.
  - A: gedrucktes U-Profil, Druck mit der Oberseite nach unten. Optional mit **Schwalbenschwanz** (Flankenwinkel einstellbar):
    - Die Schienenenden haben Zapfen, die sich nach innen aufweiten. Sie werden von oben in passende Taschen der Endkappen und Stützen gesetzt und von unten verschraubt.
    - In den Stützen ist die Tasche doppelt, eine Hälfte für jedes angrenzende Schienenstück.
  - B: Nutprofil 2020/2040/3030/4040, schwarz eloxiert.
  - C: **geschlitzte Druckplatte** nach Art der Rockboard-Oberfläche.
    - Unter der Platte laufen Rippen. Das sind die gedruckten Schienen aus A mit ihren Schwalbenschwanz-Zapfen.
    - Zwischen den Rippen liegen Stege (Plattendicke einstellbar) mit je einer Reihe verrundeter Kabelschlitze, von Reihe zu Reihe versetzt.
    - Die Platte wird je Feld und bei Bedarf quer zur Neigung in Streifen geteilt, passend zum Druckbett.
    - Benachbarte Streifen greifen mit Puzzle-Schwalbenschwänzen ineinander. Dieser Stoßsteg hat keine Schlitze.
- **Mehrteilige Seitenteile werden verschraubt**:
  - Große Schwalbenschwänze (bis 32 mm hoch, 13 mm tief) richten die Stücke aus.
  - Eine gedruckte Verbindungslasche sitzt versenkt auf der Innenseite und wird mit Linsenkopfschrauben M4 (ISO 7380) verschraubt.
  - Die Muttern liegen in Sechskant-Taschen auf der Außenseite.
- **Streben (optional, 1–2 Stück)**: Sie laufen längs unter dem Board, stecken von unten in Taschen der Endkappen und Stützen und werden von unten verschraubt.
  - A: gedruckte Flachstäbe (Breite und Höhe einstellbar), je Feld ein Stück mit Senkung für den Schraubenkopf.
  - B: handelsüblicher Alu-Flachstab 20×5 mm mit Senkkopfschrauben. Die Bohrpositionen stehen in der Stückliste.
  - Die Position wird automatisch gewählt. Dabei weichen die Streben aus: Netzteilen, Gummifüßen, den Schraubzugängen der Stützen und den Verbindungslaschen.
- **Rückwand (optional)**:
  - Platte über die ganze Breite, von hinten an Endkappen und Stützen geschraubt.
  - Hinter jeder Netzteilbox gibt es eine großzügige Aussparung mit verrundeten Ecken für die Anschlüsse.
  - Geteilt wird **nur hinter den Stützen**, wo jedes Teil verschraubt ist. Die Feldbreite wird so gewählt, dass jedes Rückwandteil aufs Bett passt.
  - **Schriftzug (optional)**:
    - Bis zu 3 Zeilen in wählbarer Schriftart: Metal Mania, New Rocker, Pirata One, UnifrakturMaguntia, Black Ops One, Creepster, Bebas Neue, Russo One, Bungee, Orbitron oder Permanent Marker.
    - Versenkt oder erhaben, Tiefe/Höhe einstellbar.
    - Der Schriftzug sitzt im breitesten freien Bereich neben Aussparungen und Schrauben und wird bei Bedarf verkleinert.
    - „Farbig hervorheben“ erzeugt die Schrift als eigenen Körper. Im 3MF ist sie ein Teil desselben Objekts mit eigener Farbe, beim STL-Export eine eigene Datei.
    - Versenkte Schrift wird auf der Druckbett-Seite gedruckt, erhabene Schrift oben (dann geht auch ein Filamentwechsel).
- **Netzteil / Batteriebox** (1–4 Stück, jedes in einem eigenen Feld), wahlweise als
  - **Box**: zwei Hälften aus Seitenwange, Vorderwand, Boden mit Lüftungsschlitzen und Deckplatte.
  - **Haltebügel**: zwei Wangen mit Auflage, Vorderlippe und Deckplatte.

  Für beide Varianten gilt:
  - Die Box sitzt so weit hinten, dass ihre offene Rückseite 2 mm vor der Rückwandebene endet (einstellbar), auch ohne Rückwand.
  - Die **Rückseite ist komplett offen** für die Anschlüsse. Das Netzteil wird von hinten eingeschoben und mit einem Klettkabelbinder gesichert.
  - Wandstärke einstellbar (Standard 5 mm), Deckplatte 8 mm. Die Schraubenköpfe liegen versenkt, damit das Netzteil flach anliegt.
  - **Schrauben immer erreichbar:** Jede Befestigungsschraube hat in ihrer Achse eine Öffnung im Boden der Box (Ø 9,5 mm), sodass ein Schraubendreher sie von unten erreicht, bevor das Netzteil eingeschoben wird.
  - **Einteilig oder zwei Hälften:** Standardmäßig wird die Box in zwei Hälften gedruckt. „Einteilig drucken“ macht daraus ein Teil – es liegt auf einer Seitenwand, die andere Seitenwand überbrückt den Innenraum ohne Stützen. Das wird nur bis 44 mm Netzteilhöhe und bei passender Druckbettgröße angeboten (sonst fällt die App auf zwei Hälften zurück und nennt den Grund).
  - Gedruckt wird auf der Seitenwange liegend, alle Wände stehen senkrecht. Stützmaterial ist nicht nötig.
- **PedalClips (optional, beliebig viele)**: Schnellhalter für je ein Pedal, bestehend aus zwei Druckteilen:
  - **Grundplatte** in Gehäusegröße (Mini, 1590A, 1590B, 125B, Boss Kompakt, 1590BB, 1590DD oder eigene Maße), wahlweise quer. Das Pedal wird mit Klettband (Hakenseite) oder Dual Lock aufgeklebt.
  - **Clip-Einsatz**, von oben mit Senkkopfschrauben 4×12 in eine Tasche der Grundplatte geschraubt. Er ist ein flach liegend gedrucktes Profil; Federzungen und Riegel biegen sich dadurch in der Schichtebene.
  - Der Einsatz greift bei A/B in die Kabellücke zwischen zwei Schienen (hält unter der Schienen-Unterkante), bei C in einen Kabelschlitz (hält unter dem Plattensteg). Seine Maße passen sich automatisch an Lückenbreite, Schienenhöhe bzw. Plattendicke an.
  - Zwei Mechanismen zur Auswahl:
    - **Federclip**: zwei hochstehende Federzungen mit Rastnase. Pedal aufsetzen und andrücken, bis es einrastet; zum Abnehmen kräftig abziehen.
    - **Bajonett**: quadratischer Hals mit Querriegel. Pedal quer halten, Riegel längs in die Öffnung stecken und um 90° drehen. Rastnocken fallen in den Hohlraum der gedruckten Schiene bzw. in die untere Nut des Alu-Profils.
  - **Platzieren**: Clip im 3D-Modell (oder in der Liste mit „Platzieren“) anklicken. Alle möglichen Positionen werden grün markiert, ein Klick setzt den Clip dort ab (Raster 5 mm, Esc bricht ab). Nicht platzierte Clips liegen vor dem Board.
  - Ausgeschlossen werden Öffnungen, unter denen ein Netzteil, eine Strebe oder zu wenig Bodenfreiheit ist. Überlappende Clips, Clips über der Board-Kante und (beim gebogenen Board) über einer Knickstelle meldet die Prüfung.
- **Normteile im 3D-Modell**: Schrauben, Muttern und Nutensteine werden dargestellt. Sie lassen sich ein- und ausblenden und bewegen sich in der Explosionsansicht mit.

## Filamentverbrauch und Materialwahl

Der Tab „Druckteile“ zeigt je Teil eine geschätzte Filamentmenge (in Gramm, PETG) sowie die Summe für alle Platten (in kg). Die Schätzung rechnet über die tatsächliche Bauteiloberfläche (3 Wandschleifen ≈ 1,2 mm bei einer 0,4-mm-Düse) plus 30 % Infill für den verbleibenden Kern – realistischer als ein pauschaler Faktor aufs Volumen, weil dünnwandige Teile (Schienen, Fenster-Stege) sonst überschätzt würden. Reale Werte hängen vom Slicer-Profil ab (±15–20 % sind normal).

Die Tabelle rechnet mit PETG (1,27 g/cm³); zum Umrechnen auf ein anderes Filament die Dichte ins Verhältnis setzen:

| Material | Dichte | Einsatzbereich | Temperatur |
|---|---|---|---|
| PLA | 1,24 g/cm³ | nur innen (Zuhause, Proberaum); am einfachsten zu drucken, am steifsten, aber am sprödesten | erweicht ab ca. 55–60 °C |
| PETG (empfohlen) | 1,27 g/cm³ | Transport/Bühne, feuchtigkeitsunempfindlich; keine stundenlange pralle Sonne (z. B. Autofenster) | kurzzeitig bis ca. 70–75 °C, dauerhaft eher 60 °C |
| ASA | 1,05 g/cm³ | Open-Air, Auto, Balkon – UV- und witterungsbeständig, verfärbt kaum; braucht beheiztes Bett und möglichst ein geschlossenes Druckergehäuse | dauerhaft ca. 90–100 °C |

## Technische Zeichnung

Der Tab „Zeichnung“ erzeugt ein A3-Blatt nach Projektionsmethode 1 mit folgendem Inhalt:
- Vorderansicht, Seitenansicht von links und Draufsicht mit Hauptmaßen, Stützenabständen, Neigungswinkel und Schienenteilung
- verdeckte Taschen, Teilungsfugen, Verbindungslaschen und Netzteil
- Schnitt durch die Schiene (Bauart C: durch die Platte, quer zu Rippen und Kabelschlitzen)
- Stücklisten für Druckteile und Zukaufteile
- Schriftfeld mit Maßstab

Export als SVG oder über „Drucken / als PDF“. Die ZIP-Datei enthält die Zeichnung ebenfalls.

## Darstellung

- **Farbschemata:** Hellfire, Toxic, High Voltage, Purple Haze, Cyber, Punk, Chrome & Blut, Goldtop und Stealth.
- **Eigene Farben:** Jede Farbe ist einzeln einstellbar: Druckteile, Schienen/Profile/Platte, Streben, Rückwand, Schriftzug, Normteile und Netzteil.
- **Transparent-Modus:** Die Deckkraft ist einstellbar. Schrauben, Muttern und Nutensteine bleiben deckend und sind so im Inneren sichtbar.
- **Sprache:** Deutsch und Englisch. Die App folgt der Browsersprache (Englisch, außer bei Deutsch); der Umschalter DE | EN oben im Seitenbereich überschreibt das, und `?lang=de` / `?lang=en` in der URL wählt die Sprache direkt. Teilenamen, Prüfungen, Stückliste, Zeichnung und die Namen der 3MF-/ZIP-Dateien folgen der gewählten Sprache.
- **Speicherung:** Die Einstellungen bleiben im Browser gespeichert.

## Druckplatten und 3MF

Der Tab „Druckplatten“ verteilt alle Druckteile automatisch auf Platten in der eingestellten Bettgröße, gedreht wo es Platz spart. In der 3D-Ansicht siehst du alle Platten im Raster oder eine einzelne.

**„Alle Platten als eine 3MF“** schreibt alle Platten in **eine einzige .3mf-Datei** (kein ZIP). Einzelne Platten lassen sich genauso exportieren; das Gesamt-ZIP enthält die Datei ebenfalls.
- **OrcaSlicer und Bambu Studio** (und deren Ableger) übernehmen die Plattenaufteilung, Plattennamen („Platte 3: Endkappe, Stütze“) und je Platte ein Vorschaubild (Schräg- und Draufsicht). Die farbig hervorgehobene Schrift-Einlage ist dort als eigenes Teil Filament 2 zugeordnet.
- Die Plattendaten stehen in `Metadata/model_settings.config`, die Teile im Plattenraster dieser Slicer (Spalten = ⌈√n⌉, 20 % Abstand). Damit sie ausgewertet werden, trägt die Datei die Kennung „BambuStudio-02.00.00.00“ im Kopf.
- **Wichtig:** Diese Slicer ordnen die Teile beim Öffnen anhand ihrer Position den Platten zu und rastern die Platten mit dem Bett des *im Slicer gewählten* Druckers. Ist das größer als das Bett im Konfigurator (z. B. 250 statt 220 mm), unter „Drucker-Bauraum“ → „Bett im Slicer X/Y“ die Druckerbett-Größe eintragen; die Belegung wird dann mittig auf die größeren Platten gesetzt. Sonst liegen die Teile gegenüber den Platten verschoben.
- **„Einzeln als ZIP“** liefert je Platte eine eigene 3MF (Platte im Ursprung) für Slicer ohne Plattenverwaltung, z. B. PrusaSlicer oder Cura. Diese zeigen die gemeinsame Datei sonst als alle Teile nebeneinander.

## Dateien

```
index.html          Oberfläche
js/app.js           UI, 3D-Vorschau (three.js), STL/ZIP-Export
js/pedalboard.js    Parametrische Geometrie (manifold-3d CSG), Normteile, Prüfungen, Stückliste
js/drawing.js       Technische Zeichnung (SVG, A3)
js/i18n.js          Übersetzungshilfe (t, tn, Zahlenformate)
js/lang/de.js, en.js  Texte je Sprache (geprüft mit `node tools/check-i18n.mjs`)
lib/manifold.*      manifold-3d 3.5.3 (Apache-2.0)
```

Die Geometrie lässt sich auch ohne Oberfläche nutzen, etwa in Node:

```js
import { initGeometry, generate } from './js/pedalboard.js';
import { initI18n } from './js/i18n.js';
await initI18n('de', async l => (await import(`./js/lang/${l}.js`)).default);   // Texte der Prüfungen, Teilenamen, Stückliste
await initGeometry();
const r = generate({ mode: 'alu', W: 600, D: 300, bedX: 220, bedY: 220 });
// r.parts[i].mesh = { positions, indices } in Druckrichtung, r.bom, r.errors, r.warnings
```

## Unterstützung

Das Tool ist kostenlos und Open Source. Wenn es dir Zeit gespart oder beim Bauen geholfen hat, kannst du es mit einem Kaffee unterstützen.

<a href="https://www.buymeacoffee.com/maxxs78" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="60" width="217"></a>

## Lizenz

Dieses Projekt steht unter der [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). Wer eine veränderte Version dieses Konfigurators als öffentlichen Webdienst betreibt, muss den Quellcode seiner Änderungen den Nutzern zugänglich machen.

Eingebundene Abhängigkeiten behalten ihre eigene Lizenz: [Three.js](https://threejs.org/) (MIT), [JSZip](https://stuk.github.io/jszip/) (MIT/GPLv3) und [manifold-3d](lib/LICENSE-manifold) (Apache-2.0).
