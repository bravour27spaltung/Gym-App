/**
 * Signalton am Ende der Pause. iOS Safari erlaubt Audio erst nach einer
 * Berührung, deshalb wird der Audio-Kontext beim Abhaken eines Satzes
 * freigeschaltet (unlockAudio) und später nur noch benutzt (beep).
 * Vibration gibt es auf dem iPhone in Web-Apps nicht.
 */

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    void ctx.resume();
  } catch {
    /* ohne Ton weiterlaufen */
  }
}

export function beep(): void {
  try {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* ohne Ton weiterlaufen */
  }
}
