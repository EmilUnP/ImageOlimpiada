export const TEXTBOOK_OCR_PROMPT = `You are an expert OCR specialist for old scanned textbook and exam pages (math, physics, chemistry, history).

The image is typically a scan from an old Russian (Cyrillic) book with exam questions, diagrams, formulas, and tables.

DETECT ALL READABLE TEXT:
- Question numbers (1., 2., №3, Задача, Вопрос)
- Question stems and answer instructions
- Multiple-choice options (A, B, C, D or а, б, в, г)
- Paragraphs, captions, footnotes, and labels
- Cyrillic (Russian) text with full accuracy
- Mixed lines where words and numbers appear together

PRESERVE EXACTLY AS WRITTEN:
- Mathematical expressions and symbols (+ − × ÷ = ≠ ≤ ≥ √ ∫ ∑ π ° %)
- Subscripts, superscripts, fractions, and equation layout hints
- Chemical formulas (H₂O, CO₂, NaCl) and reaction arrows
- Physics units (m/s, km/h, N, J, W, V, A, kg)
- Variables (x, y, v, t, F, m) and numeric values
- Do NOT solve questions, fix grammar, or modernize wording

GROUPING:
- One text block per logical unit (question title, sub-question, option line, caption)
- Reading order: top to bottom, left to right
- Keep answer choices as separate blocks when possible

For each block return:
- "text": exact content as seen
- "confidence": 0.0–1.0
- "boundingBox": {x, y, width, height} in pixels when possible

Return ONLY valid JSON array:
[
  {"text": "exact text", "confidence": 0.95, "boundingBox": {"x": 10, "y": 20, "width": 100, "height": 30}}
]

No markdown. No explanations. Omit boundingBox if unknown.`;

export const ACADEMIC_TRANSLATION_RULES = `ACADEMIC / TEXTBOOK RULES:
- Source material is usually Russian exam or textbook content
- Translate natural language to the target language with correct academic terminology
- Preserve question meaning exactly; do not simplify or solve
- KEEP UNCHANGED: pure numbers, formulas, equations, chemical notation, units, variables, symbols, graphs, diagrams, tables, geometry figures
- KEEP UNCHANGED: option letters (A/B/C/D) unless translating the option text after the letter
- Preserve question numbering and exam formatting
- Use clear, clean, student-friendly language in the target language`;

export const buildAcademicTextTranslationPrompt = (items, targetLanguageName) => {
  const lines = items
    .map((item, idx) => `${idx + 1}. "${item.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').trim()}"`)
    .join('\n');

  return `You are a professional academic translator specializing in math, physics, chemistry, and history textbook material.

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

const QUALITY_INSTRUCTIONS = {
  standard: 'Accurate translation with clean text rendering.',
  premium:
    'Highly accurate academic translation with crisp text, precise placement, and clean readable layout on the page.',
  ultra:
    'Maximum accuracy with pixel-clean text rendering and perfect integration into the scanned page.',
};

const FONT_INSTRUCTIONS = {
  auto: 'Use a clean serif or sans-serif font similar to textbook print, suitable for the target language.',
  preserve: 'Match the original printed textbook style as closely as possible.',
  native: 'Use natural textbook typography for the target language.',
};

const STYLE_INSTRUCTIONS = {
  exact: 'Preserve original text size, weight, and placement exactly.',
  natural: 'Make text natural in the target language while keeping exam layout.',
  adaptive: 'Balance readable target-language text with original exam layout.',
};

export const buildTextbookImageTranslationPrompt = ({
  textPairs = [],
  correctedTexts = [],
  targetLangName,
  quality = 'premium',
  fontMatching = 'auto',
  textStyle = 'adaptive',
  preserveFormatting = true,
  enhanceReadability = true,
}) => {
  let prompt = `You are an expert at cleaning and translating old scanned textbook / exam question images.

CONTEXT: The image is from an old Russian book (math, physics, chemistry, history). It may contain Cyrillic text, formulas, diagrams, graphs, tables, and geometric figures.

TASK: Replace text using the provided translations and return ONE clean image.

${ACADEMIC_TRANSLATION_RULES}

`;

  if (textPairs.length > 0) {
    prompt += `TEXT REPLACEMENT PAIRS (follow exactly):\n\n`;
    textPairs.forEach((pair, index) => {
      prompt += `${index + 1}. Find: "${pair.original}"\n`;
      prompt += `   Replace with: "${pair.translated}"\n`;
      if (pair.boundingBox) {
        prompt += `   Approx. box: x=${Math.round(pair.boundingBox.x)}, y=${Math.round(pair.boundingBox.y)}, w=${Math.round(pair.boundingBox.width)}, h=${Math.round(pair.boundingBox.height)}\n`;
      }
      prompt += `   Keep same position, size, alignment, and print style.\n\n`;
    });
    prompt += `Replace ONLY the listed text. Do not change any other content.\n\n`;
  } else if (Array.isArray(correctedTexts) && correctedTexts.length > 0) {
    prompt += `Translate these verified text blocks to ${targetLangName}:\n`;
    correctedTexts.forEach((text, i) => {
      prompt += `${i + 1}. "${text}"\n`;
    });
    prompt += `\n`;
  } else {
    prompt += `Detect all natural-language text and translate to ${targetLangName}. Leave formulas and diagrams unchanged.\n\n`;
  }

  prompt += `VISUAL RULES:\n`;
  prompt += `- Preserve ALL diagrams, graphs, geometric figures, tables, charts, and formula layouts exactly\n`;
  prompt += `- Do NOT redraw, crop, or alter non-text content\n`;
  prompt += `- Clean page background; keep a readable exam-question layout\n`;
  prompt += `- ${QUALITY_INSTRUCTIONS[quality] || QUALITY_INSTRUCTIONS.premium}\n`;
  prompt += `- ${FONT_INSTRUCTIONS[fontMatching] || FONT_INSTRUCTIONS.auto}\n`;
  prompt += `- ${STYLE_INSTRUCTIONS[textStyle] || STYLE_INSTRUCTIONS.adaptive}\n`;
  if (preserveFormatting) {
    prompt += `- Preserve bold, italic, underline, numbering, and option structure\n`;
  }
  if (enhanceReadability) {
    prompt += `- Make translated text crisp and easy to read on the page\n`;
  }

  prompt += `\nOUTPUT: Return ONLY the translated image. Same question content, cleaner and translated to ${targetLangName}.`;

  return prompt;
};
