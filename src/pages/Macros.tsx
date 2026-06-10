import { t, type Lang } from '../i18n';

export function Macros({ lang }: { lang: Lang }) {
  return (
    <section>
      <h1>{t(lang, 'macros.title')}</h1>
      <p class="placeholder">🚧 {t(lang, 'macros.comingSoon')}</p>
    </section>
  );
}
