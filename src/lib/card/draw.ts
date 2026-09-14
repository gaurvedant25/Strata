import { FAMILY, type Family } from "./tokens";

/**
 * The drawing primitives a share card is composed from.
 *
 * A card is drawn straight onto a canvas rather than built as DOM and
 * rasterised. That buys the fonts — the app's two faces are bundled and are
 * already resident, so `ctx.fillText` gets them for free, where a serialised
 * SVG would need both woff2 files base64-inlined into every render. What it
 * costs is text layout, which does not exist in canvas: tracking, fitting and
 * baselines are all below.
 *
 * Everything here is written in *units*, not pixels. A card is 100 units wide
 * whatever its shape, so one composition holds at 9:16, 4:5 and 1:1 and no
 * size in a template is tied to a particular export.
 */

export type Ctx = CanvasRenderingContext2D;

export type Aspect = "story" | "post" | "square";

export type OverlayTransform = {
  /** Translation as a fraction of the full card width and height. */
  x: number;
  y: number;
  scale: number;
  /** Clockwise rotation in degrees. */
  rotation: number;
};

export const DEFAULT_OVERLAY: OverlayTransform = { x: 0, y: 0, scale: 1, rotation: 0 };

export type RenderMode = "all" | "background" | "overlay";

export const ASPECTS: Record<
  Aspect,
  { w: number; h: number; label: string; ratio: string }
> = {
  story: { w: 1080, h: 1920, label: "Story", ratio: "9:16" },
  post: { w: 1080, h: 1350, label: "Post", ratio: "4:5" },
  square: { w: 1080, h: 1080, label: "Square", ratio: "1:1" },
};

export type Layout = {
  photo?: {
    image: HTMLImageElement;
    /** 1 fills the frame; values below 1 reveal the black canvas. */
    zoom: number;
    /** Image alignment from near edge (0) through centred (.5) to far edge (1). */
    x: number;
    y: number;
    /** Clockwise rotation in degrees. */
    rotation: number;
  };
  overlay?: OverlayTransform;
  /** One user-selected ink used by the complete Progress overlay. */
  overlayColor?: string;
  renderMode?: RenderMode;
  ctx: Ctx;
  /** Pixels. Always 1080 wide — the unit is derived from it. */
  w: number;
  h: number;
  /** Pixels per unit. */
  u: number;
  /** The card's height in units: 177.8 story, 125 post, 100 square. */
  H: number;
  aspect: Aspect;
};

/**
 * Starts the single moveable layer used by Progress share cards.
 *
 * The photograph and black card ground are painted before this. Everything
 * between begin/end is transformed together, which keeps preview gestures and
 * the exported image on the same canvas geometry.
 */
