// Supabase Edge Function: nimmt die Apple-Watch-Werte für EINEN Zeitraum von einem iOS-Kurzbefehl
// entgegen und legt genau ein Ergebnis pro Zeitraum in fit_watch_ranges ab (Migration 0020). Die App
// liest es und trägt Ø Puls und Distanz ins Fußball-Formular ein. Es wird nie selbst ein Fußball-Eintrag
// angelegt: Art der Einheit und RPE bleiben deine Eingabe.
//
// Aufruf: POST .../functions/v1/football-import[?ping=1|?dry=1]
// Header: x-import-token: <IMPORT_TOKEN>
// Body (JSON), Details und Beispiele in README.md:
//   {
//     "range": "<Start>|<Ende>",     // Pflicht: die Kurzbefehl-Eingabe unverändert zurückgeben
//     "avg_hr": 132, "max_hr": 171, "hr_count": 14,   // fertige Zahlen (bevorzugt)
//     "steps_total": 6200, "distance_km": 4.2,
//     "hr": "<Start>|<Ende>|<Wert>\n...", "steps": "...", "distance": "..."   // Rückfall: Rohzeilen
//   }
//
// ?ping=1  prüft nur Erreichbarkeit und Token (Stufe 1 des Kurzbefehl-Tests), schreibt nichts.
// ?dry=1   wertet aus und antwortet, schreibt aber nichts.
//
// Die Antwort enthält immer `message` (Klartext, im Kurzbefehl mit „Ergebnis anzeigen“ sichtbar).
//
// Authentifizierung: ein langes zufälliges Geheimnis (IMPORT_TOKEN) statt eines Nutzer-JWT, weil ein
// Kurzbefehl keinen ablaufenden Supabase-Token erneuern kann. Die Funktion schreibt mit der Service-Rolle
// für genau einen Nutzer (IMPORT_USER_ID). Das Token berechtigt nur dazu, Zeitraum-Ergebnisse anzulegen
// oder zu aktualisieren, nicht zum Lesen. Deshalb mit --no-verify-jwt deployen (siehe README.md).
//
// Secrets (supabase secrets set ...): IMPORT_TOKEN, IMPORT_USER_ID.
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildRangeResult, describeRangeResult } from './parse.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IMPORT_TOKEN = Deno.env.get('IMPORT_TOKEN');
const IMPORT_USER_ID = Deno.env.get('IMPORT_USER_ID');

const MAX_BODY_BYTES = 2_000_000;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Fehlerantwort mit `message`, damit der Kurzbefehl den Grund anzeigen kann. */
function fail(error: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error, message: `Fehler: ${error}`, ...extra }, status);
}

/** Vergleich ohne frühes Abbrechen (kein Zeitkanal über die Länge des gemeinsamen Präfixes). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return fail('Nur POST erlaubt', 405);

  if (!IMPORT_TOKEN || !IMPORT_USER_ID) {
    return fail('IMPORT_TOKEN/IMPORT_USER_ID sind nicht als Secrets gesetzt', 500);
  }
  const given = req.headers.get('x-import-token') ?? '';
  if (!safeEqual(given, IMPORT_TOKEN)) return fail('Ungültiges Token (Header x-import-token)', 401);

  const url = new URL(req.url);
  if (url.searchParams.get('ping') === '1') {
    return json({ ok: true, ping: true, message: 'Verbindung und Token in Ordnung. Es wurde nichts gespeichert.' });
  }

  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return fail('Anfrage zu groß', 413);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('kein Objekt');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail('Ungültiges JSON (Anfragetext muss ein JSON-Objekt sein)', 400);
  }

  const built = buildRangeResult(body);
  if (!built.ok) return fail(built.error, 400, { receivedKeys: Object.keys(body) });

  const message = describeRangeResult(built.result);
  const summary = {
    from: new Date(built.fromMs).toISOString(),
    to: new Date(built.toMs).toISOString(),
    result: built.result,
    source: built.source,
    invalid: built.invalid,
  };

  if (url.searchParams.get('dry') === '1') return json({ ok: true, dry: true, message, ...summary });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await supabase.from('fit_watch_ranges').upsert(
    {
      user_id: IMPORT_USER_ID,
      from_at: summary.from,
      to_at: summary.to,
      hr_samples: built.result.hrSamples,
      avg_heart_rate: built.result.avgHeartRate,
      max_heart_rate: built.result.maxHeartRate,
      steps: built.result.steps,
      distance_km: built.result.distanceKm,
      source: built.source,
      received_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,from_at,to_at' },
  );
  if (error) return fail(`Speichern fehlgeschlagen: ${error.message}`, 500);

  return json({ ok: true, dry: false, message, ...summary });
});
