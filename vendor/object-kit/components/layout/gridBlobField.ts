// The triangle field of object.pl without the DOM: the metaball blob, the
// opacity of each triangle and a canvas renderer. GridBlobBackground animates
// it in an SVG behind the page; the wallpaper generator draws one frame of it
// at any size. Sizes are in pixels of the surface being drawn.

export const BLOB_SCALE = 1.8;
export const BLOB_CENTER = { x: 0.53, y: 0.55 };

export const GRID_TILE = 20;
/* Kąt prosty siedzi w punkcie zaczepienia, więc scale() rozrasta trójkąt
   wyłącznie w prawo i w dół — motyw wyśrodkowany rósłby na wszystkie strony. */
export const GRID_MOTIF = 'M0 0 L3 0 L0 3 Z'; // ~3px triangle, matches the old CSS dot
export const MOTIF_LEG = 3;

export const BASE_OPACITY = 0.18; // dots outside the blob (desktop)
export const PEAK_OPACITY = 0.6; // dots at the blob core

interface Ball {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

const baseBalls: Ball[] = [
  { x: 0.39, y: 0.5, r: 0.22, vx: -0.018, vy: 0.012 },
  { x: 0.55, y: 0.43, r: 0.24, vx: 0.014, vy: -0.01 },
  { x: 0.68, y: 0.59, r: 0.19, vx: 0.012, vy: 0.016 },
  { x: 0.49, y: 0.69, r: 0.18, vx: -0.01, vy: 0.014 },
];

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hash = (x: number, seed: number) => {
  const n = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453123;
  return n - Math.floor(n);
};

function valueNoise1D(x: number, seed: number) {
  const ix = Math.floor(x);
  const fx = x - ix;
  const u = fade(fx);
  return lerp(hash(ix, seed), hash(ix + 1, seed), u);
}

function organicNoise(time: number, seed: number) {
  const t = time * 0.00042;
  const slow = valueNoise1D(t, seed);
  const medium = valueNoise1D(t * 2.3 + 17.2, seed + 9.7);
  const fast = valueNoise1D(t * 4.1 + 3.8, seed + 21.3);
  return ((slow * 0.58 + medium * 0.3 + fast * 0.12) - 0.5) * 2;
}

function getPointerResponse(pointerX: number, pointerY: number, index: number, motionSeed: number) {
  const dx = pointerX - 0.5;
  const dy = pointerY - 0.5;
  const distance = Math.min(1, Math.hypot(dx, dy) * 2);
  const easedDistance = distance * distance * (3 - 2 * distance);
  const angle = hash(index * 19.37 + 5.1, motionSeed + 41.9) * Math.PI * 2;
  const polarity = hash(index * 23.11 + 9.4, motionSeed + 83.2) > 0.5 ? 1 : -1;
  const reach = 0.08 + hash(index * 29.73 + 2.8, motionSeed + 17.4) * 0.12;
  const pointerAngle = Math.atan2(dy, dx);
  const phase = Math.sin(pointerAngle + angle * 0.7);
  const strength = easedDistance * reach * polarity * (0.55 + Math.abs(phase) * 0.65);

  return {
    x: Math.cos(angle) * strength,
    y: Math.sin(angle) * strength,
  };
}

export interface CenterPoint {
  x: number;
  y: number;
  r: number;
}

export interface Metric {
  x: number;
  y: number;
}

// Blob circle centers in normalized [0..1] space of a width x height surface.
export function getMetaballCenters(
  pointerX: number,
  pointerY: number,
  time: number,
  width: number,
  height: number,
  motionSeed = 0,
): CenterPoint[] {
  const shortSide = Math.min(Math.max(width, 1), Math.max(height, 1));
  const pointerStrength = Math.min(1, shortSide / 900);

  return baseBalls.map((ball, index) => {
    const driftX = organicNoise(time, motionSeed + index * 11.13) * Math.abs(ball.vx) * 4.6;
    const driftY = organicNoise(time, motionSeed + index * 13.71 + 100) * Math.abs(ball.vy) * 4.6;
    const pointerResponse = getPointerResponse(pointerX, pointerY, index, motionSeed);

    return {
      x: BLOB_CENTER.x + (ball.x - BLOB_CENTER.x) * BLOB_SCALE + driftX + pointerResponse.x * pointerStrength,
      y: BLOB_CENTER.y + (ball.y - BLOB_CENTER.y) * BLOB_SCALE + driftY + pointerResponse.y * pointerStrength,
      r: ball.r,
    };
  });
}

/** Aspect correction, so the blob is round in pixels rather than in normalized units. */
export function getViewportMetric(width: number, height: number): Metric {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const shortSide = Math.min(w, h);
  return { x: w / shortSide, y: h / shortSide };
}

// Classic metaball scalar field at a normalized point.
export function fieldAt(px: number, py: number, centers: CenterPoint[], metric: Metric) {
  let field = 0;
  for (const ball of centers) {
    const dx = (px - ball.x) * metric.x;
    const dy = (py - ball.y) * metric.y;
    const distanceSquared = dx * dx + dy * dy + 0.0008;
    const radius = ball.r * BLOB_SCALE;
    field += (radius * radius) / distanceSquared;
  }
  return field;
}

/** The blob's threshold breathes slowly with time. */
export const fieldThreshold = (time: number) => 4 + Math.sin(time * 0.0005);

/** How far into the blob a field value is, 0 outside to 1 at the core. */
export const fieldCoverage = (field: number, threshold: number) =>
  smoothstep(threshold - 1.65, threshold + 0.54, field);

export interface GridBlobFrame {
  width: number;
  height: number;
  /** Moment of the animation in ms: it moves the blob and its threshold. */
  time: number;
  /** Normalized pointer position; (0.5, 0.52) is the page's resting value. */
  pointer?: { x: number; y: number };
  /** Varies the drift; 0 is what object.pl shows. */
  motionSeed?: number;
  /** Grid cell and triangle leg in surface px; 20 and 3 on the web. */
  tile?: number;
  leg?: number;
  color?: string;
  baseOpacity?: number;
  peakOpacity?: number;
}

/**
 * One frame of the field on a 2D canvas, over whatever is already drawn. The
 * grid is anchored to the top-right corner, as on the page. At tile 20 and
 * leg 3 it matches the web exactly; a larger tile scales the whole grid, so a
 * 4K wallpaper can keep the proportions of a 1080p screen.
 */
export function drawGridBlob(ctx: CanvasRenderingContext2D, frame: GridBlobFrame) {
  const { width, height, time } = frame;
  const tile = frame.tile ?? GRID_TILE;
  const leg = frame.leg ?? MOTIF_LEG;
  const base = frame.baseOpacity ?? BASE_OPACITY;
  const peak = frame.peakOpacity ?? PEAK_OPACITY;
  const pointer = frame.pointer ?? { x: 0.5, y: 0.52 };

  // The field is evaluated in the page's own units, so the blob keeps its shape
  // when the grid is scaled up.
  const scale = tile / GRID_TILE;
  const centers = getMetaballCenters(pointer.x, pointer.y, time, width / scale, height / scale, frame.motionSeed ?? 0);
  const metric = getViewportMetric(width, height);
  const threshold = fieldThreshold(time);

  const cols = Math.ceil(width / tile) + 1;
  const rows = Math.ceil(height / tile) + 1;
  const startX = width % tile;

  ctx.save();
  ctx.fillStyle = frame.color ?? '#fff';
  for (let row = 0; row < rows; row += 1) {
    const y = row * tile;
    for (let col = 0; col < cols; col += 1) {
      const x = startX + col * tile;
      const coverage = fieldCoverage(fieldAt(x / width, y / height, centers, metric), threshold);
      const opacity = Math.round(lerp(base, peak, coverage) * 100) / 100;
      if (opacity <= 0) continue;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + leg, y);
      ctx.lineTo(x, y + leg);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
