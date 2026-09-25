/**
 * Prüft die Supabase-Angaben aus den Umgebungsvariablen, bevor sie an die
 * Bibliothek gehen. Die Bibliothek wirft bei einer ungültigen Adresse sofort,
 * und dann bleibt die Seite leer. Hier wird stattdessen im Klartext gesagt,
 * was falsch ist.
 */

export type SupabaseConfig = { ok: true; url: string; key: string } | { ok: false; error: string };

/**
 * Entfernt, was beim Einfügen leicht mitkommt: Leerzeichen, umschließende
 * Anführungszeichen und den Variablennamen, falls die ganze Zeile
 * (VITE_SUPABASE_URL=https://…) im Wertfeld gelandet ist.
 */
export function cleanEnv(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
    .replace(/^(?:export\s+)?VITE_[A-Z0-9_]+\s*=\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

function shorten(text: string, max = 40): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Liest die Rolle aus einem JWT-Schlüssel (nur zur Sicherheitsprüfung, ohne Signaturprüfung). */
function jwtRole(key: string): string | null {
  try {
    const part = key.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

export function resolveSupabaseConfig(
  rawUrl: string | undefined,
  rawKey: string | undefined,
): SupabaseConfig {
  const url = cleanEnv(rawUrl);
  const key = cleanEnv(rawKey);

  if (url === '' && key === '') {
    return {
      ok: false,
      error:
        'Die Variablen VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen. ' +
        'Lege sie an (lokal in der Datei .env, bei Vercel unter Environment Variables) und baue bzw. deploye neu.',
    };
  }
  if (url === '') return { ok: false, error: 'Die Variable VITE_SUPABASE_URL fehlt.' };
  if (key === '') return { ok: false, error: 'Die Variable VITE_SUPABASE_ANON_KEY fehlt.' };

  if (/^sb_(publishable|secret)_|^eyJ/.test(url)) {
    return {
      ok: false,
      error:
        'VITE_SUPABASE_URL enthält einen Schlüssel statt der Projekt-URL. Vermutlich sind die beiden Werte vertauscht.',
    };
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
    return {
      ok: false,
      error:
        `VITE_SUPABASE_URL ist keine gültige Adresse (Wert beginnt mit „${shorten(url)}"). ` +
        'Sie muss so aussehen: https://abcdefgh.supabase.co',
    };
  }

  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return {
      ok: false,
      error:
        'VITE_SUPABASE_ANON_KEY enthält einen GEHEIMEN Schlüssel (secret bzw. service_role). ' +
        'Der darf nie in eine Web-App. Verwende den publishable- bzw. anon-Schlüssel und ersetze den geheimen in Supabase.',
    };
  }

  return { ok: true, url: parsed.origin, key };
}
