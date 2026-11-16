# football-import: Apple-Watch-Werte für den Fußball-Eintrag holen

Die App ist eine Web-App und kann Apple Health nicht direkt lesen (HealthKit gibt es nur für native
iPhone-Apps). Deshalb liest ein **iOS-Kurzbefehl** (kostenlos) die Werte aus Health und schickt sie an diese
Edge Function.

## Ablauf (Neustart, Oktober 2026)

1. Im Fußball-Tab stellst du Datum und Zeitraum (Von/Bis oder Dauer) ein und tippst auf „Apple-Watch-Daten holen“.
2. Die App startet den Kurzbefehl `Fussball-Import` mit der Eingabe `<Start>|<Ende>` (ISO 8601, UTC).
3. Der Kurzbefehl holt die **neuesten Herzfrequenz-Messwerte** (sortiert, mit Limit, **ohne Datumsfilter**) und schickt sie
   als Textzeilen `<Start ISO 8601>|<Wert>` plus die Eingabe unverändert als `range`. Die Funktion schneidet den Zeitraum
   selbst heraus und rechnet Ø/Max-Puls. Eine Schleife über die (wenigen hundert) Werte ist nötig, Statistik-Aktionen nicht.
4. Die Funktion speichert genau **ein Ergebnis pro Zeitraum** in `fit_watch_ranges` (Upsert, wiederholbar) und
   antwortet im Klartext (`message`), den der Kurzbefehl anzeigt.
5. Du kehrst über den Rücksprung-Link oben links zurück; die App holt das Ergebnis ab (bis zu ~45 s Geduld) und
   trägt Ø Puls und Distanz ins Formular ein. Art der Einheit und RPE trägst du weiterhin selbst ein.

**Was sich gegenüber dem ersten Versuch geändert hat:** Das Zerlegen von Messwerten in Textzeilen per Schleife, die
Fenster-Erkennung (`detect`), die Rohwert-Tabelle und die Berechnung in der App sind weg. Sie waren viele Glieder
hintereinander, bei denen jedes still scheitern konnte. Die Tabellen `fit_health_samples` und
`fit_football_watch_windows` bleiben unangetastet in der Datenbank, werden aber nicht mehr befüllt. Die Funktion
nimmt weiterhin Rohzeilen an (Rückfall, siehe unten), wertet sie dann aber selbst im Zeitraum aus.

Die App erkennt drei Fehlerbilder und benennt sie (Funktion `diagnoseWatchRange`, getestet):

| Meldung in der App | Bedeutung | Wo suchen |
|---|---|---|
| „Es ist nichts angekommen“ / „noch nie etwas angekommen“ | Die Funktion hat nichts gespeichert | Kurzbefehl brach vor dem Senden ab, oder die Funktion lehnte ab; der Kurzbefehl zeigt deren Meldung |
| „Kurzbefehl ist durchgelaufen …, aber Health hat nichts geliefert“ | Ergebnis ohne Werte angekommen | Health-Berechtigung für Kurzbefehle, iPhone entsperrt, Zeitraum, Quelle |
| „… für einen anderen Zeitraum“ | Ergebnis angekommen, aber mit anderem `range` | Kurzbefehl hat die Eingabe verändert statt sie unverändert zurückzugeben |
| „Es kam nichts Neues an … älteres Ergebnis“ | Nur ein Ergebnis von vor dem Antippen | Kurzbefehl lief nicht bis zum Senden |

## Einrichtung (einmalig)

1. **Migration** `supabase/migrations/0020_watch_ranges.sql` im SQL-Editor von Supabase ausführen. Ohne sie antwortet
   die Funktion mit „relation "fit_watch_ranges" does not exist“.
2. **Secrets** `IMPORT_TOKEN` und `IMPORT_USER_ID` sind von der bisherigen Funktion schon gesetzt; unverändert lassen.
   (Neu: `openssl rand -hex 32` für das Token, die Nutzer-ID steht in Supabase unter Authentication → Users.)
3. **Neu deployen:**
   ```sh
   supabase functions deploy football-import --no-verify-jwt
   ```
   `--no-verify-jwt` ist nötig, weil ein Kurzbefehl kein ablaufendes Supabase-JWT erneuern kann; die Funktion prüft
   stattdessen das Token im Header `x-import-token`. Das Token erlaubt nur, Zeitraum-Ergebnisse anzulegen oder zu
   aktualisieren, nicht zu lesen.

## Testleiter (von unten nach oben, jede Stufe einzeln)

