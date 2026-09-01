/** @fileoverview Locale utilities: direction detection, system locale resolution, form label width. */
import { match } from '@formatjs/intl-localematcher'
import { isSupportedLocale, LOCALE_CATALOG, SUPPORTED_LOCALES, type SupportedLocale } from '@shared/localeCatalog'

/**
 * Resolves a raw OS locale string (e.g. `'zh-Hans-CN'`) to the best
 * matching locale code from the available set (e.g. `'zh-CN'`).
 *
 * Resolution strategy:
 *  1. Normalize Apple-style subtags (`-Hans`, `-Hant`) that don't match BCP 47.
 *  2. Exact match against available locales.
 *  3. Prefix match (e.g. `'pt'` → `'pt-BR'`).
 *  4. Fallback to `'en-US'`.
 */
export function resolveSystemLocale(
  rawLocale: string,
  availableLocales: readonly SupportedLocale[] = SUPPORTED_LOCALES,
): SupportedLocale {
  try {
    const resolved = match([rawLocale], [...availableLocales], 'en-US')
    return isSupportedLocale(resolved) ? resolved : 'en-US'
  } catch {
    return 'en-US'
  }
}

export const isRTL = (locale = 'en-US'): boolean => {
  return LOCALE_CATALOG.find(({ code }) => code === locale)?.direction === 'rtl'
}

export const getLangDirection = (locale = 'en-US'): string => {
  return isRTL(locale) ? 'rtl' : 'ltr'
}

export const calcFormLabelWidth = (locale: string): string => {
  return locale.startsWith('de') ? '28%' : '25%'
}
