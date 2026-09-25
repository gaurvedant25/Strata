/**
 * Generates every app icon — web, Android, iOS and the Play Store listing —
 * from one mark, with no image dependencies. It is rasterised by hand and
 * written out as PNG (zlib is in node core).
 *
 * The mark is the one the user supplied: three concentric rings on black,
 * each running clockwise from twelve o'clock from a dark start to a bright
 * rounded end, the end catching the light and casting a soft shadow over the
 * start it sits on. The source was a small raster, so it is redrawn here from
 * measurements of it rather than scaled up: ring width, gaps, the hole, and
 * each ring's tone read at every ten degrees round the dial.
 *
 * The mark is for the home screen and the stores only. The app's own screens
 * do not show it.
 *
 *   node scripts/icons.mjs
 */
import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const INK = [0, 0, 0]; // the ground, as in the source

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * channels: 4 for RGBA, 3 for RGB (the App Store refuses an icon with alpha).
 * Square unless a height is given — the launch screens are not.
 */
function png(size, pixels, channels, height = size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 4 ? 6 : 2; // RGBA or RGB
  const stride = size * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** signed distance to a rounded rect, used for cheap anti-aliasing */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/*
 * The mark, in 512-space, centred. Every ring is the same width; the gaps are
 * a third of that, and the hole in the middle is about one ring across.
 */
const WIDTH = 37;
/*
 * Each ring's tone (0–255 grey) every ten degrees clockwise from twelve
 * o'clock, 0° to 360°, as measured off the source; the last entry is the
 * rounded end. The start of each ring is read from under its shadow, which is
 * drawn separately.
 */
const RINGS = [
  {
    r: 150.5,
    tone: [100, 102, 103, 106, 104, 109, 110, 114, 124, 123, 131, 135, 143, 153, 163, 172, 175, 185, 192, 195, 197, 203, 208, 208, 214, 215, 214, 217, 219, 218, 217, 220, 217, 215, 218, 217, 222],
  },
  {
    r: 101.5,
    tone: [128, 128, 128, 128, 136, 135, 133, 135, 137, 130, 132, 132, 135, 136, 137, 140, 138, 142, 145, 146, 144, 150, 145, 149, 157, 155, 156, 158, 159, 162, 161, 163, 163, 166, 165, 167, 178],
  },
  {
    r: 52.5,
    tone: [143, 143, 143, 143, 145, 150, 155, 157, 159, 163, 167, 170, 172, 173, 177, 180, 179, 179, 174, 175, 169, 166, 165, 160, 158, 154, 152, 152, 145, 145, 141, 140, 140, 141, 142, 143, 150],
  },
];
// A light three-tap smoothing, so the dial reads as one sweep rather than steps.
for (const ring of RINGS) {
  const t = ring.tone;
  ring.smooth = t.map((v, i) => (i === 0 || i >= t.length - 2 ? v : (t[i - 1] + 2 * v + t[i + 1]) / 4));
}

/** Tone of a ring at `deg` clockwise from twelve o'clock, 0 ≤ deg < 360, before the end and its shadow. */
function toneAt(ring, deg) {
  const i = Math.floor(deg / 10);
  if (i >= 35) return ring.smooth[35];
  const f = deg / 10 - i;
  return ring.smooth[i] * (1 - f) + ring.smooth[i + 1] * f;
}

/*
 * The rounded end sits on the ring at twelve o'clock and shades the start of
 * the ring just clockwise of it: black at its edge, back to the ring's own
 * tone about a ring's width away.
 */
function shadow(d) {
  const t = Math.max(0, Math.min(1, (d + 2) / 40));
  return 1 - Math.pow(1 - t, 1.6);
}

/** The mark's colour at a point in 512-space, and how much of the pixel it covers (`px` = 512-units per pixel). */
function markAt(x, y, px) {
  const dx = x - 256;
  const dy = y - 256;
  const r = Math.hypot(dx, dy);
  let ring = RINGS[0];
  for (const k of RINGS) if (Math.abs(r - k.r) < Math.abs(r - ring.r)) ring = k;
  const cover = Math.max(0, Math.min(1, 0.5 - (Math.abs(r - ring.r) - WIDTH / 2) / px));
  if (cover === 0) return [0, 0];

  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // clockwise from twelve o'clock
  if (deg < 0) deg += 360;
  const endD = Math.hypot(dx, dy + ring.r) - WIDTH / 2; // distance to the rounded end
  const endW = Math.max(0, Math.min(1, 0.5 - endD / px));
  let body = toneAt(ring, deg);
  if (deg < 180) body *= shadow(endD);
  const tone = endW * ring.tone[36] + (1 - endW) * body;
  return [tone, cover];
}

/**
 * ground: "tile"   the source's square with its slightly rounded corners, for icons shown as drawn
 *         "square" full bleed, for icons the platform crops itself (iOS, the Play Store, maskable)
 *         "circle" for Android's round launcher icon
 *         "none"   transparent, for Android's adaptive foreground layer
 *         "flat"   ink only, no mark, for Android's adaptive background layer
 */
function render(size, { ground = "tile", rgb = false } = {}) {
  const channels = rgb ? 3 : 4;
  const buf = Buffer.alloc(size * size * channels);
  const px = 512 / size;
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * channels;
      const X = x + 0.5;
      const Y = y + 0.5;

      let groundD = -1;
      if (ground === "tile") groundD = sdRoundRect(X, Y, half, half, half, half, size * 0.06);
      if (ground === "circle") groundD = Math.hypot(X - half, Y - half) - half;
      const groundA = ground === "none" ? 0 : Math.max(0, Math.min(1, 0.5 - groundD));

      const [tone, cover] = ground === "flat" ? [0, 0] : markAt(X * px, Y * px, px);

      if (ground === "none") {
        for (let c = 0; c < 3; c++) buf[i + c] = Math.round(tone);
        buf[i + 3] = Math.round(255 * cover);
        continue;
      }
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(INK[c] * (1 - cover) + tone * cover);
      if (!rgb) buf[i + 3] = Math.round(255 * groundA);
    }
  }
  return png(size, buf, channels);
}

