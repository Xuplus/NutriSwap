export type Route = 'home' | 'macros' | 'equivalence' | 'not-found';

// Hash-based routing: GitHub Pages serves project sites from a subpath and has no
// SPA fallback, so #/macros works everywhere without server configuration.
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  switch (path) {
    case '':
      return 'home';
    case 'macros':
      return 'macros';
    case 'equivalence':
      return 'equivalence';
    default:
      return 'not-found';
  }
}

export function routeHref(route: Exclude<Route, 'not-found'>): string {
  return route === 'home' ? '#/' : `#/${route}`;
}
