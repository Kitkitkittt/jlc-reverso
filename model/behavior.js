// model/behavior.js
//
// Pure display-simulation behavior for the Q2718110 Reverso Duo viewer.
//
// This module is intentionally dependency-free: no DOM and no three.js. Every
// function is deterministic and synchronous so that it can be exercised directly
// by model/check-behavior.mjs in Node and reused by model/export.js in the browser.
//
// It implements docs/10-controls-and-animation.md:
//
//   recto_time   = t
//   reverse_time = t + 3600 * o
//   o            = o mod 24
//
// plus the illustrative case-release/turn/reseat motion (docs/04) and the
// module-first explosion offsets (docs/07, docs/12 stage 3).
//
// AUTHORING CONVENTIONS (geometry interface assumptions - see viewer.js header)
// ---------------------------------------------------------------------------
// * Angles returned by the angle functions are *clockwise* dial angles measured
//   from 12, as seen by a viewer facing that particular dial (docs/10 line 21).
// * The three.js rotation applied to a hand about its own local +Z is derived by
//   handRotationSign(); three.js +Z rotation is counter-clockwise to a viewer at
//   +Z, so an "own visible frame" hand needs a negative sign and a "flat recto
//   frame" hand needs a positive sign. Both faces must therefore be checked
//   independently rather than copying the recto sign (docs/10 line 33).
// * Explosion offsets are additive LOCAL millimetre offsets (parent frame).
//   Face layers descend from C100; the upper/lower case supports descend from
//   C101. All offsets use each node's assembled parent axes, +X crown, +Y 12,
//   +Z recto crystal. Calibre child transitions live in assembly.js.
// * dial_zero_angle is deliberately unset in the evidence pack (docs/10 line 31).
//   It is exposed as an explicitly illustrative parameter and defaults to 0.

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_12H = 43200;
export const SECONDS_PER_DAY = 86400;
export const OFFSET_MODULUS_HOURS = 24;

/** Half-turn of the moving case, in radians. */
export const REVERSAL_ANGLE = Math.PI;
/** Illustrative release slide along +Y. Not a measured rail stroke (docs/04). */
export const REVERSAL_SLIDE_MM = 10;
/**
 * Explicitly artistic +Z clearance lift during release/turn/reseat, in mm. The
 * moving case is ~22.6 mm wide and ~10 mm deep, so its half-turn diagonal
 * (~12.3 mm half-extent) plus the fixed fitting's top (~2.1 mm) would intersect
 * the cradle unless the case rises clear while it turns. 16 mm is chosen as an
 * explicitly illustrative clearance with margin, not a measured factory rail
 * motion or stroke (docs/04); the real release mechanism is unresolved.
 */
export const REVERSAL_CLEARANCE_MM = 16;
/** Progress at which the release slide finishes and the half-turn begins. */
export const REVERSAL_RELEASE_END = 0.22;
/** Progress at which the half-turn finishes and the reseat slide begins. */
export const REVERSAL_TURN_END = 0.78;
/** Illustrative lateral separation of the complete moving module, in mm. */
export const EXPLOSION_MODULE_SPREAD_MM = 42;
/** Progress at which the module-first phase ends and the stack phase begins. */
export const EXPLOSION_MODULE_END = 0.35;

/**
 * The 24-hour track's zero position. Unresolved until a sharp reverse reference
 * is checked (docs/10 line 31, data/scene-spec.json reverse_24h_zero_angle_degrees
 * is null). The viewer exposes it as an illustrative parameter.
 */
export const DIAL_ZERO_ANGLE_DEG = 0;

