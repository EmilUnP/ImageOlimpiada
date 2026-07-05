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
    prompt: `MODE: Old Textbook / Exam Question Scan
- Typical content: Russian Cyrillic exam questions from math, physics, chemistry, history
- Restore yellowed, faded, or low-quality book page scans
- Sharpen question text, numbering, and answer options (A/B/C/D)
- Preserve mathematical formulas, equations, symbols, subscripts, superscripts, and fractions exactly
- Preserve chemical formulas, physics units, graphs, diagrams, tables, and geometry figures exactly
- Remove scanner noise, stains, shadows, fold lines, and uneven lighting
- Straighten mild page skew; produce a clean white or light-neutral background
- Do NOT rewrite, solve, or change any question content
- Result: a clean modern scan of the same exam page, ready for translation`,
    description: "Old book questions — math, physics, chemistry, history",
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
