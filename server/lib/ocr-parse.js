import { parseJsonWithLatex, decodeJsonStringBody, normaliseLatexBackslashes } from './formula-utils.js';

const isBoundingBox = (box) =>
  box && typeof box === 'object' && ['x', 'y', 'width', 'height'].every((key) => typeof box[key] === 'number');

const MAX_SALVAGE_ATTEMPTS = 200;

/** Output cut off by the token limit: keep every complete block before the cut */
const salvageTruncatedArray = (rawText) => {
  const start = rawText.indexOf('[');
  if (start < 0) return undefined;

  let end = rawText.lastIndexOf('}');
  for (let attempt = 0; attempt < MAX_SALVAGE_ATTEMPTS && end > start; attempt++) {
    const parsed = parseJsonWithLatex(`${rawText.slice(start, end + 1)}]`);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    end = rawText.lastIndexOf('}', end - 1);
  }
  return undefined;
};

/** Parse the OCR model response into detected text blocks (LaTeX-safe) */
export const parseDetectedTexts = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return [];

  const codeBlockMatch = rawText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i);
  const arrayMatch = rawText.match(/\[[\s\S]*\]/);
  const jsonToParse = codeBlockMatch?.[1] ?? arrayMatch?.[0] ?? null;

  let parsed = jsonToParse ? parseJsonWithLatex(jsonToParse) : undefined;

  if (!Array.isArray(parsed)) {
    const salvaged = salvageTruncatedArray(rawText);
    if (salvaged) {
      console.warn(
        `[ocr-parse] OCR output was cut off — kept ${salvaged.length} complete block(s). ` +
          'Text at the end of the page may be missing; raise OPENROUTER_VISION_MAX_TOKENS (e.g. 8192) in .env.'
      );
      parsed = salvaged;
    } else {
      console.warn('[ocr-parse] Failed to parse JSON array from model response. Falling back to heuristic parsing.');
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    const textMatches = [...rawText.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)+)"/g)];
    if (textMatches.length > 0) {
      parsed = textMatches.map((match, index) => ({
        id: `text-${index + 1}`,
        text: decodeJsonStringBody(match[1]),
        confidence: 0.7,
      }));
    } else {
      const lines = rawText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !/^[\[\]{}",]*$/.test(line))
        .slice(0, 50);

      parsed = lines.map((line, index) => ({
        id: `text-${index + 1}`,
        text: line.replace(/^["']|["']$/g, ''),
        confidence: 0.7,
      }));
    }
  }

  return parsed
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id.length > 0 ? item.id : `text-${index + 1}`,
      text: typeof item.text === 'string' ? normaliseLatexBackslashes(item.text) : '',
      confidence:
        typeof item.confidence === 'number' && Number.isFinite(item.confidence)
          ? Math.max(0, Math.min(1, item.confidence))
          : 0.7,
      boundingBox: isBoundingBox(item.boundingBox)
        ? {
            x: item.boundingBox.x,
            y: item.boundingBox.y,
            width: item.boundingBox.width,
            height: item.boundingBox.height,
          }
        : undefined,
    }))
    .filter((item) => item.text && item.text.trim().length > 0);
};
