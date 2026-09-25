import { describe, expect, it } from 'vitest';
import { cleanEnv, resolveSupabaseConfig } from './config';

const KEY = 'sb_publishable_abcdef';
const jwt = (role: string) =>
  `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.sig`;

function error(url: string | undefined, key: string | undefined): string {
  const r = resolveSupabaseConfig(url, key);
  if (r.ok) throw new Error('Fehler erwartet, aber Konfiguration ist gültig');
  return r.error;
}

describe('Supabase-Konfiguration', () => {
  it('akzeptiert eine gültige Konfiguration', () => {
    expect(resolveSupabaseConfig('https://abc.supabase.co', KEY)).toEqual({
      ok: true,
      url: 'https://abc.supabase.co',
      key: KEY,
    });
  });

  it('bereinigt Anführungszeichen und Leerzeichen, wie sie beim Einfügen mitkommen', () => {
    expect(cleanEnv('  "https://abc.supabase.co"  ')).toBe('https://abc.supabase.co');
    expect(cleanEnv("'x'")).toBe('x');
    const r = resolveSupabaseConfig('"https://abc.supabase.co"\n', ` ${KEY} `);
    expect(r).toEqual({ ok: true, url: 'https://abc.supabase.co', key: KEY });
  });

  it('entfernt den Variablennamen, wenn die ganze Zeile eingefügt wurde', () => {
    expect(cleanEnv('VITE_SUPABASE_URL=https://abc.supabase.co')).toBe('https://abc.supabase.co');
    expect(cleanEnv('VITE_SUPABASE_URL = "https://abc.supabase.co"')).toBe('https://abc.supabase.co');
    expect(cleanEnv('export VITE_SUPABASE_ANON_KEY=sb_publishable_abc')).toBe('sb_publishable_abc');
    const r = resolveSupabaseConfig(
      'VITE_SUPABASE_URL=https://cemcjqfjcwzibxxdwrid.supabase.co',
      'VITE_SUPABASE_ANON_KEY=' + KEY,
    );
    expect(r).toEqual({ ok: true, url: 'https://cemcjqfjcwzibxxdwrid.supabase.co', key: KEY });
  });

  it('entfernt einen angehängten Pfad wie /rest/v1', () => {
    const r = resolveSupabaseConfig('https://abc.supabase.co/rest/v1/', KEY);
    expect(r).toMatchObject({ ok: true, url: 'https://abc.supabase.co' });
  });

  it('meldet fehlende Variablen einzeln und gemeinsam', () => {
    expect(error(undefined, undefined)).toContain('fehlen');
    expect(error('', KEY)).toBe('Die Variable VITE_SUPABASE_URL fehlt.');
    expect(error('https://abc.supabase.co', '  ')).toBe('Die Variable VITE_SUPABASE_ANON_KEY fehlt.');
  });

  it('meldet eine Adresse ohne https:// im Klartext', () => {
    expect(error('abc.supabase.co', KEY)).toContain('keine gültige Adresse');
    expect(error('abc.supabase.co:443', KEY)).toContain('keine gültige Adresse');
    expect(error('ftp://abc.supabase.co', KEY)).toContain('keine gültige Adresse');
  });

  it('erkennt vertauschte Werte', () => {
    expect(error(KEY, 'https://abc.supabase.co')).toContain('vertauscht');
    expect(error(jwt('anon'), KEY)).toContain('vertauscht');
  });

  it('lehnt geheime Schlüssel ab, akzeptiert anon-Schlüssel', () => {
    expect(error('https://abc.supabase.co', 'sb_secret_abc')).toContain('GEHEIMEN');
    expect(error('https://abc.supabase.co', jwt('service_role'))).toContain('GEHEIMEN');
    expect(resolveSupabaseConfig('https://abc.supabase.co', jwt('anon')).ok).toBe(true);
  });

  it('gibt den geheimen Schlüssel nicht in der Fehlermeldung aus', () => {
    expect(error('https://abc.supabase.co', 'sb_secret_topsecret123')).not.toContain('topsecret123');
  });
});
