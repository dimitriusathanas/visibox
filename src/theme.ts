import { useSyncExternalStore } from 'react';
import { Platform, useColorScheme } from 'react-native';

import type { Freshness } from './shared/dates.ts';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textDim: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  freezer: string;
  freezerSoft: string;
  fresh: string;
  soon: string;
  eat: string;
  toss: string;
  cookSwipe: string;
  eatSwipe: string;
  overlay: string;
  shadow: string;
}

const light: Palette = {
  bg: '#F6F4EE',
  surface: '#FFFEFA',
  surfaceAlt: '#EEEFE7',
  border: '#D7DDCF',
  text: '#24392E',
  textDim: '#687366',
  primary: '#375F48',
  primaryText: '#FFFFFF',
  primarySoft: '#E5EDD9',
  freezer: '#4E7882',
  freezerSoft: '#E4ECEB',
  fresh: '#528353',
  soon: '#A47A19',
  eat: '#C06435',
  toss: '#D14343',
  cookSwipe: '#2F9459',
  eatSwipe: '#E06A12',
  overlay: 'rgba(10, 20, 28, 0.45)',
  shadow: '#0B1A24',
};

const dark: Palette = {
  bg: '#0C1318',
  surface: '#152029',
  surfaceAlt: '#1B2832',
  border: '#26363F',
  text: '#E8EFF3',
  textDim: '#93A4B0',
  primary: '#3EC1C3',
  primaryText: '#062022',
  primarySoft: '#123336',
  freezer: '#6BB2F0',
  freezerSoft: '#14283A',
  fresh: '#4CC27C',
  soon: '#E8B82E',
  eat: '#F2873A',
  toss: '#EF6464',
  cookSwipe: '#2B8A52',
  eatSwipe: '#C9600F',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
};

// A page that embeds the web build can force a theme with <html data-theme="dark|light">.
function subscribeTheme(onChange: () => void) {
  if (typeof document === 'undefined') return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const readTheme = () => (typeof document === 'undefined' ? null : document.documentElement.getAttribute('data-theme'));
const useWebTheme = () => useSyncExternalStore(subscribeTheme, readTheme, () => null);
const useForcedTheme = Platform.OS === 'web' ? useWebTheme : () => null;

export function usePalette(): Palette {
  const system = useColorScheme();
  const forced = useForcedTheme();
  const scheme = forced === 'dark' || forced === 'light' ? forced : system;
  return scheme === 'dark' ? dark : light;
}

export function freshnessColor(p: Palette, f: Freshness): string {
  return { fresh: p.fresh, soon: p.soon, eat: p.eat, toss: p.toss }[f];
}

export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
