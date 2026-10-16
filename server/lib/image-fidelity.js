import sharp from 'sharp';

/**
 * Keeps an AI text replacement faithful to the original scan.
 *
 * Image models regenerate every pixel: they re-frame aspect ratios they cannot output (inventing
 * bars, panels and margins), re-compose or rescale the layout, and change the paper tone,
 * sharpness and texture. So the model never gets the last word on the whole picture:
 *   1. prepareForImageEdit — fit the scan to an aspect ratio the model outputs natively, by a
 *      slight stretch rather than blank margins, so it has nothing to invent or re-compose
 *   2. mergeEditedImage — map the answer back onto the original pixel grid, find where the text
 *      changed, and copy only those regions onto the untouched original
 */

// Aspect ratios OpenRouter's gpt-image-2 accepts (Gemini image models support them too)
const MODEL_ASPECT_RATIOS = [
  ['1:1', 1],
  ['4:3', 4 / 3],
  ['3:4', 3 / 4],
  ['3:2', 3 / 2],
  ['2:3', 2 / 3],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
  ['21:9', 21 / 9],
];
// Stretching the scan this much to fill the model's frame reads fine to the model and is undone
// exactly afterwards; only what is left over becomes a plain margin
const MAX_STRETCH = 1.17;
// Small scans go up to a size the model can read stroke weight from; huge ones come down
const MIN_MODEL_INPUT_SIDE = 1024;
const MAX_MODEL_INPUT_SIDE = 2048;

// Small scans are enlarged first (plain resampling — nothing invented) and returned at that size:
// with a letter only ~8 px tall, the new text cannot stay crisp and the merge cannot tell a 1 px
// old stroke from a new one
const ENLARGE_BELOW = 1000;
const ENLARGE_TO = 1200;
const MAX_ENLARGE = 4;

// Result quality chosen in the app: "original" keeps the scan's own look; "hd" returns the model's
// crisp redraw of the whole page at 3× the uploaded size
export const RESULT_QUALITY_SCALE = { original: 1, hd: 3 };
// Long-side cap for any result, and size above which results are sent as JPEG — a multi-megapixel
// PNG can exceed the hosting response limit (Vercel: 4.5 MB)
const MAX_OUTPUT_SIDE = 4096;
const JPEG_ABOVE_PIXELS = 4_000_000;

// Change detection and alignment run on downscaled copies — long side in pixels
const ANALYSIS_SIDE = 1024;
const COARSE_SIDE = 256;

const IDENTITY = { sx: 1, dx: 0, sy: 1, dy: 0 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const range = (centre, radius, step) => {
  const values = [];
  for (let v = centre - radius; v <= centre + radius + 1e-9; v += step) values.push(v);
  return values;
};

/** Decode to sRGB, 3 channels, EXIF orientation baked in — the one pixel grid every step shares */
const decodeRgb = async (input, resize) => {
  let pipeline = sharp(input).rotate().flatten({ background: '#ffffff' }).removeAlpha().toColourspace('srgb');
  if (resize) pipeline = pipeline.resize(resize.width, resize.height, { fit: 'fill' });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
};

const rawRgb = (rgb, width, height) => sharp(rgb, { raw: { width, height, channels: 3 } });

const resizeRgb = (rgb, width, height, outWidth, outHeight) =>
  rawRgb(rgb, width, height).resize(outWidth, outHeight, { fit: 'fill' }).raw().toBuffer();

/** Median colour of the outermost pixel ring — the paper colour used for padding */
const borderColour = (rgb, width, height) => {
  const channels = [[], [], []];
  const push = (x, y) => {
    const i = (y * width + x) * 3;
    for (let c = 0; c < 3; c++) channels[c].push(rgb[i + c]);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }
  const [r, g, b] = channels.map((values) => values.sort((a, z) => a - z)[values.length >> 1]);
  return { r, g, b };
};

const luma = (rgb, count) => {
  const grey = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    grey[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  }
  return grey;
};

const boxBlur = (src, width, height, radius) => {
  const span = radius * 2 + 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[row + clamp(k, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / span;
      sum += src[row + Math.min(x + radius + 1, width - 1)] - src[row + Math.max(x - radius, 0)];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[clamp(k, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span;
      sum += tmp[Math.min(y + radius + 1, height - 1) * width + x] - tmp[Math.max(y - radius, 0) * width + x];
    }
  }

  return out;
};

/** Detail layer (strokes, lines, edges) without the smooth paper tone */
const highPass = (grey, width, height, radius) => {
  const out = boxBlur(grey, width, height, radius);
  for (let i = 0; i < grey.length; i++) out[i] = grey[i] - out[i];
  return out;
};

/** Binary dilation with a (2rx+1)×(2ry+1) rectangle */
const dilate = (mask, width, height, rx, ry) => {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= Math.min(rx, width - 1); x++) count += mask[row + x];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = count > 0 ? 1 : 0;
      if (x + rx + 1 < width) count += mask[row + x + rx + 1];
      if (x - rx >= 0) count -= mask[row + x - rx];
    }
  }

  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y <= Math.min(ry, height - 1); y++) count += tmp[y * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = count > 0 ? 1 : 0;
      if (y + ry + 1 < height) count += tmp[(y + ry + 1) * width + x];
      if (y - ry >= 0) count -= tmp[(y - ry) * width + x];
    }
  }

  return out;
};

const percentileOfAbs = (values, fraction) => {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < values.length; i++) histogram[Math.min(255, Math.round(Math.abs(values[i])))]++;
  const target = values.length * fraction;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= target) return v;
  }
  return 255;
};

/**
 * Per-channel gain/offset that maps the model's colours onto the original's, fitted on pixels
 * the edit did not touch (worst 20% of residuals dropped). Fixes whitened paper, contrast boosts
 * and colour casts so pasted regions blend in.
 */
const fitTone = (orig, edited, count, include) => {
  const tone = [];

  for (let c = 0; c < 3; c++) {
    let gain = 1;
    let offset = 0;

    for (let pass = 0; pass < 2; pass++) {
      let limit = Infinity;
      if (pass === 1) {
        const residuals = new Float32Array(count);
        let n = 0;
        for (let i = 0; i < count; i++) {
          if (include && !include[i]) continue;
          residuals[n++] = Math.abs(gain * edited[i * 3 + c] + offset - orig[i * 3 + c]);
        }
        limit = percentileOfAbs(residuals.subarray(0, n), 0.8);
      }

      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (let i = 0; i < count; i++) {
        if (include && !include[i]) continue;
        const x = edited[i * 3 + c];
        const y = orig[i * 3 + c];
        if (Math.abs(gain * x + offset - y) > limit) continue;
        n++;
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
      }
      if (n < 50) break;

      const meanX = sx / n;
      const meanY = sy / n;
      const varX = sxx / n - meanX * meanX;
      // Near-uniform paper gives no slope information — correct the offset only
      gain = varX > 100 ? clamp((sxy / n - meanX * meanY) / varX, 0.6, 1.6) : 1;
      offset = meanY - gain * meanX;
    }

    tone.push({ gain, offset });
  }

  return tone;
};

