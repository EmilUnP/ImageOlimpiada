export const EXAM_CORPUS_CONTEXT = `CORPUS CONTEXT:
- Batch of ~12,000+ old Russian (Cyrillic) exam scans from many subjects and exam sections
- Each image may differ in subject, layout, quality, and size — handle each independently by visible content
- Goal: faithful preservation for downstream OCR and translation, not interpretation or solving`;

export const TEXTBOOK_OCR_PROMPT = `You are an expert OCR specialist for a large archive of old scanned exam and textbook material.

${EXAM_CORPUS_CONTEXT}

The image may be a full page or a small crop from any subject: question stem, diagram, table, graph, formula, map, or illustration fragment.

DETECT ALL READABLE TEXT (any subject):
- Question numbers, section titles, instructions (Задача, Вопрос, Выберите, Установите соответствие, etc.)
- Numbered labels on diagrams, maps, charts, and figures
- Callout labels, captions, footnotes, and table headers/cells
- Graph axis labels, tick values, and unit abbreviations (Latin or Cyrillic)
- Multiple-choice options (A/B/C/D or а/б/в/г)
- Names, dates, places, terms, and sentences in any academic field
- Short formula or unit snippets when they contain readable characters

PRESERVE EXACTLY AS WRITTEN:
- All notation: math symbols, chemistry formulas, units, variables, subscripts, superscripts, fractions
- Numbers, punctuation, and original spelling — even if faded or unclear
- Do NOT solve, complete, guess missing parts, fix grammar, or modernize wording
- If text is illegible, omit that block rather than inventing content

GROUPING:
- One block per logical unit (label, cell, option, caption, formula line, paragraph fragment)
- Reading order: top to bottom, left to right
- Diagram-only images: one block per visible label or number

For each block return:
- "text": exact content as seen
- "confidence": 0.0–1.0 (lower when uncertain)
- "boundingBox": {x, y, width, height} in pixels when possible

Return ONLY valid JSON array:
[
  {"text": "exact text", "confidence": 0.95, "boundingBox": {"x": 10, "y": 20, "width": 100, "height": 30}}
]

No markdown. No explanations. Omit boundingBox if unknown.`;

export const ACADEMIC_TRANSLATION_RULES = `ACADEMIC / EXAM CORPUS RULES:
${EXAM_CORPUS_CONTEXT}

- Translate natural language to the target language with correct terminology for whatever subject is visible
- Preserve meaning exactly; do not simplify, summarize, or solve
- KEEP UNCHANGED: numbers, formulas, equations, symbols, variables, units, dates used as data
- KEEP UNCHANGED: numbered diagram labels when they are digits only (1, 2, 3…)
- KEEP UNCHANGED: all non-text visuals — diagrams, graphs, tables, maps, photos, geometry, line art
- KEEP UNCHANGED: option letters (A/B/C/D) unless translating the text after the letter
- Translate readable labels, questions, and instructions; keep layout and leader lines intact
- Use clear academic language appropriate to the target language`;

export const buildAcademicTextTranslationPrompt = (items, targetLanguageName) => {
  const lines = items
    .map((item, idx) => `${idx + 1}. "${item.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim()}"`)
    .join('\n');

  return `You are a professional academic translator for a large archive of old exam material (all subjects).

Translate the following text blocks to ${targetLanguageName}.

${ACADEMIC_TRANSLATION_RULES}

REQUIREMENTS:
1. Return ONLY a valid JSON array of strings
2. Same order and same number of items as input
3. Translate each block completely and accurately
4. If a block is ONLY a formula, number, symbol, or unit with no translatable words, return it unchanged

Texts:
${lines}

Return ONLY: ["translation1", "translation2", "..."]`;
};

export const buildImageTextReplacementPrompt = ({
  textPairs = [],
  correctedTexts = [],
  targetLangName = 'English',
}) => {
  let prompt = `You are editing a scanned textbook or exam image. Your job is IN-PLACE TEXT REPLACEMENT — like Photoshop, not adding labels.

TASK: Replace every listed original text with the exact ${targetLangName} translation. Keep the image identical except for those text changes.

FOR EACH REPLACEMENT:
1. Completely remove the original text (inpaint the paper/background behind it)
2. Write the replacement string in the exact same position
3. Match original typography: font size, weight, alignment, ink color, serif/sans-serif style
4. Do not cover, erase, or alter diagram lines, arrows, leader lines, or drawings

STRICT RULES:
- Use the replacement strings EXACTLY as given — do not re-translate or change spelling
- Never show both the original and translated text
- Never add rectangles, boxes, stickers, highlights, or colored patches behind text
- Never add new callout labels, floating captions, or text in empty areas
- Never move text to a different location on the image
- Keep image size, crop, and all non-text content unchanged
`;

  if (textPairs.length > 0) {
    prompt += `\nREPLACEMENTS (copy each "→" string exactly):\n`;
    textPairs.forEach((pair, i) => {
      prompt += `${i + 1}. "${pair.original}" → "${pair.translated}"\n`;
    });
  } else if (correctedTexts.length > 0) {
    prompt += `\nTranslate these text blocks to ${targetLangName} in place:\n`;
    correctedTexts.forEach((text, i) => {
      prompt += `${i + 1}. "${text}"\n`;
    });
  }

  if (/azerbaijani/i.test(targetLangName)) {
    prompt += `\nFor Azerbaijani use correct characters: ı, ş, ə, ü, ö, ç, ğ, İ, Ş, Ə — never mix Cyrillic and Latin.\n`;
  }

  prompt += `\nReturn ONLY the edited image.`;

  return prompt;
};

/** @deprecated use buildImageTextReplacementPrompt */
export const buildTextbookImageTranslationPrompt = buildImageTextReplacementPrompt;