**Stufe 0, ohne iPhone:** Erreichbarkeit und Token.
```sh
curl -s -X POST "https://<projekt>.supabase.co/functions/v1/football-import?ping=1" -H "x-import-token: <token>"
```
Erwartet: `"message":"Verbindung und Token in Ordnung. Es wurde nichts gespeichert."`

Auswertung ansehen, ohne zu speichern (`?dry=1`):
```sh
curl -s -X POST "https://<projekt>.supabase.co/functions/v1/football-import?dry=1" \
  -H "x-import-token: <token>" -H "Content-Type: application/json" \
  -d '{"range":"2026-10-01T17:00:00Z|2026-10-01T18:30:00Z","avg_hr":132,"max_hr":171,"hr_count":14,"steps_total":6200,"distance_km":4.2}'
```

**Stufe 1, Kurzbefehl nur mit Ping:** beweist URL-Schema, Eingabe-Übergabe, Netz und Token (`?ping=1`, Antwort anzeigen).
**Stufe 2, Health lesen:** Suche und Schleife, fünf Zeilen `Datum|Wert` anzeigen. **Stufe 3:** vollständiger Kurzbefehl (unten).
Erst zur nächsten Stufe, wenn die vorige sichtbar läuft. So zeigt sich, an welchem Glied es hängt.

## Body

| Feld | Bedeutung |
|---|---|
| `range` | **Pflicht.** `<Start>\|<Ende>`, die Kurzbefehl-Eingabe **unverändert** zurückgeben (ISO 8601 mit `Z` oder Offset, Ende nach Start, höchstens 24 h). Alternativ `from` und `to` |
| `avg_hr`, `max_hr` | Ø/Max-Puls, 30–220 bpm. Zahl oder Text („131,6 count/min“) |
| `hr_count` | Anzahl der Herzfrequenz-Messwerte, auf denen Ø/Max beruhen |
| `steps_total` | Summe der Schritte im Zeitraum („6.200“ wird als 6200 gelesen) |
| `distance_km` | Summe Gehen + Laufen; mit Einheit („4200 m“) wird umgerechnet, ohne Einheit gilt km |
| `hr`, `distance`, `steps` | **Hauptweg:** Rohzeilen `<Start>\|<Wert>` (oder `<Start>\|<Ende>\|<Wert>`); die Funktion wertet nur Messwerte im Zeitraum aus. Fertige Zahlen (`avg_hr` …) haben je Feld Vorrang |

Unplausible Werte (Puls außerhalb 30–220, negative Zahlen, Distanz über 100 km) werden nicht gespeichert und in
`invalid` gezählt. Liegt Ø über Max (vertauschte Felder), lehnt die Funktion mit Klartext ab. Ein Lauf ohne Werte wird
bewusst als leeres Ergebnis gespeichert; das unterscheidet „Health war leer“ von „nichts angekommen“.

## Kurzbefehl „Fussball-Import“ (am 13.10.2026 auf iPhone mit iOS 26 geprüft: Puls läuft)

Der Name muss genau `Fussball-Import` lauten (die App startet ihn per URL-Schema). Aufbau, von Hand oder mit „Änderung beschreiben“:

1. **Variable konfigurieren** `range` = Kurzbefehl-Eingabe.
2. **Health-Messungen suchen**: nur der Filter *Typ ist Herzfrequenz*; Sortieren nach Startdatum, absteigend; Beschränken 250.
3. **Wiederholen mit jedem** (Health-Messungen): *Details von Health-Messung* Startdatum, dann **Datum formatieren**
   (benutzerdefiniert `yyyy-MM-dd'T'HH:mm:ssXXX`, ergibt `2026-10-13T16:14:47+02:00`), dann *Details* Wert, dann **Text**
   `{Formatiertes Datum}|{Wert}`.
4. **Text kombinieren** (Zeilenumbruch), danach **Variable konfigurieren** `hr`.
5. **Inhalte von URL abrufen**: URL `https://<projekt>.supabase.co/functions/v1/football-import`, POST, Header `x-import-token`,
   JSON mit `range` (Text, die Variable `range`) und `hr` (Text, die Variable `hr`).
6. **Ergebnis anzeigen** des Inhalts der URL (die Antwort enthält `message`).

Optional später: dieselbe Schleife für *Gehen- und Laufen-Distanz* mit **Einheit Kilometer** als Feld `distance`
(eigene Variable). Die Distanz ist der unsicherste Wert (für Fußball nicht validiert, siehe unten).

### Was auf dem iPhone nicht funktionierte (Erfahrung, nicht Apple-Dokumentation)