const applyTone = (rgb, tone) => {
  const out = new Uint8ClampedArray(rgb.length);
  for (let i = 0; i < rgb.length; i++) {
    const { gain, offset } = tone[i % 3];
    out[i] = gain * rgb[i] + offset;
  }
  return out;
};

const encodeRgb = async (rgb, width, height, mimeType) => {
  const image = rawRgb(rgb, width, height);
  if (/jpe?g/i.test(mimeType) || width * height > JPEG_ABOVE_PIXELS) {
    return { mimeType: 'image/jpeg', buffer: await image.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer() };
  }
  if (/webp/i.test(mimeType)) {
    return { mimeType: 'image/webp', buffer: await image.webp({ quality: 95 }).toBuffer() };
  }
  return { mimeType: 'image/png', buffer: await image.png().toBuffer() };
};

/**
 * Working size: a small scan is enlarged to ENLARGE_TO on its long side (at most MAX_ENLARGE×), and
 * an HD result to `scale`× — whichever is larger, never past MAX_OUTPUT_SIDE
 */
const enlargeForWork = async ({ rgb, width, height }, scale = 1) => {
  const side = Math.max(width, height);
  const auto = side < ENLARGE_BELOW ? Math.min(MAX_ENLARGE, ENLARGE_TO / side) : 1;
  const factor = Math.min(Math.max(scale, auto), MAX_OUTPUT_SIDE / side);
  if (factor <= 1.001) return { rgb, width, height };
  const outWidth = Math.round(width * factor);
  const outHeight = Math.round(height * factor);
  const out = await rawRgb(rgb, width, height).resize(outWidth, outHeight, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  return { rgb: out, width: outWidth, height: outHeight };
};

/**
 * Fit the scan to the nearest aspect ratio the model outputs natively. A slight stretch fills the
 * frame; only beyond MAX_STRETCH does the rest become a margin of the scan's own paper colour.
 * Blank margins invite the model to re-compose the picture — shrinking a diagram, moving labels —
 * and a frame it cannot output gets squeezed with invented bars and panels.
 *
 * The returned layout describes the model's canvas in original-pixel units: once the answer is
 * resized to canvasWidth × canvasHeight, the scan sits at (padLeft, padTop) at its original size.
 */
export async function prepareForImageEdit({ data, mimeType, scale = 1 }) {
  const source = await decodeRgb(Buffer.from(data, 'base64'));
  const { rgb, width, height } = await enlargeForWork(source, scale);

  const ratio = width / height;
  const [aspectRatio, target] = MODEL_ASPECT_RATIOS.reduce((best, entry) =>
    Math.abs(Math.log(entry[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? entry : best
  );
  // Horizontal stretch relative to vertical
  const stretch = clamp(target / ratio, 1 / MAX_STRETCH, MAX_STRETCH);
  const contentRatio = ratio * stretch;

  const side = clamp(Math.max(width, height), MIN_MODEL_INPUT_SIDE, MAX_MODEL_INPUT_SIDE);
  const modelWidth = target >= 1 ? side : Math.round(side * target);
  const modelHeight = target >= 1 ? Math.round(side / target) : side;
  const contentWidth = contentRatio >= target ? modelWidth : Math.round(modelHeight * contentRatio);
  const contentHeight = contentRatio >= target ? Math.round(modelWidth / contentRatio) : modelHeight;
  const left = Math.floor((modelWidth - contentWidth) / 2);
  const top = Math.floor((modelHeight - contentHeight) / 2);
  const padded = contentWidth !== modelWidth || contentHeight !== modelHeight;

  let pipeline = rawRgb(rgb, width, height).resize(contentWidth, contentHeight, { fit: 'fill' });
  if (padded) {
    pipeline = pipeline.extend({
      left,
      top,
      right: modelWidth - contentWidth - left,
      bottom: modelHeight - contentHeight - top,
      background: borderColour(rgb, width, height),
    });
  }

  const isJpeg = /jpe?g/i.test(mimeType);
  const buffer = await (isJpeg ? pipeline.jpeg({ quality: 95 }) : pipeline.png()).toBuffer();

  const unitX = width / contentWidth;
  const unitY = height / contentHeight;
  return {
    data: buffer.toString('base64'),
    mimeType: isJpeg ? 'image/jpeg' : 'image/png',
    aspectRatio,
    original: { rgb, width, height, mimeType, sourceRgb: source.rgb, sourceWidth: source.width, sourceHeight: source.height },
    layout: {
      enlarge: Number((width / source.width).toFixed(2)),
      canvasWidth: Math.round(modelWidth * unitX),
      canvasHeight: Math.round(modelHeight * unitY),
      padLeft: left * unitX,
      padTop: top * unitY,
      padded,
      stretch: Number(stretch.toFixed(3)),
      model: `${modelWidth}x${modelHeight} (${aspectRatio})`,
    },
  };
}

/** Grey high-pass copies of the original and of the model canvas at one analysis size */
const buildAlignmentLevel = async (original, canvasRgb, layout, side) => {
  const f = side / Math.max(original.width, original.height);
  const w = Math.max(8, Math.round(original.width * f));
  const h = Math.max(8, Math.round(original.height * f));
  const cw = Math.max(8, Math.round(layout.canvasWidth * f));
  const ch = Math.max(8, Math.round(layout.canvasHeight * f));
  const radius = Math.max(2, Math.round(side / 170));

  const [origRgb, canvasSmall] = await Promise.all([
    resizeRgb(original.rgb, original.width, original.height, w, h),
    resizeRgb(canvasRgb, layout.canvasWidth, layout.canvasHeight, cw, ch),
  ]);

  const orig = highPass(luma(origRgb, w * h), w, h, radius);
  const canvas = highPass(luma(canvasSmall, cw * ch), cw, ch, radius);
  const cap = Math.max(8, percentileOfAbs(orig, 0.99) * 0.5);

  return {
    // Original pixels per level pixel — search steps are given in level pixels
    unit: 1 / f,
    original: { width: original.width, height: original.height },
    layout,
    w,
    h,
    cw,
    ch,
    // Exact per-axis scales: rounding the sizes makes them differ slightly from f
    origScaleX: w / original.width,
    origScaleY: h / original.height,
    canvasScaleX: cw / layout.canvasWidth,
    canvasScaleY: ch / layout.canvasHeight,
    orig,
    canvas,
    // Per-pixel error cap: features only one image has (invented bars, replaced words) cost the
    // same at every offset, so they cannot drag the alignment away from the shared layout
    cap,
  };
};

/**
 * Where level pixel i of the original lands in the level canvas under t (one axis, pixel centres).
 * t scales about the content centre and shifts in original pixels.
 */
const mapAxis = (i, origScale, canvasScale, size, pad, s, d) => {
  const position = (i + 0.5) / origScale;
  return (pad + size / 2 + s * (position - size / 2) + d) * canvasScale - 0.5;
};

/**
 * Mean detail difference between the original and the model canvas, sampling the canvas
 * bilinearly through an axis-aligned scale + shift. `matched` is the share of the original's
 * strong structure (lines, strokes) that lines up with the canvas.
 */
const compareAligned = (level, t, step) => {
  const { orig, w, h, canvas, cw, ch, cap, original, layout } = level;

  // Columns whose sample lands on the canvas, and where
  const xs = new Int32Array(Math.ceil(w / step));
  const u0s = new Int32Array(xs.length);
  const fus = new Float32Array(xs.length);
  let columns = 0;
  for (let x = 0; x < w; x += step) {
    const u = mapAxis(x, level.origScaleX, level.canvasScaleX, original.width, layout.padLeft, t.sx, t.dx);
    const u0 = Math.floor(u);
    if (u0 < 0 || u0 + 1 >= cw) continue;
    xs[columns] = x;
    u0s[columns] = u0;
    fus[columns] = u - u0;
    columns++;
  }

  let sum = 0;
  let count = 0;
  let total = 0;
  let strong = 0;
  let matched = 0;
  for (let y = 0; y < h; y += step) {
    total += xs.length;
    const v = mapAxis(y, level.origScaleY, level.canvasScaleY, original.height, layout.padTop, t.sy, t.dy);
    const v0 = Math.floor(v);
    if (v0 < 0 || v0 + 1 >= ch) continue;
    const fv = v - v0;
    const origRow = y * w;
    const top = v0 * cw;
    const bottom = top + cw;
    for (let j = 0; j < columns; j++) {
      const u0 = u0s[j];
      const fu = fus[j];
      const upper = canvas[top + u0] + (canvas[top + u0 + 1] - canvas[top + u0]) * fu;
      const lower = canvas[bottom + u0] + (canvas[bottom + u0 + 1] - canvas[bottom + u0]) * fu;
      const o = orig[origRow + xs[j]];
      const d = o - (upper + (lower - upper) * fv);
      const ad = d < 0 ? -d : d;
      sum += ad < cap ? ad : cap;
      if (o > cap || o < -cap) {
        strong++;
        if (ad < cap * 0.5) matched++;
      }
    }
    count += columns;
  }

  return {
    error: count > total * 0.6 ? sum / count : Infinity,
    matched: strong ? matched / strong : 0,
  };
};

const searchAxis = (level, start, axis, scales, shifts, step) => {
  let best = start;
  let bestError = compareAligned(level, start, step).error;
  for (const s of scales) {
    for (const d of shifts) {
      const t = axis === 'x' ? { ...start, sx: s, dx: d } : { ...start, sy: s, dy: d };
      const { error } = compareAligned(level, t, step);
      if (error < bestError) {
        bestError = error;
        best = t;
      }
    }
  }
  return best;
};

/** Largest displacement t causes anywhere on the content, in original pixels */
const maxDisplacement = (t, width, height) =>
  Math.max(Math.abs(t.dx) + (Math.abs(t.sx - 1) * width) / 2, Math.abs(t.dy) + (Math.abs(t.sy - 1) * height) / 2);

// How far a model may rescale / move the drawing and still be lined up (gpt-image redraws
// diagrams up to ~25% smaller or larger)
const MAX_SCALE_DRIFT = 0.25;
const MAX_SHIFT_DRIFT = 0.2;

/** Total detail per column (or row) — unaffected by misalignment along the other axis */
const structureProfile = (hp, width, height, vertical) => {
  const out = new Float32Array(vertical ? height : width);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const v = hp[row + x];
      out[vertical ? y : x] += v < 0 ? -v : v;
    }
  }
  return out;
};

/** Correlation of the original profile with the canvas profile under one axis mapping */
const profileCorrelation = (orig, canvas, map) => {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let i = 0; i < orig.length; i++) {
    const u = map(i);
    const u0 = Math.floor(u);
    if (u0 < 0 || u0 + 1 >= canvas.length) continue;
    const a = orig[i];
    const b = canvas[u0] + (canvas[u0 + 1] - canvas[u0]) * (u - u0);
    n++;
    sa += a;
    sb += b;
    saa += a * a;
    sbb += b * b;
    sab += a * b;
  }
  if (n < orig.length * 0.7) return -1;
  const variance = (saa - (sa * sa) / n) * (sbb - (sb * sb) / n);
  return variance > 0 ? (sab - (sa * sb) / n) / Math.sqrt(variance) : -1;
};

/** Wide search for one axis's scale and shift by matching structure profiles */
const searchProfile = (level, vertical) => {
  const orig = structureProfile(level.orig, level.w, level.h, vertical);
  const canvas = structureProfile(level.canvas, level.cw, level.ch, vertical);
  const size = vertical ? level.original.height : level.original.width;
  const pad = vertical ? level.layout.padTop : level.layout.padLeft;
  const origScale = vertical ? level.origScaleY : level.origScaleX;
  const canvasScale = vertical ? level.canvasScaleY : level.canvasScaleX;

  let best = { s: 1, d: 0, score: -Infinity };
  for (const s of range(1, MAX_SCALE_DRIFT, 0.005)) {
    for (const d of range(0, size * MAX_SHIFT_DRIFT, level.unit)) {
      const score = profileCorrelation(orig, canvas, (i) => mapAxis(i, origScale, canvasScale, size, pad, s, d));
      if (score > best.score) best = { s, d, score };
    }
  }
  return best;
};

/** Coarse-to-fine 2D refinement, one axis at a time so a slightly stretched answer still lines up */
const refineAlignment = (fine, start, coarseStep) => {
  const passes = [
    { scale: 0.015, scaleStep: 0.0025, shift: Math.ceil(coarseStep), shiftStep: 1, sampleStep: 4 },
    { scale: 0.005, scaleStep: 0.001, shift: 2, shiftStep: 0.5, sampleStep: 3 },
    { scale: 0.002, scaleStep: 0.0005, shift: 1, shiftStep: 0.25, sampleStep: 2 },
  ];
  let t = start;
  for (const pass of passes) {
    for (const axis of ['x', 'y']) {
      const s = axis === 'x' ? t.sx : t.sy;
      const d = axis === 'x' ? t.dx : t.dy;
      t = searchAxis(
        fine,
        t,
        axis,
        range(s, pass.scale, pass.scaleStep),
        range(d, pass.shift * fine.unit, pass.shiftStep * fine.unit),
        pass.sampleStep
      );
    }
  }
  return t;
};

/** Wide 2D search around "no change", one axis at a time (moderate drift: a few % and pixels) */
const searchNearIdentity = (coarse) => {
  let t = IDENTITY;
  const { width, height } = coarse.original;
  for (let i = 0; i < 3; i++) {
    t = searchAxis(coarse, t, 'x', range(1, 0.08, 0.01), range(0, width * 0.08, coarse.unit), 2);
    t = searchAxis(coarse, t, 'y', range(1, 0.08, 0.01), range(0, height * 0.08, coarse.unit), 2);
  }
  return t;
};

/**
 * How the model moved or rescaled the drawing. Candidates: no change, a broad 2D search around it
 * (moderate drift), and a per-axis profile search (large rescaling — image models sometimes redraw
 * a diagram 20% smaller). Each is refined at full analysis size; the best fit wins. It is kept only
 * when it moves content by a visible amount and clearly lines up more of the original's structure:
 * when nearly all structure is replaced text, any offset can match old words to new ones a little.
 */
const estimateAlignment = async (original, canvasRgb, layout) => {
  const [coarse, fine] = await Promise.all([
    buildAlignmentLevel(original, canvasRgb, layout, COARSE_SIDE),
    buildAlignmentLevel(original, canvasRgb, layout, ANALYSIS_SIDE),
  ]);
  const coarseStep = coarse.unit / fine.unit;

  const x = searchProfile(coarse, false);
  const y = searchProfile(coarse, true);
  const starts = [IDENTITY, searchNearIdentity(coarse), { sx: x.s, dx: x.d, sy: y.s, dy: y.d }];

  let t = IDENTITY;
  let after = { error: Infinity, matched: 0 };
  const refined = [];
  // Starts that put content in the same place (within a coarse pixel) need refining only once
  const samePlace = (a, b) =>
    Math.abs(a.dx - b.dx) + (Math.abs(a.sx - b.sx) * original.width) / 2 < coarse.unit &&
    Math.abs(a.dy - b.dy) + (Math.abs(a.sy - b.sy) * original.height) / 2 < coarse.unit;
  for (const start of starts) {
    if (refined.some((r) => samePlace(r, start))) continue;
    refined.push(start);
    const candidate = refineAlignment(fine, start, coarseStep);
    const fit = compareAligned(fine, candidate, 2);
    if (fit.error < after.error) {
      after = fit;
      t = candidate;
    }
  }

  const before = compareAligned(fine, IDENTITY, 2);
  const shifted =
    maxDisplacement(t, original.width, original.height) >= 0.75 &&
    after.error < before.error * 0.95 &&
    after.matched >= Math.max(before.matched * 1.5, before.matched + 0.08);

  return { transform: shifted ? t : IDENTITY, shifted, before, after };
};

/**
 * The model's answer resampled onto the original pixel grid. `sharpen` (sigma) restores crispness
 * when the model's pixels had to be enlarged to the original's resolution.
 */
const alignToOriginal = async (canvasRgb, layout, original, t, sharpen = 0) => {
  const { width, height } = original;
  let sourceWidth = layout.canvasWidth;
  let sourceHeight = layout.canvasHeight;
  let left = Math.round(layout.padLeft + (width / 2) * (1 - t.sx) + t.dx);
  let top = Math.round(layout.padTop + (height / 2) * (1 - t.sy) + t.dy);
  const rectWidth = Math.max(1, Math.round(width * t.sx));
  const rectHeight = Math.max(1, Math.round(height * t.sy));

  const extend = {
    left: Math.max(0, -left),
    top: Math.max(0, -top),
    right: Math.max(0, left + rectWidth - sourceWidth),
    bottom: Math.max(0, top + rectHeight - sourceHeight),
  };

  let source = canvasRgb;
  if (extend.left || extend.top || extend.right || extend.bottom) {
    source = await rawRgb(canvasRgb, sourceWidth, sourceHeight).extend({ ...extend, extendWith: 'copy' }).raw().toBuffer();
    sourceWidth += extend.left + extend.right;
    sourceHeight += extend.top + extend.bottom;
    left += extend.left;
    top += extend.top;
  }

  let pipeline = rawRgb(source, sourceWidth, sourceHeight)
    .extract({ left, top, width: rectWidth, height: rectHeight })
    .resize(width, height, { fit: 'fill' });
  if (sharpen > 0) pipeline = pipeline.sharpen({ sigma: sharpen });
  return pipeline.raw().toBuffer();
};

/**
 * How much the model's own pixels get enlarged on the way to the original grid, and the matching
 * sharpening (none when the model drew at least at the original's resolution)
 */
const upscaleSharpening = (editedSize, layout, t) => {
  const factor = Math.max(
    layout.canvasWidth / editedSize.width / t.sx,
    layout.canvasHeight / editedSize.height / t.sy
  );
  return factor > 1.15 ? clamp(0.4 * factor, 0.5, 1.5) : 0;
};

const decodeEdited = async (editedData, layout) => {
  const buffer = Buffer.from(editedData, 'base64');
  const { width, height } = await sharp(buffer).metadata();
  // The model answers at its own resolution — stretch it back onto the canvas we sent
  const { rgb } = await decodeRgb(buffer, { width: layout.canvasWidth, height: layout.canvasHeight });
  return { canvasRgb: rgb, editedSize: { width, height } };
};

/**
 * Fallback when the merge fails: the model's answer mapped back onto the original frame and size
 * (no padding, no stretch), without restoring untouched pixels
 */
export async function restoreEditedFrame({ prepared, editedData, mode = 'faithful' }) {
  const { original, layout } = prepared;
  const { canvasRgb, editedSize } = await decodeEdited(editedData, layout);
  const edited = await alignToOriginal(canvasRgb, layout, original, IDENTITY, upscaleSharpening(editedSize, layout, IDENTITY));
  const result = mode === 'hd' ? { rgb: edited, width: original.width, height: original.height } : await toUploadSize(edited, null, original);
  const encoded = await encodeRgb(result.rgb, result.width, result.height, original.mimeType);
  return `data:${encoded.mimeType};base64,${encoded.buffer.toString('base64')}`;
}

/**
 * "Keep scan" results come back at the upload's own size. The work may have run on an enlarged
 * copy (small scans, for a clean merge); the result is scaled back, and every pixel the edit did
 * not touch is the upload's own, untouched by any resampling.
 */
const toUploadSize = async (rgb, alpha, original) => {
  const { width, height, sourceWidth, sourceHeight, sourceRgb } = original;
  if (!sourceRgb || (width === sourceWidth && height === sourceHeight)) return { rgb, width, height };
  const [small, smallAlpha] = await Promise.all([
    rawRgb(rgb, width, height).resize(sourceWidth, sourceHeight, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer(),
    alpha
      ? sharp(alpha, { raw: { width, height, channels: 1 } })
          .resize(sourceWidth, sourceHeight, { fit: 'fill' })
          .toColourspace('b-w')
          .raw()
          .toBuffer()
      : null,
  ]);
  if (!smallAlpha) return { rgb: small, width: sourceWidth, height: sourceHeight };
  const out = Buffer.from(sourceRgb);
  for (let p = 0; p < sourceWidth * sourceHeight; p++) {
    if (smallAlpha[p] < 4) continue;
    out[p * 3] = small[p * 3];
    out[p * 3 + 1] = small[p * 3 + 1];
    out[p * 3 + 2] = small[p * 3 + 2];
  }
  return { rgb: out, width: sourceWidth, height: sourceHeight };
};

const labelComponents = (mask, width, height) => {
  const labels = new Int32Array(mask.length).fill(-1);
  const queue = new Int32Array(mask.length);
  const components = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = components.length;
    const component = { id, minX: width, minY: height, maxX: 0, maxY: 0, changed: 0, onInk: 0, accepted: false };
    components.push(component);

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const y = (i - x) / width;
      if (x < component.minX) component.minX = x;
      if (x > component.maxX) component.maxX = x;
      if (y < component.minY) component.minY = y;
      if (y > component.maxY) component.maxY = y;

      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      for (const n of neighbours) {
        if (n >= 0 && mask[n] && labels[n] === -1) {
          labels[n] = id;
          queue[tail++] = n;
        }
      }
    }
  }

  return { labels, components };
};

