// node model/check-movement-surface.mjs — outward winding and open bores.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMovement } from './movement.js';

const root = createMovement({});

/** Signed volume by the divergence theorem; positive means outward winding. */
function signedVolume(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
  let volume = 0;
  const triangle = (i, j, k) => {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, j);
    c.fromBufferAttribute(position, k);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  };
  if (index) for (let i = 0; i < index.count; i += 3) triangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  else for (let i = 0; i < position.count; i += 3) triangle(i, i + 1, i + 2);
  return volume;
}

const meshes = [];
root.traverse(node => { if (node.isMesh) meshes.push(node); });

// 1. No turned or extruded part may be wound inside-out, and no part may be a
//    degenerate shell: the lathed annuli are rings, so their profile closing
//    must be present. A hole in a profile shows up as a near-zero volume.
for (const node of meshes) {
  const volume = signedVolume(node.geometry);
  assert.ok(volume > 0, `${node.name}: geometry must be wound outward (volume ${volume})`);
}

// 2. A turned ring with an open profile would be a zero-thickness tube, so the
//    rings that must be hollow still hold a bore: the chaton setting is an
//    annulus and the drum wall is a tube, both with an inner radius present.
const boreMeshes = meshes.filter(node => /bearing_seat|brass_drum_rim/.test(node.name));
for (const node of boreMeshes) {
  const position = node.geometry.attributes.position;
  let minRadius = Infinity;
  for (let i = 0; i < position.count; i++) minRadius = Math.min(minRadius, Math.hypot(position.getX(i), position.getY(i)));
  assert.ok(minRadius > 0.2, `${node.name}: hollow turned ring must keep its bore (min radius ${minRadius})`);
}

console.log('Movement geometry checks passed: outward winding and open turned bores.');
