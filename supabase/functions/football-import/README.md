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

Der Name muss genau `Fussball-Import` lauten (die App startet ihn per URL-Schema).

**Wichtig: Die Uhr wird ganztägig getragen.** Dann liegen pro Woche tausende Herzfrequenzwerte vor, und
eine Schleife über alle Werte hängt in der Kurzbefehle-App. Deshalb lädt der Kurzbefehl **nur den Zeitraum,
den du in der App gewählt hast** (Datum, Startzeit, Dauer). Die App übergibt ihn als Texteingabe
`<Start>|<Ende>` (ISO 8601 in UTC, z. B. `2026-10-01T17:00:00Z|2026-10-01T18:30:00Z`). Damit sind es für
90 Minuten nur wenige Dutzend Werte. Und die automatische Fenster-Erkennung ist standardmäßig aus (sie ginge
bei ganztägigem Tragen nicht, siehe `detect` unten).

Änderungen gegenüber der ersten Version („letzte 7 Tage“):

1. Ganz oben: **Text teilen** (Split Text) auf die **Kurzbefehl-Eingabe**, Trennzeichen **Benutzerdefiniert** `|`.
2. **Element aus Liste abrufen** (Get Item from List) → **Erstes Element**, danach **Daten aus Eingabe abrufen**
   (Get Dates from Input) → **Variable festlegen** `von`.
3. Dasselbe mit **Letztes Element** → Variable `bis`.
4. In **allen drei** „Health-Werte suchen“-Aktionen den Datumsfilter ändern: statt „Startdatum liegt in den letzten 7 Tagen“
   **„Startdatum liegt zwischen“ `von` und `bis`** (die beiden Variablen einsetzen). Quelle = deine Apple Watch bleibt.
5. Bei **Schritte** den leeren Filter „Wert“ löschen.
6. Header `x-import-token` mit deinem Token füllen (nicht den Kurzbefehl mit Token teilen).

Ohne Eingabe (z. B. direkt aus der Kurzbefehle-App gestartet) fehlt der Zeitraum. Dann am besten oben mit
**Wenn** (If) die Eingabe prüfen und sonst **Nach Eingabe fragen** (Ask for Input) nutzen.

## Auslösen

Health-Daten lesen darf ein Kurzbefehl nur, solange das iPhone **entsperrt** ist. Im Fußball-Tab: Datum, Startzeit
und Dauer einstellen, „Apple-Watch-Daten holen“ antippen (öffnet den Kurzbefehl mit dem Zeitraum), danach über den
Rücksprung-Link oben links in der Statusleiste zurück in die App. Die App rechnet Ø/Max-Puls, Distanz und
Schritte automatisch aus den gespeicherten Rohwerten (läuft die App danach nicht mehr, hilft „Nur berechnen“).

Bewusst **ohne** x-callback-url: Eine https-Rücksprungadresse würde in Safari statt in der Home-Bildschirm-App
landen, mit anderer Anmeldung und anderem Speicher.

Ein erneuter Aufruf erzeugt keine Dopplungen (Upsert auf Art/Start/Ende).

## Optional: Fenster-Erkennung (`"detect": true`)

Nur sinnvoll, wenn die Uhr **nur im Training** getragen wird. Dann bilden zusammenhängende Herzfrequenzwerte
(Lücke unter 45 min) eine Einheit; mindestens 20 min und 3 Messwerte, höchstens 4 h. Als Body-Feld
`"detect": true` mitschicken. Die erkannten Fenster erscheinen im Fußball-Tab als „Apple Watch erkannt“.
