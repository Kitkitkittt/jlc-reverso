import * as THREE from 'three';

// Native authoring units are millimetres. Coordinates, spokes and clearances are
// artist-chosen presentation geometry, not a measured 854/1 or a working train.
const TAU = Math.PI * 2;
const VIDEO = 'https://www.youtube.com/watch?v=BohN-EtjQuw';
const locator = (timeSeconds, observed) => ({
  sourceId: 'S07', url: `${VIDEO}&t=${timeSeconds}s`, timeSeconds, observed,
});
const REF = {
  plate: [locator(240, 'Exposed oblong perlage plate, irregular openings and bearing bores; video orientation differs.'), locator(480, 'Assembled outline with stem at the right.')],
  bridge: [locator(480, 'Sculpted silver left/right supports around central brass rim; beveled edges.')],
  winding: [locator(480, 'Central brass rim, silver winding wheels and lower-right steel winding/setting levers.'), locator(330, 'Exposed curved steel setting lever and jewel-looking bearing.')],
  barrel: [locator(210, 'Isolated open barrel and coiled mainspring; only the cover/rim vocabulary is represented here.'), locator(240, 'Large silver circular cover beside a brass spoked wheel.')],
  train: [locator(240, 'Exposed brass spoked wheel and slender steel hub.'), locator(255, 'Contact-sheet view adds smaller brass spoked wheels; positions here remain illustrative.')],
  balance: [locator(480, 'Upper-left brass balance rim and silver support with central ruby-looking bearing.')],
  bearing: [locator(330, 'Ruby-looking bearing accents and metal surrounds; no jewel count or material authentication.')],
};

function metadata(id, label, description, sourceLocators, extra = {}) {
  return {
    id, label, description, evidenceStatus: 'observed_reference_video',
    sourceIds: ['S07'], sourceLocators,
    geometryStatus: 'source_informed_illustrative', illustrative: true,
    physicalEvidence: null, factoryDimensions: null, toothCount: null, spokeCountIsIllustrative: true,
    ...extra,
  };
}

function circlePath(x, y, radius) {
  const path = new THREE.Path();
  path.absarc(x, y, radius, 0, TAU, true);
  return path;
}

function diskShape(radius, bore = 0) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, TAU, false);
  if (bore) shape.holes.push(circlePath(0, 0, bore));
  return shape;
}

function polygon(points) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) shape.lineTo(...points[i]);
  shape.closePath();
  return shape;
}
// ---------------------------------------------------------------------------
// Educational running model
//
// Every animated part is an independent arm whose angle is a pure function of
// one accumulated phase. The phase has two accumulators: the train adds
// wall-clock time times the selected speed on each running frame, so the speed
// is applied once, exactly when it elapses, and never again to time already
// run; the balance, escapement and fork add plain wall-clock seconds. The caller
// advances the phase only while the viewer is running, so pause/resume, a speed
// change, time setting and GMT correction never move a wheel, and phase zero is
// exactly the assembled pose (exports stay unchanged).
//
// Catalogue-supported: 21,600 vibrations/h, i.e. 3 Hz / 6 beats per second
// (docs/05, START_HERE). Everything else is illustrative: train rates, spoke
// counts, escapement step size, fork swing and balance amplitude are
// presentation choices, not measured 854/1 values.
// ---------------------------------------------------------------------------
export const VIBRATION_RATE_VPH = 21600;
export const BEATS_PER_SECOND = VIBRATION_RATE_VPH / 3600;
export const OSCILLATION_HZ = BEATS_PER_SECOND / 2;
/**
 * Illustrative ceiling on the train's time scale. Above 60x a wheel turns faster
 * than the display refresh can sample it, so it strobes and reads as noise
 * instead of motion; the balance deliberately keeps its real cadence at every
 * speed, because a strobed oscillator would be a false reading of the one rate
 * the catalogue actually supports.
 */
export const MOTION_TIME_SCALE_MAX = 60;
export const motionTimeScale = speed => Math.min(Math.abs(Number(speed) || 1), MOTION_TIME_SCALE_MAX);

/** Two-accumulator running phase: speed-scaled train, wall-clock oscillator. */
export const initialMotionPhase = () => ({ trainElapsedSeconds: 0, oscillatorElapsedSeconds: 0 });

/**
 * Advance the phase by one running frame. `realSeconds` is wall-clock time, so
 * the train's factor is baked into the accumulator here and a later speed change
 * only affects frames still to come.
 */
export function advanceMotionPhase(phase = initialMotionPhase(), realSeconds = 0, speed = 1) {
  const dt = Math.max(0, Number(realSeconds) || 0);
  return {
    trainElapsedSeconds: Math.max(0, Number(phase.trainElapsedSeconds) || 0) + dt * motionTimeScale(speed),
    oscillatorElapsedSeconds: Math.max(0, Number(phase.oscillatorElapsedSeconds) || 0) + dt,
  };
}