const overlap = (aMin, aMax, bMin, bMax) => Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin) + 1);

/**
 * A changed region next to accepted text belongs to the same replacement: a longer translation
 * running past the original word, or wrapping onto the next line.
 */
/** Accepted regions grouped into rows: regions side by side on one line belong together */
const textRows = (regions) => {
  const parent = regions.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < regions.length; a++) {
    for (let b = a + 1; b < regions.length; b++) {
      if (onSameLine(regions[a], regions[b])) parent[find(a)] = find(b);
    }
  }
  const rows = new Map();
  regions.forEach((region, i) => {
    const root = find(i);
    if (!rows.has(root)) rows.set(root, []);
    rows.get(root).push(region);
  });
  return [...rows.values()];
};

/** Two regions side by side on one text line (letters or words of the same row) */
const onSameLine = (a, b) => {
  const lineHeight = Math.min(a.maxY - a.minY + 1, b.maxY - b.minY + 1);
  const sameLine = overlap(a.minY, a.maxY, b.minY, b.maxY) >= lineHeight * 0.5;
  const horizontalGap = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  return sameLine && horizontalGap <= lineHeight * 1.5;
};

const isTextContinuation = (candidate, accepted) => {
  const ch = candidate.maxY - candidate.minY + 1;
  const cw = candidate.maxX - candidate.minX + 1;
  const ah = accepted.maxY - accepted.minY + 1;

  if (onSameLine(candidate, accepted)) return true;

  // A wrapped line has the height of the line it continues — thin edges of invented bars do not
  const similarHeight = ch >= ah * 0.6 && ch <= ah * 1.6;
  const below = overlap(candidate.minX, candidate.maxX, accepted.minX, accepted.maxX) >= cw * 0.5;
  const verticalGap = Math.max(candidate.minY - accepted.maxY, accepted.minY - candidate.maxY);
  return similarHeight && below && verticalGap <= ah;
};


