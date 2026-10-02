# football-import: Fußball-Daten der Apple Watch automatisch holen

Die App ist eine Web-App und kann Apple Health nicht direkt lesen (HealthKit gibt es nur
auf dem iPhone für native Apps). Deshalb liest ein **iOS-Kurzbefehl** (kostenlos) die
Rohwerte aus Health und schickt sie an diese Edge Function. Sie erkennt daraus
Trainingsfenster und legt sie in `fit_football_watch_windows` ab. Im Fußball-Tab erscheinen
sie als Vorschlag („Apple Watch erkannt“): ein Tipp übernimmt Startzeit, Dauer, Ø Puls und
Distanz ins Formular. Art der Einheit und RPE trägst du weiterhin selbst ein.

**Zeitraum selbst wählen:** Die Funktion speichert zusätzlich alle Rohwerte in `fit_health_samples`
(Upsert, keine Dopplung). Im Formular stellst du Datum, Startzeit und Dauer selbst ein und tippst auf
„Werte aus Apple Watch berechnen“: Ø/Max-Puls, Distanz und Schritte werden für genau diesen Zeitraum
aus den Rohwerten berechnet (`summarizeWatchSamples`). Das ist der Weg, wenn die Zeiten jedes Mal
anders sind oder die automatische Erkennung danebenliegt. Die Vorschläge bleiben als Abkürzung bestehen.

## Welche Daten

| Wert | Verwendung | Hinweis |
|---|---|---|
| Herzfrequenz (Start, Wert) | Kern: erkennt das Zeitfenster, Ø/Max-Puls | Ohne gestartete Aufzeichnung versucht die Uhr laut Apple nur etwa alle 5 Minuten einen Wert zu liefern (Series 10), Ø/Max beruhen also auf wenigen Messwerten |
| Schritte (Start, Ende, Wert) | Summe im Fenster | optional |
| Distanz Gehen/Laufen (Start, Ende, Wert) | Summe im Fenster | optional, Näherung der Uhr, für Fußball nicht validiert |
| Aktive Energie (kcal) | **wird bewusst nicht übernommen** | Schätzfehler in Studien von rund 10 % bis über 150 % (npj Digit Med 2025) |

Fenster-Erkennung (siehe `parse.ts`, getestet in `src/lib/footballWatch.test.ts`): Die Uhr wird
nur im Training getragen, also bilden zusammenhängende Herzfrequenzwerte (Lücke unter 45 min) eine
Einheit. Mindestens 20 min und 3 Messwerte, höchstens 4 h; alles andere wird mit Grund
gemeldet (`skipped`) und nicht angelegt. Die Dauer ist wegen der seltenen Messung eine leichte
Unterschätzung.

## Einrichtung (einmalig)

1. **Migrationen** `supabase/migrations/0013_football_watch_windows.sql` und `0014_health_samples.sql` nacheinander im SQL-Editor von Supabase ausführen.
2. **Token und Nutzer-ID festlegen.** Token erzeugen: `openssl rand -hex 32`. Die Nutzer-ID steht in Supabase unter
   Authentication → Users (deine UUID).
3. **Secrets setzen und deployen** (Supabase CLI, Projekt verlinkt):
   ```sh
   supabase secrets set IMPORT_TOKEN=<token> IMPORT_USER_ID=<deine-uuid>
   supabase functions deploy football-import --no-verify-jwt
   ```
   `--no-verify-jwt` ist nötig, weil der Kurzbefehl kein ablaufendes Supabase-JWT erneuern kann; die
   Funktion prüft stattdessen das Token im Header `x-import-token`. Das Token erlaubt nur, Vorschlags-Fenster
   anzulegen oder zu aktualisieren, nicht zu lesen.