/** The one phase an arm reads: only the train uses the speed-scaled accumulator. */
export function motionPhaseFor(motion, phase = initialMotionPhase()) {
  if (!motion || motion.kind === 'static') return 0;
  const seconds = motion.kind === 'wheel' ? phase.trainElapsedSeconds : phase.oscillatorElapsedSeconds;
  return Math.max(0, Number(seconds) || 0);
}

/**
 * Signed rotation about the arm's own local +Z, in radians, for that arm's own
 * phase (see motionPhaseFor). Every arm's mesh origin is its pivot, so no pivot
 * transform is invented or measured.
 */
export function motionAngle(motion, elapsedSeconds) {
  if (!motion) return 0;
  const t = Math.max(0, Number(elapsedSeconds) || 0);
  switch (motion.kind) {
    case 'wheel': return motion.radPerSecond * t;
    case 'balance': return motion.amplitudeRad * Math.sin(TAU * OSCILLATION_HZ * t);
    // The escapement is quantised: the wheel steps once per beat and the fork
    // swaps between its two positions on the same boundary.
    case 'escape': return motion.stepRadians * Math.floor(t * BEATS_PER_SECOND);
    case 'fork': return motion.amplitudeRad * (Math.floor(t * BEATS_PER_SECOND) % 2 ? 1 : -1);
    default: return 0;
  }
}

/** Animated arms in stable traversal order, for the viewer and the GLB clips. */
export function motionArms(root) {
  const arms = [];
  root.traverse(node => {
    if (node.userData?.motion) arms.push({ id: node.userData.id ?? node.name, name: node.name, node, motion: node.userData.motion });
  });
  return arms;
}

/** Compact running-motion status for the viewer snapshot metadata. */
export function motionStatus({ phase = initialMotionPhase(), running = false, speed = 1 } = {}) {
  const trainElapsedSeconds = Math.max(0, Number(phase?.trainElapsedSeconds) || 0);
  const oscillatorElapsedSeconds = Math.max(0, Number(phase?.oscillatorElapsedSeconds) || 0);
  const scale = motionTimeScale(speed);
  return {
    running: Boolean(running),
    speed: Number(speed) || 1,
    timeScale: scale,
    timeScaleClamped: scale < (Math.abs(Number(speed)) || 1),
    trainElapsedSeconds,
    oscillatorElapsedSeconds,
    beatsPerSecond: BEATS_PER_SECOND,
    oscillationHz: OSCILLATION_HZ,
    escapeSteps: Math.floor(oscillatorElapsedSeconds * BEATS_PER_SECOND),
    balancePhase: motionAngle({ kind: 'balance', amplitudeRad: BALANCE_AMPLITUDE_RAD }, oscillatorElapsedSeconds) / BALANCE_AMPLITUDE_RAD,
    precision: 'Educational motion: train speeds and amplitudes illustrative; balance cadence derived from the catalogue 21,600 vph rate.',
  };
}

/**
 * Illustrative running rates. Only the balance cadence is catalogue-derived
 * (OSCILLATION_HZ); the train speeds, escapement step, fork swing and balance
 * amplitude are chosen for legibility and are not measured 854/1 values.
 */
export const TRAIN_WHEEL_RAD_PER_SECOND = Object.freeze({ large: 0.9, lower: 1.35, upper: 1.7 });
export const ESCAPE_STEP_RADIANS = TAU / 15; // illustrative step, no counted teeth
export const BALANCE_AMPLITUDE_RAD = 1.1;
export const FORK_AMPLITUDE_RAD = 0.14;

function extrusion(shape, thickness, bevel = 0.035) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: bevel > 0, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, curveSegments: 36,
  });
  geometry.translate(0, 0, -thickness / 2);
  // World-like face UVs keep the procedural finish consistent across plates.
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / 6, positions.getY(i) / 6);
  // Serialize the centered vertices and authored UVs, not the extrusion recipe.
  geometry.type = 'BufferGeometry';
  delete geometry.parameters;
  geometry.toJSON = THREE.BufferGeometry.prototype.toJSON;
  return geometry;
}

