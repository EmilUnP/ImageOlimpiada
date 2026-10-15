import { getSubjectRules } from './subject-rules.js';

export const EXAM_CORPUS_CONTEXT = `CORPUS CONTEXT:
- Batch of ~12,000+ old Russian (Cyrillic) exam scans from many subjects and exam sections
- Each image may differ in subject, layout, quality, and size — handle each independently by visible content
- Goal: faithful preservation for downstream OCR and translation, not interpretation or solving`;

const FORMULA_OCR_RULES = String.raw`FORMULAS — CRITICAL (mathematics, physics, chemistry, biology):
A formula flattened into plain text is WRONG: "x2" instead of x², "H2SO4" without subscripts, "a/b" instead of a stacked fraction.
- Write every formula, equation, expression, chemical formula and reaction inside $...$ in LaTeX notation
- Superscripts ^{…}, subscripts _{…}, stacked fractions \frac{numerator}{denominator}, roots \sqrt{…}, vectors \vec{…}, degrees ^\circ, arrows \rightarrow
- In a sentence with math, wrap only the math: Найдите $x$, если $2x+3=7$
- A lone variable, point or quantity inside a sentence is math too: точка $A$, скорость $v$
- Copy every symbol, number and sign exactly — do not simplify, reorder, evaluate or complete
- Variables, point names and chemical element symbols are Latin or Greek letters. Inside formulas never use the Cyrillic lookalikes А В С Е Н К М О Р Т Х — use Cyrillic only where the printed label really is a Russian word or abbreviation (wrap it in \text{…})
- In the JSON output write every backslash twice: "$\\frac{1}{2}$", "$\\sqrt{x}$"
- Keep each "text" value on one line — no raw line breaks

EXAMPLES (image → "text" value in JSON):
  x² − 5x + 6 = 0                      → "$x^2 - 5x + 6 = 0$"
  (a + b) stacked over 2               → "$\\frac{a+b}{2}$"
  Решите систему (x + y = 5; x − y = 1) → "Решите систему $\\begin{cases} x+y=5 \\\\ x-y=1 \\end{cases}$"
  H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O        → "$H_2SO_4 + 2NaOH \\rightarrow Na_2SO_4 + 2H_2O$"
  Fтр = μN                              → "$F_{\\text{тр}} = \\mu N$"
  g = 9,8 м/с²                          → "$g = 9{,}8\\ \\text{м/с}^2$"`;

export const buildOcrPrompt = (subject = 'auto') => {
  const { name, rules } = getSubjectRules(subject, 'ocr');

  return `You are an expert OCR specialist for a large archive of old scanned exam and textbook material.

${EXAM_CORPUS_CONTEXT}

SUBJECT: ${name}
${rules}

The image may be a full page or a small crop from any subject: question stem, diagram, table, graph, formula, map, or illustration fragment.

DETECT ALL READABLE TEXT:
- Question numbers, section titles, instructions (Задача, Вопрос, Выберите, Установите соответствие, etc.)
- Numbered labels on diagrams, maps, charts, and figures
- Callout labels, captions, footnotes, and table headers/cells
- Graph axis labels, tick values, and unit abbreviations (Latin or Cyrillic)
- Multiple-choice options (A/B/C/D or а/б/в/г)
- Names, dates, places, terms, and sentences in any academic field
- Formulas, equations, chemical formulas and reactions — see FORMULAS below

${FORMULA_OCR_RULES}

PRESERVE EXACTLY AS WRITTEN:
- Numbers, punctuation, and original spelling — even if faded or unclear
- Do NOT solve, complete, guess missing parts, fix grammar, or modernize wording
- If text is illegible, omit that block rather than inventing content

GROUPING:
- One block per logical unit (label, cell, option, caption, formula line, paragraph fragment)
- Reading order: top to bottom, left to right
- Diagram-only images: one block per visible label or number

For each block return:
- "text": exact content as seen (formulas in $...$ LaTeX)
- "confidence": 0.0–1.0 (lower when uncertain)
- "boundingBox": {x, y, width, height} in pixels when possible

Return ONLY a valid JSON array:
[
  {"text": "Решите уравнение $x^2 - 5x + 6 = 0$", "confidence": 0.95, "boundingBox": {"x": 10, "y": 20, "width": 300, "height": 30}},
  {"text": "$\\frac{a+b}{2}$", "confidence": 0.9}
]

No markdown. No explanations. Omit boundingBox if unknown.`;
};

export const ACADEMIC_TRANSLATION_RULES = `ACADEMIC / EXAM CORPUS RULES:
${EXAM_CORPUS_CONTEXT}

- Translate natural language to the target language with correct terminology for the subject
- Preserve meaning exactly; do not simplify, summarize, or solve
- KEEP UNCHANGED: numbers, formula structure, symbols, variables, dates used as data
- KEEP UNCHANGED: numbered diagram labels when they are digits only (1, 2, 3…)
- KEEP UNCHANGED: all non-text visuals — diagrams, graphs, tables, maps, photos, geometry, line art
- KEEP UNCHANGED: option letters (A/B/C/D) unless translating the text after the letter
- Translate readable labels, questions, and instructions; keep layout and leader lines intact
- Use clear academic language appropriate to the target language`;