- **Datumsfilter in „Health-Messungen suchen“ lieferten 0 Treffer**: „ist nach dem“ mit Datums-Variable, „ist kleiner/größer
  oder gleich“ mit Datum, „liegt in den letzten 2 Stunden“. **Ohne Datumsfilter** kamen Werte, und „ist heute“ lieferte Treffer.
  Warum, ist offen. Deshalb sortieren und begrenzen statt filtern. Folge: Es sind nur die neuesten 250 Werte erreichbar
  (bei etwa einem Wert alle 2 bis 6 Minuten grob ein halber bis ganzer Tag, bei Belastung dichter), ältere Zeiträume
  liefern „ohne Werte“.
- **KI-erzeugte Kurzbefehle („Änderung beschreiben“) machten wiederholt dieselben Fehler**: falscher Typ (Schritte statt
  Herzfrequenz), ungefragt ergänzte Datumsfilter, Distanz-Einheit `count` statt Kilometer, und zwei Aktionen namens
  „Kombinierter Text“, die beide für `hr` und `distance` eingesetzt wurden. Nach dem Erzeugen immer im Editor prüfen: Typ,
  nur ein Filter, Einheit, Variablen `hr`/`distance` verschieden. Die Funktion lehnt identische `hr`/`distance` und Distanzen
  über 100 km inzwischen mit Klartext ab.
- **„Statistik berechnen“ direkt auf Health-Werten** wurde nicht getestet, weil schon der Datumsfilter scheiterte.
- Der Quellenname lautet „Apple Watch von Steffen“ (mehrfach vorhanden); ein Filter „Apple Watch“ würde nicht passen. Ohne
  Quellenfilter können iPhone und Watch bei Schritten und Distanz doppelt zählen.

Testleiter, falls es wieder hakt: Stufe 0 (`curl ?ping=1`), dann ein Kurzbefehl, der nur die Suche und die Schleife macht und
fünf Zeilen anzeigt (Format prüfen: Datum mit Uhrzeit und `+02:00`, Pulswert 40 bis 200), dann der vollständige Kurzbefehl.

## Auslösen und Grenzen

- Health-Daten liest ein Kurzbefehl nur, solange das iPhone **entsperrt** ist. Ein einzelner Forenbeitrag
  (talk.automators.fm, 2022, ohne Antwort) berichtet für „Get Workouts from Health“ den Fehler „Protected health data is
  inaccessible“ bei gesperrtem Gerät; das ist eine Einzelbeobachtung, keine Apple-Dokumentation, passt aber zum Verhalten
  geschützter Health-Daten. Deshalb: iPhone entsperrt lassen.
- Beim ersten Lauf fragt iOS pro Health-Typ (Herzfrequenz, Schritte, Gehen + Laufen) nach Zugriff. Alles erlauben.
- **Messtakt:** Ohne gestartete Aufzeichnung (bei dir der Normalfall, kein HKWorkout) versucht die Uhr laut Apple-Whitepaper
  „Using Apple Watch to measure heart rate, calorimetry, and activity“ (11/2024, Herstellerangabe, von mir hier nicht erneut
  geprüft) nur etwa alle 5 Minuten einen Herzfrequenzwert. Ø und Max beruhen deshalb auf wenigen Messwerten (die App zeigt die
  Anzahl). Dauer, Distanz und Schritte sind Näherungen. Deine RPE bleibt die Hauptgröße.
- **Aktive Energie (kcal)** wird bewusst nicht übernommen (Schätzfehler in Studien von rund 10 % bis über 150 %,
  npj Digit Med 2025; aus dem früheren README übernommen, nicht erneut geprüft).
- Ein erneuter Lauf für denselben Zeitraum überschreibt das Ergebnis (Upsert), erzeugt also keine Dopplung. Liefert Health
  dabei nichts, wird das frühere Ergebnis durch ein leeres ersetzt; die bereits ins Formular übernommenen Werte bleiben.
- Bewusst **ohne** x-callback-url: Eine https-Rücksprungadresse würde in Safari statt in der Home-Bildschirm-App landen
  (andere Anmeldung, anderer Speicher).

## Schritte, Distanz und aktive Energie (ab Migration 0021)

Zusätzlich zu `hr` akzeptiert die Funktion die Rohzeilen-Felder `steps`, `distance` und `energy` im Format
`<Start>|<Ende>|<Wert>|<Quelle>` (je ein Messwert pro Zeile, ISO 8601 mit Offset). Regeln der Funktion:

- Summe über den Zeitraum; Samples an der Grenze zählen anteilig nach Überlappung.
- Schicken die Zeilen eine Quelle mit und ist eine davon eine „Watch“, zählt **nur die Watch**. Ohne Quelle würden
  iPhone und Watch Schritte und Distanz doppelt zählen.
