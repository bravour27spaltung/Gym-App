# recovery-import: Schlaf, HRV und Ruhepuls in den Recovery-Eintrag holen

Ergänzt einen **bereits angelegten** Recovery-Eintrag (zuerst die gefühlte Erholung in der App eintragen)
um Schlaf, HRV und Ruhepuls aus Apple Health. Ein iOS-Kurzbefehl liest die Rohwerte und schickt sie hierher.

## Was sich beim Schlaf geändert hat

Ein Eintrag gehört zum **Tag des Aufwachens**. Der Schlaf ist die **Nacht, die an diesem Tag endet**, als Ganzes,
also auch der Teil vor Mitternacht. Das erledigt die Funktion selbst (`sleep.ts`, identisch mit `src/lib/sleep.ts`):

1. Schlafphasen (Core/Deep/REM, nicht „Im Bett“ und nicht „Wach“) werden vereinigt; überlappende Quellen zählen
   nur einmal, Watch-Daten haben Vorrang.
2. Pausen bis 2 Stunden gehören noch zur selben Nacht, längere Pausen trennen Nacht und Nickerchen.
3. Die längste Session, die am Eintragsdatum endet, ist die Nacht. Beginn, Ende und Dauer werden gespeichert
   (`sleep_start`, `sleep_end`, `sleep_hours`).

**Fehlerbild vorher:** Wurde der Schlaf für „den Tag ab 0 Uhr“ abgefragt, fehlte der Abend vor Mitternacht
(zu wenig Schlaf) bzw. die Vornacht rutschte in den falschen Tag. Der Kurzbefehl muss deshalb ein
**großzügiges Fenster** holen, nicht den Kalendertag: **Vortag 12:00 bis Eintragsdatum 18:00**.

## Einrichtung

1. Migration `supabase/migrations/0016_recovery_sleep_window.sql` im SQL-Editor von Supabase ausführen
   **(vor dem Deployen)**.
2. Für den Kurzbefehl: Token und Nutzer-ID wie bei `football-import` (siehe dessen README) als Secrets setzen
   (`IMPORT_TOKEN`, `IMPORT_USER_ID`) und mit `--no-verify-jwt` deployen:
   ```sh
   supabase functions deploy recovery-import --no-verify-jwt
   ```
   Alternativ geht auch ein Nutzer-JWT im Header `Authorization: Bearer …`.
3. Testen ohne zu schreiben (`?dry=1`), Zeiten mit Offset (hier +02:00):
   ```sh
   curl -s -X POST "https://<projekt>.supabase.co/functions/v1/recovery-import?dry=1" \
     -H "x-import-token: <token>" -H "Content-Type: application/json" \
     -d '{"date":"2026-10-03","sleep":"2026-10-02T23:00:00+02:00|2026-10-03T03:00:00+02:00|Core\n2026-10-03T03:00:00+02:00|2026-10-03T06:30:00+02:00|REM"}'
   ```
   Erwartet: `night` mit Beginn 21:00Z, Ende 04:30Z und `hours` 7,5.

## Automatisch statt von Hand (Reihenfolge egal)

Die Web-App kann Apple Health nicht selbst lesen; nur der Kurzbefehl kann das. Damit der Schlaf von
selbst ankommt, richte in **Kurzbefehle → Automation** einen Auslöser ein (z. B. täglich 08:00 oder
„Wecker wird gestoppt“, Ausführen **ohne Nachfragen**) und lass ihn „Recovery-Import“ starten. Das iPhone
muss dafür entsperrt sein, sonst bekommt der Kurzbefehl keine Health-Daten.

Gibt es zu diesem Zeitpunkt noch keinen Eintrag, legt die Funktion die Werte in
`fit_recovery_health_inbox` ab (**Migration `0017_recovery_health_inbox.sql` vorher ausführen**). Die App
überträgt sie beim Öffnen/Synchronisieren in den Eintrag von heute und leert den Eingang. Beim ersten
Öffnen am Tag fragt die App die Recovery ab, solange für heute noch nichts eingetragen ist.

## Body