const buildFormulaTranslationRules = (targetLanguageName) => String.raw`FORMULAS — CRITICAL:
- Tokens like [[F1]], [[F2]] stand for formulas that are already correct. Copy every token exactly once, unchanged, and place it where that formula belongs in the translated sentence
- Text inside $...$ is LaTeX math. Keep it inside $...$ with the same structure, symbols, numbers, variables, exponents, subscripts and fractions
- Inside $...$ change ONLY Cyrillic words, labels and unit abbreviations (in \text{…}) to the ${targetLanguageName} equivalents; never turn math into words
- Never drop the $ delimiters, never remove LaTeX commands, never write a formula out in words
- Input and output are JSON, so a LaTeX command appears as "\\text" or "\\mu" — copy exactly that escaping, never add extra backslashes`;

export const buildAcademicTextTranslationPrompt = (items, targetLanguageName, subject = 'auto') => {
  const textsJson = JSON.stringify(
    items.map((item) => item.text.replace(/\r?\n/g, ' ').trim()),
    null,
    2
  );
  const { name, rules } = getSubjectRules(subject, 'translate', targetLanguageName);

  return `You are a professional academic translator for a large archive of old exam material (all subjects).

Translate the following text blocks to ${targetLanguageName}.

SUBJECT: ${name}
${rules}

${ACADEMIC_TRANSLATION_RULES}

${buildFormulaTranslationRules(targetLanguageName)}

REQUIREMENTS:
1. Return ONLY a valid JSON array of strings
2. Same order and same number of items as input (${items.length})
3. Translate each block completely and accurately
4. If a block is ONLY a formula, number, symbol, or unit with no translatable words, return it unchanged

Texts (JSON array):
${textsJson}

Return ONLY: ["translation1", "translation2", "..."]`;
};

const FORMULA_RENDER_RULES = `FORMULAS AND NOTATION — CRITICAL:
- Every formula, equation, chemical formula, number, unit and symbol that is not part of a listed replacement must stay exactly as printed — same glyphs, same position
- In the replacement strings, text between $...$ is LaTeX that DESCRIBES math already printed in the original line. Draw that math exactly as it looks on the original image: stacked fractions stay stacked, exponents stay raised, subscripts stay lowered, roots, vectors and arrows unchanged
- Never draw $ signs, backslashes, curly braces, or LaTeX command names (\\frac, \\sqrt, \\text…) on the image
- Only the words around the math change language`;

// The render step pads odd aspect ratios to one the image model outputs natively (see image-fidelity.js)
const PADDED_CANVAS_RULE =
  '- The scan is centred on a plain margin of its own paper colour, added only for processing. Leave that margin plain and empty — do not extend the scan into it or draw anything there';

export const buildImageTextReplacementPrompt = ({
  textPairs = [],
  protectedTexts = [],
  correctedTexts = [],
  targetLangName = 'English',
  subject = 'auto',
  paddedCanvas = false,
}) => {
  const { name, rules } = getSubjectRules(subject, 'render', targetLangName);

  let prompt = `You are editing a scanned textbook or exam image. Your job is IN-PLACE TEXT REPLACEMENT — like Photoshop, not adding labels.

TASK: Replace every listed original text with the exact ${targetLangName} translation. Keep the image identical except for those text changes.

SUBJECT: ${name}
${rules}

FOR EACH REPLACEMENT:
1. Completely remove the original words (inpaint the paper/background behind them)
2. Write the replacement in the exact same position
3. Match original typography: font size, weight, alignment, ink color, serif/sans-serif style
4. Do not cover, erase, or alter diagram lines, arrows, leader lines, or drawings

STRICT RULES:
- Use the replacement strings EXACTLY as given — do not re-translate or change spelling
- Never show both the original and translated text
- Never add rectangles, boxes, stickers, highlights, or colored patches behind text
- Never add new callout labels, floating captions, or text in empty areas
- Never move text to a different location on the image
- Keep image size, crop, and all non-text content unchanged

EVERYTHING ELSE STAYS PIXEL-IDENTICAL:
- Same canvas: same framing, zoom and aspect ratio — no added borders, bars, bands, frames, panels, margins, shadows, titles or watermarks
- Do not redraw, move, resize, recolor or restyle any shape, box, line, arrow, table, diagram, photo or drawing
- Do not enhance the image: no sharpening, denoising, upscaling, recoloring, or brightness/contrast change — keep the paper tone, scan grain, stains and blur exactly as they are
- Every area outside the replaced words must look exactly like the input
${paddedCanvas ? `${PADDED_CANVAS_RULE}\n` : ''}
${FORMULA_RENDER_RULES}
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

  if (protectedTexts.length > 0) {
    prompt += `\nDO NOT TOUCH — formulas and symbols that are already correct. Leave these exact pixels as they are:\n`;
    protectedTexts.forEach((text, i) => {
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
