import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StretchHowTo } from './StretchHowTo';

describe('StretchHowTo', () => {
  it('zeigt Schritte, Muskelnamen und den Intensitätshinweis', () => {
    const html = renderToString(
      <StretchHowTo muscles={['hip flexors']} instructions={['Erster Schritt.', 'Zweiter Schritt.']} />,
    );
    expect(html).toContain('Anleitung');
    expect(html).toContain('Erster Schritt.');
    expect(html).toContain('Zweiter Schritt.');
    expect(html).toContain('Hüftbeuger');
    expect(html).toContain('nicht bis Schmerz');
  });

  it('nummeriert die Schritte als geordnete Liste', () => {
    const html = renderToString(<StretchHowTo muscles={['neck']} instructions={['A.', 'B.']} />);
    expect(html).toContain('<ol>');
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it('zeigt nichts ohne Anleitung (eigene Übung oder Katalog noch nicht importiert)', () => {
    expect(renderToString(<StretchHowTo muscles={['neck']} />)).toBe('');
    expect(renderToString(<StretchHowTo muscles={['neck']} instructions={null} />)).toBe('');
    expect(renderToString(<StretchHowTo muscles={['neck']} instructions={[]} />)).toBe('');
  });
});
