import { describe, expect, it } from 'vitest';
import { LANGS, messages, t } from './index';

describe('i18n', () => {
  it('has the same keys in every language', () => {
    const [first, ...rest] = LANGS;
    const reference = Object.keys(messages[first]).sort();
    for (const lang of rest) {
      expect(Object.keys(messages[lang]).sort()).toEqual(reference);
    }
  });

  it('has no empty translations', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value, `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('translates a known key', () => {
    expect(t('es', 'nav.home')).toBe('Inicio');
    expect(t('en', 'nav.home')).toBe('Home');
  });
});
