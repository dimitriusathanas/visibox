import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

import type { Lang } from '../shared/types.ts';

export interface Settings {
  lang: Lang;
  userName: string;
  /** Keys from STAPLES the household always has. */
  staples: string[];
  diet: string;
}

export const STAPLES: readonly { key: string; en: string; bg: string }[] = [
  { key: 'oil', en: 'oil', bg: 'олио' },
  { key: 'olive_oil', en: 'olive oil', bg: 'зехтин' },
  { key: 'salt', en: 'salt', bg: 'сол' },
  { key: 'pepper', en: 'black pepper', bg: 'черен пипер' },
  { key: 'paprika', en: 'paprika', bg: 'червен пипер' },
  { key: 'savory', en: 'savory (chubritsa)', bg: 'чубрица' },
  { key: 'garlic', en: 'garlic', bg: 'чесън' },
  { key: 'onions', en: 'onions', bg: 'лук' },
  { key: 'flour', en: 'flour', bg: 'брашно' },
  { key: 'sugar', en: 'sugar', bg: 'захар' },
  { key: 'rice', en: 'rice', bg: 'ориз' },
  { key: 'pasta', en: 'pasta', bg: 'паста' },
  { key: 'vinegar', en: 'vinegar', bg: 'оцет' },
  { key: 'tomato_paste', en: 'tomato paste', bg: 'доматено пюре' },
  { key: 'honey', en: 'honey', bg: 'мед' },
];

function deviceLang(): Lang {
  try {
    return getLocales()[0]?.languageCode === 'bg' ? 'bg' : 'en';
  } catch {
    return 'en';
  }
}

export function defaultSettings(): Settings {
  return {
    lang: deviceLang(),
    userName: '',
    staples: ['oil', 'olive_oil', 'salt', 'pepper', 'paprika', 'garlic', 'onions', 'flour', 'sugar', 'rice', 'pasta'],
    diet: '',
  };
}

const KEY = 'vf:settings:v1';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) } : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => undefined);
}

export function stapleLabels(keys: string[], lang: Lang): string[] {
  return STAPLES.filter((s) => keys.includes(s.key)).map((s) => s[lang]);
}