export function beginOverlay(L: Layout) {
  if (L.renderMode === "background") return false;
  const { ctx, w, h } = L;
  const o = L.overlay ?? DEFAULT_OVERLAY;
  ctx.save();
  ctx.beginPath();
  roundPath(L, 4, 4, 92, L.H - 8, 2.4);
  ctx.clip();
  ctx.translate(o.x * w, o.y * h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.scale(o.scale, o.scale);
  ctx.translate(-w / 2, -h / 2);
  return true;
}

export function endOverlay(L: Layout) {
  L.ctx.restore();
}

export function layout(ctx: Ctx, aspect: Aspect): Layout {
  const { w, h } = ASPECTS[aspect];
  const u = w / 100;
  return { ctx, w, h, u, H: h / u, aspect };
}

export type TextOpts = {
  size: number;
  family?: Family;
  weight?: number;
  color?: string;
  /** Letter spacing in ems, the way the stylesheet writes it. */
  track?: number;
  caps?: boolean;
  align?: "left" | "center" | "right";
  /** Widest the line may be, in units. Beyond it the type shrinks, then clips. */
  maxW?: number;
  /** How far the shrink is allowed to go before an ellipsis instead. */
  minScale?: number;
};

/** Sets the context's font from a text spec. Returns the pixel size used. */
function face(ctx: Ctx, o: TextOpts, u: number, size = o.size) {
  ctx.font = `${o.weight ?? 400} ${size * u}px ${FAMILY[o.family ?? "mono"]}`;
  return size * u;
}

/**
 * The width of a tracked string, without the trailing gap.
 *
 * CSS letter-spacing puts a gap after every character including the last, so
 * centring tracked text in the browser leaves it visibly off to the left —
 * which is why the design compensates with a matching `padding-left`. Measuring
 * the way the ink actually sits means a card never needs that correction.
 */
function widthOf(ctx: Ctx, s: string, trackPx: number) {
  if (!s.length) return 0;
  if (!trackPx) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + trackPx;
  return w - trackPx;
}

export type TextBox = {
  /** Where the ink starts and ends vertically, in units. */
  top: number;
  bottom: number;
  height: number;
  width: number;
};

/**
 * One line of type, positioned by the top of its ink.
 *
 * Canvas offers a baseline, an em box and a bounding box, and only the last of
 * those is any use for stacking: two lines set at the same size sit at
 * different heights on the page if one of them has no descender. Every string
 * here is placed by where its ink actually begins, so a template stacks blocks
 * by adding gaps rather than by guessing at line boxes.
 */
export function text(
  L: Layout,
  s: string,
  x: number,
  top: number,
  o: TextOpts,
): TextBox {
  const { ctx, u } = L;
  const str = o.caps ? s.toUpperCase() : s;
  let size = o.size;
  face(ctx, o, u, size);
  let trackPx = (o.track ?? 0) * size * u;
  let shown = str;

  if (o.maxW != null) {
    const max = o.maxW * u;
    const floor = size * (o.minScale ?? 0.7);
    // Shrink first: a card would rather set a long lift name small than cut it.
    while (widthOf(ctx, shown, trackPx) > max && size > floor) {
      size -= 0.25;
      face(ctx, o, u, size);
      trackPx = (o.track ?? 0) * size * u;
    }
    // Then give up and mark the cut, which reads as a decision where a
    // mid-glyph clip reads as a bug.
    if (widthOf(ctx, shown, trackPx) > max) {
      while (shown.length > 1 && widthOf(ctx, shown + "…", trackPx) > max)
        shown = shown.slice(0, -1);
      shown += "…";
    }
  }

  const w = widthOf(ctx, shown, trackPx);
  const m = ctx.measureText(shown);
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  const align = o.align ?? "left";
  const startPx =
    align === "left"
      ? x * u
      : align === "center"
        ? x * u - w / 2
        : x * u - w;
  const baseline = top * u + ascent;

  ctx.fillStyle = o.color ?? "#ffffff";
  ctx.textBaseline = "alphabetic";
  if (trackPx) {
    let cx = startPx;
    for (const ch of shown) {
      ctx.fillText(ch, cx, baseline);
      cx += ctx.measureText(ch).width + trackPx;
    }
  } else {
    ctx.fillText(shown, startPx, baseline);
  }

  return {
    top,
    bottom: (baseline + descent) / u,
    height: (ascent + descent) / u,
    width: w / u,
  };
}

/** What `text` would occupy, without drawing it. Used to centre a block. */
export function measure(L: Layout, s: string, o: TextOpts): TextBox {
  const { ctx, u } = L;
  const str = o.caps ? s.toUpperCase() : s;
  face(ctx, o, u);
  const trackPx = (o.track ?? 0) * o.size * u;
  const m = ctx.measureText(str);
  return {
    top: 0,
    bottom: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / u,
    height: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / u,
    width: widthOf(ctx, str, trackPx) / u,
  };
}

/** A hairline. Drawn on a half-pixel so it stays one pixel and does not blur. */
export function rule(
  L: Layout,
  x1: number,
  x2: number,
  y: number,
  color: string,
  weight = 0.37,
) {
  const { ctx, u } = L;
  ctx.fillStyle = color;
  ctx.fillRect(x1 * u, Math.round(y * u), (x2 - x1) * u, Math.max(1, weight * u));
}

/**
 * Adds a rounded rectangle, in units, to whatever path is already open.
 *
 * Deliberately does not start the path itself: the shadow pass below needs
 * this shape as the *second* subpath of an even-odd clip, which is how a
 * translucent panel is kept from sitting on top of its own shadow.
 */
function roundPath(
  L: Layout,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const { ctx, u } = L;
  const px = x * u;
  const py = y * u;
  const pw = w * u;
  const ph = h * u;
  const rad = Math.min(r * u, ph / 2, pw / 2);
  // `roundRect` is only on Safari 16.4 and up, and the wordmark is on every
  // card — so the shape is traced by hand rather than made to depend on it.
  ctx.moveTo(px + rad, py);
  ctx.lineTo(px + pw - rad, py);
  ctx.arcTo(px + pw, py, px + pw, py + rad, rad);
  ctx.lineTo(px + pw, py + ph - rad);
  ctx.arcTo(px + pw, py + ph, px + pw - rad, py + ph, rad);
  ctx.lineTo(px + rad, py + ph);
  ctx.arcTo(px, py + ph, px, py + ph - rad, rad);
  ctx.lineTo(px, py + rad);
  ctx.arcTo(px, py, px + rad, py, rad);
  ctx.closePath();
}

/** Run a drawing operation inside the same rounded geometry used by panels. */
export function clipPanel(
  L: Layout,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  draw: () => void,
) {
  L.ctx.save();
  L.ctx.beginPath();
  roundPath(L, x, y, w, h, r);
  L.ctx.clip();
  draw();
  L.ctx.restore();
}

export type PanelOpts = {
  fill?: string;
  stroke?: string;
  /** In units, like everything else. */
  lineWidth?: number;
  /** Cast around the shape. Blur and offset are in units. */
  shadows?: { color: string; blur: number; dy: number }[];
  /** A hairline of this colour inside the top edge — CSS's inset highlight. */
  sheen?: string;
};

/**
 * A rounded rectangle: the slab a record is stamped into, and the floating
 * panel the transparent card is built on.
 *
 * The shadows are a list because the design's surface casts two — a wide soft
 * one for the lift off the background and a tight dark one for the contact
 * edge — and canvas holds only one shadow at a time, so each is its own pass.
 *
 * Each pass is clipped to everything *outside* the shape before it is drawn.
 * Canvas has no way to cast a shadow without also painting the thing casting
 * it, and the panel here is translucent on purpose: fill it twice in opaque
 * black under a surface at 72% and the photo it is supposed to be floating
 * over stops showing through at all.
 */
export function panel(
  L: Layout,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  o: PanelOpts,
) {
  const { ctx, u } = L;
  const trace = () => {
    ctx.beginPath();
    roundPath(L, x, y, w, h, r);
  };
  if (o.shadows?.length) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, L.w, L.h);
    roundPath(L, x, y, w, h, r);
    ctx.clip("evenodd");
    for (const sh of o.shadows) {
      trace();
      ctx.shadowColor = sh.color;
      ctx.shadowBlur = sh.blur * u;
      ctx.shadowOffsetY = sh.dy * u;
      ctx.fillStyle = "#000000";
      ctx.fill();
    }
    ctx.restore();
  }
  if (o.fill) {
    trace();
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.sheen) {
    // The same outline dropped by a pixel and clipped to the panel, which
    // leaves ink along the top edge only — the shape CSS draws for an inset
    // shadow with no blur and no spread.
    ctx.save();
    trace();
    ctx.clip();
    ctx.beginPath();
    roundPath(L, x, y + 0.19, w, h, r);
    ctx.strokeStyle = o.sheen;
    ctx.lineWidth = 0.37 * u;
    ctx.stroke();
    ctx.restore();
  }
  if (o.stroke) {
    trace();
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = (o.lineWidth ?? 0.19) * u;
    ctx.stroke();
  }
}

