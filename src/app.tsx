import { useEffect, useState } from 'preact/hooks';
import { getInitialLang, persistLang, t, type Lang, LANGS } from './i18n';
import { parseHash, routeHref, type Route } from './router';
import { Home } from './pages/Home';
import { Macros } from './pages/Macros';
import { Equivalence } from './pages/Equivalence';
import { Diet } from './pages/Diet';
import { Attribution } from './pages/Attribution';
import { NotFound } from './pages/NotFound';

export function App() {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => persistLang(lang), [lang]);

  const navItems = [
    { route: 'home', label: t(lang, 'nav.home') },
    { route: 'macros', label: t(lang, 'nav.macros') },
    { route: 'equivalence', label: t(lang, 'nav.equivalence') },
    { route: 'diet', label: t(lang, 'nav.diet') },
  ] as const;

  return (
    <div class="layout">
      <header class="header">
        <a class="brand" href={routeHref('home')}>
          🥗 NutriSwap
        </a>
        <nav class="nav" aria-label="main">
          {navItems.map((item) => (
            <a
              key={item.route}
              href={routeHref(item.route)}
              aria-current={route === item.route ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div class="lang-switch" role="group" aria-label="language">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              class={l === lang ? 'active' : ''}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main class="main">
        {route === 'home' && <Home lang={lang} />}
        {route === 'macros' && <Macros lang={lang} />}
        {route === 'equivalence' && <Equivalence lang={lang} />}
        {route === 'diet' && <Diet lang={lang} />}
        {route === 'attribution' && <Attribution lang={lang} />}
        {route === 'not-found' && <NotFound lang={lang} />}
      </main>

      <footer class="footer">
        <p>{t(lang, 'app.disclaimer')}</p>
        <p>
          <a href={routeHref('attribution')}>{t(lang, 'footer.attribution')}</a>
          {' · '}
          <a href="https://github.com/Xuplus/NutriSwap" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
