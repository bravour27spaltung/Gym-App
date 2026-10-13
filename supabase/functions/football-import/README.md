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
