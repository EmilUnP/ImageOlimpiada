import sharp from 'sharp';

/**
 * Keeps an AI text replacement faithful to the original scan.
 *
 * Image models regenerate every pixel: they re-frame aspect ratios they cannot output (inventing
 * bars, panels and margins), nudge the layout, and change the paper tone, sharpness and texture.
 * So the model never gets the last word on the whole picture:
 *   1. prepareForImageEdit — pad the scan to an aspect ratio the model outputs natively, so it has
 *      nothing to invent around the content
 *   2. mergeEditedImage — map the answer back onto the original pixel grid, find where the text
 *      changed, and copy only those regions onto the untouched original
 */

// Output shapes both image families support natively (gpt-image: 1024², 1536×1024, 1024×1536; Gemini lists these too)
const MODEL_ASPECT_RATIOS = [1, 3 / 2, 2 / 3];
const MAX_MODEL_INPUT_SIDE = 2048;

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
  if (/jpe?g/i.test(mimeType)) {
    return { mimeType: 'image/jpeg', buffer: await image.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer() };
  }
  if (/webp/i.test(mimeType)) {
    return { mimeType: 'image/webp', buffer: await image.webp({ quality: 95 }).toBuffer() };
  }
  return { mimeType: 'image/png', buffer: await image.png().toBuffer() };
};

/**
 * Pad the scan with its own paper colour to the nearest aspect ratio the model outputs natively.
 * Without this, a wide crop gets squeezed into a 3:2 or square canvas and the model fills the gap
 * with invented bars, frames and panels.
 */