// Original deterministic surface marks only; no source photograph is a texture.
function finishTexture(kind) {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const normals = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx, ny, polish;
      if (kind === 'perlage') {
        // Overlapping circular passes: the last lower-row stamp obscures the
        // earlier one, leaving circular boundaries rather than square cells.
        let row = Math.floor((y + 48) / 64);
        let cx = ((x + (row % 2) * 32 + 32) % 64) - 32;
        let cy = y - row * 64;
        if (cx * cx + cy * cy > 48 * 48) {
          row--;
          cx = ((x + (row % 2) * 32 + 32) % 64 + 64) % 64 - 32;
          cy = y - row * 64;
        }
        const radius = Math.max(1, Math.hypot(cx, cy));
        const fade = Math.min(radius / 8, 1);
        const swirl = Math.sin(radius * 0.9) * 0.05 * fade;
        const groove = Math.sin(radius * 2.1) * 0.025 * fade;
        nx = -cy / radius * swirl + cx / radius * groove;
        ny = cx / radius * swirl + cy / radius * groove;
        polish = 0.9 + Math.sin(radius * 0.55) * 0.018 + Math.sin(radius * 2.1) * 0.008;
      } else if (kind === 'circular') {
        // Disc UVs use local XY centred on the wheel axis. Wrapped signed
        // coordinates preserve concentric machining around that origin.
        const cx = x < size / 2 ? x : x - size;
        const cy = y < size / 2 ? y : y - size;
        const radius = Math.max(1, Math.hypot(cx, cy));
        const groove = Math.sin(radius * 1.1) * 0.16;
        nx = cx / radius * groove;
        ny = cy / radius * groove;
        polish = 0.92 + Math.sin(radius * 1.1) * 0.02;
      } else {
        nx = 0;
        ny = Math.sin(y * 1.3 + Math.sin(x * 0.07) * 0.2) * 0.1;
        polish = 0.91 + Math.sin(y * 1.3) * 0.04;
      }
      const offset = (y * size + x) * 4;
      const inverseLength = 1 / Math.hypot(nx, ny, 1);
      normals[offset] = Math.round((nx * inverseLength * 0.5 + 0.5) * 255);
      normals[offset + 1] = Math.round((ny * inverseLength * 0.5 + 0.5) * 255);
      normals[offset + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
      normals[offset + 3] = 255;
      roughness[offset] = roughness[offset + 1] = roughness[offset + 2] = Math.round(polish * 255);
      roughness[offset + 3] = 255;
    }
  }
  const texture = pixels => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d').putImageData(new ImageData(pixels, size, size), 0, 0);
    const map = new THREE.CanvasTexture(canvas);
    map.flipY = false;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 8;
    map.needsUpdate = true;
    return map;
  };
  return { normalMap: texture(normals), roughnessMap: texture(roughness) };
}

