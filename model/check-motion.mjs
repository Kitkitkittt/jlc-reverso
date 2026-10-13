// node model/check-motion.mjs — cadence boundaries and local-pivot geometry.
// Real Run/Pause behavior is exercised by model/check-playback.html.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMovement } from './movement.js';
import {
  motionArms, motionAngle, motionPhaseFor, advanceMotionPhase, initialMotionPhase,
  motionTimeScale, BEATS_PER_SECOND, OSCILLATION_HZ, VIBRATION_RATE_VPH, MOTION_TIME_SCALE_MAX,
} from './movement.js';

const near = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} not within ${eps} of ${expected}`);

// --- Catalogue-derived cadence ---------------------------------------------

assert.equal(VIBRATION_RATE_VPH, 21600);
assert.equal(BEATS_PER_SECOND, 6);
assert.equal(OSCILLATION_HZ, 3);

// The balance cadence is the one rate the catalogue supports, so it must not
// scale with the display speed; the train does, but is clamped to avoid aliasing.
assert.equal(motionTimeScale(1), 1, '1x must be real time');
assert.equal(motionTimeScale(8), 8);
assert.equal(motionTimeScale(MOTION_TIME_SCALE_MAX * 100), MOTION_TIME_SCALE_MAX, 'train scale clamps to avoid strobing');
assert.equal(motionTimeScale(-4), 4);

// Speed is applied once, to the frame that elapses: the train accumulator takes
// wall-clock x speed, the oscillator accumulator takes wall-clock only.
const frame = (phase, real, speed) => advanceMotionPhase(phase, real, speed);
assert.deepEqual(frame(initialMotionPhase(), 2, 8), { trainElapsedSeconds: 16, oscillatorElapsedSeconds: 2 });
assert.deepEqual(frame(initialMotionPhase(), 2, MOTION_TIME_SCALE_MAX * 100), { trainElapsedSeconds: 2 * MOTION_TIME_SCALE_MAX, oscillatorElapsedSeconds: 2 });
assert.deepEqual(frame(initialMotionPhase(), -1, 8), { trainElapsedSeconds: 0, oscillatorElapsedSeconds: 0 }, 'a negative frame must not rewind the phase');

// A speed change alters only future frames. The already-accumulated train phase
// is untouched, so the next frame continues from the same wheels instead of
// re-scaling the whole elapsed history by the new factor.
const ran = frame(frame(initialMotionPhase(), 1, 1), 1, 1);
const sped = frame(ran, 1, 8);
assert.deepEqual(sped, { trainElapsedSeconds: 10, oscillatorElapsedSeconds: 3 }, 'a speed change must not rescale elapsed train phase');
assert.equal(motionPhaseFor({ kind: 'wheel', radPerSecond: 1 }, sped), 10);
assert.equal(motionPhaseFor({ kind: 'balance', amplitudeRad: 1.1 }, sped), 3, 'balance cadence must ignore speed');
assert.equal(motionPhaseFor({ kind: 'static' }, sped), 0);

// --- Beat boundaries --------------------------------------------------------

const escape = { kind: 'escape', stepRadians: Math.PI * 2 / 15 };
const fork = { kind: 'fork', amplitudeRad: 0.14 };
const beat = 1 / BEATS_PER_SECOND;
const eps = 1e-6;
near(motionAngle(escape, beat - eps), 0);
near(motionAngle(escape, beat), escape.stepRadians, 1e-9);
near(motionAngle(escape, 3 * beat - eps), 2 * escape.stepRadians);
near(motionAngle(escape, 3 * beat), 3 * escape.stepRadians);
// The fork swaps bank on the same boundary; the two banks are symmetric.
near(Math.abs(motionAngle(fork, beat - eps)), fork.amplitudeRad);
assert.notEqual(Math.sign(motionAngle(fork, beat - eps)), Math.sign(motionAngle(fork, beat)));
// Balance: quarter-period peaks, zero crossings on the beat grid.
const balance = { kind: 'balance', amplitudeRad: 1.1 };
near(motionAngle(balance, 0), 0);
near(motionAngle(balance, 1 / (4 * OSCILLATION_HZ)), balance.amplitudeRad, 1e-9);
near(motionAngle(balance, 1 / (2 * OSCILLATION_HZ)), 0, 1e-9);
near(motionAngle(balance, 3 / (2 * OSCILLATION_HZ)), 0, 1e-9);

// --- Geometry: pivots, static parts and the assembled pose ------------------

const root = createMovement({});
const arms = motionArms(root);

const drift = new THREE.Vector3();

const byName = new Map(arms.map(a => [a.name, a]));

// The same invariant read from the geometry: a spinning body must be authored
// around its own origin, so the local XY centre of its bounding box is ~zero.
// An off-centre body would orbit its pivot instead of spinning in place.
for (const name of ['M030_large_train_wheel_rim', 'M040_escape_wheel_illustration_rim', 'M050_balance_rim']) {
  const node = byName.get(name).node;
  node.geometry.computeBoundingBox();
  node.geometry.boundingBox.getCenter(drift);
  near(drift.x, 0, 1e-6);
  near(drift.y, 0, 1e-6);
}

// 2. The balance oscillates about its own staff centre, not the group origin.
const staff = byName.get('M050_balance_staff_illustration');
for (const name of ['M050_balance_rim', 'M050_balance_arm_0', 'M050_balance_arm_1', 'M050_balance_arm_2']) {
  const node = byName.get(name).node;
  near(node.position.x, staff.node.position.x);
  near(node.position.y, staff.node.position.y);
}

// 3. Winding and setting works stay still; bridges, plate and screws are
//    untagged, so they never enter the arm list at all.
for (const name of ['M010_central_winding_ring_rim', 'M010_central_winding_wheel', 'M010_upper_winding_wheel']) {
  const tagged = byName.get(name);
  assert.ok(tagged, `${name} should be explicitly tagged static`);
  assert.equal(tagged.motion.kind, 'static');
  assert.equal(motionAngle(tagged.motion, 123.4), 0);
  assert.equal(motionPhaseFor(tagged.motion, { trainElapsedSeconds: 123.4, oscillatorElapsedSeconds: 123.4 }), 0);
}
const bridges = root.getObjectByName('M002');
bridges.traverse(node => assert.ok(!node.userData?.motion, `static support ${node.name} must not be animated`));

// 4. The accumulators feed motionAngle as the arm's one phase. A wheel advances
//    by exactly its rate per trained second; after a partial beat the escapement
//    has not stepped yet, and only the beat-crossing frame moves it. This is the
//    boundary a speed change must not disturb: elapsed train time is never
//    rescaled, so a wheel cannot jump between frames.
const wheel = { kind: 'wheel', radPerSecond: 1.7 };
const held = advanceMotionPhase(initialMotionPhase(), 0.5, 8);
near(motionAngle(wheel, motionPhaseFor(wheel, held)), wheel.radPerSecond * 4);
const beforeBeat = advanceMotionPhase(initialMotionPhase(), beat - eps, 1);
const onBeat = advanceMotionPhase(initialMotionPhase(), beat, 1);
assert.equal(motionAngle(escape, motionPhaseFor(escape, beforeBeat)), 0);
near(motionAngle(escape, motionPhaseFor(escape, onBeat)), escape.stepRadians, 1e-9);


console.log('motion checks passed');
