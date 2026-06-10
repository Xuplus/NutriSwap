import { t, type Lang } from '../i18n';
import { routeHref } from '../router';

export function Home({ lang }: { lang: Lang }) {
  return (
    <>
      <section class="hero">
        <h1>{t(lang, 'home.title')}</h1>
        <p>{t(lang, 'home.intro')}</p>
      </section>
      <section class="cards">
        <article class="card">
          <h2>🎯 {t(lang, 'home.macros.title')}</h2>
          <p>{t(lang, 'home.macros.desc')}</p>
          <a class="button" href={routeHref('macros')}>
            {t(lang, 'home.cta')}
          </a>
        </article>
        <article class="card">
          <h2>🔄 {t(lang, 'home.equivalence.title')}</h2>
          <p>{t(lang, 'home.equivalence.desc')}</p>
          <a class="button" href={routeHref('equivalence')}>
            {t(lang, 'home.cta')}
          </a>
        </article>
      </section>
    </>
  );
}
