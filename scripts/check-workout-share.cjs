/* Runs existing gesture/Progress regressions, then the workout share contracts. */
require('./check-share-cards.cjs');
const assert = require('node:assert/strict');
const { workoutCard } = require('../src/lib/card/workoutData.ts');
const { WORKOUT_TEMPLATES } = require('../src/lib/card/workoutTemplates.ts');
const { ASPECTS } = require('../src/lib/card/draw.ts');
const { streakSummary } = require('../src/lib/stats.ts');
const now = new Date(2026, 8, 15, 19).getTime();
const hour = 3600000;
const exercises = new Map([
  ['bench', { id: 'bench', name: 'Bench press', muscle: 'Chest' }],
  ['plank', { id: 'plank', name: 'Plank', muscle: 'Core', tracks: 'time' }],
]);
const make = (id, endedAt, weight, overrides = {}) => ({
  id, name: 'Upper body', date: '2026-09-14', startedAt: endedAt - 52 * 60000, endedAt,
  entries: [{ id: `${id}-entry`, exerciseId: 'bench', sets: [
    { id: `${id}-set`, weight, reps: 10, done: true, ...overrides },
  ] }],
});
const before = make('before', now - 24 * hour, 60);
const session = make('current', now, 80);
const build = (s = session, history = [before, s], clock = now) => workoutCard(s, exercises, clock, 'kg', history, 'male');
const data = build();
assert.equal(data.duration, '52m');
assert.equal(data.volume, '800');
assert.equal(data.sets, 1);
assert.equal(data.exerciseCount, 1);
assert.equal(data.currentStreak, streakSummary([before, session], now).current);
assert.equal(data.records.length, 2, 'One strict e1RM and one exercise-volume improvement');
assert.equal(data.volumeRecord, true);
assert.deepEqual(data.muscles, ['chest']);
assert.equal(build(session, [session]).records.length, 0, 'First readings are not broken records');
assert.equal(build(session, [session]).volumeRecord, false);
const tied = make('tied', now, 60);
assert.equal(build(tied).records.length, 0, 'Tied bests are not broken records');
assert.equal(build(tied).volumeRecord, false);
const future = make('future', now + hour, 1000);
assert.deepEqual(build(session, [future, session, before]).records, data.records,
  'Later workouts do not erase records set at this completion');
assert.deepEqual(build(session, [session, { ...before, deleted: true }]).records, []);
const empty = { ...session, entries: [] };
assert.equal(build(empty).volume, '0');
assert.equal(build(empty).exerciseCount, 0);
for (const skipped of [true, false]) {
  const s = make('unfinished', now, 999, skipped ? { skipped: true } : { done: false });
  assert.equal(build(s).sets, 0);
  assert.equal(build(s).records.length, 0);
  assert.equal(build(s).muscles.length, 0);
}
const timed = { ...session, entries: [{ id: 'timed', exerciseId: 'plank', sets: [
  { id: 'hold', seconds: 60, weight: 0, reps: 0, done: true },
] }] };
assert.equal(build(timed).sets, 1, 'Completed timed sets count');
assert.equal(build(timed).volume, '0');
assert.equal(build(timed).records.length, 0);
assert.deepEqual(build(timed).muscles, ['abs', 'obliques']);
const duplicate = { ...session, entries: [...session.entries, ...session.entries] };
assert.equal(build(duplicate).volume, '1600');
assert.equal(build(duplicate).exerciseCount, 1, 'Repeated entries aggregate by exercise');
assert.equal(build(duplicate).records.length, 2, 'Repeated entries do not duplicate record badges');
assert.equal(build(session, [before, session], now + 60 * hour).currentStreak, 0);
assert.equal(build(session, [before, session], now + 60 * hour).duration, '52m', 'Reopened/history duration stays fixed');
assert.ok(!('note' in build({ ...session, note: 'private' })));

// Geometry-only canvas: verifies transformed layout and genuine anatomy paths,
// without accounts, stored workouts, a browser, or claiming pixel-level QA.
global.Path2D = class { constructor(path) { assert.ok(typeof path === 'string' && path.length > 0); } };
for (const aspect of ['story', 'square']) for (const gender of ['male', 'female']) {
  for (const sample of [data, build(empty), build(tied), build(timed), {
    ...data, name: 'Single-arm Full-body Strength & Conditioning — Long Workout Name',
    volume: '999,999,999', duration: '12h 59m', sets: 1234, currentStreak: 1234,
  }]) for (const mode of ['all', 'background', 'overlay']) for (const photoPresent of [false, true]) {
    const { w, h } = ASPECTS[aspect];
    let labels = [];
    let fillCount = 0;
    let transformCalls = 0;
    const ctx = new Proxy({
      font: '', globalAlpha: 1,
      createLinearGradient() { return { addColorStop() {} }; },
      measureText(s) { const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10);
        return { width: s.length * size * 0.6, actualBoundingBoxAscent: size * 0.75, actualBoundingBoxDescent: size * 0.2 }; },
      fillText(s, x, y) {
        labels.push(s);
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(x >= 0 && x <= w && y >= 0 && y <= h, `${aspect}: text outside export (${s})`);
      },
      fill(path) { if (path instanceof Path2D) fillCount++; },
      setTransform() { throw new Error('Workout body map must preserve overlay transforms'); },
      translate() { transformCalls++; },
    }, { get(obj, key) { return key in obj ? obj[key] : (...args) => args.filter(a => typeof a === 'number').forEach(a => assert.ok(Number.isFinite(a))); } });
    const L = { ctx, w, h, u: w / 100, H: h / (w / 100), aspect, renderMode: mode,
      overlayColor: '#7cf281', overlay: { x: -0.08, y: 0.15, scale: 0.65, rotation: 22 },
      photo: photoPresent ? { image: { naturalWidth: 1600, naturalHeight: 1200 }, zoom: 0.2, x: 0, y: 1, rotation: 35 } : undefined };
    for (const template of WORKOUT_TEMPLATES) {
      labels = []; fillCount = 0; transformCalls = 0;
      template.draw(L, { ...sample, gender });
      if (mode === 'background') assert.equal(labels.length, 0);
      else {
        assert.ok(labels.some(s => s.includes('Strata')));
        assert.ok(labels.some(s => /streak/i.test(s)));
        assert.ok(labels.some(s => s.includes(sample.duration)));
        if (template.id === 'workout/scan') {
          assert.ok(fillCount > 10, 'Training scan uses the real anatomy paths');
          assert.ok(transformCalls > 3, 'Anatomy composes with the overlay transform');
        }
      }
    }
  }
}
assert.equal(WORKOUT_TEMPLATES.length, 5);
assert.equal(WORKOUT_TEMPLATES.filter(t => t.name.includes('Wild card')).length, 2);
console.log('Workout shares: five templates, strict records, streaks, timed/empty sets, history, anatomy, layers and both sizes passed.');
