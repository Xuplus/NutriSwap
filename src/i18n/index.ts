export type Lang = 'es' | 'en';

export const LANGS: Lang[] = ['es', 'en'];

const STORAGE_KEY = 'nutriswap.lang';

export const messages = {
  es: {
    'app.tagline': 'Tus macros, tus equivalencias',
    'app.disclaimer':
      'Herramienta educativa. No sustituye el consejo de un profesional de la salud.',
    'nav.home': 'Inicio',
    'nav.macros': 'Calculadora de macros',
    'nav.equivalence': 'Equivalencias',
    'home.title': 'Bienvenido a NutriSwap',
    'home.intro':
      'Dos herramientas para planificar tu alimentación con datos abiertos de composición de alimentos en España.',
    'home.macros.title': 'Calculadora de macros',
    'home.macros.desc':
      'A partir de tus datos, actividad y objetivo, calcula las calorías, proteínas, carbohidratos y grasas que necesitas cada día.',
    'home.equivalence.title': 'Equivalencias de alimentos',
    'home.equivalence.desc':
      'Encuentra alimentos intercambiables por sus macronutrientes: cuántos gramos de merluza equivalen a tu pechuga de pollo.',
    'home.cta': 'Abrir herramienta',
    'macros.title': 'Calculadora de macros',
    'macros.comingSoon':
      'En construcción: aquí calcularás tus calorías y macros diarios según tu objetivo.',
    'equivalence.title': 'Equivalencias de alimentos',
    'equivalence.comingSoon':
      'En construcción: aquí buscarás alimentos equivalentes en macronutrientes.',
    'notFound.title': 'Página no encontrada',
    'notFound.back': 'Volver al inicio',
  },
  en: {
    'app.tagline': 'Your macros, your swaps',
    'app.disclaimer': 'Educational tool. Not a substitute for professional medical advice.',
    'nav.home': 'Home',
    'nav.macros': 'Macro calculator',
    'nav.equivalence': 'Equivalences',
    'home.title': 'Welcome to NutriSwap',
    'home.intro':
      'Two tools to plan your nutrition using open food composition data from Spain.',
    'home.macros.title': 'Macro calculator',
    'home.macros.desc':
      'From your personal data, activity and goal, calculate the calories, protein, carbs and fat you need every day.',
    'home.equivalence.title': 'Food equivalences',
    'home.equivalence.desc':
      'Find foods that are interchangeable by macronutrients: how many grams of hake equal your chicken breast.',
    'home.cta': 'Open tool',
    'macros.title': 'Macro calculator',
    'macros.comingSoon':
      'Under construction: here you will calculate your daily calories and macros for your goal.',
    'equivalence.title': 'Food equivalences',
    'equivalence.comingSoon':
      'Under construction: here you will search for macro-equivalent foods.',
    'notFound.title': 'Page not found',
    'notFound.back': 'Back to home',
  },
} as const;

export type MessageKey = keyof (typeof messages)['es'];

export function t(lang: Lang, key: MessageKey): string {
  return messages[lang][key] ?? messages.es[key] ?? key;
}

export function getInitialLang(): Lang {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored === 'es' || stored === 'en') return stored;
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return 'en';
  }
  return 'es';
}

export function persistLang(lang: Lang): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
