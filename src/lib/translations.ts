import type { TranslatedText } from "./types";

/** Replace one row's translation (or add it), leaving the rest of the table alone */
export const upsertTranslation = (translations: TranslatedText[], next: TranslatedText): TranslatedText[] =>
  translations.some((t) => t.id === next.id)
    ? translations.map((t) => (t.id === next.id ? next : t))
    : [...translations, next];

/**
 * Fold a fresh machine run into the table. Translations the user typed always win,
 * and a row the machine returned empty keeps the translation it already had.
 */
export const mergeMachineTranslations = (
  current: TranslatedText[],
  fresh: TranslatedText[]
): TranslatedText[] => {
  const byId = new Map(current.map((t) => [t.id, t]));
  const freshIds = new Set(fresh.map((t) => t.id));

  return [
    ...fresh.map((t) => {
      const existing = byId.get(t.id);
      if (existing?.edited) return existing;
      if (!t.translatedText?.trim() && existing?.translatedText?.trim()) return existing;
      return t;
    }),
    ...current.filter((t) => t.edited && !freshIds.has(t.id)),
  ];
};