| Feld | Bedeutung |
|---|---|
| `date` | Tag des Aufwachens `YYYY-MM-DD`, Pflicht |
| `sleep` | Schlafabschnitte, je Zeile `<Start>\|<Ende>\|<Phase>` (ISO 8601 mit Offset). Alternativ `sleep_samples` als Array `{start,end,value}` |
| `hrv` | optional, je Zeile `<Start>\|<Ende>\|<ms>`; gemittelt wird über die Nacht (bis 1 h nach dem Aufwachen) |
| `hrv_ms`, `resting_hr` | optional, bereits gemittelte Werte (Vorrang vor `hrv`) |
| `tz_offset_min` | optional, falls die Zeitstempel keinen Offset tragen |
| `sleep_hours` | **veraltet**: fertige Summe ohne Nachtfenster, anfällig für den oben beschriebenen Fehler |

Vorhandene Werte werden nie überschrieben. **Ausnahme:** ein Schlafwert aus Apple Health **ohne** Nachtfenster
(aus der alten Methode) wird durch den Nachtwert ersetzt. Dasselbe passiert in der App beim Apple-Health-Import
(Verlauf → Health-Import): Alte Apple-Health-Schlafwerte werden dort erneut angeboten.

## Kurzbefehl „Recovery-Import“ (Änderungen)

Nicht auf einem iPhone getestet, die Aktionsnamen können je nach iOS-Version leicht abweichen.

1. Variable `tag` = **Datum formatieren** (aktuelles Datum, eigenes Format `yyyy-MM-dd`), also der Tag des Aufwachens.
2. Variable `von` = **Text** `<gestern> 12:00` und `bis` = **Text** `<tag> 18:00`, jeweils mit **Daten aus Eingabe abrufen**
   in ein Datum umwandeln (`gestern` = `tag` mit **Datum anpassen** −1 Tag).
3. **Health-Werte suchen**: Typ **Schlaf**, **Startdatum liegt zwischen** `von` und `bis`, Quelle deine Apple Watch.
   Nicht „Startdatum ist heute“ und nicht „ab 0 Uhr“ verwenden.
4. **Für jedes Element wiederholen**: **Text** `<Startdatum ISO 8601>|<Enddatum ISO 8601>|<Wert>`, Ergebnisse
   zeilenweise zusammenfügen (`sleep`). Eine Nacht hat typischerweise nur einige Dutzend Abschnitte.
5. Optional dasselbe für **Herzfrequenzvariabilität** im selben Fenster (`hrv`) und den **Ruhepuls** (`resting_hr`, Mittelwert).
6. **Inhalte von URL abrufen**: POST, JSON mit `date`, `sleep`, optional `hrv`/`resting_hr`, Header `x-import-token`.

Health-Daten liest ein Kurzbefehl nur bei **entsperrtem iPhone**.

## Grenzen

- Consumer-Wearables erkennen Schlaf gut, Wachphasen aber schlecht und überschätzen die Schlafzeit tendenziell
  (Chinoy et al. 2021, Sleep 44(5), Laborvergleich, Apple Watch war nicht dabei). Als Trend nutzbar, als Absolutwert mit Vorsicht.
- **Tief- und REM-Schlaf** werden als Minuten pro Nacht gespeichert (Migration `0018_recovery_sleep_stages.sql`
  vorher ausführen) und in der App nur gegen den **eigenen** 14-Nächte-Schnitt gezeigt, ohne Status und ohne
  Einfluss auf die Gesamtbewertung. Gründe: Tief und REM erkennen Uhren im Polysomnographie-Vergleich besser als Wach
  und Leichtschlaf (Sleep Advances 2025, zpaf021, Apple Watch Series 8 darunter, n = 62); für die Schlafarchitektur
  gibt es keinen anerkannten Sollwert (Ohayon et al. 2017, Sleep Health, Expertenkonsens).
- **Nicht ausgewertet:** Wachzeit, Zahl der Aufwachphasen, Schlafeffizienz und Leichtschlaf. Die Wacherkennung ist schwach
  (Spezifität 29 bis 52 %), die Effizienz würde dadurch systematisch zu hoch ausfallen.
- Apple misst HRV als SDNN, nur gelegentlich; die Abweichung zum Brustgurt ist im Absolutwert groß (Sensors 2024,
  24(19):6220). Die App wertet deshalb nur den 7-Tage-Trend aus.
