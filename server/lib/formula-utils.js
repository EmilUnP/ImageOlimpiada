/**
 * Formula handling for the OCR → translate → render pipeline.
 * OCR writes math/chemistry as LaTeX between $...$ so structure (sub/superscripts,
 * fractions, roots) survives as text. Translation masks language-neutral formulas
 * so the LLM can never rewrite them.
 */

/** $$display$$ or $inline$ math segments */
export const MATH_SEGMENT_RE = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;

const CYRILLIC_RE = /[Ѐ-ӿ]/;
const LETTER_RE = /\p{L}/u;
const PLACEHOLDER_RE = /\[\[F(\d+)\]\]/g;
const PLACEHOLDER_TEST_RE = /\[\[F\d+\]\]/;

const JSON_SIMPLE_ESCAPES = new Set(['"', '\\', '/']);
const JSON_CONTROL_ESCAPES = new Set(['b', 'f', 'n', 'r', 't']);

/**
 * Models often emit LaTeX inside JSON with single backslashes ("\frac", "\times").
 * JSON.parse would silently turn \f, \t, \n, \r, \b into control characters, or throw
 * on \s, \D, \{ … Double every backslash that is not a genuine JSON escape.
 * A control escape followed by a lowercase letter is treated as LaTeX (\frac, \to, \neq, \beta, \rho).
 */
export const repairLatexJsonEscapes = (raw) => {
  if (typeof raw !== 'string' || !raw.includes('\\')) return raw;

  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }

    const next = raw[i + 1];
    if (next !== undefined && JSON_SIMPLE_ESCAPES.has(next)) {
      out += ch + next;
      i++;
      continue;
    }

    if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6);
      i += 5;
      continue;
    }

    if (next !== undefined && JSON_CONTROL_ESCAPES.has(next) && !/[a-z]/.test(raw[i + 2] ?? '')) {
      out += ch + next;
      i++;
      continue;
    }

    out += '\\\\';
  }
  return out;
};

/**
 * Models sometimes escape twice, so "\frac" arrives as "\\frac" (LaTeX line break + "frac").
 * Inside math, collapse backslash runs back to what the source used: without \\ line breaks in
 * the source every run becomes one backslash; otherwise (or with no source, e.g. OCR output)
 * only quadruple runs and runs before a command name collapse.
 */
export const normaliseLatexBackslashes = (text, source) => {
  if (typeof text !== 'string' || !text.includes('\\\\')) return text;

  const keepLineBreaks = typeof source !== 'string' || /\\\\/.test(source);
  return text.replace(MATH_SEGMENT_RE, (segment) =>
    keepLineBreaks
      ? segment.replace(/\\{4}/g, '\\\\').replace(/\\{2,}(?=[a-zA-Z])/g, '\\')
      : segment.replace(/\\{2,}/g, '\\')
  );
};

/** JSON.parse with LaTeX escape repair; returns undefined on failure */
export const parseJsonWithLatex = (jsonText) => {
  try {
    return JSON.parse(repairLatexJsonEscapes(jsonText));
  } catch {
    try {
      return JSON.parse(jsonText);
    } catch {
      return undefined;
    }
  }
};

/** Decode a raw JSON string body captured by a regex fallback */
export const decodeJsonStringBody = (body) => {
  const parsed = parseJsonWithLatex(`"${body}"`);
  return typeof parsed === 'string' ? parsed : body;
};

/**
 * Replace language-neutral math segments with [[F1]], [[F2]] … tokens.
 * Segments containing Cyrillic (units like \text{м/с}, labels like F_{\text{тр}}) stay visible
 * so the translator can localise those labels.
 */
export const maskFormulas = (text) => {
  const formulas = [];
  const masked = text.replace(MATH_SEGMENT_RE, (segment) => {
    if (CYRILLIC_RE.test(segment)) return segment;
    formulas.push(segment);
    return `[[F${formulas.length}]]`;
  });
  return { masked, formulas };
};

/** Restore masked formulas; `complete` is false if any token was dropped or invented */
export const unmaskFormulas = (text, formulas) => {
  if (!formulas.length) {
    return { text, complete: !PLACEHOLDER_TEST_RE.test(text) };
  }

  const seen = new Set();
  const restored = text.replace(PLACEHOLDER_RE, (token, n) => {
    const formula = formulas[Number(n) - 1];
    if (formula === undefined) return token;
    seen.add(n);
    return formula;
  });

  return {
    text: restored,
    complete: seen.size === formulas.length && !PLACEHOLDER_TEST_RE.test(restored),
  };
};

/** True when a (masked) block still has words that need translating */
export const hasTranslatableText = (maskedText) =>
  LETTER_RE.test(maskedText.replace(/\[\[F\d+\]\]/g, ''));

export const normaliseForCompare = (text) => (text || '').replace(/\s+/g, ' ').trim();
