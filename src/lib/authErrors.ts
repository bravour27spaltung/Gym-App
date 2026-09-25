/**
 * Übersetzt die englischen Fehlermeldungen von Supabase Auth in verständliches
 * Deutsch. Unbekannte Meldungen bleiben im Original erhalten, damit nichts
 * verschluckt wird.
 */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes('signups not allowed') || m.includes('user not found')) {
    return 'Zu dieser E-Mail-Adresse gibt es kein Konto. Prüfe die Schreibweise.';
  }
  if (m.includes('rate limit') || m.includes('only request this after') || m.includes('too many')) {
    const seconds = /after (\d+) seconds?/.exec(m)?.[1];
    return seconds
      ? `Zu viele Anfragen. Warte ${seconds} Sekunden und versuche es dann erneut.`
      : 'Zu viele Anfragen. Warte einige Minuten oder melde dich mit dem Passwort an.';
  }
  if (m.includes('expired') || (m.includes('invalid') && m.includes('token'))) {
    return 'Der Code ist ungültig oder abgelaufen. Fordere einen neuen an.';
  }
  if (m.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort stimmen nicht.';
  }
  if (
    m.includes('valid email') ||
    m.includes('invalid email') ||
    m.includes('validate email') ||
    m.includes('invalid format')
  ) {
    return 'Das ist keine gültige E-Mail-Adresse.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.';
  }
  return message;
}

/** Nimmt einen eingetippten Code an: nur Ziffern, 6 bis 10 Stellen (Supabase ist einstellbar). */
export function normalizeCode(input: string): string | null {
  const digits = input.replace(/\s+/g, '');
  return /^\d{6,10}$/.test(digits) ? digits : null;
}