4. **Testen ohne Kurzbefehl** (`?dry=1` schreibt nichts, zeigt nur die erkannten Fenster):
   ```sh
   curl -s -X POST "https://<projekt>.supabase.co/functions/v1/football-import?dry=1" \
     -H "x-import-token: <token>" -H "Content-Type: application/json" \
     -d '{"hr":"2026-10-01T19:00:00+02:00|2026-10-01T19:00:00+02:00|118\n2026-10-01T19:07:00+02:00|2026-10-01T19:07:00+02:00|141\n2026-10-01T19:14:00+02:00|2026-10-01T19:14:00+02:00|152\n2026-10-01T19:21:00+02:00|2026-10-01T19:21:00+02:00|147\n2026-10-01T19:28:00+02:00|2026-10-01T19:28:00+02:00|139"}'
   ```
   (Das Beispiel hat 28 Minuten und 5 Messwerte und liefert ein Fenster.)

## Der Kurzbefehl „Fussball-Import“

Der Name muss genau `Fussball-Import` lauten (der Button in der App startet ihn per URL-Schema).
**Hinweis:** Die Schritte unten habe ich nicht auf einem iPhone ausprobiert. Die Namen einzelner
Aktionen und Filter können in deiner iOS-Version leicht abweichen; prüfe mit dem `?dry=1`-Test, ob die
Ausgabe stimmt.

Für **jeden der drei Werte** (Herzfrequenz, Schritte, Distanz Gehen + Laufen) dieselbe Abfolge:

1. **Health-Werte finden**: Typ = Herzfrequenz (bzw. Schritte / Gehen + Laufen Distanz), Startdatum
   „liegt in den letzten 7 Tagen“, **Quelle = deine Apple Watch** (sonst zählen iPhone-Schritte doppelt
   bzw. außerhalb des Trainings mit), sortiert nach Startdatum, älteste zuerst.
2. **Für jedes Element wiederholen**:
   - **Datum formatieren** auf „Start-Datum“ des Elements, Format **ISO 8601** (enthält die Zeitzone, das ist Pflicht)
   - **Datum formatieren** auf „Enddatum“ des Elements, ebenfalls ISO 8601
   - **Text**: `<Start>|<Ende>|<Wert des Elements>` (Wert = Eigenschaft „Wert“ des Health-Elements, mit Einheit)
   - **Zur Variablen hinzufügen** (z. B. `hr`, `steps`, `distance`)
3. Nach der Schleife: **Text kombinieren** (Variable, getrennt durch „Neue Zeile“) -> Variable `hrText` usw.

Danach **Inhalt von URL abrufen**:

- URL: `https://<projekt>.supabase.co/functions/v1/football-import`
- Methode **POST**, Header `x-import-token: <token>`
- Anfragetext **JSON** mit drei Feldern vom Typ **Text**: `hr`, `steps`, `distance`
  (Werte = die kombinierten Texte; Kurzbefehle maskieren Zeilenumbrüche im JSON selbst)
- Optional: **Mitteilung anzeigen** mit dem Ergebnis (`created`/`updated`/`skipped`).

Datums- und Zahlenformate liest `parse.ts` tolerant (ISO 8601 mit `+02:00`, `Z` oder `+0200`;
Dezimalkomma oder -punkt; Distanz in km, m oder mi). Datum **ohne Zeitzone** wird abgelehnt und im Feld
`invalid` gezählt, statt still falsch eingeordnet zu werden.

## Auslösen

Health-Daten lesen darf ein Kurzbefehl nur, solange das iPhone **entsperrt** ist. Ein reiner
Zeit-Trigger hilft deshalb nicht zuverlässig. Zwei Wege:

1. **Button in der App (zuverlässig):** Im Fußball-Tab startet „Apple-Watch-Daten abrufen“ den
   Kurzbefehl per `shortcuts://x-callback-url/run-shortcut` und springt danach zurück; die Vorschläge laden
   beim Zurückkehren neu.
2. **Automation „App öffnen“** (Kurzbefehle → Automation → App): läuft ohne Rückfrage, sobald du eine App
   öffnest. Ob sich eine zum Home-Bildschirm hinzugefügte Web-App dort als App auswählen lässt, habe
   ich nicht geprüft (vermutlich nicht). Alternative: Aktionstaste, Rückseiten-Tipp oder Home-Bildschirm-Symbol
   für den Kurzbefehl.

Ein erneuter Aufruf erzeugt keine Dopplungen: überlappende Fenster werden aktualisiert, bereits in einen
Eintrag übernommene bleiben unberührt.
