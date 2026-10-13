// model/check-behavior.mjs
//
// Permanent, dependency-free behavior check for model/behavior.js.
//
//   node model/check-behavior.mjs        (npm run check)
//
// Every case exercises real return values, so a regression in the clock,
// pusher, reversal or explosion math throws and exits non-zero. Covers docs/10
// (boundaries, negative wrap, 12/24 presses, linked minutes, clockwise hands,
// smooth reversal) and docs/07 / docs/12 stage 3 (module-first explosion with an
// exact assembled inverse). Pure asserts: no harness, no mocks, no source reads.

import assert from 'node:assert/strict';
import {
  mod,
  normalizeOffset,
  reverseSeconds,
  minuteAngle,
  hourAngle,
  rectoSecondsAngle,
  reverse24hAngle,
  dialAngles,
  pressPusher,
  dayPhase,
  formatClock,
  formatClockSeconds,
  parseClock,
  handRotations,
  reversalPose,
  explosionOffsets,
  assembledOffsets,
  EXPLOSION_IDS,
  EXPLOSION_MODULE_END,
  HAND_IDS,
  SECONDS_PER_DAY,
  REVERSAL_ANGLE,
  REVERSAL_RELEASE_END,
  REVERSAL_CLEARANCE_MM,
} from './behavior.js';

const near = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} not within ${eps} of ${expected}`);

// --- Clock boundaries and negative wrap ------------------------------------

assert.equal(mod(-25, 24), 23);
assert.equal(formatClock(-60), '23:59'); // -60 s is 23:59, not a negative clock
assert.equal(formatClockSeconds(-1), '23:59:59');
near(minuteAngle(-60), 354);
near(rectoSecondsAngle(-1), 354);
near(minuteAngle(3599), 359.9);
near(minuteAngle(3600), 0); // wraps at the hour
near(rectoSecondsAngle(60), 0);
near(hourAngle(43200), 0);
near(reverse24hAngle(SECONDS_PER_DAY), 0); // wraps at 24 h
near(reverse24hAngle(SECONDS_PER_DAY / 2), 180); // 12 h
assert.equal(formatClock(SECONDS_PER_DAY), '00:00');

// --- parseClock is the trust boundary for typed input ----------------------

assert.equal(parseClock('00:00'), 0);
assert.equal(parseClock('23:59:59'), 86399);
assert.equal(parseClock('24:00'), null); // out of range
assert.equal(parseClock('nonsense'), null);

// --- GMT pusher: 12/24 press cycle, minutes stay linked --------------------

assert.equal(pressPusher(23, 1), 0);
assert.equal(pressPusher(0, 12), 12);
assert.equal(pressPusher(0, 24), 0); // a full cycle restores the state
assert.equal(pressPusher(7, 24), 7);
// Same 12-hour hand position, but the 24-hour indicator and day phase differ.
near(dialAngles(0, 12).reverse.hour, dialAngles(0, 0).reverse.hour);
near(reverse24hAngle(0, 12), 180);
assert.equal(dayPhase(0, 0), 'DAY');
assert.equal(dayPhase(0, 12), 'NIGHT');
// Whole-hour offsets never move the minute hand.
for (const offset of [0, 1, 5, 12, 23]) {
  near(minuteAngle(reverseSeconds(1234.5, offset)), minuteAngle(1234.5));
}
assert.equal(normalizeOffset(-7), 17); // -7 h correction is +17 forward presses

// --- Both faces run clockwise (signed radians) -----------------------------

// Authored in its own visible frame, each face turns clockwise: a negative
// three.js rotation about that face's outward +Z (docs/10 line 33).
const r = handRotations(905, 0, 180, { recto: -1, reverse: -1 });
for (const face of ['recto', 'reverse']) {
  for (const key of Object.keys(r[face])) {
    assert.ok(r[face][key] < 0, `${face}.${key} must be negative (clockwise)`);
  }
}

// --- Smooth reversal: endpoints, stationary, lifts clear -------------------

assert.deepEqual(reversalPose(0).position, [0, 0, 0]);
near(reversalPose(0).angle, 0);
assert.deepEqual(reversalPose(1).position, [0, 0, 0]); // reseated flush
near(reversalPose(1).angle, REVERSAL_ANGLE); // half-turn
const step = 1e-4;
assert.ok(Math.abs(reversalPose(step).angle - reversalPose(0).angle) < 1e-6);
assert.ok(Math.abs(reversalPose(1).angle - reversalPose(1 - step).angle) < 1e-6);
near(reversalPose(REVERSAL_RELEASE_END).position[2], REVERSAL_CLEARANCE_MM);
assert.ok(reversalPose(0.5).position[1] > 0, 'case must slide clear mid-turn');
near(reversalPose(1).position[2], 0);
assert.deepEqual(reversalPose(-5).position, [0, 0, 0]); // clamped
near(reversalPose(9).angle, REVERSAL_ANGLE);

// --- Explosion: module-first, exact assembled reset ------------------------

assert.deepEqual(explosionOffsets(0), assembledOffsets());
assert.deepEqual(explosionOffsets(-1), explosionOffsets(0)); // clamped
const early = explosionOffsets(EXPLOSION_MODULE_END);
assert.ok(early.C100[0] > 0, 'module must separate during phase A');
for (const id of EXPLOSION_IDS) {
  if (id === 'C100' || id === 'M000') continue;
  assert.deepEqual(early[id], [0, 0, 0], `${id} must still be assembled`);
}
const full = explosionOffsets(1);
for (const id of HAND_IDS) assert.ok(Array.isArray(full[id]), `${id} needs an offset`);
for (const id of ['D002', 'D003', 'D004']) assert.ok(full[id][2] > 0, `${id} +Z`);
for (const id of ['D102', 'D103', 'D104']) assert.ok(full[id][2] < 0, `${id} -Z`);

console.log('behavior checks passed');