// Best correlation of a region with the model's version under a ±2 px shift. A redrawn shape
// (box, dot, arrow, untouched symbol) correlates strongly; old words against new words do not —
// even transliterations with look-alike letters (Канада → Kanada) stay well below this
const REDRAWN_CORRELATION = 0.85;
const REDRAWN_SHIFT = 2;
// …and the model's version must carry about as much structure: where it erased something (an old
// letter's descender) the leftover noise can correlate by chance
const REDRAWN_ENERGY = [0.4, 2.5];

const bestShiftedCorrelation = (pixels, hpOrig, hpEdited, width, height) => {
  const xs = new Int32Array(pixels.length);
  const ys = new Int32Array(pixels.length);
  for (let k = 0; k < pixels.length; k++) {
    xs[k] = pixels[k] % width;
    ys[k] = (pixels[k] - xs[k]) / width;
  }

  let best = -1;
  for (let sy = -REDRAWN_SHIFT; sy <= REDRAWN_SHIFT; sy++) {
    for (let sx = -REDRAWN_SHIFT; sx <= REDRAWN_SHIFT; sx++) {
      let ab = 0;
      let aa = 0;
      let bb = 0;
      for (let k = 0; k < pixels.length; k++) {
        const x = xs[k] + sx;
        const y = ys[k] + sy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const a = hpOrig[pixels[k]];
        const b = hpEdited[y * width + x];
        ab += a * b;
        aa += a * a;
        bb += b * b;
      }
      const energy = aa > 0 ? bb / aa : 0;
      if (energy >= REDRAWN_ENERGY[0] && energy <= REDRAWN_ENERGY[1]) best = Math.max(best, ab / Math.sqrt(aa * bb));
    }
  }
  return best;
};

