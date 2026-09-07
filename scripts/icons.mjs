/**
 * Generates the PWA icon set with no image dependencies:
 * a black rounded square with a white dumbbell, rasterised by hand and
 * written out as PNG (zlib is in node core).
 *
 *   node scripts/icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(OUT, { recursive: true });

const BG = [10, 10, 11, 255]; // near-black panel
const FG = [255, 255, 255, 255]; // white glyph

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

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
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

function render(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 512;
  // maskable icons must survive a circular crop: keep the mark inside ~62%
  const scale = maskable ? 0.72 : 1;
  const cx = size / 2;
  const cy = size / 2;

  // dumbbell parts, in 512-space, as [centerX, centerY, halfW, halfH, radius]
  const parts = [
    [256, 256, 108, 22, 10], // bar
    [134, 256, 24, 64, 12], // inner plate L
    [378, 256, 24, 64, 12], // inner plate R
    [94, 256, 18, 42, 9], // outer plate L
    [418, 256, 18, 42, 9], // outer plate R
  ];

  const bgRadius = maskable ? size : size * 0.24; // full bleed circle-safe vs squircle

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const bgD = maskable
        ? -1
        : sdRoundRect(x + 0.5, y + 0.5, cx, cy, size / 2, size / 2, bgRadius);
      const bgA = Math.max(0, Math.min(1, 0.5 - bgD));

      let fgA = 0;
      for (const [pcx, pcy, hw, hh, r] of parts) {
        const d = sdRoundRect(
          x + 0.5,
          y + 0.5,
          cx + (pcx - 256) * s * scale,
          cy + (pcy - 256) * s * scale,
          hw * s * scale,
          hh * s * scale,
          r * s * scale,
        );
        fgA = Math.max(fgA, Math.max(0, Math.min(1, 0.5 - d)));
      }

      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(BG[c] * (1 - fgA) + FG[c] * fgA);
      }
      px[i + 3] = Math.round(255 * bgA);
    }
  }
  return png(size, px);
}

const files = [
  ["pwa-192.png", render(192)],
  ["pwa-512.png", render(512)],
  ["pwa-maskable-512.png", render(512, { maskable: true })],
  ["apple-touch-icon.png", render(180, { maskable: true })],
  ["favicon.png", render(64)],
];

for (const [name, buf] of files) {
  writeFileSync(join(OUT, name), buf);
  console.log("wrote public/" + name, buf.length + "b");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="123" fill="#0a0a0b"/>
  <g fill="#ffffff">
    <rect x="148" y="234" width="216" height="44" rx="10"/>
    <rect x="110" y="192" width="48" height="128" rx="12"/>
    <rect x="354" y="192" width="48" height="128" rx="12"/>
    <rect x="76" y="214" width="36" height="84" rx="9"/>
    <rect x="400" y="214" width="36" height="84" rx="9"/>
  </g>
</svg>
`;
writeFileSync(join(OUT, "icon.svg"), svg);
console.log("wrote public/icon.svg");

/*
 * The Android launcher icon, for `npx @capacitor/assets generate`. It wants a
 * single 1024px source and slices the density buckets itself, so this is the
 * only extra size the native build needs — drawn by the same routine as the
 * rest rather than resampled up from the 512.
 */
const NATIVE = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
mkdirSync(NATIVE, { recursive: true });
for (const [name, buf] of [
  ["icon.png", render(1024, { maskable: true })],
  // the adaptive foreground is the same mark; the layer behind it is flat ink
  ["icon-foreground.png", render(1024, { maskable: true })],
]) {
  writeFileSync(join(NATIVE, name), buf);
  console.log("wrote assets/" + name, buf.length + "b");
}
