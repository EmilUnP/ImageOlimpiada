export const LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Russian',
  az: 'Azerbaijani',
};

export const getLanguageName = (code) => LANGUAGE_NAMES[code] || code;

/** Normalise OCR + translation pairs from the client into a consistent shape */
export const normaliseTextPairs = (translatedTexts = []) => {
  if (!Array.isArray(translatedTexts) || translatedTexts.length === 0) return [];

  return translatedTexts
    .map((pair) => {
      const original = typeof pair.original === 'string' ? pair.original.trim() : '';
      const translated = typeof pair.translated === 'string' ? pair.translated.trim() : '';
      const boundingBox =
        pair.boundingBox &&
        typeof pair.boundingBox === 'object' &&
        ['x', 'y', 'width', 'height'].every((key) => typeof pair.boundingBox[key] === 'number')
          ? {
              x: pair.boundingBox.x,
              y: pair.boundingBox.y,
              width: pair.boundingBox.width,
              height: pair.boundingBox.height,
            }
          : undefined;

      if (!original || !translated) return null;
      return { original, translated, boundingBox };
    })
    .filter(Boolean);
};
