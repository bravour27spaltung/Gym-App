# Gym-Log

Trainings-App für das Fitnessstudio (Handy zuerst, Auswertung auch am PC). Nur für einen Nutzer, ohne laufende Kosten.

## Stand

| Bereich | Status |
| --- | --- |
| Kernlogik in `src/lib` (Gewichte, Double Progression, Aufwärmsätze, Rotation, Pausentimer, Trainings-Zustand, lokaler Speicher) | fertig, Tests grün |
| Datenbankschema mit Zugriffsregeln (`supabase/migrations/0001_fit_schema.sql`, `0002_fit_last_sets.sql`) | fertig, noch nicht gegen eine echte Supabase-Instanz ausgeführt |
| Log-Ansicht (Login, Training starten, Übungen, kompakte Satzzeilen, Vorbelegung, Aufwärmen, Pausentimer, Ausgangskorb) | im Chromium gegen eine Fake-Datenbank durchgespielt, noch nicht auf dem iPhone oder mit echtem Supabase getestet |
| Trainingspläne (anlegen, bearbeiten, Tage/Übungen verschieben, archivieren, Start aus dem Plan mit Rotation) | wie oben |
| Projekt-Build mit `npm run build` (Vite) | noch nicht ausgeführt, hier ist npm gesperrt; der Code wurde mit Bun gebündelt |
| Eigene Übungen mit Haupt- und Hilfsmuskeln (Auswahl im Formular, wird in `fit_exercises` gespeichert) | fertig, Tests grün (Bun); mit echter Datenbank noch nicht ausprobiert |
| Übungskatalog: Import-Skript `tools/build-seed.mjs` (free-exercise-db, deutsche Namen per Glossar) | Skript fertig und mit Beispieldaten getestet, mit dem echten Katalog noch nicht gelaufen |
| Übungsanleitungen auf Deutsch, Service Worker (App offline neu öffnen), Export/Import, Backup, Auswertung, Fußball | offen |

## Datenbank einrichten und Übungskatalog einspielen

Reihenfolge im SQL-Editor von Supabase (jeweils Inhalt der Datei einfügen und ausführen):

1. `supabase/migrations/0001_fit_schema.sql`
2. `supabase/migrations/0002_fit_last_sets.sql`
   (Wurde 0001 schon in der alten Fassung ausgeführt: zusätzlich `0003_catalog_details_only.sql` ausführen.)
