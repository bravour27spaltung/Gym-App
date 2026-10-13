# football-import: Apple-Watch-Werte für den Fußball-Eintrag holen

Die App ist eine Web-App und kann Apple Health nicht direkt lesen (HealthKit gibt es nur für native
iPhone-Apps). Deshalb liest ein **iOS-Kurzbefehl** (kostenlos) die Werte aus Health und schickt sie an diese
Edge Function.

## Ablauf (Neustart, Oktober 2026)

1. Im Fußball-Tab stellst du Datum und Zeitraum (Von/Bis oder Dauer) ein und tippst auf „Apple-Watch-Daten holen“.
2. Die App startet den Kurzbefehl `Fussball-Import` mit der Eingabe `<Start>|<Ende>` (ISO 8601, UTC).
3. Der Kurzbefehl liest **nur diesen Zeitraum** aus Health und schickt **wenige Zahlen** (Ø/Max-Puls, Anzahl
   Messwerte, Schritte, Distanz) plus die Eingabe unverändert als `range`. **Keine Schleife über Messwerte.**
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

**Stufe 1, Kurzbefehl nur mit Ping:** beweist URL-Schema, Eingabe-Übergabe, Netz und Token (Text unten).
**Stufe 2, Health lesen:** Werte nur anzeigen (Berechtigungen erteilen). **Stufe 3:** vollständiger Kurzbefehl.
Erst zur nächsten Stufe, wenn die vorige sichtbar läuft. So zeigt sich, an welchem Glied es hängt.

## Body

| Feld | Bedeutung |
|---|---|
| `range` | **Pflicht.** `<Start>\|<Ende>`, die Kurzbefehl-Eingabe **unverändert** zurückgeben (ISO 8601 mit `Z` oder Offset, Ende nach Start, höchstens 24 h). Alternativ `from` und `to` |
| `avg_hr`, `max_hr` | Ø/Max-Puls, 30–220 bpm. Zahl oder Text („131,6 count/min“) |
| `hr_count` | Anzahl der Herzfrequenz-Messwerte, auf denen Ø/Max beruhen |
| `steps_total` | Summe der Schritte im Zeitraum („6.200“ wird als 6200 gelesen) |
| `distance_km` | Summe Gehen + Laufen; mit Einheit („4200 m“) wird umgerechnet, ohne Einheit gilt km |
| `hr`, `steps`, `distance` | **Rückfall:** Rohzeilen `<Start>\|<Ende>\|<Wert>`; die Funktion wertet nur Messwerte im Zeitraum aus. Fertige Zahlen haben je Feld Vorrang |

Unplausible Werte (Puls außerhalb 30–220, negative Zahlen, Distanz über 100 km) werden nicht gespeichert und in
`invalid` gezählt. Liegt Ø über Max (vertauschte Felder), lehnt die Funktion mit Klartext ab. Ein Lauf ohne Werte wird
bewusst als leeres Ergebnis gespeichert; das unterscheidet „Health war leer“ von „nichts angekommen“.

## Kurzbefehl „Fussball-Import“ (Text zum Einfügen in „Änderung beschreiben“)

Der Name muss genau `Fussball-Import` lauten (die App startet ihn per URL-Schema). URL und Token sind dieselben wie
beim bisherigen Kurzbefehl. Nicht auf einem iPhone getestet von mir; Aktionsnamen können je nach iOS-Version abweichen.

**Stufe 1 (nur Ping und Eingabe):**

```
Erstelle bzw. ersetze den Kurzbefehl "Fussball-Import" durch einen reinen Verbindungstest, ohne Health-Zugriff und ohne Schleifen:
1. Setze die Variable "range" auf die Kurzbefehl-Eingabe (Text). Ist keine Eingabe vorhanden, dann Text "2026-10-01T17:00:00Z|2026-10-01T18:30:00Z".
2. "Inhalte von URL abrufen": URL <FUNKTIONS-URL>/football-import?ping=1 , Methode POST, Header x-import-token = <TOKEN>, Anfragetext JSON mit dem Feld range (Text) = Variable range.
3. "Wörterbuchwert abrufen": Wert für Schlüssel message aus dem Ergebnis von Schritt 2.
4. "Ergebnis anzeigen": zuerst die Variable range, darunter die message.
Alle Dialoge und Nachfragen weglassen.
```

**Stufe 3 (vollständig, Variante A mit Statistik, ohne Schleife):**

```
Ändere den Kurzbefehl "Fussball-Import" so, dass er ohne jede Schleife den Zeitraum aus Health auswertet und das Ergebnis sendet:
1. Variable "range" = Kurzbefehl-Eingabe (Text im Format "<Start>|<Ende>", ISO 8601, z. B. 2026-10-01T17:00:00Z|2026-10-01T18:30:00Z). Ohne Eingabe: "Nach Eingabe fragen" (Text) nach Start|Ende.
2. "Text teilen" von range an "|"; "Element aus Liste abrufen" Erstes Element, dann "Daten aus Eingabe abrufen" -> Variable "von". Dasselbe mit Letztes Element -> Variable "bis".
3. "Health-Werte suchen": Typ Herzfrequenz, Startdatum liegt zwischen von und bis, Quelle Apple Watch, Limit aus -> Variable "hr". "Statistik berechnen" Durchschnitt von hr -> "avgHr"; "Statistik berechnen" Maximum von hr -> "maxHr"; "Anzahl" von hr -> "hrCount". Es darf keine Schleife benutzt werden.
4. "Health-Werte suchen": Typ Schritte, Startdatum zwischen von und bis, Quelle Apple Watch. "Statistik berechnen" Summe -> "stepsTotal".
5. "Health-Werte suchen": Typ Gehen- und Laufen-Distanz, Startdatum zwischen von und bis, Quelle Apple Watch. "Statistik berechnen" Summe -> "distanceKm" (in Kilometern).
6. "Inhalte von URL abrufen": URL <FUNKTIONS-URL>/football-import , Methode POST, Header x-import-token = <TOKEN>, Anfragetext JSON: range (Text) = range, avg_hr (Zahl) = avgHr, max_hr (Zahl) = maxHr, hr_count (Zahl) = hrCount, steps_total (Zahl) = stepsTotal, distance_km (Zahl) = distanceKm.
7. "Wörterbuchwert abrufen" message aus dem Ergebnis, dann "Ergebnis anzeigen".
Die Eingabe muss in Schritt 6 unverändert als range gesendet werden (nicht neu formatieren). Wenn ein Health-Typ keine Werte liefert, den Kurzbefehl trotzdem bis zum Senden weiterlaufen lassen.
```

**Rückfall Variante B (nur, falls „Statistik berechnen“ die Health-Werte nicht annimmt):** In Schritt 3 bis 5 statt der
Statistik je Typ **eine** Schleife „Für jedes Element wiederholen“ über die gefundenen Werte, die pro Element eine Textzeile
`<Startdatum ISO 8601>|<Wert>` erzeugt, und die Zeilen zusammengefügt als `hr`, `steps`, `distance` senden (statt
`avg_hr` usw.). Bei einem begrenzten Zeitraum von 1 bis 2 Stunden sind das wenige Dutzend Werte. Die Funktion rechnet dann selbst.

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