/** Pixels of `mask` on straight runs at least `minLength` long (rows, or columns when vertical) */
const longRuns = (mask, width, height, minLength, vertical) => {
  const out = new Uint8Array(mask.length);
  const lines = vertical ? width : height;
  const length = vertical ? height : width;
  const index = vertical ? (line, k) => k * width + line : (line, k) => line * width + k;

  for (let line = 0; line < lines; line++) {
    let start = -1;
    for (let k = 0; k <= length; k++) {
      const on = k < length && mask[index(line, k)];
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        if (k - start >= minLength) for (let j = start; j < k; j++) out[index(line, j)] = 1;
        start = -1;
      }
    }
  }
  return out;
};

/** Dark strokes that form long straight lines — box borders, rules, connectors, axes */
const straightLines = (dark, width, height, minLength) => {
  // Bridge the 1 px wobble a slightly skewed scan gives a long line
  const horizontal = longRuns(dilate(dark, width, height, 0, 1), width, height, minLength, false);
  const vertical = longRuns(dilate(dark, width, height, 1, 0), width, height, minLength, true);
  const out = new Uint8Array(dark.length);
  for (let i = 0; i < dark.length; i++) out[i] = dark[i] && (horizontal[i] || vertical[i]) ? 1 : 0;
  return out;
};

/**
 * Long strokes that are structure (border, axis, bar edge, connector) rather than part of a glyph
 * — a "1", or the stacked stems of a bold, blurred word. Structure continues outside the edited
 * regions, or forms a long connected shape (a box outline with its connectors); a glyph stroke
 * lies inside its text and spans a line or two of it at most.
 */
const structuralLines = (lines, keep, minLength, width, height) => {
  const longShape = Math.max(minLength * 3, Math.round(Math.max(width, height) * 0.12));
  const { labels, components } = labelComponents(dilate(lines, width, height, 1, 1), width, height);
  const total = new Uint32Array(components.length);
  const outside = new Uint32Array(components.length);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    total[labels[i]]++;
    if (!keep[i]) outside[labels[i]]++;
  }
  const structural = components.map(
    (c) => outside[c.id] >= total[c.id] * 0.3 || Math.max(c.maxX - c.minX, c.maxY - c.minY) + 1 >= longShape
  );
  const out = new Uint8Array(lines.length);
  for (let i = 0; i < lines.length; i++) if (lines[i] && structural[labels[i]]) out[i] = 1;
  return out;
};

/** Median height of the original's glyphs (dark blobs) inside the edited regions */
const medianGlyphHeight = (darkOrig, keep, width, height) => {
  const { labels, components } = labelComponents(darkOrig, width, height);
  const inEdit = new Uint8Array(components.length);
  for (let i = 0; i < labels.length; i++) if (labels[i] >= 0 && keep[i]) inEdit[labels[i]] = 1;
  const heights = components
    .filter((c) => inEdit[c.id])
    .map((c) => c.maxY - c.minY + 1)
    .filter((h) => h >= 3 && h <= height / 2)
    .sort((a, b) => a - b);
  return heights.length ? heights[heights.length >> 1] : 0;
};

