// node model/check-assembly.mjs — real deterministic educational transition math.
import assert from 'node:assert/strict';
import { assemblyOffsets, movementExplosionOffsets, MOVEMENT_GROUPS } from './assembly.js';

const separated = assemblyOffsets(0);
assert.deepEqual(movementExplosionOffsets(1), separated);
assert.deepEqual(assemblyOffsets(-1), separated);
for (const offset of Object.values(assemblyOffsets(1))) assert.deepEqual(offset, [0, 0, 0]);
assert.deepEqual(assemblyOffsets(2), assemblyOffsets(1));
for (const offset of Object.values(movementExplosionOffsets(0))) assert.deepEqual(offset, [0, 0, 0]);

for (const [id, group] of Object.entries(MOVEMENT_GROUPS)) {
  const atStart = assemblyOffsets(group.start)[id];
  assert.deepEqual(atStart, separated[id]);
  assert.deepEqual(assemblyOffsets(group.end)[id], [0, 0, 0]);
  const middle = assemblyOffsets((group.start + group.end) / 2)[id];
  for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(middle[axis] - separated[id][axis] / 2) < 1e-12);
}

const scrub = assemblyOffsets(0.24);
assemblyOffsets(0.9);
assemblyOffsets(0.02);
assert.deepEqual(assemblyOffsets(0.24), scrub); // reverse scrubs never accumulate
for (const p of [0, 0.14, 0.24, 0.46, 0.74, 1]) {
  const offsets = assemblyOffsets(p);
  for (const id of ['C000', 'C100', 'C101', 'C102', 'C103', 'B000']) assert.equal(id in offsets, false);
  for (const value of Object.values(offsets).flat()) assert.ok(Number.isFinite(value));
}
console.log('Assembly checks passed: staged seating, identity, deterministic scrub, no case/cradle motion.');
