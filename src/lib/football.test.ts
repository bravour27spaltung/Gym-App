import { describe, expect, it } from 'vitest';
import { footballKindLabel } from './football';

describe('footballKindLabel', () => {
  it('benennt die alten Untertypen deutsch', () => {
    expect(footballKindLabel('training')).toBe('Mannschaftstraining');
    expect(footballKindLabel('casual')).toBe('Lockeres Kicken');
    expect(footballKindLabel('match')).toBe('Spiel');
  });
});
