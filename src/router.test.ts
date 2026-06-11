import { describe, expect, it } from 'vitest';
import { parseHash, routeHref } from './router';

describe('parseHash', () => {
  it('maps hashes to routes', () => {
    expect(parseHash('')).toBe('home');
    expect(parseHash('#')).toBe('home');
    expect(parseHash('#/')).toBe('home');
    expect(parseHash('#/macros')).toBe('macros');
    expect(parseHash('#/macros/')).toBe('macros');
    expect(parseHash('#/equivalence')).toBe('equivalence');
    expect(parseHash('#/diet')).toBe('diet');
    expect(parseHash('#/attribution')).toBe('attribution');
    expect(parseHash('#/does-not-exist')).toBe('not-found');
  });

  it('routeHref round-trips through parseHash', () => {
    expect(parseHash(routeHref('home'))).toBe('home');
    expect(parseHash(routeHref('macros'))).toBe('macros');
    expect(parseHash(routeHref('equivalence'))).toBe('equivalence');
  });
});
