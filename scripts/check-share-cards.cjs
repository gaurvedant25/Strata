/* Pure regression checks; no accounts, browsers, or stored workouts are touched. */
const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { liftCard } = require('../src/lib/card/select.ts');
const { liftJourney, liftMoment, liftPoster } = require('../src/lib/card/liftTemplates.ts');
const { pinchOverlay, constrainOverlay } = require('../src/lib/card/overlay.ts');
const { MIN_PHOTO_ZOOM, photoSize, pinchPhoto } = require('../src/lib/card/photo.ts');
// An off-centre pinch must keep the point beneath the fingers stationary.
for (const aspect of ['story', 'square']) {
  const start = { x: 0, y: 0, scale: 0.7, rotation: 0 };
  const origin = { x: 0.65, y: 0.6 };
  const current = { x: 0.68, y: 0.62 };
  const next = pinchOverlay(start, origin, current, 0.8, aspect);
  assert.ok(Math.abs(0.5 + next.x + ((origin.x - 0.5) / start.scale) * next.scale - current.x) < 1e-9);
  assert.ok(Math.abs(0.5 + next.y + ((origin.y - 0.5) / start.scale) * next.scale - current.y) < 1e-9);
  const dragged = pinchOverlay(next, current, { x: current.x + 0.02, y: current.y }, 1, aspect);
  assert.ok(Math.abs(dragged.x - next.x - 0.02) < 1e-9, 'One-finger continuation must not jump');
  for (const scale of [0.1, 0.35, 0.7, 1, 3]) for (const direction of [-1, 1]) {
    const bounded = constrainOverlay({ x: direction * 10, y: direction * 10, scale, rotation: 0 }, aspect);
    const H = aspect === 'story' ? 1920 / 10.8 : 100;
    assert.ok(bounded.scale >= 0.35 && bounded.scale <= 1);
    assert.ok(0.5 + bounded.x - 0.44 * bounded.scale >= 0.05 - 1e-9);
    assert.ok(0.5 + bounded.x + 0.44 * bounded.scale <= 0.95 + 1e-9);
    assert.ok(0.5 + bounded.y + (9 / H - 0.5) * bounded.scale >= 5 / H - 1e-9);
    assert.ok(0.5 + bounded.y + (1 - 7 / H - 0.5) * bounded.scale <= 1 - 5 / H + 1e-9);
  }
  const tilted = pinchOverlay({ x: 0, y: 0, scale: 0.5, rotation: 10 },
    { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 0.8, aspect, 25);
  assert.equal(tilted.rotation, 35, 'Two-finger rotation tilts the complete stats overlay');
}

// Photos can shrink far below cover size, with the point under the fingers
// preserved and the unused card area left for the black canvas.
{
  const image = { width: 1600, height: 1200 };
  const frame = { width: 360, height: 640 };
  const start = { x: 0.5, y: 0.5, zoom: 1, rotation: 0 };
  const origin = { x: 220, y: 280 };
  const current = { x: 205, y: 300 };
  const next = pinchPhoto(start, image, frame, origin, current, 0.2);
  const before = photoSize(image, frame, start.zoom);
  const after = photoSize(image, frame, next.zoom);
  const sx = (origin.x + (before.width - frame.width) * start.x) / before.width;
  const sy = (origin.y + (before.height - frame.height) * start.y) / before.height;
  assert.ok(Math.abs(sx * after.width - (after.width - frame.width) * next.x - current.x) < 1e-9);
  assert.ok(Math.abs(sy * after.height - (after.height - frame.height) * next.y - current.y) < 1e-9);
  assert.ok(after.width < frame.width && after.height < frame.height, 'Zooming out reveals black canvas');
  assert.equal(pinchPhoto(start, image, frame, origin, origin, 0).zoom, MIN_PHOTO_ZOOM);
  const tilted = pinchPhoto(start, image, frame, origin, origin, 0.8, 32);
  assert.equal(tilted.rotation, 32, 'Two-finger rotation tilts the photo');
}
const base = { name: 'Bench press', currentStreak: 6, metricId: 'e1rm', metricLabel: 'Estimated 1RM', unit: 'kg', sinceLabel: '', stats: [], decimals: 1 };
const make = (values, history = values) => liftCard({ ...base, values, history, dates: values.map((_, i) => `${i + 1} Sep 2026`) });
assert.equal(make([80, 100]).record.value, '100');
assert.equal(make([80, 100], [120, 80, 100]).record, null, 'Range high is not an all-time best');
assert.equal(make([80, 100], [100, 80, 100]).record, null, 'A tied best is not a new record');
assert.equal(make([80]).record, null);
assert.equal(liftJourney.fits(make([80])), false);
assert.equal(liftJourney.fits(make([80, 80])), true);
assert.equal(make([80, 100]).current, '100');
assert.equal(make([80, 100]).delta, '+20');
assert.equal(make([100, 80]).delta, '-20');
assert.equal(make([80, 80]).delta, '0');
assert.equal(make([80, 100]).changePct, 25);
assert.equal(make([0, 100]).changePct, null);
assert.equal(make([80, 100]).currentStreak, 6);
assert.equal(liftMoment.name, 'Lift snapshot');
assert.equal(liftJourney.fits(make([80, NaN])), false);

// The layout contract: every drawing coordinate is finite and all text stays
// within the export, including long names, very large values, and both sizes.
for (const aspect of ['story', 'square']) for (const values of [[80], [80, 80], [100, 80], [80, 100], [12340, 999999.9]]) {
  const data = make(values);
  data.name = 'Single-arm Incline Dumbbell Bench Press';
  const H = aspect === 'story' ? 1920 / 10.8 : 100;
  const ctx = new Proxy({
    font: '', globalAlpha: 1,
    createLinearGradient() { return { addColorStop() {} }; },
    measureText(s) { const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10); return { width: s.length * size * 0.6, actualBoundingBoxAscent: size * 0.75, actualBoundingBoxDescent: size * 0.2 }; },
    fillText(s, x, y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); assert.ok(y <= H * 10.8 + 1 && y >= 0, `Text outside ${aspect}: ${s}`); },
  }, { get(obj, key) { return key in obj ? obj[key] : (...args) => args.filter(a => typeof a === 'number').forEach(a => assert.ok(Number.isFinite(a))); } });
  const L = { ctx, w: 1080, h: H * 10.8, u: 10.8, H, aspect };
  const photo = { image: { naturalWidth: 1600, naturalHeight: 1200 }, zoom: 1.2, x: 0.5, y: 0.5, rotation: -12 };
  for (const template of [liftMoment, liftPoster, liftJourney]) if (!template.fits || template.fits(data)) {
    template.draw(L, data);
    template.draw({ ...L, photo }, data);
    template.draw({ ...L, photo, overlay: constrainOverlay({ x: 0.18, y: -0.12, scale: 0.7, rotation: 14 }, aspect) }, data);
    template.draw({ ...L, photo, renderMode: 'background' }, data);
    template.draw({ ...L, photo, renderMode: 'overlay' }, data);
  }
}
console.log('Share cards: data, records, streaks, photos, movable overlays, and both layout sizes passed.');