export async function prepareForImageEdit({ data, mimeType }) {
  const { rgb, width, height } = await decodeRgb(Buffer.from(data, 'base64'));

  const ratio = width / height;
  const target = MODEL_ASPECT_RATIOS.reduce((best, r) =>
    Math.abs(Math.log(r / ratio)) < Math.abs(Math.log(best / ratio)) ? r : best
  );
  const canvasWidth = ratio < target ? Math.round(height * target) : width;
  const canvasHeight = ratio > target ? Math.round(width / target) : height;
  const padLeft = Math.floor((canvasWidth - width) / 2);
  const padTop = Math.floor((canvasHeight - height) / 2);
  const padded = canvasWidth !== width || canvasHeight !== height;

  let canvas = rgb;
  if (padded) {
    canvas = await rawRgb(rgb, width, height)
      .extend({
        top: padTop,
        bottom: canvasHeight - height - padTop,
        left: padLeft,
        right: canvasWidth - width - padLeft,
        background: borderColour(rgb, width, height),
      })
      .raw()
      .toBuffer();
  }

  // Separate pipeline: sharp always resizes before it extends
  let pipeline = rawRgb(canvas, canvasWidth, canvasHeight);
  const scale = Math.min(1, MAX_MODEL_INPUT_SIDE / Math.max(canvasWidth, canvasHeight));
  if (scale < 1) {
    pipeline = pipeline.resize(Math.round(canvasWidth * scale), Math.round(canvasHeight * scale), { fit: 'fill' });
  }

  const isJpeg = /jpe?g/i.test(mimeType);
  const buffer = await (isJpeg ? pipeline.jpeg({ quality: 95 }) : pipeline.png()).toBuffer();

  return {
    data: buffer.toString('base64'),
    mimeType: isJpeg ? 'image/jpeg' : 'image/png',
    original: { rgb, width, height, mimeType },
    layout: { canvasWidth, canvasHeight, padLeft, padTop, padded },
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
    canvas: highPass(luma(canvasSmall, cw * ch), cw, ch, radius),
    // Per-pixel error cap: features only one image has (invented bars, replaced words) cost the
    // same at every offset, so they cannot drag the alignment away from the shared layout
    cap: Math.max(8, percentileOfAbs(orig, 0.99) * 0.5),
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

/**
 * Small shifts / scale drift the model introduced (a few % at most). Coarse-to-fine search, one
 * axis at a time so a slightly stretched answer still lines up. Kept only when it moves content
 * by a visible amount and clearly lines up more of the original's structure: when nearly all
 * structure is replaced text, any offset can match old words to new ones a little better.
 */
const estimateAlignment = async (original, canvasRgb, layout) => {
  const coarse = await buildAlignmentLevel(original, canvasRgb, layout, COARSE_SIDE);
  let t = IDENTITY;
  for (let i = 0; i < 3; i++) {
    for (const axis of ['x', 'y']) {
      t = searchAxis(coarse, t, axis, range(1, 0.04, 0.01), range(0, 10 * coarse.unit, coarse.unit), 2);
    }
  }

  const fine = await buildAlignmentLevel(original, canvasRgb, layout, ANALYSIS_SIDE);
  const coarseStep = coarse.unit / fine.unit;
  // Wide pass first (the short side of a wide crop is barely resolved at coarse size), then narrow
  const passes = [
    { scale: 0.015, scaleStep: 0.0025, shift: Math.ceil(coarseStep), shiftStep: 1, sampleStep: 4 },
    { scale: 0.005, scaleStep: 0.001, shift: 2, shiftStep: 0.5, sampleStep: 3 },
    { scale: 0.002, scaleStep: 0.0005, shift: 1, shiftStep: 0.25, sampleStep: 2 },
  ];
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

  const before = compareAligned(fine, IDENTITY, 2);
  const after = compareAligned(fine, t, 2);
  const shifted =
    maxDisplacement(t, original.width, original.height) >= 0.75 &&
    after.error < before.error * 0.9 &&
    after.matched >= Math.max(before.matched * 1.6, before.matched + 0.1);

  return { transform: shifted ? t : IDENTITY, shifted, before, after };
};

/** The model's answer resampled onto the original pixel grid */
const alignToOriginal = async (canvasRgb, layout, original, t) => {
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

  return rawRgb(source, sourceWidth, sourceHeight)
    .extract({ left, top, width: rectWidth, height: rectHeight })
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();
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
const isTextContinuation = (candidate, accepted) => {
  const ch = candidate.maxY - candidate.minY + 1;
  const cw = candidate.maxX - candidate.minX + 1;
  const ah = accepted.maxY - accepted.minY + 1;
  const lineHeight = Math.min(ch, ah);

  const sameLine = overlap(candidate.minY, candidate.maxY, accepted.minY, accepted.maxY) >= lineHeight * 0.5;
  const horizontalGap = Math.max(candidate.minX - accepted.maxX, accepted.minX - candidate.maxX);
  if (sameLine && horizontalGap <= lineHeight * 1.5) return true;

  // A wrapped line has the height of the line it continues — thin edges of invented bars do not
  const similarHeight = ch >= ah * 0.6 && ch <= ah * 1.6;
  const below = overlap(candidate.minX, candidate.maxX, accepted.minX, accepted.maxX) >= cw * 0.5;
  const verticalGap = Math.max(candidate.minY - accepted.maxY, accepted.minY - candidate.maxY);
  return similarHeight && below && verticalGap <= ah;
};

/**
 * Where did the text change? High-pass difference between the original and the aligned answer,
 * grouped into regions. A region is kept only when it overlaps original ink (the old text being
 * replaced) or continues kept text; changes on blank paper — invented bars, panels, captions —
 * are dropped. Returns a feathered alpha mask (0–255) at analysis size.
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
  }

  // Grow past anti-aliasing, then feather so pasted regions have no hard seams
  const feather = Math.max(1, Math.round(side / 500));
  const grown = dilate(keep, width, height, feather * 2, feather * 2);
  const soft = boxBlur(Float32Array.from(grown), width, height, feather);
  const alpha = new Uint8Array(count);
  let keptArea = 0;
  for (let i = 0; i < count; i++) {
    alpha[i] = Math.round(soft[i] * 255);
    if (alpha[i] > 0) keptArea++;
  }

  return {
    alpha,
    stats: {
      regionsKept: candidates.filter((c) => c.accepted).length,
      regionsDropped: candidates.filter((c) => !c.accepted).length,
      changedArea: keptArea / count,
      droppedChangeShare: changedTotal ? rejectedTotal / changedTotal : 0,
    },
  };
};

/**
 * Put the model's text changes onto the untouched original. Everything outside the changed text
 * regions keeps the original pixels, size and format.
 */
export async function mergeEditedImage({ prepared, editedData }) {
  const { original, layout } = prepared;
  const { width, height } = original;

  // The model answers at its own resolution — stretch it back onto the canvas we sent
  const { rgb: canvasRgb } = await decodeRgb(Buffer.from(editedData, 'base64'), {
    width: layout.canvasWidth,
    height: layout.canvasHeight,
  });

  const { transform, shifted } = await estimateAlignment(original, canvasRgb, layout);
  const edited = await alignToOriginal(canvasRgb, layout, original, transform);

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
  const { alpha, stats } = buildEditMask(luma(origSmall, count), luma(applyTone(editedSmall, roughTone), count), aw, ah);
  const untouched = alpha.map((a) => (a === 0 ? 1 : 0));
  const tone = fitTone(origSmall, editedSmall, count, untouched);

  const fullAlpha = await sharp(alpha, { raw: { width: aw, height: ah, channels: 1 } })
    .resize(width, height, { fit: 'fill', kernel: 'linear' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  const out = Buffer.from(original.rgb);
  for (let p = 0; p < width * height; p++) {
    const a = fullAlpha[p];
    // Low alpha is resampling spill — leave those pixels exactly as they were
    if (a < 4) continue;
    const weight = a / 255;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      const value = clamp(tone[c].gain * edited[i] + tone[c].offset, 0, 255);
      out[i] = Math.round(out[i] + (value - out[i]) * weight);
    }
  }

  const encoded = await encodeRgb(out, width, height, original.mimeType);

  let warning;
  if (stats.regionsKept === 0) {
    warning = 'The image model did not change any text — the original is returned. Try again.';
  } else if (stats.changedArea > 0.85) {
    warning = 'The image model redrew most of the image, so parts of the layout may differ from the original. Try again for a cleaner result.';
  }

  return {
    dataUrl: `data:${encoded.mimeType};base64,${encoded.buffer.toString('base64')}`,
    warning,
    stats: {
      ...stats,
      aligned: shifted ? transform : null,
      padded: layout.padded,
    },
  };
}
