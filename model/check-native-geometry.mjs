// node model/check-native-geometry.mjs — real watch JSON/ObjectLoader round trip, no DOM.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWatch, PARAMETERS } from './exterior.js';

const { root: live } = createWatch();
live.updateMatrixWorld(true);
const json = JSON.parse(JSON.stringify(live.toJSON()));
const reopened = new THREE.ObjectLoader().parse(json);
const tolerance = 1e-6; // Float32 geometry, in native millimetres.
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} != ${expected}`);
const bounds = object => {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  return [...box.min.toArray(), ...box.max.toArray()];
};
const compareBounds = (actual, expected, label) => {
  actual.forEach((value, i) => near(value, expected[i], `${label}[${i}]`));
};

assert.equal(live.userData.authoringUnits, 'mm');
assert.equal(reopened.userData.authoringUnits, 'mm');
compareBounds(bounds(reopened), bounds(live), 'full assembled watch bounds (mm)');
let meshCount = 0;
live.traverse(node => {
  if (!node.isMesh) return;
  meshCount++;
  const copy = reopened.getObjectByName(node.name);
  assert.ok(copy?.isMesh, `${node.name}: mesh preserved`);
  assert.equal(copy.userData.id, node.userData.id, `${node.name}: stable ID`);
  copy.matrixWorld.elements.forEach((value, i) => near(value, node.matrixWorld.elements[i], `${node.name}: assembled transform[${i}]`));
  const geometry = node.geometry;
  assert.deepEqual(Object.keys(copy.geometry.attributes), Object.keys(geometry.attributes), `${node.name}: attributes`);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const restored = copy.geometry.attributes[name];
    assert.equal(restored.itemSize, attribute.itemSize, `${node.name}.${name}: item size`);
    assert.equal(restored.normalized, attribute.normalized, `${node.name}.${name}: normalization`);
    assert.equal(restored.array.length, attribute.array.length, `${node.name}.${name}: data size`);
    assert.ok(restored.array.every((value, i) => value === attribute.array[i]), `${node.name}.${name}: complete vertex data`);
  }
  assert.deepEqual(copy.geometry.index?.array, geometry.index?.array, `${node.name}: triangle indices`);
  assert.deepEqual(copy.geometry.groups, geometry.groups, `${node.name}: material groups`);
  compareBounds(bounds(copy), bounds(node), `${node.name}: world bounds (mm)`);
});
let reopenedMeshCount = 0;
reopened.traverse(node => { if (node.isMesh) reopenedMeshCount++; });
assert.equal(reopenedMeshCount, meshCount, 'all meshes preserved');


// Check the actual curved link surface, not merely the bracelet node transforms.
const L = PARAMETERS.illustrative;
const halfHeight = (L.braceletUnitPitch_mm - L.braceletLinkGap_mm - 0.2) / 2;
for (const watch of [live, reopened]) {
  const positions = watch.getObjectByName('B003_upper_run_u01_c1').geometry.attributes.position;
  let centerTop = -Infinity;
  let edgeTop = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const y = Math.abs(positions.getY(i));
    if (y < tolerance) centerTop = Math.max(centerTop, positions.getZ(i));
    if (y >= halfHeight - tolerance) edgeTop = Math.max(edgeTop, positions.getZ(i));
  }
  assert.ok(Number.isFinite(centerTop) && Number.isFinite(edgeTop), 'bracelet surface samples exist');
  assert.ok(centerTop - edgeTop >= L.braceletLinkCrown_mm - tolerance, 'bracelet surface curves down toward its ends');
}

// Controls must attach to the flank, stay separate, and reverse with the case.
for (const watch of [live, reopened]) {
  const pusher = watch.getObjectByName('I003'), crown = watch.getObjectByName('I001');
  const pusherBox = bounds(pusher), crownBox = bounds(crown);
  assert.ok(pusherBox[0] < L.movingCaseWidth_mm / 2 && pusherBox[3] > L.movingCaseWidth_mm / 2, 'pusher head seats across the case wall');
  assert.ok(pusherBox[1] > crownBox[4], 'pusher stays above and separate from crown');
  const moving = watch.getObjectByName('C100');
  moving.rotation.y = Math.PI;
  watch.updateMatrixWorld(true);
  assert.ok(bounds(pusher)[3] < 0 && bounds(crown)[3] < 0, 'upright reverse places both controls on the left');
  moving.rotation.y = 0;
  watch.updateMatrixWorld(true);
}
console.log(`Native geometry checks passed: ${meshCount} meshes, complete vertex data, assembled millimetre bounds, centered shell and curved bracelet.`);