3. Nutzer anlegen (Authentication, Users), danach die Registrierung neuer Nutzer abschalten.
4. Übungskatalog: Auf deinem Rechner (Node 18 oder neuer) im Projektordner
   ```bash
   node tools/build-seed.mjs
   ```
   Das lädt die Übungsliste [free-exercise-db](https://github.com/yuhonas/free-exercise-db) herunter (gemeinfrei) und schreibt `supabase/seed/exercises_seed_1.sql`, `_2.sql` usw. Diese Dateien der Reihe nach im SQL-Editor ausführen. Das Einspielen ist wiederholbar: Vorhandene Katalogübungen werden aktualisiert (Namen, Muskelgruppen, Gerät), ihre IDs bleiben gleich, Pläne und Trainings bleiben also verknüpft. Eigene Übungen bleiben unberührt.

Die Übungen gehören dem ersten Nutzer in `auth.users`, deshalb muss Schritt 3 vor Schritt 4 stehen.

**Was in der Datenbank steht:** Der Katalog (`fit_exercises`) enthält nur Details zur Übung: Name, Muskelgruppen, Gerät und Anleitung. Es gibt keine Gewichte und keine festen Gewichtsschritte. Welches Gewicht du nimmst, steht bei den Sätzen (`fit_sets`).

**Deutsche Namen:** Die Namen in `tools/names_de.txt` (eine Zeile je Übung, „Englischer Name => Deutscher Name") habe ich von Hand übersetzt. Sie sind nicht von einer Fachperson geprüft. Für Übungen, die später im Katalog neu hinzukommen und dort noch fehlen, greift ein Wort-Glossar (`tools/glossary-de.mjs`) als Notlösung; das Skript meldet, wie viele Namen darüber laufen. Einzelne Namen änderst du in `names_de.txt` (oder per Übungs-ID in `tools/names_de.json`) und führst das Skript danach erneut aus. Die Anleitungen bleiben zunächst englisch (`instructions_en`).

**Muskelgruppen:** Übungen speichern `primary_muscles` und `secondary_muscles` als Liste mit den englischen Schlüsseln des Katalogs (z. B. `lats`, `middle back`). Die deutschen Anzeigenamen stehen in `src/lib/muscles.ts`. Beim Anlegen einer eigenen Übung ist mindestens ein Hauptmuskel Pflicht.

## Auf GitHub und Vercel bringen

1. **GitHub:** Leeres, privates Repository `gym-app` anlegen (ohne README). Dann im entpackten Ordner:
   ```bash
   git init -b main
   git add .
   git commit -m "Erste Version der Gym-App"
   git remote add origin https://github.com/DEIN-NAME/gym-app.git
   git push -u origin main
   ```
   `.env` und `node_modules` sind über `.gitignore` ausgeschlossen.
2. **Supabase:** SQL aus `supabase/migrations/0001_fit_schema.sql` und danach `0002_fit_last_sets.sql` im SQL-Editor ausführen. Unter Authentication einen Nutzer mit E-Mail und Passwort anlegen, danach die Registrierung neuer Nutzer abschalten. Projekt-URL und Anon-Key stehen in den Projekteinstellungen unter API.
3. **Vercel:** Projekt aus dem GitHub-Repository importieren. Vite wird erkannt (Build `npm run build`, Ausgabe `dist`). Vor dem ersten Deploy unter Environment Variables eintragen: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Die Werte werden beim Build eingebaut, nach einer Änderung ist ein neuer Deploy nötig.
4. **iPhone:** Die Vercel-Adresse in Safari öffnen, Teilen, „Zum Home-Bildschirm". Erst von dort aus testen, denn so gelten die Speicherregeln der installierten Web-App.

Vor dem Live-Test lokal: `npm run check` prüft Typen und Tests.

## Start

```bash
npm install
cp .env.example .env      # Supabase-URL und Anon-Key eintragen
npm test
npm run dev
```

Datenbank: Inhalt von `supabase/migrations/0001_fit_schema.sql`, danach `0002_fit_last_sets.sql` im SQL-Editor von Supabase ausführen. Danach dein Konto anlegen und unter Authentication die Registrierung neuer Nutzer abschalten.

## Festlegungen

- **Gewichte:** ganze Kilo plus 0 / 0,25 / 0,5 / 0,75 kg, gewählt im Satz. Optional Stangen- oder Maschinengewicht pro Übung im Training (`fit_workout_exercises.equipment_kg`); Gesamtlast = eingegebenes Gewicht + Eigengewicht. Der Übungskatalog enthält keine Gewichte.
- **Double Progression:** Steigerung, sobald in mehr als einem Arbeitssatz die obere Wiederholungsgrenze erreicht wurde (Beispiel bis 12: 12 / 12 / 11 reicht). Die RIR-Angabe wird gespeichert, beeinflusst den Vorschlag aber nicht. Um wie viel du steigerst, entscheidest du selbst: Die App zeigt „Steigern" und lässt das bisherige Gewicht stehen, das neue Gewicht wählst du im Satz. Es gibt keine festen Gewichtsschritte pro Übung.
- **Aufwärmsätze:** Vorschlag als Rampe (50 %, 70 %, 85 % der Gesamtlast inkl. Stange/Maschine, vorgeschlagen wird das einzugebende Gewicht, gerundet auf die Schrittweite). Das ist eine Praxis-Faustregel, keine belegte Norm.
- **Pläne:** Plan → Tage (z. B. Push, Pull, Lower) → Übungen mit Sätzen, Wiederholungsbereich, Ziel-RIR und Pause. Die Startseite bietet den nächsten Tag in der Rotation an; Gewicht, Schritt und Vorschlag kommen aus dem letzten Training der Übung. Entfernte Tage und Übungen werden archiviert, nicht gelöscht.
- **Plan und Ausführung getrennt:** Planwerte werden beim Trainingsstart in `fit_workout_exercises` kopiert.
- **Archivieren statt Löschen:** über `archived_at`.
- **Pausentimer:** speichert den Endzeitpunkt statt eines laufenden Zählers und legt ihn im Trainingsentwurf ab, damit er nach dem Sperren des iPhones und auch nach einem Neuladen der App stimmt.

## Sicherheit

Der Anon-Key steckt im Frontend und ist öffentlich. Geschützt sind die Daten allein durch die Row-Level-Security-Regeln. Backups gehören in ein privates Repo.

## Offline-Verhalten

Das laufende Training und der Ausgangskorb liegen im `localStorage`. Bricht die Verbindung während des Trainings ab, geht nichts verloren, und abgeschlossene Trainings werden gesendet, sobald wieder Empfang besteht. Die App selbst wird noch nicht zwischengespeichert: Ein Neuladen ohne Verbindung schlägt fehl, bis ein Service Worker ergänzt ist.

## Anmeldung per E-Mail-Link und Code

Die App schickt eine E-Mail mit einem Link **und** einem Code. Am Computer tippst du auf den Link. In der App vom iPhone-Home-Bildschirm gibst du den Code ein, denn der Link öffnet Safari und nicht die App. Das Passwort bleibt als Ausweg, falls das Mail-Limit von Supabase erreicht ist. Über das Formular entstehen keine neuen Konten (`shouldCreateUser: false`).

Einrichtung in Supabase (die Menünamen können leicht abweichen):

1. **Authentication, URL Configuration:** Als **Site URL** die Vercel-Adresse eintragen (`https://….vercel.app`) und dieselbe Adresse unter **Redirect URLs** ergänzen. Ohne das führt der Link auf eine falsche Seite.
2. **Authentication, Emails (Templates), „Magic Link":** Den Text so ändern, dass auch der Code darin steht:
   ```html
   <h2>Anmeldung bei Gym-Log</h2>
   <p><a href="{{ .ConfirmationURL }}">Hier tippen, um dich anzumelden</a></p>
   <p>Oder gib diesen Code in der App ein: <strong>{{ .Token }}</strong></p>
   ```
3. **Die Vorlage lässt sich nur bearbeiten, wenn ein eigener SMTP-Server eingerichtet ist** (Authentication, SMTP Settings). Ohne ihn verschickt Supabase die Standardmail, die nur den Link enthält und keinen Code. Dann gilt: Am Computer den Link benutzen, in der App vom iPhone-Home-Bildschirm das Passwort. Der Standardversand geht außerdem nur an Adressen von Projekt-Teammitgliedern.
4. Der integrierte Mailversand von Supabase ist stark begrenzt (nur wenige Mails pro Stunde, bitte die aktuellen Limits prüfen). Für eine Person reicht das, sonst hilft ein eigener SMTP-Anbieter.

## Fehlersuche

- **Meldung „VITE_SUPABASE_URL ist keine gültige Adresse":** Die Variable muss `https://abcdefgh.supabase.co` lauten, ohne Pfad. Anführungszeichen und Leerzeichen entfernt die App selbst. Nach einer Änderung in Vercel neu deployen.
- **Meldung zu einem geheimen Schlüssel:** In die App gehört nur der publishable- bzw. anon-Schlüssel, nie `sb_secret_…` oder `service_role`.
- **„Etwas ist schiefgelaufen":** Die Fehlerseite zeigt den Grund. „Laufendes Training verwerfen und neu laden" löscht nur den lokalen Entwurf, nicht die bereits gesendeten oder im Ausgangskorb wartenden Trainings.
- **Leere Seite ohne Meldung:** In Chrome mit Cmd + Option + J die Konsole öffnen und den roten Text notieren.
