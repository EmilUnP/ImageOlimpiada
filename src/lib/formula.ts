/** Mirrors server/lib/formula-utils.js — OCR writes formulas as LaTeX between $...$ */
const MATH_SEGMENT_RE = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;

export interface TextSegment {
  value: string;
  math: boolean;
}

/** Split text into plain and $...$ math segments (delimiters stripped from math) */
export const splitMath = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MATH_SEGMENT_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) segments.push({ value: text.slice(lastIndex, start), math: false });
    const raw = match[0];
    const delimiter = raw.startsWith("$$") ? 2 : 1;
    segments.push({ value: raw.slice(delimiter, -delimiter), math: true });
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) segments.push({ value: text.slice(lastIndex), math: false });
  return segments;
};

/** Block contains math and no words outside it — the translator keeps it unchanged */
export const isFormulaOnly = (text: string): boolean => {
  const outside = text.replace(MATH_SEGMENT_RE, "");
  return outside !== text && !/\p{L}/u.test(outside);
};
