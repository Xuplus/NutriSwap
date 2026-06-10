import { t, type Lang } from '../i18n';

export function Attribution({ lang }: { lang: Lang }) {
  return (
    <section>
      <h1>{t(lang, 'attribution.title')}</h1>
      <p class="intro">{t(lang, 'attribution.intro')}</p>
      <div class="panel">
        <h2>
          <a href="https://www.bedca.net" target="_blank" rel="noopener noreferrer">
            BEDCA
          </a>
        </h2>
        <p>{t(lang, 'attribution.bedca.desc')}</p>
        <h2>
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
            Open Food Facts
          </a>
        </h2>
        <p>
          {t(lang, 'attribution.off.desc')}{' '}
          <a
            href="https://opendatacommons.org/licenses/odbl/1-0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ODbL 1.0
          </a>
        </p>
        <p>{t(lang, 'attribution.method')}</p>
        <p>
          <a href="https://github.com/Xuplus/NutriSwap" target="_blank" rel="noopener noreferrer">
            {t(lang, 'attribution.repo')}
          </a>
        </p>
      </div>
    </section>
  );
}