/** Source-informed educational assembly; no OEM construction or dimensions claimed. */
export function createMovement({ width = 18, height = 26, depth = 3 } = {}) {
  for (const [name, value] of Object.entries({ width, height, depth })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite millimetre value`);
  }
  const perlage = finishTexture('perlage');
  const brush = finishTexture('linear');
  const circularBrush = finishTexture('circular');
  const material = (color, roughness, finish = null, normalStrength = 0.25) => new THREE.MeshStandardMaterial({
    color, metalness: 0.96, roughness, envMapIntensity: 1.15,
    ...(finish || {}),
    ...(finish ? { normalScale: new THREE.Vector2(normalStrength, normalStrength) } : {}),
  });
  const silver = material(0xcdd2d6, 0.36, perlage, 0.35);
  const satin = material(0xdce1e3, 0.29, brush);
  const circularSilver = material(0xdce1e3, 0.29, circularBrush);
  const circularSteel = material(0x89939b, 0.31, circularBrush);
  const polished = material(0xe4e6e7, 0.18);
  const brass = material(0xc9a04d, 0.3, brush);
  const paleBrass = material(0xe0bf72, 0.26);
  const steel = material(0x707c86, 0.31);
  const blueSteel = material(0x344658, 0.32);
  const ruby = new THREE.MeshStandardMaterial({ color: 0x742746, metalness: 0.18, roughness: 0.19 });

  const root = new THREE.Group();
  root.name = 'M000';
  root.scale.set(width / 18, height / 26, depth / 3);
  root.userData = metadata('M000', 'Educational manual-wind calibre',
    'Original source-informed movement illustration, not an authenticated or measured owner movement. S07 is a service video labelled 854-1; its identity is not independently authenticated. No tooth counts, functional gearing, jewel counts, pivot measurements, rotor or date mechanism are asserted.',
    [...REF.plate, ...REF.bridge], {
      authoringUnits: 'mm', illustrativeEnvelope_mm: { width, height, depth },
      sourceView: { stem: '+X (right)', bridgeFace: '+Z', plate: 'lower Z' },
      schematicSubsystemIds: ['M060', 'M070', 'M080'],
      evidenceScope: 'Visible form and material contrast of another reference movement, not physical evidence from the owner watch.',
      // The running behaviour is educational: only the balance cadence comes
      // from the catalogue (21,600 vph = 6 beats/s). Train rates, escapement
      // step, fork swing and amplitude are illustrative display choices.
      runningModel: {
        beatsPerSecond: BEATS_PER_SECOND, oscillationHz: OSCILLATION_HZ,
        trainRatesIllustrative: true, balanceCadenceDerivedFromCatalogue: true,
        windingAndSettingStatic: true,
        precision: 'Educational motion: train speeds and amplitudes are illustrative; the balance cadence derives from the catalogue 21,600 vph rate. No functional gearing, tooth counts or measured amplitudes are claimed.',
      },
    });

  const subsystem = (id, label, z, description, refs, extra) => {
    const group = new THREE.Group();
    group.name = id;
    group.position.z = z;
    group.userData = metadata(id, label, description, refs, extra);
    root.add(group);
    return group;
  };
  const mesh = (group, suffix, geometry, mat, x = 0, y = 0, z = 0, extra = {}) => {
    const object = new THREE.Mesh(geometry, mat);
    object.name = `${group.name}_${suffix}`;
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    object.userData = { ...group.userData, label: suffix.replaceAll('_', ' '), ...extra };
    group.add(object);
    return object;
  };
  const flat = (group, suffix, shape, thickness, mat, x = 0, y = 0, z = 0, extra = {}) => {
    const geometry = extrusion(shape, thickness);
    if (mat === circularSilver || mat === circularSteel) {
      // Keep the full barrel radius inside one signed circular texture period.
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.75, uv.getY(i) * 0.75);
    }
    return mesh(group, suffix, geometry, mat, x, y, z, extra);
  };
  const disc = (group, suffix, radius, thickness, mat, x, y, z, bore = 0, extra = {}) =>
    flat(group, suffix, diskShape(radius, bore), thickness, mat, x, y, z, extra);
  const hub = (group, suffix, x, y, z, radius = 0.22, thickness = 0.28) =>
    disc(group, suffix, radius, thickness, steel, x, y, z);
  /**
   * A spoked wheel. Every part is positioned at the wheel's own centre (x, y),
   * so each mesh's local origin is the arbor and a local +Z rotation spins the
   * wheel in place about its pivot without orbiting the group origin.
   */
  const wheel = (group, suffix, x, y, radius, z, mat = brass, motion = null) => {
    const part = object => { if (motion) object.userData.motion = motion; return object; };
    const shape = diskShape(radius, radius * 0.85);
    part(flat(group, `${suffix}_rim`, shape, 0.13, mat, x, y, z));
    part(disc(group, `${suffix}_hub`, radius * 0.22, 0.18, mat, x, y, z, radius * 0.08));
    // ponytail: smooth rims and illustrative spokes; replace only with measured
    // profiles if a real tooth/pivot dataset becomes available. No counted teeth.
    for (let i = 0; i < 5; i++) {
      const spoke = polygon([[radius * 0.17, -0.085], [radius * 0.91, -0.13], [radius * 0.91, 0.13], [radius * 0.17, 0.085]]);
      const arm = part(flat(group, `${suffix}_spoke_${i}`, spoke, 0.1, mat, x, y, z));
      arm.rotation.z = i * TAU / 5 + 0.17;
    }
    part(hub(group, `${suffix}_pinion`, x, y, z + 0.16, Math.max(0.13, radius * 0.075), 0.3));
  };

  const plate = subsystem('M001', 'Shaped mainplate', -0.57,
    'Rounded oblong silver plate with perlage and open bearing/clearance regions inspired by the exposed service frames. Opening sizes, positions, thickness and edges are illustrative; holes are not a factory drilling pattern.', REF.plate);
  const outline = new THREE.Shape();
  outline.moveTo(-4.5, 12.4);
  outline.bezierCurveTo(-7.5, 12.4, -8.6, 10.6, -8.6, 7.6);
  outline.lineTo(-8.6, -7.7);
  outline.bezierCurveTo(-8.6, -11.3, -6.3, -12.4, -3.7, -12.4);
  outline.lineTo(3.9, -12.4);
  outline.bezierCurveTo(7.1, -12.4, 8.6, -10.1, 8.6, -7.7);
  outline.lineTo(8.6, -0.6);
  outline.lineTo(7.8, -0.6);
  outline.lineTo(7.8, 1.25);
  outline.lineTo(8.6, 1.25);
  outline.lineTo(8.6, 7.7);
  outline.bezierCurveTo(8.6, 10.7, 6.9, 12.4, 4.1, 12.4);
  outline.closePath();
  outline.holes.push(circlePath(-4.5, 7.1, 3.05), circlePath(-4, -7.0, 2.75));
  const trainOpening = new THREE.Path();
  trainOpening.moveTo(-0.35, -7.1);
  trainOpening.bezierCurveTo(-0.8, -4.8, -0.35, -2.7, 0.65, -2.1);
  trainOpening.bezierCurveTo(2.5, -1.6, 4.4, -2.8, 4.7, -4.6);
  trainOpening.bezierCurveTo(4.9, -6.6, 2.5, -8.3, 0.6, -8.6);
  trainOpening.bezierCurveTo(-0.05, -8.8, -0.25, -8.0, -0.35, -7.1);
  trainOpening.closePath();
  outline.holes.push(trainOpening);
  for (const [x, y, r] of [[-6.8, -2.6, 0.65], [-5.8, 1.1, 0.48], [6.5, 7.9, 0.68], [6.3, -8.6, 0.7], [0.1, 10.5, 0.42], [3.5, 9.9, 0.46], [-5.3, -10.6, 0.42], [0.1, -10.5, 0.62], [5.9, -4, 0.44], [4.6, 4.1, 0.45], [-2.3, 2.7, 0.36]]) {
    outline.holes.push(circlePath(x, y, r));
  }
  flat(plate, 'perlage_body', outline, 0.4, silver);
  for (const [i, x, y] of [[0, -6.8, -2.6], [1, 6.5, 7.9], [2, 6.3, -8.6]]) {
    disc(plate, `clearance_lip_${i}`, 0.83, 0.055, satin, x, y, 0.23, 0.7);
  }

  const barrel = subsystem('M020', 'Barrel region and cover', -0.06,
    'Silver circular cover and brass rim inspired by the exposed large circular cover in S07. Placement is reorganized into the illustrated bridge-side view, not a source-traced assembly. Mainspring, arbor construction and wheel teeth are not inferred.', REF.barrel);
  disc(barrel, 'brass_drum_rim', 3.4, 0.37, brass, -4, -7, 0, 0.26);
  disc(barrel, 'brushed_cover', 3.17, 0.13, circularSilver, -4, -7, 0.24, 0.24);
  disc(barrel, 'cover_highlight_ring', 2.9, 0.035, polished, -4, -7, 0.325, 2.84);
  hub(barrel, 'arbor_presentation', -4, -7, 0.37, 0.21, 0.25);

  const train = subsystem('M030', 'Going-train illustration', 0.08,
    'Readable brass spoked wheels and slim steel hubs inspired by the exposed train. Smooth rims deliberately omit unsupported tooth counts. This is a nonfunctional arrangement; centres, ratios, spoke counts and levels are artist chosen. The wheels turn during playback at illustrative relative rates, not a real gear ratio.', REF.train);
  wheel(train, 'large_train_wheel', -0.7, -4.25, 2.7, 0.03, brass, { kind: 'wheel', radPerSecond: TRAIN_WHEEL_RAD_PER_SECOND.large });
  wheel(train, 'lower_train_wheel', 3.3, -6.9, 1.8, 0.13, brass, { kind: 'wheel', radPerSecond: TRAIN_WHEEL_RAD_PER_SECOND.lower });
  wheel(train, 'upper_train_wheel', 3.45, -2.65, 1.43, 0.24, brass, { kind: 'wheel', radPerSecond: TRAIN_WHEEL_RAD_PER_SECOND.upper });

  const bridges = subsystem('M002', 'Sculpted upper supports', 0.67,
    'Separate beveled silver supports with concave wheel clearances. Curved support vocabulary follows the assembled source; outlines and bearing locations are illustrative, with no engraving or invented OEM identification.', REF.bridge);
  const leftBridge = new THREE.Shape();
  leftBridge.moveTo(-7.95, -6.5);
  leftBridge.bezierCurveTo(-8.2, -2.8, -8.1, 0.1, -7.5, 2.8);
  leftBridge.bezierCurveTo(-6.9, 4.0, -5.4, 4.1, -4.4, 3.9);
  leftBridge.bezierCurveTo(-3.3, 3.5, -2.4, 2.7, -2.3, 2.2);
  leftBridge.bezierCurveTo(-4.2, 0.5, -4.7, -1.5, -3.7, -3.4);
  leftBridge.bezierCurveTo(-4.7, -5.0, -6.1, -5.8, -7.95, -6.5);
  leftBridge.closePath();
  leftBridge.holes.push(circlePath(-6.85, 0.1, 0.45));
  flat(bridges, 'left_sweeping_support', leftBridge, 0.27, silver);
  const rightBridge = new THREE.Shape();
  rightBridge.moveTo(2.7, 3.5);
  rightBridge.bezierCurveTo(4.3, 2.2, 5.2, 0.5, 4.8, -1.35);
  rightBridge.lineTo(7.75, -1.9);
  rightBridge.lineTo(7.75, 8.85);
  rightBridge.bezierCurveTo(7.2, 10.9, 4.9, 11.4, 2.55, 11.2);
  rightBridge.lineTo(1.75, 8.2);
  rightBridge.bezierCurveTo(3.9, 7.25, 4.6, 5.6, 2.7, 3.5);
  rightBridge.closePath();
  rightBridge.holes.push(circlePath(5.8, 8.5, 0.44), circlePath(6.5, 2.9, 0.42));
  flat(bridges, 'right_arched_support', rightBridge, 0.3, silver);
  const lowerBridge = new THREE.Shape();
  lowerBridge.moveTo(-6.5, -10.6);
  lowerBridge.bezierCurveTo(-3.1, -10.85, -0.9, -9.85, 1.4, -8.45);
  lowerBridge.bezierCurveTo(2.5, -7.55, 3.8, -7.45, 4.7, -7.15);
  lowerBridge.lineTo(4.1, -5.7);
  lowerBridge.bezierCurveTo(2.0, -5.8, 0.9, -6.8, -0.1, -7.5);
  lowerBridge.bezierCurveTo(-2.6, -8.8, -4.3, -9.1, -6.4, -8.75);
  lowerBridge.closePath();
  lowerBridge.holes.push(circlePath(3.3, -6.9, 0.31));
  flat(bridges, 'lower_train_support', lowerBridge, 0.23, satin);
  const centralBridge = new THREE.Shape();
  centralBridge.moveTo(-3.25, -2.9);
  centralBridge.lineTo(-2.55, -3.35);
  centralBridge.bezierCurveTo(-1.25, -2.5, -1.0, -0.35, -0.6, 0.15);
  centralBridge.bezierCurveTo(-0.9, 1.25, 0.65, 1.7, 1.05, 0.95);
  centralBridge.bezierCurveTo(1.6, 1.6, 2.8, 2.5, 3.85, 2.65);
  centralBridge.lineTo(4.05, 3.55);
  centralBridge.bezierCurveTo(2.4, 3.5, 1.2, 2.65, 0.5, 1.65);
  centralBridge.bezierCurveTo(-0.5, 2.0, -1.3, 1.1, -1.15, 0.15);
  centralBridge.bezierCurveTo(-1.55, -1.1, -2.05, -2.25, -3.25, -2.9);
  centralBridge.closePath();
  centralBridge.holes.push(circlePath(0.1, 0.65, 0.38));
  flat(bridges, 'central_sculpted_bearing_bridge', centralBridge, 0.17, satin, 0, 0, 0.1);

  const winding = subsystem('M010', 'Winding and setting works', 0.37,
    'Central brass rim, small silver winding wheels and individually shaped right-flank steel setting levers follow visible forms at 480 s and 330 s. The smooth rims are not tooth profiles and the lever relationships are nonfunctional.', REF.winding);
  // Winding and setting works stay still during normal running: a manually wound
  // watch only turns these while the crown or the setting train is being worked,
  // which this display does not model. They carry an explicit static tag so the
  // boundary is checkable rather than merely implied.
  const stillMotion = { kind: 'static' };
  wheel(winding, 'central_winding_ring', 0.1, 0.65, 3.65, -0.05, brass, stillMotion);
  const windingCover = diskShape(2.83, 0.35);
  windingCover.holes.push(circlePath(1.77, -0.3, 0.39));
  flat(winding, 'central_silver_cover', windingCover, 0.14, circularSilver, 0.1, 0.65, 0.14);
  disc(winding, 'central_winding_wheel', 1.07, 0.16, circularSteel, 0.1, 0.65, 0.39, 0.23).userData.motion = stillMotion;
  hub(winding, 'central_winding_pivot', 0.1, 0.65, 0.55, 0.17, 0.16).userData.motion = stillMotion;
  disc(winding, 'upper_winding_wheel', 1.55, 0.18, circularSilver, -1.45, 3.55, 0.19, 0.25).userData.motion = stillMotion;
  hub(winding, 'upper_winding_pivot', -1.45, 3.55, 0.37, 0.19, 0.24).userData.motion = stillMotion;
  disc(winding, 'setting_intermediate_wheel', 0.79, 0.12, circularSilver, 3.9, -0.15, 0.3, 0.2).userData.motion = stillMotion;
  const settingLever = new THREE.Shape();
  settingLever.moveTo(5.5, 0.55);
  settingLever.bezierCurveTo(4.9, 0.45, 4.45, -0.2, 4.7, -1.0);
  settingLever.lineTo(6.1, -3.6);
  settingLever.bezierCurveTo(6.6, -4.3, 6.45, -5.9, 7.15, -6.05);
  settingLever.bezierCurveTo(8.2, -6.1, 8.2, -5.0, 7.6, -4.6);
  settingLever.lineTo(7.1, -1.7);
  settingLever.bezierCurveTo(6.95, -0.4, 6.6, 0.65, 5.5, 0.55);
  settingLever.closePath();
  settingLever.holes.push(circlePath(5.6, -0.3, 0.25), circlePath(7.3, -5.15, 0.23));
  flat(winding, 'curved_setting_lever', settingLever, 0.17, satin, 0, 0, 0.42);
  const yoke = polygon([[3.2, -1.0], [4.3, -0.8], [4.85, -2.25], [5.9, -3.15], [5.5, -3.85], [4.0, -2.75], [3.65, -1.8], [2.95, -1.75]]);
  yoke.holes.push(circlePath(3.65, -1.4, 0.22));
  flat(winding, 'setting_yoke', yoke, 0.15, polished, 0, 0, 0.62);
  const clickSpring = new THREE.Shape();
  clickSpring.moveTo(-3.9, -9.35);
  clickSpring.bezierCurveTo(-0.4, -9.55, 2.55, -9.25, 5.3, -8.1);
  clickSpring.lineTo(5.55, -7.75);
  clickSpring.bezierCurveTo(2.3, -8.8, -0.6, -9.05, -3.9, -8.85);
  clickSpring.closePath();
  flat(winding, 'lower_spring_lever', clickSpring, 0.11, steel, 0, 0, 0.14);
  const stem = mesh(winding, 'visible_stem_segment', new THREE.CylinderGeometry(0.22, 0.22, 2.75, 24), steel, 7.25, 0.38, -0.24);
  stem.rotation.z = Math.PI / 2;

  const escapement = subsystem('M040', 'Escapement teaching detail', 0.35,
    'Small smooth-rim brass wheel and fork explain the transition to the oscillator. S07 shows the balance region, but this fork outline and its placement are general-mechanical illustration, not an observed pallet geometry or operating escapement. During playback the wheel steps once per beat and the fork alternates; the step size is illustrative, not a counted tooth count.', REF.balance,
    { evidenceStatus: 'general_mechanical_illustration', geometryStatus: 'general_mechanical_illustrative' });
  wheel(escapement, 'escape_wheel_illustration', -0.7, 6.45, 1.22, 0.04, paleBrass, { kind: 'escape', stepRadians: ESCAPE_STEP_RADIANS });
  // The fork outline is authored around its own staff at (-1.85, 5.5), so the
  // mesh origin is the pivot and the fork alternates in place without orbiting.
  const fork = polygon([[-0.8, 0.35], [-0.7, 0.05], [0.1, -0.2], [0.3, -0.9], [0.9, -0.95], [1.05, -0.6], [0.6, -0.5], [0.4, 0.15], [-0.35, 0.45], [-0.35, 0.75], [-0.8, 0.85]]);
  const forkMesh = flat(escapement, 'fork_general_mechanical', fork, 0.1, blueSteel, -1.85, 5.5, 0.31);
  forkMesh.userData.motion = { kind: 'fork', amplitudeRad: FORK_AMPLITUDE_RAD };
  hub(escapement, 'fork_pivot_illustration', -1.85, 5.5, 0.42, 0.12, 0.19);

  const oscillator = subsystem('M050', 'Balance and support', 0.58,
    'Upper-left open brass balance rim and a sculpted silver support inspired by the assembled service view. The fine spiral is separately labelled general-mechanical because individual hairspring coils are not resolved in the inspected source. No beat rate, coil count or oscillating clearance is measured.', REF.balance);
  // Balance rim, arms and staff share the staff centre (-4.5, 7.1), so each
  // mesh origin is the oscillation axis and the balance swings about its own
  // centre. The support, jewel surround and hairspring stay still: only the
  // inner end of the spring is carried, its outer attachment is fixed.
  const balanceMotion = { kind: 'balance', amplitudeRad: BALANCE_AMPLITUDE_RAD };
  const balanceRim = disc(oscillator, 'balance_rim', 3.0, 0.18, paleBrass, -4.5, 7.1, 0.05, 2.74);
  balanceRim.userData.motion = balanceMotion;
  for (let i = 0; i < 3; i++) {
    const arm = flat(oscillator, `balance_arm_${i}`, polygon([[0.2, -0.075], [2.87, -0.11], [2.87, 0.11], [0.2, 0.075]]), 0.1, brass, -4.5, 7.1, 0.05);
    arm.rotation.z = i * TAU / 3 + 0.35;
    arm.userData.motion = balanceMotion;
  }
  hub(oscillator, 'balance_staff_illustration', -4.5, 7.1, 0.24, 0.16, 0.38).userData.motion = balanceMotion;
  const springPoints = [];
  for (let i = 0; i <= 180; i++) {
    const t = i / 180;
    const angle = t * TAU * 4.2;
    const radius = 0.3 + t * 1.35;
    springPoints.push(new THREE.Vector3(-4.5 + Math.cos(angle) * radius, 7.1 + Math.sin(angle) * radius, 0.32));
  }
  mesh(oscillator, 'hairspring_general_mechanical', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints), 180, 0.022, 5, false), blueSteel, 0, 0, 0, {
    label: 'Hairspring — general-mechanical illustration', evidenceStatus: 'general_mechanical_illustration', geometryStatus: 'general_mechanical_illustrative',
    description: 'Restrained illustrative spiral, not source-resolved or a specified coil count, alloy, terminal curve or real spring cross-section.', sourceIds: [], sourceLocators: [],
  });
  const balanceSupport = new THREE.Shape();
  balanceSupport.moveTo(-7.8, 10.65);
  balanceSupport.lineTo(-6.35, 10.8);
  balanceSupport.bezierCurveTo(-5.65, 9.6, -4.25, 9.0, -3.72, 7.95);
  balanceSupport.bezierCurveTo(-3.2, 6.75, -4.35, 6.25, -5.03, 6.75);
  balanceSupport.bezierCurveTo(-5.65, 7.65, -5.85, 8.95, -7.3, 9.15);
  balanceSupport.lineTo(-7.8, 10.65);
  balanceSupport.closePath();
  balanceSupport.holes.push(circlePath(-4.5, 7.1, 0.47), circlePath(-6.95, 10, 0.27));
  flat(oscillator, 'balance_support', balanceSupport, 0.2, satin, 0, 0, 0.51);
  disc(oscillator, 'balance_bearing_surround', 0.64, 0.08, paleBrass, -4.5, 7.1, 0.65, 0.39);

  const bearings = subsystem('M090', 'Source-visible bearing accents', 0.96,
    'Restrained ruby-looking accents and metal surrounds inspired by visible source bearings. These are not an authenticated jewel material, a jewel inventory, or measured bearing positions.', REF.bearing);
  for (const [i, x, y, z] of [[0, -4.5, 7.1, 0.24], [1, 3.3, -6.9, -0.15], [2, 4.4, 4.1, -0.12], [3, -2.7, -1.2, -0.08]]) {
    disc(bearings, `bearing_seat_${i}`, 0.43, 0.07, polished, x, y, z, 0.28);
    disc(bearings, `ruby_looking_bearing_${i}`, 0.28, 0.085, ruby, x, y, z + 0.015, 0.075);
  }

  const fasteners = subsystem('M091', 'Visible-style screw accents', 0.93,
    'A few slotted silver fastener heads inspired by visible source accents. Their number, locations, diameters and slot angles are presentation choices; hidden screws and thread/length specifications are not asserted.', REF.bridge);
  for (const [i, x, y, z] of [[0, -6.85, 0.1, 0], [1, 5.8, 8.5, 0], [2, 6.5, 2.9, 0], [3, -5.9, -9.55, -0.05], [4, -6.95, 10, 0.19], [5, 7.3, -5.15, -0.08]]) {
    disc(fasteners, `screw_head_${i}`, 0.41, 0.11, polished, x, y, z);
    const slot = mesh(fasteners, `screw_slot_${i}`, new THREE.BoxGeometry(0.6, 0.065, 0.014), steel, x, y, z + 0.064);
    slot.rotation.z = 0.35 + i * 0.71;
  }

  // These deliberately sparse lower-face teaching groups are not a second
  // claimed physical train. Their captions and exported metadata retain that boundary.
  const schematic = (id, label, z, description) => subsystem(id, label, z, description,
    [locator(240, 'Spoked-wheel visual vocabulary only; this display-transfer arrangement is not observed.')], {
      evidenceStatus: 'general_mechanical_illustration', geometryStatus: 'schematic_display_transfer',
      physicalArrangementClaim: false, sourceEvidenceScope: 'Visual vocabulary only; no physical two-train or ratio claim.',
    });
  const motion = schematic('M060', 'Recto motion works — schematic', -1.02,
    'Illustrative concentric display-transfer wheels explain hour/minute display outputs. The geometry is not an observed 854/1 motion-works layout, gearing ratio or real pivot coordinate.');
  wheel(motion, 'minute_transfer_schematic', 0, 0, 2.15, 0.08, paleBrass);
  disc(motion, 'hour_transfer_schematic', 1.25, 0.14, satin, 0, 0, -0.14, 0.26);
  disc(motion, 'display_pipe_schematic', 0.3, 0.22, blueSteel, 0, 0, -0.3, 0.15);
  const reverse = schematic('M070', 'Reverse time transfer — schematic', -1.06,
    'Sparse teaching wheels mark the reverse time-display output, not a second physical going train. Layout, wheel count, coupling and ratio are deliberately unresolved.');
  wheel(reverse, 'reverse_display_schematic', 0, 4.5, 1.85, 0.02, paleBrass);
  wheel(reverse, 'transfer_schematic', -2.6, 2.85, 1.0, -0.08, satin);
  const dayNight = schematic('M080', '24-hour display transfer — schematic', -1.04,
    'A lower display wheel and small transfer wheel explain the separate 24-hour output. No actual reduction ratio, tooth count, pivot placement or independent time train is claimed.');
  wheel(dayNight, 'day_night_display_schematic', 0, -6.5, 1.75, 0.02, paleBrass);
  wheel(dayNight, 'day_night_transfer_schematic', 2.55, -5.2, 0.9, -0.08, satin);

  root.traverse(node => {
    node.userData.assembledPosition = node.position.toArray();
    node.userData.assembledQuaternion = node.quaternion.toArray();
    node.userData.assembledScale = node.scale.toArray();
  });
  return root;
}
