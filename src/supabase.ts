import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseConfig } from './lib/config';

// Der Schlüssel ist im Frontend öffentlich sichtbar. Die Sicherheit liegt
// allein in den Row-Level-Security-Regeln (siehe supabase/migrations).
// Die Angaben werden geprüft, bevor createClient sie bekommt: bei einem
// ungültigen Wert würde die Bibliothek werfen und die Seite bliebe leer.

let client: SupabaseClient | null = null;
let problem: string | null = null;

const config = resolveSupabaseConfig(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
);

if (config.ok) {
  try {
    client = createClient(config.url, config.key);
  } catch (e) {
    problem = `Supabase konnte nicht gestartet werden: ${e instanceof Error ? e.message : String(e)}`;
  }
} else {
  problem = config.error;
}

export const supabase = client;
/** Klartext-Grund, warum es keinen Supabase-Client gibt (null, wenn alles in Ordnung ist). */
export const configError = problem;