- Einheit steht im Wert: `km` oder `m` bei Distanz, `kcal` oder `kJ` bei Energie (kJ wird umgerechnet).
- Je Feld braucht der Kurzbefehl eine **eigene** Variable; identische Listen lehnt die Funktion ab.
- Energie ist die **aktive** Energie (nicht Ruheumsatz), wie schon beim Health-Export-Import der App.

Datenbank vor dem Deploy: `supabase db push` bzw. `0021_watch_energy_steps.sql` im SQL-Editor ausführen
(sonst scheitert das Speichern an der fehlenden Spalte `energy_kcal`).

Einordnung: Der Puls ist gut belegt. Aktive Energie und Distanz ohne gestartetes Workout sind Schätzungen der Uhr
(Energie nach Herzfrequenz und Bewegung, Distanz aus Schrittlänge-Modell/GPS nur bei Workout) und für Fußball nicht
validiert; als grobe Größenordnung behandeln, nicht als Messwert.

## Archiv: Rohwerte automatisch sichern (ab Migration 0022)

**Problem, das das löst:** Der Kurzbefehl erreicht in Health nur die neuesten ~250 Pulswerte (Datumsfilter lieferten auf dem
iPhone 0 Treffer, siehe oben). Wer den Fußball-Eintrag am Abend vergisst, kam Tage später nicht mehr an die Werte.
Jetzt sichert ein **automatisch laufender Kurzbefehl** die Rohwerte laufend; der Fußball-Tab rechnet den frei gewählten
Zeitraum aus diesem Archiv, auch Tage nach der Einheit. Der alte Weg („Apple-Watch-Daten holen“) bleibt als Rückfall.

**Ablauf:** Kurzbefehl `Fussball-Archiv` → `POST …/football-import?archive=1` → Tabelle `fit_health_samples` (Upsert über
Nutzer/Art/Start/Ende/Quelle, wiederholbare Läufe erzeugen keine Dopplung) → Fußball-Tab zeigt unter „Zusatzwerte“
„Im Archiv gefunden: …“ mit Knopf „Werte übernehmen“, sobald Datum, Startzeit und Dauer stehen. Es wird nichts ungefragt
ins Formular geschrieben.

### Einrichtung (Reihenfolge einhalten)

1. `supabase/migrations/0022_health_archive.sql` im SQL-Editor von Supabase ausführen (oder `supabase db push`).
2. Funktion neu deployen: `supabase functions deploy football-import --no-verify-jwt` (Secrets bleiben unverändert).
3. Test ohne Speichern (`dry=1` zusätzlich), Zeiten mit Offset:
   ```sh
   curl -s -X POST "https://<projekt>.supabase.co/functions/v1/football-import?archive=1&dry=1" \
     -H "x-import-token: <token>" -H "Content-Type: application/json" \
     -d '{"hr":"2026-10-29T19:10:00+01:00|128\n2026-10-29T19:15:00+01:00|141","steps":"2026-10-29T19:10:00+01:00|2026-10-29T19:15:00+01:00|312|Apple Watch von Steffen"}'
   ```
   Erwartet: `Würde archivieren: 2 Puls · 1 Schritte · 0 Distanz · 0 Energie. Pulswerte von … bis ….`
4. Kurzbefehl `Fussball-Archiv` anlegen (Prompt für die KI unten) und von Hand einmal laufen lassen. Die Antwort nennt Anzahl
   und Zeitbereich der gesicherten Pulswerte.
5. Automation: **Kurzbefehle → Automation → Tageszeit 22:00 → „Sofort ausführen“**.

### Body (`?archive=1`, kein `range`)

| Feld | Inhalt |
|---|---|
| `hr` | je Zeile `<Start>\|<Wert>` |
| `steps`, `distance`, `energy` | je Zeile `<Start>\|<Ende>\|<Wert>\|<Quelle>`; Distanz mit Einheit (`km`/`m`), Energie `kcal`/`kJ` |

Geprüft und **nicht** gespeichert (als `invalid` gezählt): Puls außerhalb 30–220, negative Werte, Distanz über 100 km je
Sample, Zeitstempel in der Zukunft, Intervalle über 24 h, Datum ohne Zeitzone. Pro Aufruf höchstens 5000 Werte. Identische
Listen in zwei Feldern lehnt die Funktion wie beim Zeitraum-Weg ab.

**Lückenmeldung:** Liegt der älteste Puls eines Laufs mehr als 30 Minuten nach dem zuletzt archivierten, meldet die Antwort
„Hinweis: zwischen … und … fehlen Pulswerte“. Daraus lässt sich nicht unterscheiden, ob die Uhr nicht am Handgelenk war oder
der Kurzbefehl zu selten lief; der Text nennt beides.