/**
 * Where the original pixels must win even inside an edited region:
 *   - around long lines of the scan the model drew too (border, rule, axis) — it redraws them a
 *     pixel or more off, which doubles the edge. Requiring the model's line keeps stacked letter
 *     stems of old text (a bold "k" above an "h") from passing for a border
 *   - around long lines only the model drew (edges of invented bars, added underlines)
 * Old ink in the band that is not part of a line — a letter touching it — is not protected, so
 * the old text is still erased.
 */
const protectedLines = (hpOrig, hpEdited, inkThreshold, keep, width, height) => {
  const count = width * height;
  const side = Math.max(width, height);
  const darkOrig = new Uint8Array(count);
  const darkEdited = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    darkOrig[i] = hpOrig[i] < -inkThreshold ? 1 : 0;
    darkEdited[i] = hpEdited[i] < -inkThreshold ? 1 : 0;
  }

  // Longer than any letter stroke: a stem with its descender stays under ~2× the typical glyph
  // height, so large headings are not mistaken for rules or borders
  const minLength = Math.max(24, Math.round(side * 0.05), Math.round(medianGlyphHeight(darkOrig, keep, width, height) * 2.2));
  const reach = Math.max(2, Math.round(side / 340));
  const linesOrig = structuralLines(straightLines(darkOrig, width, height, minLength), keep, minLength, width, height);
  const linesEdited = structuralLines(straightLines(darkEdited, width, height, minLength), keep, minLength, width, height);
  const nearOrigLines = dilate(linesOrig, width, height, reach * 2, reach * 2);
  const nearEditedLines = dilate(linesEdited, width, height, reach * 2, reach * 2);

  const lines = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    lines[i] = (linesOrig[i] && nearEditedLines[i]) || (linesEdited[i] && !nearOrigLines[i]) ? 1 : 0;
  }
  const band = dilate(lines, width, height, reach, reach);

  const protect = new Uint8Array(count);
  for (let i = 0; i < count; i++) protect[i] = band[i] && (linesOrig[i] || !darkOrig[i]) ? 1 : 0;
  return protect;
};

/**
 * Finish erasing the old text: faint strokes of it (a blurred word ending, a light letter) can
 * stay under the change threshold and survive next to the new text. Kept regions grow through
 * weaker changes connected to them, but only near their own text (within one line height) and
 * never into protected lines. A heavily blurred stroke is a wide soft blob that barely shows in
 * the detail layer, so old ink the model erased (scan darker than the answer) counts too.
 */
const WEAK_BRIGHTNESS_CHANGE = 15;

const growThroughWeakChanges = (keep, blocked, hpOrig, hpEdited, origGrey, editedGrey, changeThreshold, accepted, width, height) => {
  const count = width * height;
  const weakThreshold = Math.max(8, changeThreshold * 0.45);
  const allowed = new Uint8Array(count);
  for (const c of accepted) {
    const margin = c.maxY - c.minY + 1;
    const top = Math.max(0, c.minY - (margin >> 1));
    const bottom = Math.min(height - 1, c.maxY + (margin >> 1));
    const left = Math.max(0, c.minX - margin);
    const right = Math.min(width - 1, c.maxX + margin);
    for (let y = top; y <= bottom; y++) allowed.fill(1, y * width + left, y * width + right + 1);
  }

  const weak = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    weak[i] =
      allowed[i] &&
      !blocked[i] &&
      (Math.abs(hpOrig[i] - hpEdited[i]) > weakThreshold || editedGrey[i] - origGrey[i] > WEAK_BRIGHTNESS_CHANGE)
        ? 1
        : 0;
  }
  // Bridge the gaps between a faint letter's strokes
  const reachable = dilate(weak, width, height, 2, 2);

  const queue = new Int32Array(count);
  let tail = 0;
  for (let i = 0; i < count; i++) if (keep[i]) queue[tail++] = i;
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = i % width;
    const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
    for (const n of neighbours) {
      if (n >= 0 && n < count && !keep[n] && reachable[n] && allowed[n] && !blocked[n]) {
        keep[n] = 1;
        queue[tail++] = n;
      }
    }
  }
};

/**
 * Where did the text change? High-pass difference between the original and the aligned answer,
 * grouped into regions. A region is kept only when it overlaps original ink (the old text being
 * replaced) or continues kept text; changes on blank paper — invented bars, panels, captions —
 * are dropped, and so are shapes the model merely redrew. Long lines inside kept regions stay
 * original. Returns a feathered alpha mask (0–255) at analysis size.
 */
const buildEditMask = (origGrey, editedGrey, width, height) => {
  const count = width * height;
  const radius = Math.max(2, Math.round(Math.max(width, height) / 170));
  const hpOrig = highPass(origGrey, width, height, radius);
  const hpEdited = highPass(editedGrey, width, height, radius);

  // Thresholds follow the scan's own stroke contrast, so faint pages still register their text
  const strokeContrast = percentileOfAbs(hpOrig, 0.995);
  const changeThreshold = clamp(strokeContrast * 0.4, 14, 60);
  // High enough that paper grain and screen moiré are not mistaken for ink
  const inkThreshold = clamp(strokeContrast * 0.35, 10, 50);

  const changed = new Uint8Array(count);
  const ink = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    changed[i] = Math.abs(hpOrig[i] - hpEdited[i]) > changeThreshold ? 1 : 0;
    ink[i] = Math.abs(hpOrig[i]) > inkThreshold ? 1 : 0;
  }
  const nearInk = dilate(ink, width, height, 1, 1);

  // Merge letters into words and lines
  const side = Math.max(width, height);
  const grouped = dilate(changed, width, height, Math.max(2, Math.round(side * 0.006)), Math.max(1, Math.round(side * 0.003)));
  const { labels, components } = labelComponents(grouped, width, height);

  for (let i = 0; i < count; i++) {
    if (!changed[i]) continue;
    const component = components[labels[i]];
    component.changed++;
    if (nearInk[i]) component.onInk++;
  }

  const MIN_CHANGED_PIXELS = 6;
  const candidates = components.filter((c) => c.changed >= MIN_CHANGED_PIXELS);
  for (const c of candidates) {
    c.accepted = c.onInk >= 3 && c.onInk / c.changed >= 0.2;
  }

  // Shapes the model only redrew keep their original pixels — checked before growing text
  // continuations, so a redrawn dot or box cannot pull its neighbours in. A row of text is judged
  // as a whole: reverting single look-alike letters (А → A, Д → D) inside a translated word would
  // mix old and new glyphs
  let shapesKept = 0;
  for (const row of textRows(candidates.filter((c) => c.accepted))) {
    const ids = new Set(row.map((c) => c.id));
    const pixels = [];
    for (let i = 0; i < count; i++) if (ids.has(labels[i])) pixels.push(i);
    if (bestShiftedCorrelation(pixels, hpOrig, hpEdited, width, height) >= REDRAWN_CORRELATION) {
      for (const c of row) {
        c.accepted = false;
        c.redrawn = true;
      }
      shapesKept += row.length;
    }
  }

  for (let pass = 0; pass < 6; pass++) {
    let grew = false;
    const accepted = candidates.filter((c) => c.accepted);
    for (const c of candidates) {
      if (!c.accepted && accepted.some((a) => isTextContinuation(c, a))) {
        c.accepted = true;
        grew = true;
      }
    }
    if (!grew) break;
  }

  const keep = new Uint8Array(count);
  const dropped = new Uint8Array(count);
  let changedTotal = 0;
  let rejectedTotal = 0;
  for (let i = 0; i < count; i++) {
    if (labels[i] < 0) continue;
    const component = components[labels[i]];
    if (component.accepted) keep[i] = 1;
    if (changed[i]) {
      changedTotal++;
      if (!component.accepted) rejectedTotal++;
    }
    // Changes rejected as inventions on blank paper (not shapes the model merely redrew)
    if (!component.accepted && !component.redrawn && component.changed >= MIN_CHANGED_PIXELS) dropped[i] = 1;
  }
  // Lines are classified against the regions as detected, before they grow
  const lines = protectedLines(hpOrig, hpEdited, inkThreshold, keep, width, height);
  growThroughWeakChanges(keep, lines, hpOrig, hpEdited, origGrey, editedGrey, changeThreshold, candidates.filter((c) => c.accepted), width, height);

  // Grow past anti-aliasing, then feather so pasted regions have no hard seams
  const feather = Math.max(1, Math.round(side / 500));
  const grown = dilate(keep, width, height, feather * 2, feather * 2);
  const soft = boxBlur(Float32Array.from(grown), width, height, feather);
  const protect = boxBlur(Float32Array.from(lines), width, height, 1);
  const alpha = new Uint8Array(count);
  let keptArea = 0;
  let lineArea = 0;
  for (let i = 0; i < count; i++) {
    alpha[i] = Math.round(soft[i] * (1 - protect[i]) * 255);
    if (alpha[i] > 0) keptArea++;
    if (soft[i] > 0 && protect[i] > 0.5) lineArea++;
  }

  // HD mode takes the model's whole page except its inventions on blank paper
  const droppedSoft = boxBlur(Float32Array.from(dilate(dropped, width, height, feather * 2, feather * 2)), width, height, feather);
  const hdAlpha = new Uint8Array(count);
  for (let i = 0; i < count; i++) hdAlpha[i] = Math.round((1 - droppedSoft[i]) * 255);

  return {
    alpha,
    hdAlpha,
    stats: {
      regionsKept: candidates.filter((c) => c.accepted).length,
      regionsDropped: candidates.filter((c) => !c.accepted).length,
      shapesKept,
      linesKept: lineArea / count,
      changedArea: keptArea / count,
      droppedChangeShare: changedTotal ? rejectedTotal / changedTotal : 0,
    },
  };
};