function write(path, buf) {
  mkdirSync(dirname(join(ROOT, path)), { recursive: true });
  writeFileSync(join(ROOT, path), buf);
  console.log("wrote " + path, buf.length + "b");
}

// The web app. The rings sit well inside a maskable icon's safe circle as drawn.
write("public/pwa-192.png", render(192));
write("public/pwa-512.png", render(512));
write("public/pwa-maskable-512.png", render(512, { ground: "square" }));
write("public/apple-touch-icon.png", render(180, { ground: "square" }));
write("public/favicon.png", render(64));

/*
 * The SVG favicon has no sweep gradient to draw with, so each ring is laid
 * down in three-degree pieces, each one flat in the tone at its middle, with
 * the rounded end on top.
 */
function svgRing(ring) {
  const out = [];
  for (let a = 0; a < 360; a += 3) {
    const mid = a + 1.5;
    const m = (mid - 90) * (Math.PI / 180);
    const [mx, my] = [256 + ring.r * Math.cos(m), 256 + ring.r * Math.sin(m)];
    let tone = toneAt(ring, mid);
    if (mid < 180) tone *= shadow(Math.hypot(mx - 256, my - 256 + ring.r) - WIDTH / 2);
    const from = ((a - 90 - 0.3) * Math.PI) / 180;
    const to = ((a + 3 - 90) * Math.PI) / 180;
    const p = (t) => `${(256 + ring.r * Math.cos(t)).toFixed(2)} ${(256 + ring.r * Math.sin(t)).toFixed(2)}`;
    const g = Math.round(tone).toString(16).padStart(2, "0");
    out.push(`    <path d="M${p(from)} A${ring.r} ${ring.r} 0 0 1 ${p(to)}" stroke="#${g}${g}${g}"/>`);
  }
  const e = Math.round(ring.tone[36]).toString(16).padStart(2, "0");
  out.push(`    <circle cx="256" cy="${256 - ring.r}" r="${WIDTH / 2}" fill="#${e}${e}${e}" stroke="none"/>`);
  return out.join("\n");
}
write(
  "public/icon.svg",
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="31" fill="#000000"/>
  <g fill="none" stroke-width="${WIDTH}">
${RINGS.map(svgRing).join("\n")}
  </g>
</svg>
`),
);

/*
 * Android. The launcher icons are written straight into the density buckets.
 * The adaptive icon insets both layers to the visible area (see
 * mipmap-anydpi-v26), so the foreground is the whole visible icon; the rings
 * already sit inside the launcher's safe circle.
 */
const DENSITIES = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(DENSITIES)) {
  const dir = `android/app/src/main/res/mipmap-${density}`;
  write(`${dir}/ic_launcher.png`, render(size));
  write(`${dir}/ic_launcher_round.png`, render(size, { ground: "circle" }));
  write(`${dir}/ic_launcher_foreground.png`, render(size, { ground: "none" }));
  write(`${dir}/ic_launcher_background.png`, render(Math.round(size * 2.25), { ground: "flat" }));
}

// iOS draws its own rounded corners, and the App Store takes this same file.
write("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", render(1024, { ground: "square", rgb: true }));

// The Play Store listing wants a 512px square; Play rounds the corners itself.
write("assets/play-store-icon.png", render(512, { ground: "square" }));

// Sources for `npx @capacitor/assets generate`, should the native icons be regenerated that way.
write("assets/icon.png", render(1024, { ground: "square" }));
write("assets/icon-foreground.png", render(1024, { ground: "none" }));

/*
 * The launch screens: plain black, the app's own ground, with nothing on them.
 * The mark is the app icon and only that — it is not shown inside the app, and
 * a launch screen is the first screen of it. These replace what was there
 * before: the old dumbbell on Android and Capacitor's default logo on iOS.
 * Every file keeps the size the platform's template gave it, read from its own
 * header, so only what is in it changes.
 */
function flat(width, height, [r, g, b]) {
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < px.length; i += 3) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  return png(width, px, 3, height);
}

const RES = "android/app/src/main/res";
const SPLASH = [
  ...readdirSync(join(ROOT, RES))
    .filter((d) => d.startsWith("drawable"))
    .map((d) => `${RES}/${d}/splash.png`),
  ...readdirSync(join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset"))
    .filter((f) => f.endsWith(".png"))
    .map((f) => `ios/App/App/Assets.xcassets/Splash.imageset/${f}`),
].filter((p) => existsSync(join(ROOT, p)));
for (const p of SPLASH) {
  const head = readFileSync(join(ROOT, p));
  write(p, flat(head.readUInt32BE(16), head.readUInt32BE(20), INK));
}
