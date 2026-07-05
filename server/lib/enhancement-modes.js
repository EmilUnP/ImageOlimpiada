const GLOBAL_RULES = `You are a professional photo restoration and image enhancement specialist.

TASK: Improve the uploaded image quality and return ONE enhanced image only.

STRICT RULES (must follow):
- Preserve the exact same scene, composition, subjects, text, logos, and layout
- Do NOT add, remove, replace, or invent objects, people, text, or backgrounds
- Do NOT change identity, facial features, body shape, or product design
- Do NOT apply heavy filters, plastic skin, oversaturation, or artificial HDR
- Reduce noise, blur, compression artifacts, and haze while keeping a natural look
- Keep original aspect ratio and framing; do not crop or rotate unless correcting obvious scan skew
- Output a clean, sharp, realistic result suitable for professional use`;

const INTENSITY_MODIFIERS = {
  low: `INTENSITY: Soft
- Make gentle corrections only
- Prioritize authenticity over dramatic change
- Fix obvious defects lightly while keeping the original character`,
  medium: `INTENSITY: Balanced
- Apply clear but natural quality improvements
- Improve clarity, exposure, and color balance without over-processing
- Target a polished, realistic finish`,
  high: `INTENSITY: Strong
- Apply maximum safe quality recovery
- Strongly reduce noise, blur, and defects while staying realistic
- Improve detail and contrast clearly, but avoid unnatural or synthetic appearance`,
};

export const enhancementPrompts = {
  textbook: {
    prompt: `MODE: Old Textbook / Exam Scan (any subject, any section)
- Large mixed corpus: thousands of scans from different exam parts, subjects, and page layouts
- Subjects may include math, physics, chemistry, biology, history, geography, literature, languages, and more — treat every image by what you SEE, not by assumed subject
- Content may be a full page, half page, or small crop (table, formula, graph, diagram, photo insert, map, timeline)

TEXT & NOTATION (preserve exactly):
- All Cyrillic text: questions, instructions, captions, table cells, axis labels, footnotes
- Mathematical and scientific notation: equations, fractions, units (Latin or Cyrillic), Greek letters, subscripts, superscripts, variables
- Question numbers, section headers, numbered diagram labels, and answer options (A/B/C/D or а/б/в/г)
- Dates, names, place names, and terminology in any academic field

FIGURES & LAYOUT (preserve exactly — do NOT redraw, simplify, or invent):
- Any diagram type: apparatus, anatomy, maps, charts, geometry, Venn/concept maps, timelines, microscopy, illustrations
- Tables, graphs, coordinate plots, geometric figures, and embedded photos
- Leader lines, arrows, numbering, grid lines, stamps, and original page structure

SCAN CLEANUP (apply consistently across all subjects):
- Sharpen text and thin lines without thickening strokes or adding detail that is not in the original
- Remove noise, stains, shadows, fold lines, yellowing, and uneven lighting
- Straighten mild skew; clean white or light-neutral background
- Do NOT rewrite, translate, solve, or change any content
- Result: same exam material, cleaner and sharper — safe for bulk OCR and translation pipelines`,
    description: "Default for exam scans — all subjects, full pages or crops",
  },
  document: {
    prompt: `MODE: Document / Scan
- Make text sharp, dark, and easy to read
- Remove yellowing, stains, shadows, and scanner noise
- Straighten mild perspective skew and improve page contrast
- Preserve every word, number, line, table, stamp, and layout exactly
- Background should be clean white or neutral; text must remain fully legible`,
    description: "Text-heavy pages and worksheets",
  },
  old: {
    prompt: `MODE: Old / Vintage Photo Restoration
- Remove scratches, dust, folds, stains, and minor damage
- Reduce fading and yellow cast while keeping a natural vintage tone if appropriate
- Restore contrast and detail without modernizing the scene
- Preserve historical appearance, clothing, faces, and background exactly
- Result should look carefully restored, not recreated`,
    description: "Heavily damaged vintage pages",
  },
  photo: {
    prompt: `MODE: General Photo
- Improve overall sharpness, micro-contrast, and fine detail
- Correct exposure and white balance naturally
- Reduce noise and compression artifacts
- Enhance colors subtly; keep realistic appearance
- Result should look like a high-quality photo, not AI-generated`,
    description: "General photos — fallback for non-text images",
  },
};

export const getEnhancementModesList = () =>
  Object.keys(enhancementPrompts).map((key) => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    description: enhancementPrompts[key].description,
  }));

export const buildEnhancementPrompt = (mode = "textbook", intensity = "medium") => {
  const validMode = enhancementPrompts[mode] ? mode : "textbook";
  const validIntensity = INTENSITY_MODIFIERS[intensity] ? intensity : "medium";
  const modeConfig = enhancementPrompts[validMode];

  return `${GLOBAL_RULES}

${modeConfig.prompt}

${INTENSITY_MODIFIERS[validIntensity]}

OUTPUT: Return only the enhanced image. Same content, cleaner and sharper result.`;
};
