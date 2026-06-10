import { t, type Lang } from '../i18n';

export function Equivalence({ lang }: { lang: Lang }) {
  return (
    <section>
      <h1>{t(lang, 'equivalence.title')}</h1>
      <p class="placeholder">🚧 {t(lang, 'equivalence.comingSoon')}</p>
    </section>
  );
}