/** Positive modulo: result is always in [0, modulus). Handles negative input. */
export function mod(value, modulus) {
  const r = ((value % modulus) + modulus) % modulus;
  return r === 0 ? 0 : r;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

/** Classic Hermite smoothstep. Zero slope at both edges, so endpoints are still. */
export function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// One elapsed-time state
// ---------------------------------------------------------------------------

/** Whole-hour reverse offset, wrapped into [0, 24). */
export function normalizeOffset(hours) {
  return mod(Math.round(hours), OFFSET_MODULUS_HOURS);
}

/** The reverse face's own elapsed seconds, including its whole-hour offset. */
export function reverseSeconds(seconds, offsetHours = 0) {
  return seconds + SECONDS_PER_HOUR * offsetHours;
}

/** Clockwise minute-hand angle, degrees, for an elapsed-seconds value. */
export function minuteAngle(seconds) {
  return 360 * (mod(seconds, SECONDS_PER_HOUR) / SECONDS_PER_HOUR);
}

/** Clockwise hour-hand angle, degrees (12-hour period). */
export function hourAngle(seconds) {
  return 360 * (mod(seconds, SECONDS_PER_12H) / SECONDS_PER_12H);
}

/** Clockwise small-seconds angle, degrees (60-second period). */
export function rectoSecondsAngle(seconds) {
  return 360 * (mod(seconds, SECONDS_PER_MINUTE) / SECONDS_PER_MINUTE);
}

/** Clockwise 24-hour indicator angle, degrees, including the dial zero offset. */
export function reverse24hAngle(seconds, offsetHours = 0, dialZeroAngle = DIAL_ZERO_ANGLE_DEG) {
  const rt = mod(reverseSeconds(seconds, offsetHours), SECONDS_PER_DAY);
  return dialZeroAngle + 360 * (rt / SECONDS_PER_DAY);
}

/** Raw clockwise dial angles for both faces, before any viewer-frame sign. */
export function dialAngles(seconds, offsetHours = 0, dialZeroAngle = DIAL_ZERO_ANGLE_DEG) {
  const rt = reverseSeconds(seconds, offsetHours);
  return {
    recto: {
      hour: hourAngle(seconds),
      minute: minuteAngle(seconds),
      seconds: rectoSecondsAngle(seconds),
    },
    reverse: {
      hour: hourAngle(rt),
      minute: minuteAngle(rt),
      hours24: reverse24hAngle(seconds, offsetHours, dialZeroAngle),
    },
  };
}

// ---------------------------------------------------------------------------
// Clockwise motion on both faces
// ---------------------------------------------------------------------------

/** The outward normal of a face in the assembled recto frame (docs/10 line 33). */
export function outwardNormalZ(face) {
  return face === 'reverse' ? -1 : 1;
}

/**
 * Sign of the local +Z rotation that makes a hand run clockwise for a viewer of
 * the given face.
 *
 * @param {'recto'|'reverse'} face
 * @param {number} localPlusZWorldZ  world Z component of the node's local +Z axis
 *   in the assembled pose. -1 for a reverse display authored in its own visible
 *   frame, +1 for geometry authored flat in the recto frame.
 * @returns {1|-1}
 */
export function handRotationSign(face, localPlusZWorldZ) {
  const normal = outwardNormalZ(face);
  if (!Number.isFinite(localPlusZWorldZ) || Math.abs(localPlusZWorldZ) < 1e-6) return -1;
  // Local +Z already points along the outward normal => own visible frame, and a
  // positive three.js rotation about it reads counter-clockwise to that viewer.
  return localPlusZWorldZ * normal > 0 ? -1 : 1;
}

/**
 * Signed local +Z rotations (radians) for all six hands, ready to compose onto
 * each hand's assembled quaternion.
 */
export function handRotations(
  seconds,
  offsetHours = 0,
  dialZeroAngle = DIAL_ZERO_ANGLE_DEG,
  signs = { recto: -1, reverse: -1 },
) {
  const angles = dialAngles(seconds, offsetHours, dialZeroAngle);
  const deg2rad = Math.PI / 180;
  return {
    recto: {
      hour: signs.recto * angles.recto.hour * deg2rad,
      minute: signs.recto * angles.recto.minute * deg2rad,
      seconds: signs.recto * angles.recto.seconds * deg2rad,
    },
    reverse: {
      hour: signs.reverse * angles.reverse.hour * deg2rad,
      minute: signs.reverse * angles.reverse.minute * deg2rad,
      hours24: signs.reverse * angles.reverse.hours24 * deg2rad,
    },
  };
}

// ---------------------------------------------------------------------------
// GMT pusher
// ---------------------------------------------------------------------------

/**
 * One full actuation increments the reverse hour offset by +1. Minutes stay
 * linked because the offset is a whole number of hours (docs/10 lines 37-39).
 * Forward-only in the conceptual model, so negative counts wrap as expected.
 */
export function pressPusher(offsetHours = 0, presses = 1) {
  return normalizeOffset(offsetHours + presses);
}

/**
 * Half-cycle label for the reverse 24-hour indicator: the first 12 hours of the
 * reverse day read DAY, the second read NIGHT. The indicator's true zero angle is
 * unresolved (docs/10 line 31), so the DAY/NIGHT boundary is a provisional
 * half-cycle split, not a verified daylight/night boundary. Consumers label it
 * as provisional.
 */
export function dayPhase(seconds, offsetHours = 0) {
  const rt = mod(reverseSeconds(seconds, offsetHours), SECONDS_PER_DAY);
  return rt < SECONDS_PER_12H ? 'DAY' : 'NIGHT';
}

// ---------------------------------------------------------------------------
// Formatting / parsing
// ---------------------------------------------------------------------------

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** "HH:MM" on a 24-hour clock, wrapping negative values forwards. */
export function formatClock(seconds) {
  const s = mod(Math.floor(seconds), SECONDS_PER_DAY);
  return `${pad2(Math.floor(s / SECONDS_PER_HOUR))}:${pad2(Math.floor((s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE))}`;
}

/** "HH:MM:SS" on a 24-hour clock, wrapping negative values forwards. */
export function formatClockSeconds(seconds) {
  const s = mod(Math.floor(seconds), SECONDS_PER_DAY);
  return `${pad2(Math.floor(s / SECONDS_PER_HOUR))}:${pad2(Math.floor((s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE))}:${pad2(s % SECONDS_PER_MINUTE)}`;
}

/** Parse "H:MM" or "HH:MM:SS" into elapsed seconds, or null if invalid. */
export function parseClock(text) {
  const match = /^\s*(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (!Number.isFinite(hours) || hours > 23) return null;
  return hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + seconds;
}

/**
 * Human-readable evidence label text for the legend. The scope of each badge is
 * deliberately narrow: a badge records what a *source* shows, never that the
 * viewer's geometry or proportions have been verified. `verified_primary` means
 * a manufacturer/catalogue record exists for the reference; it is not a claim
 * that the modelled shape matches it.
 */
export const EVIDENCE_LABELS = Object.freeze({
  verified_primary: 'Historical spec or catalogue record for the reference — not verified geometry',
  observed_owner: 'Visible in the owner wrist photograph (U01)',
  observed_supplied_photo: 'Visible in supplied reference photos (U03)',
  derived: 'Calculated result with recorded premises',
  general_mechanical: 'General mechanical explanation, not 854/1 geometry',
  reported_unconfirmed: 'Reported value lacking exact-reference confirmation',
  project_defined: 'Project-defined grouping, not a manufacturer part',
  source_informed: 'Visible mechanism informs educational groups; dimensions, pivots and tooth counts are unverified',
  illustrative_envelope: 'Illustrative envelope; shape and proportions not measured',
  unknown: 'Not established',
});

/**
 * Always-visible caution that applies to the whole model regardless of which
 * evidence badges are switched on. Shown in the legend and every export.
 */
export const GEOMETRY_CAUTION = 'Photograph-informed exterior; proportions provisional. Source-informed educational calibre geometry, not exact 854/1 parts. Dimensions, pivots and tooth counts remain unverified. Explanatory assembly order is not a workshop or lubrication procedure. Layer gaps are enlarged, not measured.';

// ---------------------------------------------------------------------------
// Case reversal (docs/04): release/slide, Y-parallel half-turn, reseat
// ---------------------------------------------------------------------------

/**
 * Piecewise-smooth reversal pose for progress in [0, 1].
 *
 *   0.00 - 0.22  release: slide out along +Y and lift along +Z, stationary at
 *                both ends
 *   0.22 - 0.78  half-turn about the Y-parallel axis, held clear of the cradle
 *   0.78 - 1.00  reseat: drop and slide back to the assembled position
 *
 * The +Z lift is an explicitly illustrative clearance: the moving case's
 * half-turn diagonal (~24 mm) is wider than the cradle window (~22.9 mm), so a
 * level turn would sweep through the fixed side rails. It is a presentation
 * clearance, not a measured factory rail motion (docs/04); the real release
 * mechanism is unresolved.
 *
 * @returns {{position: [number, number, number], angle: number}} position is an
 *   additive offset in the parent frame (mm, [x, y, z]); angle is an additive
 *   rotation about the parent +Y axis (radians). Both are zero at progress 0
 *   and progress 1, and the pose is stationary at both ends.
 */
export function reversalPose(progress) {
  const p = clamp01(progress);
  const travel = smoothstep(0, REVERSAL_RELEASE_END, p) - smoothstep(REVERSAL_TURN_END, 1, p);
  const slide = REVERSAL_SLIDE_MM * travel;
  const clearance = REVERSAL_CLEARANCE_MM * travel;
  const angle = REVERSAL_ANGLE * smoothstep(REVERSAL_RELEASE_END, REVERSAL_TURN_END, p);
  return { position: [0, slide, clearance], angle };
}

// ---------------------------------------------------------------------------
// Explosion (docs/07, docs/12 stage 3): module first, then the stacks
// ---------------------------------------------------------------------------

/**
 * Full-explosion local offsets in the assembled recto frame, in mm. Presentation
 * offsets only: they are never part of the assembled part thickness (docs/08
 * line 48) and every gap is enlarged for explanation.
 */
export const EXPLOSION_FULL_OFFSETS = Object.freeze({
  // Complete moving module, moved aside from the fixed cradle first.
  C100: Object.freeze([EXPLOSION_MODULE_SPREAD_MM, 0, 0]),
  // Case body moves aside; its upper/lower gadroon supports separate locally.
  C101: Object.freeze([58, 0, 8]),
  C102: Object.freeze([0, 0, 6]),
  C103: Object.freeze([0, 0, -6]),
  // Recto stack: crystal, then hands, then dial (+Z).
  C105: Object.freeze([0, 0, 48]),
  D003: Object.freeze([0, 0, 30]),
  D002: Object.freeze([0, 0, 26]),
  D004: Object.freeze([0, 0, 23]),
  D001: Object.freeze([0, 0, 16]),
  // Calibre module: the central baseline after case separation.
  M000: Object.freeze([0, 0, 0]),
  // Reverse stack: dial, then hands, then crystal (-Z).
  D101: Object.freeze([0, 0, -16]),
  D102: Object.freeze([0, 0, -26]),
  D103: Object.freeze([0, 0, -30]),
  D104: Object.freeze([0, 0, -23]),
  C106: Object.freeze([0, 0, -48]),
  // Independent controls on their own flank.
  I001: Object.freeze([65, -10, 0]),
  I003: Object.freeze([65, 12, 0]),
});

/** Node IDs referenced by the explosion, in a stable order. */
export const EXPLOSION_IDS = Object.freeze(Object.keys(EXPLOSION_FULL_OFFSETS));

/** IDs of the six display hands (three recto, three reverse). */
export const HAND_IDS = Object.freeze(['D002', 'D003', 'D004', 'D102', 'D103', 'D104']);

/** The assembled state is the identity: every offset is exactly zero. */
export function assembledOffsets() {
  const out = {};
  for (const id of EXPLOSION_IDS) out[id] = [0, 0, 0];
  return out;
}

/** Scale an offset component, normalising IEEE -0 to 0 so amount 0 is an exact identity. */
function scaleComponent(value, phase) {
  const scaled = value * phase;
  return scaled === 0 ? 0 : scaled;
}

/**
 * Additive local-mm offsets for an explosion amount in [0, 1].
 *
 * Phase A (0 -> 0.35): the complete moving module separates from the cradle.
 * Phase B (0.35 -> 1): the recto stack, calibre and reverse stack separate.
 * Amount 0 returns the exact assembled state (see assembledOffsets()).
 *
 * @returns {Record<string, [number, number, number]>} plain object keyed by node ID
 */
export function explosionOffsets(amount) {
  const a = clamp01(amount);
  const modulePhase = smoothstep(0, EXPLOSION_MODULE_END, a);
  const stackPhase = smoothstep(EXPLOSION_MODULE_END, 1, a);
  const out = {};
  for (const id of EXPLOSION_IDS) {
    const full = EXPLOSION_FULL_OFFSETS[id];
    const phase = id === 'C100' ? modulePhase : stackPhase;
    out[id] = [
      scaleComponent(full[0], phase),
      scaleComponent(full[1], phase),
      scaleComponent(full[2], phase),
    ];
  }
  return out;
}

/** Apply an offset table to a position triple. Used by the viewer and the tests. */
export function applyOffset(position, offset) {
  return [
    position[0] + offset[0],
    position[1] + offset[1],
    position[2] + offset[2],
  ];
}