/** A filled round-ended pill, for the wordmark patch. */
export function pill(
  L: Layout,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  panel(L, x, y, w, h, Math.min(h, w) / 2, { fill: color });
}

/** The ground every card sits on. */
export function ground(L: Layout, color: string) {
  L.ctx.fillStyle = color;
  L.ctx.fillRect(0, 0, L.w, L.h);
}

/**
 * A soft round glow: the canvas equivalent of the blurred radial the finish
 * card puts behind its figure.
 *
 * A gradient rather than a blurred circle, because `ctx.filter` is slow and
 * unevenly supported on WebKit. The stops are written in rgba from a colour
 * given as its channels, and the far stop is the *same* colour at zero alpha
 * rather than the keyword `transparent` — interpolating toward transparent
 * black is what puts a dirty grey ring around a warm glow on a black ground.
 */
export function glow(
  L: Layout,
  cx: number,
  cy: number,
  radius: number,
  rgb: readonly [number, number, number],
  alpha: number,
) {
  const { ctx, u } = L;
  const [r, g, b] = rgb;
  const grad = ctx.createRadialGradient(
    cx * u,
    cy * u,
    0,
    cx * u,
    cy * u,
    radius * u,
  );
  // Five stops on a curve rather than two on a line. A straight ramp to zero
  // leaves a visible edge where the falloff stops, which on a black ground
  // reads as a ring drawn around the thing that is supposed to be glowing.
  for (const [at, k] of [
    [0, 1],
    [0.25, 0.66],
    [0.5, 0.36],
    [0.75, 0.14],
    [1, 0],
  ] as const)
    grad.addColorStop(at, `rgba(${r},${g},${b},${alpha * k})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx * u, cy * u, radius * u, 0, Math.PI * 2);
  ctx.fill();
}