// A scan softer than this is unreadable anyway; a larger estimate would mean something is off
const MAX_SOFTNESS_SIGMA = 4;

/** Running max (or min) over a (2r+1)-square window, one axis at a time */
const slidingExtreme = (src, width, height, r, pickMax) => {
  const pick = pickMax ? Math.max : Math.min;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = src[row + x];
      for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r); k++) v = pick(v, src[row + k]);
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = tmp[y * width + x];
      for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++) v = pick(v, tmp[k * width + x]);
      out[y * width + x] = v;
    }
  }
  return out;
};

/**
 * Typical width of an image's strongest edges, in pixels. For an edge blurred by a Gaussian of
 * sigma, contrast / peak gradient is about 2.5 sigma (about 1.7 sigma for a thin line), so the
 * median over the strongest edges tracks how soft the image is. Measured on one image alone,
 * it does not depend on the model's answer lining up with the scan.
 */
const edgeWidth = (grey, width, height) => {
  const count = width * height;
  const hi = slidingExtreme(grey, width, height, 12, true);
  const lo = slidingExtreme(grey, width, height, 12, false);
  const gradient = new Float32Array(count);
  const histogram = new Uint32Array(256);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const g = Math.hypot((grey[i + 1] - grey[i - 1]) / 2, (grey[i + width] - grey[i - width]) / 2);
      gradient[i] = g;
      histogram[Math.min(255, Math.round(g))]++;
    }
  }
  let seen = 0;
  let threshold = 255;
  for (let v = 255; v >= 0; v--) {
    seen += histogram[v];
    if (seen >= count * 0.02) {
      threshold = v;
      break;
    }
  }
  const widths = [];
  for (let i = 0; i < count; i++) {
    const contrast = hi[i] - lo[i];
    if (gradient[i] >= Math.max(threshold, 2) && contrast >= 40) widths.push(contrast / gradient[i]);
  }
  if (widths.length < 50) return 0;
  widths.sort((a, b) => a - b);
  return widths[widths.length >> 1];
};

/**
 * How much softer the scan is than the model's answer (Gaussian sigma, analysis pixels), and the
 * answer softened by that much. Image models draw crisp, so on a blurry scan every untouched line
 * would otherwise read as "changed", and crisp pasted text would look stuck on.
 */
const estimateSoftness = (origGrey, editedGrey, width, height) => {
  const origEdge = edgeWidth(origGrey, width, height);
  const editedEdge = edgeWidth(editedGrey, width, height);
  const sigma = clamp(Math.sqrt(Math.max(0, origEdge * origEdge - editedEdge * editedEdge)) / 2.2, 0, MAX_SOFTNESS_SIGMA);
  if (sigma < 0.6) return { sigma: 0, grey: editedGrey, origEdge, editedEdge };
  // Two box passes of this radius have the same spread as the Gaussian
  const radius = Math.max(1, Math.round((Math.sqrt(6 * sigma * sigma + 1) - 1) / 2));
  return { sigma, grey: boxBlur(boxBlur(editedGrey, width, height, radius), width, height, radius), origEdge, editedEdge };
};

/**
 * How much to deepen the pasted ink. The model writes thinner, lighter strokes than a bold
 * scanned font, and once softened they read grey next to the original text. Compares the darkest
 * ink inside the edited regions before (old text) and after (new text); only ever darkens.
 */
const inkDepth = (origRgb, pasted, tone, alpha, paperLevel) => {
  const paperGrey = luma(Uint8Array.from(paperLevel), 1)[0];
  if (paperGrey < 128) return 1; // light text on a dark background — leave it alone

  const origHist = new Uint32Array(256);
  const pastedHist = new Uint32Array(256);
  let n = 0;
  for (let p = 0; p < alpha.length; p++) {
    if (alpha[p] < 200) continue;
    const i = p * 3;
    origHist[Math.round(0.299 * origRgb[i] + 0.587 * origRgb[i + 1] + 0.114 * origRgb[i + 2])]++;
    const g =
      0.299 * (tone[0].gain * pasted[i] + tone[0].offset) +
      0.587 * (tone[1].gain * pasted[i + 1] + tone[1].offset) +
      0.114 * (tone[2].gain * pasted[i + 2] + tone[2].offset);
    pastedHist[clamp(Math.round(g), 0, 255)]++;
    n++;
  }
  if (n < 100) return 1;

  const darkest = (hist) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v];
      if (seen >= n * 0.03) return v;
    }
    return 255;
  };
  const origInk = darkest(origHist);
  const pastedInk = darkest(pastedHist);
  if (paperGrey - origInk < 30 || pastedInk <= origInk) return 1;
  return clamp((paperGrey - origInk) / Math.max(1, paperGrey - pastedInk), 1, 2.5);
};