### Grenzen und offene Punkte (ehrlich)

- **Auslöser ungeklärt.** iOS hat keinen „beim Entsperren“-Auslöser. Health-Zugriff geht nur bei entsperrtem iPhone. Zwei
  Erfahrungsberichte (Reddit r/shortcuts „Automation does not run w/ Health action“, Apple Community Thread 254795044,
  beide Nutzerberichte, keine Apple-Dokumentation) beschreiben, dass Automationen mit Health-Aktionen bei gesperrtem Gerät
  nicht laufen bzw. bis zum Entsperren warten. Ob die 22-Uhr-Automation bei dir beim nächsten Entsperren nachläuft, muss
  ein Test auf deinem iPhone zeigen. Läuft sie nicht, ist der Rückfall: Kurzbefehl am Ende des morgendlichen
  `Recovery-Import` mit aufrufen (dann ist das iPhone entsperrt).
- **Reichweite pro Lauf ~250 Pulswerte** (grob ein halber bis ganzer Tag). Läuft der Kurzbefehl seltener als täglich,
  entstehen Lücken (die Antwort meldet sie).
- **Messdichte unverändert:** ohne gestartete Aufzeichnung misst die Uhr den Puls nur alle paar Minuten (Apple-Whitepaper
  11/2024, Herstellerangabe, nicht erneut geprüft). Das Archiv macht die Daten verfügbar, nicht dichter.
- **Speicher:** grob 500 Zeilen pro Tag (Schätzung, nicht gemessen), im niedrigen zweistelligen MB-Bereich pro Jahr;
  für den Supabase-Gratisplan unkritisch.
- Datenschutz: Das Archiv enthält ganztägige Pulswerte, nicht nur Fußball. Zugriff nur über RLS (eigener Nutzer);
  löschen geht über die Tabelle `fit_health_samples` im Supabase-Dashboard.

### Prompt für die KI, die den Kurzbefehl baut

```text
Baue mir einen iOS-Kurzbefehl namens „Fussball-Archiv“ (Schritt für Schritt, mit den genauen Aktionsnamen der deutschen
Kurzbefehle-App, iOS 26). Er sichert Apple-Health-Rohwerte in meine Datenbank. Halte dich exakt an diese Vorgaben, weil
frühere KI-Entwürfe hier wiederholt dieselben Fehler gemacht haben:

1. Fünf Mal „Health-Messungen suchen“, jeweils mit NUR EINEM Filter „Typ ist …“, KEIN Datumsfilter (Datumsfilter liefern bei
   mir 0 Treffer), Sortieren nach Startdatum absteigend, Beschränken auf 250:
   a) Herzfrequenz → Variable hr
   b) Schritte → Variable steps
   c) Gehen + Laufen Distanz, Einheit Kilometer → Variable distance
   d) Aktive Energie, Einheit Kilokalorien → Variable energy
   Jede Suche braucht ihre EIGENE Ergebnisvariable; es dürfen nie zwei Felder dieselbe Variable erhalten.
2. Zu jeder Suche „Wiederholen mit jedem“ und je Messwert einen Text bauen. Datum immer mit „Datum formatieren“, benutzerdefiniert
   yyyy-MM-dd'T'HH:mm:ssXXX (ergibt z. B. 2026-10-29T19:14:47+01:00):
   - Herzfrequenz: <Startdatum>|<Wert>
   - Schritte, Distanz, Energie: <Startdatum>|<Enddatum>|<Wert>|<Quelle>   (Quelle = Details „Quelle“ der Messung)
   Danach die Texte je Schleife mit Zeilenumbruch kombinieren und in die passende Variable (hr, steps, distance, energy) legen.
3. „Inhalte von URL abrufen“: URL https://<PROJEKT>.supabase.co/functions/v1/football-import?archive=1, Methode POST, Header
   x-import-token = <TOKEN>, Anfragetext JSON mit den vier Feldern hr, steps, distance, energy (jeweils Text, die zugehörige
   Variable).
4. „Ergebnis anzeigen“ mit der Antwort (Feld message). Bei Fehlern soll der Kurzbefehl die Antwort trotzdem anzeigen.
5. Keine weiteren Filter, keine „Statistik berechnen“-Aktion, keine Datumsvariablen als Filter.

Erkläre am Ende, wie ich prüfe, dass vier verschiedene Variablen im Anfragetext stehen, und wie ich die Automation
„Tageszeit 22:00, Sofort ausführen“ dafür anlege.
```
