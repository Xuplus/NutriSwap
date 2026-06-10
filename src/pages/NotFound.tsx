import { t, type Lang } from '../i18n';
import { routeHref } from '../router';

export function NotFound({ lang }: { lang: Lang }) {
  return (
    <section>
      <h1>{t(lang, 'notFound.title')}</h1>
      <a class="button" href={routeHref('home')}>
        {t(lang, 'notFound.back')}
      </a>
    </section>
  );
}
