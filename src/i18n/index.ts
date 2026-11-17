import { en } from './en';
import { zh } from './zh';

export type Messages = typeof en;
export type MessageKey = keyof Messages;
export type Lang = 'en' | 'zh';
export const LANGS = ['en', 'zh'] as const satisfies readonly Lang[];
export const LANG_STORAGE_KEY = 'traczema.lang';

export const MESSAGES: Record<Lang, Messages> = { en, zh };
export { en, zh };

export type MessageParams = Record<string, string | number>;

/** Base names of the `<base>_one` / `<base>_other` plural pairs. */
export type PluralBase = MessageKey extends infer K ? (K extends `${infer B}_other` ? B : never) : never;

export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

export interface Translator {
  lang: Lang;
  t: (key: MessageKey, params?: MessageParams) => string;
  /** Plural-aware lookup: picks `<base>_<rule>` via Intl.PluralRules, falling back to `_other`. */
  tn: (base: PluralBase, count: number, params?: MessageParams) => string;
  /** Runtime check for keys that arrive as plain strings (e.g. engine `labelKey`s). */
  has: (key: string) => key is MessageKey;
}

export function createTranslator(lang: Lang): Translator {
  const messages = MESSAGES[lang];
  const rules = new Intl.PluralRules(lang === 'zh' ? 'zh-CN' : 'en');
  const t: Translator['t'] = (key, params) => interpolate(messages[key], params);
  return {
    lang,
    t,
    tn: (base, count, params) => {
      const specific = `${base}_${rules.select(count)}` as MessageKey;
      const key = specific in messages ? specific : (`${base}_other` as MessageKey);
      return t(key, { count, ...params });
    },
    has: (key): key is MessageKey => Object.prototype.hasOwnProperty.call(messages, key),
  };
}

/** Stored choice wins; otherwise Chinese browsers get 中文 and everyone else English. */
export function resolveInitialLang(stored: string | null | undefined, navigatorLanguage?: string): Lang {
  if (stored === 'en' || stored === 'zh') return stored;
  return navigatorLanguage?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
