import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { reversalPose, explosionOffsets } from './behavior.js';
import { ASSEMBLY_SECONDS, MOVEMENT_GROUPS, movementExplosionOffsets, assemblyOffsets } from './assembly.js';
import { motionAngle, motionStatus } from './movement.js';

export function assembledSource(watch, sceneSpec) {
  // Restore the source pose on a clone, including hands and all movement children.
  const root = watch.root.clone(true);
  root.traverse(node => {
    const base = node.userData;
    if (base.assembledPosition) node.position.fromArray(base.assembledPosition);
    if (base.assembledQuaternion) node.quaternion.fromArray(base.assembledQuaternion);
    if (base.assembledScale) node.scale.fromArray(base.assembledScale);
    node.visible = true;
  });
  root.userData = {
    ...root.userData,
    reference: sceneSpec.reference,
    calibre: sceneSpec.calibre,
    authoringUnits: 'mm',
    gltfUnits: 'm',
    mmToM: sceneSpec.mm_to_m,
    coordinateFrame: sceneSpec.coordinate_frame,
    precision: 'Photograph-informed exterior; proportions provisional. Source-informed educational calibre geometry, not exact 854/1 parts. Explanatory order, not a workshop procedure.',
    physicalUnknowns: sceneSpec.physical_unknowns,
    illustrativeParameters: watch.parameters,
    displayState: {
      ...root.userData.displayState,
      movementExplosion: 0,
      educationalAssemblyProgress: 1,
      educationalAssemblyActive: false,
      motionPhase: { trainElapsedSeconds: 0, oscillatorElapsedSeconds: 0 },
      motion: motionStatus({ phase: { trainElapsedSeconds: 0, oscillatorElapsedSeconds: 0 }, running: false, speed: 1 }),
    },
  };
  root.updateMatrixWorld(true);
  return root;
}

function presentationClips(root) {
  const moving = root.getObjectByName('C100');
  const times = [], positions = [], rotations = [];
  const base = moving.position.toArray();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const baseRotation = moving.quaternion.clone();
  const rotation = new THREE.Quaternion();
  for (let i = 0; i <= 120; i++) {
    const pose = reversalPose(i / 120);
    times.push(i / 20);
    positions.push(...pose.position.map((value, index) => value + base[index]));
    rotation.setFromAxisAngle(yAxis, pose.angle).multiply(baseRotation);
    rotations.push(...rotation.toArray());
  }
  const reversal = new THREE.AnimationClip('Case reversal (illustrative clearance)', 6, [
    new THREE.VectorKeyframeTrack('C100.position', times, positions),
    new THREE.QuaternionKeyframeTrack('C100.quaternion', times, rotations),
  ]);
  reversal.userData = {precision: 'Presentation motion only; actual pivot and slide stroke unresolved', explosion: false};

  const explodeTimes = Array.from({length: 81}, (_, i) => i / 20);
  const fullOffsets = explosionOffsets(1);
  const tracks = [];
  for (const id of Object.keys(fullOffsets)) {
    const node = root.getObjectByName(id);
    if (!node) continue;
    const assembled = node.position.toArray();
    const values = [];
    for (let i = 0; i <= 80; i++) {
      const offset = explosionOffsets(i / 80)[id] ?? [0, 0, 0];
      values.push(...offset.map((value, index) => value + assembled[index]));
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${id}.position`, explodeTimes, values));
  }
  const explosion = new THREE.AnimationClip('Educational assembly explosion', 4, tracks);
  explosion.userData = {precision: 'Presentation offsets, not disassembly instructions or measured gaps', reversal: false};
  const movementClips = [
    ['Calibre exploded groups', 4, movementExplosionOffsets],
    ['Calibre assembly (educational)', ASSEMBLY_SECONDS, assemblyOffsets],
  ].map(([name, duration, offsets]) => {
    const times = Array.from({ length: 81 }, (_, i) => duration * i / 80);
    const tracks = [];
    for (const id of Object.keys(MOVEMENT_GROUPS)) {
      const node = root.getObjectByName(id);
      if (!node || node.parent?.name !== 'M000' || !node.children.length) continue;
      const base = node.position.toArray();
      const values = [];
      for (let i = 0; i <= 80; i++) values.push(...offsets(i / 80)[id].map((value, axis) => base[axis] + value));
      tracks.push(new THREE.VectorKeyframeTrack(`${id}.position`, times, values));
    }
    if (name === 'Calibre assembly (educational)') {
      // Twelve samples per beat preserve the 3 Hz teaching oscillator. Step
      // tracks hold each escape/fork pose; no gear tooth count is implied.
      const sampleTimes = Array.from({ length: duration * 72 + 1 }, (_, i) => i / 72);
      const axis = new THREE.Vector3(0, 0, 1);
      const turn = new THREE.Quaternion();
      root.traverse(node => {
        const motion = node.userData.motion;
        if (!motion || motion.kind === 'static') return;
        const base = node.quaternion.clone();
        const composed = new THREE.Quaternion();
        const values = [];
        for (const time of sampleTimes) {
          turn.setFromAxisAngle(axis, motionAngle(motion, time));
          composed.copy(base).multiply(turn);
          values.push(composed.x, composed.y, composed.z, composed.w);
        }
        const interpolation = ['escape', 'fork'].includes(motion.kind) ? THREE.InterpolateDiscrete : THREE.InterpolateLinear;
        tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, sampleTimes, values, interpolation));
      });
    }
    const clip = new THREE.AnimationClip(name, duration, tracks);
    clip.userData = { precision: 'Source-informed educational groups; not exact parts or OEM assembly order. Balance cadence 3 Hz; train speeds, ratios and amplitudes illustrative.', caseMotion: false };
    return clip;
  });
  return [reversal, explosion, ...movementClips];
}

export async function exportModel(watch, sceneSpec) {
  if (sceneSpec.mm_to_m !== 0.001) throw new Error('Expected explicit 1 mm = 0.001 m conversion');
  const source = assembledSource(watch, sceneSpec);
  // ponytail: scale one export wrapper; bake vertices only if a consumer cannot preserve node scales.
  const meterRoot = new THREE.Group();
  meterRoot.name = 'Q2718110_meters';
  meterRoot.scale.setScalar(sceneSpec.mm_to_m);
  meterRoot.userData = {units: 'm', mmToM: sceneSpec.mm_to_m, scaleAppliedExactlyOnce: true};
  meterRoot.add(source);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(meterRoot, {
    binary: true,
    trs: true,
    onlyVisible: false,
    animations: presentationClips(source),
    maxTextureSize: 2048,
  });
  return new Blob([result], {type: 'model/gltf-binary'});
}
