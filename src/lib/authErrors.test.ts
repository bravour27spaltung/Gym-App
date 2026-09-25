import { describe, expect, it } from 'vitest';
import { normalizeCode, translateAuthError } from './authErrors';

describe('Auth-Fehlermeldungen', () => {
  it('übersetzt bekannte Meldungen', () => {
    expect(translateAuthError('Signups not allowed for otp')).toContain('kein Konto');
    expect(translateAuthError('Invalid login credentials')).toBe('E-Mail oder Passwort stimmen nicht.');
    expect(translateAuthError('Token has expired or is invalid')).toContain('ungültig oder abgelaufen');
    expect(translateAuthError('Failed to fetch')).toContain('Keine Verbindung');
    expect(translateAuthError('Unable to validate email address: invalid format')).toContain('gültige E-Mail');
  });

  it('nennt bei Wartezeit die Sekunden', () => {
    expect(
      translateAuthError('For security purposes, you can only request this after 47 seconds.'),
    ).toBe('Zu viele Anfragen. Warte 47 Sekunden und versuche es dann erneut.');
    expect(translateAuthError('email rate limit exceeded')).toContain('Passwort');
  });

  it('lässt unbekannte Meldungen unverändert', () => {
    expect(translateAuthError('Something unexpected')).toBe('Something unexpected');
  });
});

describe('Code-Eingabe', () => {
  it('akzeptiert 6 bis 10 Ziffern, auch mit Leerzeichen', () => {
    expect(normalizeCode('123456')).toBe('123456');
    expect(normalizeCode(' 123 456 ')).toBe('123456');
    expect(normalizeCode('12345678')).toBe('12345678');
  });

  it('lehnt zu kurze, zu lange und nicht numerische Eingaben ab', () => {
    expect(normalizeCode('12345')).toBeNull();
    expect(normalizeCode('12345678901')).toBeNull();
    expect(normalizeCode('12a456')).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });
});
