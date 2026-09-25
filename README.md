# Gym-Log

Trainings-App für das Fitnessstudio (Handy zuerst, Auswertung auch am PC). Nur für einen Nutzer, ohne laufende Kosten.

## Stand

| Bereich | Status |
| --- | --- |
| Kernlogik in `src/lib` (Gewichte, Double Progression, Aufwärmsätze, Rotation, Pausentimer, Trainings-Zustand, lokaler Speicher) | fertig, 59 Tests |
| Datenbankschema mit Zugriffsregeln (`supabase/migrations/0001_fit_schema.sql`, `0002_fit_last_sets.sql`) | fertig, noch nicht gegen eine echte Supabase-Instanz ausgeführt |
| Log-Ansicht (Login, Training starten, Übungen, kompakte Satzzeilen, Vorbelegung, Aufwärmen, Pausentimer, Ausgangskorb) | im Chromium gegen eine Fake-Datenbank durchgespielt, noch nicht auf dem iPhone oder mit echtem Supabase getestet |
| Trainingspläne (anlegen, bearbeiten, Tage/Übungen verschieben, archivieren, Start aus dem Plan mit Rotation) | wie oben |
| Projekt-Build mit `npm run build` (Vite) | noch nicht ausgeführt, hier ist npm gesperrt; der Code wurde mit Bun gebündelt |
| Service Worker (App offline neu öffnen), Export/Import, Backup, Übungsimport, Auswertung, Fußball | offen |

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

- **Gewichte:** ganze Kilo plus 0 / 0,25 / 0,5 / 0,75 kg. Optional Stangen- oder Maschinengewicht pro Übung (`equipment_kg`); Gesamtlast = eingegebenes Gewicht + Eigengewicht.
- **Double Progression:** Steigerung, sobald in mehr als einem Arbeitssatz die obere Wiederholungsgrenze erreicht wurde (Beispiel bis 12: 12 / 12 / 11 reicht). Die RIR-Angabe wird gespeichert, beeinflusst den Vorschlag aber nicht. Der Sprung entspricht `increment_kg` der Übung.
- **Aufwärmsätze:** Vorschlag als Rampe (50 %, 70 %, 85 % der Gesamtlast inkl. Stange/Maschine, vorgeschlagen wird das einzugebende Gewicht, gerundet auf die Schrittweite). Das ist eine Praxis-Faustregel, keine belegte Norm.
- **Pläne:** Plan → Tage (z. B. Push, Pull, Lower) → Übungen mit Sätzen, Wiederholungsbereich, Ziel-RIR und Pause. Die Startseite bietet den nächsten Tag in der Rotation an; Gewicht, Schritt und Vorschlag kommen aus dem letzten Training der Übung. Entfernte Tage und Übungen werden archiviert, nicht gelöscht.
- **Plan und Ausführung getrennt:** Planwerte werden beim Trainingsstart in `fit_workout_exercises` kopiert.
- **Archivieren statt Löschen:** über `archived_at`.
- **Pausentimer:** speichert den Endzeitpunkt statt eines laufenden Zählers und legt ihn im Trainingsentwurf ab, damit er nach dem Sperren des iPhones und auch nach einem Neuladen der App stimmt.

## Sicherheit

Der Anon-Key steckt im Frontend und ist öffentlich. Geschützt sind die Daten allein durch die Row-Level-Security-Regeln. Backups gehören in ein privates Repo.

## Offline-Verhalten

Das laufende Training und der Ausgangskorb liegen im `localStorage`. Bricht die Verbindung während des Trainings ab, geht nichts verloren, und abgeschlossene Trainings werden gesendet, sobald wieder Empfang besteht. Die App selbst wird noch nicht zwischengespeichert: Ein Neuladen ohne Verbindung schlägt fehl, bis ein Service Worker ergänzt ist.
