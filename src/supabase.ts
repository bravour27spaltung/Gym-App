import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Der Anon-Key ist im Frontend öffentlich sichtbar. Die Sicherheit liegt
// allein in den Row-Level-Security-Regeln (siehe supabase/migrations).
export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;