/**
 * SAFETY GATE — whether a merge can work at all:
 *   - 'different-picture': neither the layout nor the fine structure matches — the model drew
 *     something else. Merging would smear two unrelated images together; the original is returned.
 *   - 'rebuilt-layout': the picture is the same but none of its lines land where the scan's do and
 *     much of it changed — the merge would patch two drawings together; the answer is used whole.
 *   - 'merge': the normal path.
 * Measured on real answers: faithful ones score layout 0.90–0.99 and structure 0.12–0.6; an
 * unrelated picture scored 0.08 and 0.01.
 */
const judgeAnswer = ({ layoutMatch, structureMatch, changedArea }) => {
  if (layoutMatch < 0.4 && structureMatch < 0.08) return 'different-picture';
  if (structureMatch < 0.08 && changedArea > 0.4) return 'rebuilt-layout';
  return 'merge';
};

/**
 * Does the model's answer show the same picture? Correlation of the two images blurred until only
 * the layout is left (text lines become grey bands, a chart its blocks). A faithful answer —
 * even one with every word replaced — keeps its layout; an answer that drew something else does not.
 */
const layoutCorrelation = (origGrey, editedGrey, width, height) => {
  const radius = Math.max(4, Math.round(Math.max(width, height) / 64));
  const a = boxBlur(boxBlur(origGrey, width, height, radius), width, height, radius);
  const b = boxBlur(boxBlur(editedGrey, width, height, radius), width, height, radius);
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    sa += a[i];
    sb += b[i];
    n++;
  }
  const ma = sa / n;
  const mb = sb / n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i] - ma) * (b[i] - mb);
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
};

const softenToScan = (rgb, width, height, sigma) => rawRgb(rgb, width, height).blur(Math.max(0.3, sigma)).raw().toBuffer();

/**
 * Put the model's text changes onto the untouched original. Everything outside the changed text
 * regions keeps the original pixels, size and format.
 */
export async function mergeEditedImage({ prepared, editedData, mode = 'faithful' }) {
  const hd = mode === 'hd';
  const { original, layout } = prepared;
  const { width, height } = original;

  const { canvasRgb, editedSize } = await decodeEdited(editedData, layout);
  const alignmentFit = await estimateAlignment(original, canvasRgb, layout);
  const { transform, shifted } = alignmentFit;
  const sharpen = upscaleSharpening(editedSize, layout, transform);
  const edited = await alignToOriginal(canvasRgb, layout, original, transform, sharpen);

  const f = ANALYSIS_SIDE / Math.max(width, height);
  const aw = Math.max(8, Math.round(width * f));
  const ah = Math.max(8, Math.round(height * f));
  const count = aw * ah;
  const [origSmall, editedSmall] = await Promise.all([
    resizeRgb(original.rgb, width, height, aw, ah),
    resizeRgb(edited, width, height, aw, ah),
  ]);

  // First tone fit over everything (most of the image is unchanged), refit outside the edits
  const roughTone = fitTone(origSmall, editedSmall, count, null);
  const origGrey = luma(origSmall, count);
  // Detection compares against the answer softened to the scan's own sharpness; the pasted
  // pixels stay the model's crisp ones
  const softness = estimateSoftness(origGrey, luma(applyTone(editedSmall, roughTone), count), aw, ah);
  const { alpha, hdAlpha, stats } = buildEditMask(origGrey, softness.grey, aw, ah);
  const untouched = alpha.map((a) => (a === 0 ? 1 : 0));
  const tone = fitTone(origSmall, editedSmall, count, untouched);
  // Pasted pixels take on the scan's own softness: crisp new text in a blurry scan looks stuck on
  // (HD keeps the model's crispness — that is the point of it)
  const pasted = !hd && softness.sigma > 0 ? await softenToScan(edited, width, height, softness.sigma * (width / aw)) : edited;

  // Does the answer still show the original picture? (see SAFETY GATE below)
  const layoutMatch = layoutCorrelation(origGrey, softness.grey, aw, ah);
  const structureMatch = (shifted ? alignmentFit.after : alignmentFit.before).matched;
  const verdict = judgeAnswer({ layoutMatch, structureMatch, changedArea: stats.changedArea });

  const report = {
    ...stats,
    mode,
    verdict,
    aligned: shifted ? transform : null,
    softness: Number(softness.sigma.toFixed(2)),
    layout: Number(layoutMatch.toFixed(3)),
    edgeWidth: [Number(softness.origEdge.toFixed(1)), Number(softness.editedEdge.toFixed(1))],
    structureMatch: Number(structureMatch.toFixed(3)),
    sharpen,
    model: layout.model,
    stretch: layout.stretch,
    enlarge: layout.enlarge,
    padded: layout.padded,
  };

  if (verdict === 'different-picture') {
    const encoded = await encodeRgb(original.sourceRgb, original.sourceWidth, original.sourceHeight, original.mimeType);
    return {
      dataUrl: `data:${encoded.mimeType};base64,${encoded.buffer.toString('base64')}`,
      warning:
        "The image model's answer does not match the original picture, so nothing was replaced and the original is returned. Try again.",
      stats: report,
    };
  }

  const fullAlpha = await sharp(hd ? hdAlpha : alpha, { raw: { width: aw, height: ah, channels: 1 } })
    .resize(width, height, { fit: 'fill', kernel: 'linear' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  // The model rebuilt the layout: a merge could only patch two different drawings together, so
  // its whole version is used — still in the scan's frame, tone and softness
  if (verdict === 'rebuilt-layout') fullAlpha.fill(255);

  const paper = borderColour(original.rgb, width, height);
  const paperLevel = [paper.r, paper.g, paper.b];
  const ink = hd ? 1 : inkDepth(original.rgb, pasted, tone, fullAlpha, paperLevel);

  const out = Buffer.from(original.rgb);
  for (let p = 0; p < width * height; p++) {
    const a = fullAlpha[p];
    // Low alpha is resampling spill — leave those pixels exactly as they were
    if (a < 4) continue;
    const weight = a / 255;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      const toned = tone[c].gain * pasted[i] + tone[c].offset;
      const value = clamp(paperLevel[c] - (paperLevel[c] - toned) * ink, 0, 255);
      out[i] = Math.round(out[i] + (value - out[i]) * weight);
    }
  }

  const result = hd ? { rgb: out, width, height } : await toUploadSize(out, fullAlpha, original);
  const encoded = await encodeRgb(result.rgb, result.width, result.height, original.mimeType);
  report.output = `${result.width}x${result.height}`;

  let warning;
  if (verdict === 'rebuilt-layout') {
    warning =
      "The image model redrew the picture's layout, so its whole version is shown instead of only the changed text. Try again for a closer match.";
  } else if (stats.regionsKept === 0) {
    warning = 'The image model did not change any text — the original is returned. Try again.';
  }

  return {
    dataUrl: `data:${encoded.mimeType};base64,${encoded.buffer.toString('base64')}`,
    warning,
    stats: { ...report, inkDepth: Number(ink.toFixed(2)) },
  };
}
