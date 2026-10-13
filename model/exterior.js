// model/exterior.js
//
// Photograph-informed exterior for the Jaeger-LeCoultre Reverso Duo Q2718110
// (Calibre 854/1), authored natively in millimetres with Three.js primitives,
// custom extruded shapes and programmatically drawn canvas dial textures.
//
// This file owns exterior geometry only. model/behavior.js owns the clock,
// pusher and presentation math; model/viewer.js applies reversal/explosion on
// top of the assembled transforms authored here; model/export.js owns the
// 1 mm = 0.001 m export wrapper. Nothing here exports.
//
// EVIDENCE POLICY
//   The only sourced dimension is the catalogue case envelope (42.2 x 26 mm for
//   the complete case, NOT the moving case, dial opening or movement). Every
//   other number below is an artist-chosen, clearly labelled illustrative
//   parameter. No factory dimension, OEM part number, tooth count, screw length
//   or pivot coordinate is invented here.
//
// DISPLAY
//   Dial textures are drawn programmatically; the owner photograph is never
//   loaded, cropped or rehosted as a texture. Both dials read upright from their
//   own outside. The reverse stack bakes rotateY(PI) (a proper rotation, so text
//   is not mirrored) and stays a direct child of C100 in the assembled recto
//   frame, so behavior.js explosion offsets apply verbatim.
//
// NODE CONTRACT (consumed by model/viewer.js and model/export.js)
//   C000 fixed assembly, C100 moving assembly, C105/D001/D002/D003/D004 recto
//   stack, D101/D102/D103/D104 reverse stack, M000 educational calibre groups,
//   C106 reverse crystal, I001 crown, I003 pusher, B000 bracelet. Whole-watch
//   explosion nodes descend from C100; calibre subsystem nodes descend M000.
//   Every movable node carries
//   userData.assembledPosition / assembledQuaternion / assembledScale. Node
//   names are unique so glTF animation tracks bind unambiguously.

import * as THREE from 'three';
import { createMovement } from './movement.js';

const PI = Math.PI;
const HAS_CANVAS = typeof document !== 'undefined' && typeof document.createElement === 'function';

// ---------------------------------------------------------------------------
// Illustrative parameters (all editable; only the envelope is sourced)
// ---------------------------------------------------------------------------

export const PARAMETERS = Object.freeze({
  units: 'mm',
  contract: 'createWatch(sceneSpec) -> { root, parameters, meta }',

  // The single sourced dimension set. Scope: catalogue case envelope only.
  catalogueEnvelope: Object.freeze({
    length_mm: 42.2,
    width_mm: 26.0,
    sourceIds: ['S01'],
    evidenceStatus: 'verified_primary',
    scope: 'catalogue_case_envelope',
    note: 'Complete case boundary. Not the moving case, dial opening or movement.',
  }),

  // Artist-chosen geometry. Editable; NOT factory dimensions.
  illustrative: Object.freeze({
    // The moving case is a tall straight rectangle, not a rounded square: the
    // cradle shows only narrow long side rails and a modest end structure, and
    // the dial runs close to the case face width (U01).
    cradleWidth_mm: 26.0,
    cradleLength_mm: 42.2,
    cradleDepth_mm: 2.6,
    cradleWindowWidth_mm: 24.8,
    cradleWindowLength_mm: 40.2,
    cradleRecessZ_mm: -1.2,
    movingCaseWidth_mm: 24.4,
    movingCaseLength_mm: 40.0,
    movingCaseDepth_mm: 7.0,
    caseCornerRadius_mm: 0.8,
    dialWidth_mm: 20.8,
    dialHeight_mm: 32.0,
    dialApertureWidth_mm: 20.4,
    dialApertureHeight_mm: 31.6,
    crystalWidth_mm: 20.6,
    crystalHeight_mm: 31.8,
    crystalThickness_mm: 0.5,
    // Three horizontal gadroons per case end face (U01: triple ridges).
    gadroonCountPerEnd: 3,
    // Controls on the recto right flank (U01): a round crown with a separate
    // rectangular GMT pusher above it, toward 12. Protrusion and the separated
    // gap are photo-informed artistic proportions, not measured controls.
    crownDiameter_mm: 3.2,
    crownLength_mm: 1.9,
    crownCenterY_mm: 1.0,
    crownPositionX_mm: 13.2,
    crownKnurlCount: 36,
    crownKnurlRadius_mm: 0.07,
    gadroonRadius_mm: 0.34,
    gadroonPitch_mm: 0.94,
    pusherWidth_mm: 1.0,
    pusherHeight_mm: 4.0,
    pusherDepth_mm: 1.8,
    pusherCenterY_mm: 7.0,
    pusherPositionX_mm: 12.55,
    moduleWidth_mm: 18.0,
    moduleHeight_mm: 26.0,
    moduleDepth_mm: 3.0,
    // Five narrow, longitudinally staggered beveled link columns (U01).
    braceletWidth_mm: 17.0,
    braceletColumns: 5,
    braceletUnitsPerSide: 6,
    braceletUnitPitch_mm: 4.5,
    braceletLinkGap_mm: 0.2,
    braceletLinkDepth_mm: 2.1,
    braceletLinkCrown_mm: 0.32,
    braceletStaggerFraction: 0.5,
    braceletStartY_mm: 25.0,
    braceletCurve_mm: 0.006,
    rectoNumeralHeight_mm: 3.65,
    rectoNumeralSqueeze: 0.72,
    rectoNumeralPositions_mm: Object.freeze([
      [11, -6.4, 13.8], [12, 0, 13.8], [1, 6.4, 13.8],
      [10, -8.0, 8.2], [9, -8.0, 2.6], [8, -8.0, -3.0],
      [2, 8.0, 8.2], [3, 8.0, 2.6], [4, 8.0, -3.0],
      [7, -6.8, -12.8], [5, 6.8, -12.8],
    ]),
    rectoWeaveField_mm: Object.freeze({ x: -6.2, y: 10.8, width: 12.4, height: 18.5, pitch: 0.22, alpha: 0.15 }),
    rectoSecondsRadius_mm: 3.5,
    rectoHourLength_mm: 7.1,
    rectoMinuteLength_mm: 9.4,
    rectoHourHalfWidth_mm: 0.29,
    rectoMinuteHalfWidth_mm: 0.22,
    rectoSecondsCenterY_mm: -10.8,
    reverseTimeCenterY_mm: 5.2,
    reverse24hCenterY_mm: -9.6,
    reverse24hZeroAngle_deg: 0,
  }),

  // Presentation choices that are NOT physical dimensions.
  presentation: Object.freeze({
    neutralTime: '08:20:35 (U01 hand arrangement: hour toward 8, minute toward 4); illustrative pose, not a claim about the photographed instant',
    reverse24hZeroOrientation: 'artistic: zero drawn at the top of the lower register',
    rectoHandStyle: 'blue-black straight baton hour/minute with minimally tapered tips, needle small seconds',
    reverseHandStyle: 'slim silver hour/minute with inset look, silver 24-hour pointer',
    dialZeroAngleIsArtistic: true,
  }),

  disclaimer:
    'Photograph-informed exterior; proportions provisional. Only the 42.2 x 26 mm case envelope is sourced. M000 is a source-informed educational movement, not measured 854/1 CAD.',
});

// ---------------------------------------------------------------------------
// Canvas texture helpers (original procedural art, never the owner photo)
// ---------------------------------------------------------------------------

function makeCanvas(width, height) {
  if (!HAS_CANVAS) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function canvasTexture(canvas, { repeat = null, srgb = true } = {}) {
  if (!canvas) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

// Dial drawing space: mm -> canvas px, so texture features line up with the
// pivots authored in mm below.
const DIAL_CANVAS_W = 1024;
const DIAL_CANVAS_H = Math.round(DIAL_CANVAS_W * PARAMETERS.illustrative.dialHeight_mm / PARAMETERS.illustrative.dialWidth_mm);
const DIAL_MM_W = PARAMETERS.illustrative.dialWidth_mm;
const DIAL_MM_H = PARAMETERS.illustrative.dialHeight_mm;
const PX = DIAL_CANVAS_W / DIAL_MM_W; // ~50.2 px per mm
const X = mm => DIAL_CANVAS_W / 2 + mm * PX;
const Y = mm => DIAL_CANVAS_H / 2 - mm * PX;
const P = mm => mm * PX;

const FONT_SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
// Dial numerals: the owner photo shows tall plain black Arabic digits, not a
// serif face. A condensed sans (Arial/Helvetica, horizontally squeezed) is the
// closest careful approximation; the exact typeface is deliberately provisional,
// not a claimed traced match.
const FONT_DIAL_NUMERAL = 'Arial, Helvetica, sans-serif';

function fillRoundedRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Fine rectangular weave for the recto centre field. Two crossing line
 *  families only: no perimeter ring, so the field reads as fine dial texture
 *  rather than a second circular register. */
function drawFineWeave(ctx, xMm, yMm, wMm, hMm, pitchMm, alpha) {
  const x0 = X(xMm);
  const y0 = Y(yMm);
  const w = P(wMm);
  const h = P(hMm);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.lineWidth = 1;
  const step = P(pitchMm);
  const span = w + h;
  ctx.strokeStyle = `rgba(86, 94, 108, ${alpha})`;
  for (let o = -h; o < span; o += step) {
    ctx.beginPath();
    ctx.moveTo(x0 + o, y0);
    ctx.lineTo(x0 + o + h, y0 + h);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(86, 94, 108, ${alpha * 0.7})`;
  for (let o = 0; o < span; o += step) {
    ctx.beginPath();
    ctx.moveTo(x0 + o, y0 + h);
    ctx.lineTo(x0 + o + h, y0);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a numeral as a tall, slightly condensed sans glyph (photo: tall plain
 *  black Arabic digits, no serif). Horizontal squeeze is applied via scale so
 *  the digits read narrow and tall like the owner watch; provisional, not traced. */
function drawTallNumeral(ctx, text, cx, cy, sizeMm, squeeze = 0.82) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(squeeze, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${P(sizeMm)}px ${FONT_DIAL_NUMERAL}`;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Rectangular Arabic layout observed on U01. No large 6 over the seconds. */
function drawRectoNumerals(ctx) {
  const L = PARAMETERS.illustrative;
  const positions = L.rectoNumeralPositions_mm;
  ctx.fillStyle = '#050608';
  for (const [hour, x, y] of positions) {
    drawTallNumeral(ctx, String(hour), X(x), Y(y), L.rectoNumeralHeight_mm, L.rectoNumeralSqueeze);
  }
}

function drawRectoSecondsRegister(ctx, centerYMm, radiusMm) {
  const cx = X(0);
  const cy = Y(centerYMm);
  const r = P(radiusMm);
  // Lower inset boundary, kept separate from the circular track (docs/03).
  fillRoundedRect(
    ctx,
    X(-4.25), Y(centerYMm + 4.2), P(8.5), P(8.4), P(0.55),
    'rgba(246, 245, 240, 0.98)',
  );
  // Crisp circular track. Line weights are authored in mm (via P) rather than
  // raw canvas pixels, so the ring and ticks keep their relative weight when
  // the 1024 px dial texture is downsampled to a ~170 px on-screen dial.
  ctx.save();
  ctx.strokeStyle = '#20262e';
  ctx.lineWidth = P(0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, r + P(0.35), 0, PI * 2);
  ctx.stroke();
  // 60 second ticks, longer and black every fifth.
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * PI * 2 - PI / 2;
    const outer = r;
    const inner = r - (i % 5 === 0 ? P(0.85) : P(0.45));
    ctx.strokeStyle = i % 5 === 0 ? '#050608' : 'rgba(40, 46, 56, 0.9)';
    ctx.lineWidth = i % 5 === 0 ? P(0.1) : P(0.05);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }
  // Ten-second labels sit inside the separate circular tick track.
  ctx.fillStyle = '#050608';
  for (const n of [10, 20, 30, 40, 50, 60]) {
    const a = (n / 60) * PI * 2 - PI / 2;
    drawTallNumeral(
      ctx, String(n),
      cx + Math.cos(a) * (r - P(1.7)),
      cy + Math.sin(a) * (r - P(1.7)),
      1.1, 0.8,
    );
  }
  ctx.restore();
}

function dialRectoCanvas() {
  const canvas = makeCanvas(DIAL_CANVAS_W, DIAL_CANVAS_H);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');

  // Base silver with a lighter outer numeral zone (photo: lighter rim, patterned
  // centre). Transparent corners keep the plate from being an opaque backdrop.
  const base = ctx.createLinearGradient(0, 0, 0, DIAL_CANVAS_H);
  base.addColorStop(0, '#f4f3ef');
  base.addColorStop(0.5, '#eeede8');
  base.addColorStop(1, '#e6e5e0');
  fillRoundedRect(ctx, 0, 0, DIAL_CANVAS_W, DIAL_CANVAS_H, P(0.35), base);

  // Fine patterned central field (U01: rectangular fine-textured centre with a
  // separate plain outer numeral zone). Drawn as a soft rectangular weave with
  // feathered edges and NO perimeter ring, so it cannot be mistaken for a
  // second circular register. Alpha is kept low; the field is texture only.
  const field = PARAMETERS.illustrative.rectoWeaveField_mm;
  const fieldX = X(field.x);
  const fieldY = Y(field.y);
  const fieldW = P(field.width);
  const fieldH = P(field.height);
  const fieldGrad = ctx.createLinearGradient(fieldX, fieldY, fieldX, fieldY + fieldH);
  fieldGrad.addColorStop(0, 'rgba(198, 203, 211, 0.0)');
  fieldGrad.addColorStop(0.18, 'rgba(198, 203, 211, 0.55)');
  fieldGrad.addColorStop(0.82, 'rgba(205, 210, 217, 0.5)');
  fieldGrad.addColorStop(1, 'rgba(210, 215, 221, 0.0)');
  ctx.save();
  ctx.fillStyle = fieldGrad;
  ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
  ctx.restore();
  drawFineWeave(ctx, field.x, field.y, field.width, field.height, field.pitch, field.alpha);

  // Seconds register FIRST, so the hour numerals 5 and 7 drawn afterwards sit
  // on top of the lower inset instead of being hidden underneath it.
  drawRectoSecondsRegister(ctx, PARAMETERS.illustrative.rectoSecondsCenterY_mm, PARAMETERS.illustrative.rectoSecondsRadius_mm);

  // Subtle brand placement matching the photo. Deliberately not a modern lockup.
  ctx.save();
  ctx.fillStyle = 'rgba(40, 46, 56, 0.78)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${P(0.78)}px ${FONT_SANS}`;
  ctx.fillText('JAEGER-LECOULTRE', X(0), Y(8.6));
  ctx.font = `${P(0.65)}px ${FONT_SANS}`;
  ctx.fillStyle = 'rgba(60, 66, 78, 0.55)';
  ctx.fillText('REVERSO', X(0), Y(7.3));
  ctx.restore();

  drawRectoNumerals(ctx);

  return canvas;
}

function dialReverseCanvas() {
  const canvas = makeCanvas(DIAL_CANVAS_W, DIAL_CANVAS_H);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');

  // Dark patterned field. Opaque inside the plate, transparent corners.
  const base = ctx.createRadialGradient(X(0), Y(1.0), P(1), X(0), Y(1.0), P(17));
  base.addColorStop(0, '#23262c');
  base.addColorStop(0.6, '#181b20');
  base.addColorStop(1, '#0f1114');
  fillRoundedRect(ctx, 0, 0, DIAL_CANVAS_W, DIAL_CANVAS_H, P(1.1), base);

  // Fine rectangular weave over the whole dark plate, same treatment as the
  // recto centre field now that drawGuilloche is gone.
  drawFineWeave(ctx, -10.1, 11.6, 20.2, 20.2, 0.6, 0.12);

  const timeCY = PARAMETERS.illustrative.reverseTimeCenterY_mm;
  const timeR = 8.8;
  const cx = X(0);
  const cy = Y(timeCY);
  const r = P(timeR);

  // Upper circular time display.
  ctx.save();
  ctx.strokeStyle = 'rgba(214, 218, 226, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, PI * 2);
  ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * PI * 2 - PI / 2;
    const inner = r - (i % 5 === 0 ? P(0.7) : P(0.32));
    ctx.strokeStyle = i % 5 === 0 ? 'rgba(226, 230, 238, 0.9)' : 'rgba(170, 178, 190, 0.6)';
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  // Slim intervening hour markers; the large quarter markers carry 12 / 3 / 9.
  ctx.strokeStyle = 'rgba(226, 230, 238, 0.95)';
  ctx.lineWidth = 3;
  for (const hour of [1, 2, 4, 5, 7, 8, 10, 11]) {
    const a = hour * 30 * (PI / 180);
    const outer = r - P(0.6);
    const inner = r - P(2.0);
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * inner, cy - Math.cos(a) * inner);
    ctx.lineTo(cx + Math.sin(a) * outer, cy - Math.cos(a) * outer);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4f6fa';
  for (const hour of [12, 3, 9]) {
    const a = hour * 30 * (PI / 180);
    drawTallNumeral(ctx, String(hour), cx + Math.sin(a) * P(6.9), cy - Math.cos(a) * P(6.9), 2.6, 0.8);
  }
  ctx.restore();

  const dayCY = PARAMETERS.illustrative.reverse24hCenterY_mm;
  const dayR = 4.4;
  const dcy = Y(dayCY);
  const dr = P(dayR);

  // Lower provisional 24-hour register. Zero is drawn at the top: explicitly
  // artistic, because the true track zero is unresolved (data/scene-spec.json).
  ctx.save();
  ctx.strokeStyle = 'rgba(214, 218, 226, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, dcy, dr, 0, PI * 2);
  ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * PI * 2 - PI / 2;
    const inner = dr - (i % 6 === 0 ? P(0.7) : P(0.34));
    ctx.strokeStyle = i % 6 === 0 ? 'rgba(226, 230, 238, 0.9)' : 'rgba(160, 168, 182, 0.6)';
    ctx.lineWidth = i % 6 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, dcy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * dr, dcy + Math.sin(a) * dr);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8ebf0';
  ctx.font = `${P(0.95)}px ${FONT_SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, hour] of [['0', 0], ['6', 6], ['12', 12], ['18', 18]]) {
    const a = (hour / 24) * PI * 2 - PI / 2;
    ctx.fillText(label, cx + Math.cos(a) * (dr - P(1.5)), dcy + Math.sin(a) * (dr - P(1.5)));
  }
  // DAY / NIGHT flank the lower register (observed in U03). Sized and centred so
  // each word sits fully inside the dial canvas and the case aperture: the
  // register rim is at +/-4.4 mm and the aperture edge at +/-10.0 mm, so the
  // labels are centred at +/-7.0 mm with a reduced face.
  ctx.font = `${P(1.0)}px ${FONT_SANS}`;
  ctx.fillStyle = 'rgba(224, 228, 236, 0.95)';
  ctx.textAlign = 'center';
  ctx.fillText('DAY', X(-7.0), dcy);
  ctx.fillText('NIGHT', X(7.0), dcy);
  ctx.restore();

  // Small, unobtrusive reverse wordmark.
  ctx.save();
  ctx.fillStyle = 'rgba(206, 212, 222, 0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${P(0.78)}px ${FONT_SANS}`;
  ctx.fillText('R E V E R S O', X(0), Y(14.6));
  ctx.restore();

  return canvas;
}



// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function roundedRectPath(target, width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, Math.min(width, height) / 2);
  target.moveTo(x + r, y);
  target.lineTo(x + width - r, y);
  target.quadraticCurveTo(x + width, y, x + width, y + r);
  target.lineTo(x + width, y + height - r);
  target.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  target.lineTo(x + r, y + height);
  target.quadraticCurveTo(x, y + height, x, y + height - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
  target.closePath();
  return target;
}

// Preserve baked vertex edits in native JSON without copying attribute buffers.
// ExtrudeGeometry/ShapeGeometry override toJSON, so use the base serializer too.
function nativeBufferGeometry(geometry) {
  geometry.type = 'BufferGeometry';
  delete geometry.parameters;
  geometry.toJSON = THREE.BufferGeometry.prototype.toJSON;
  return geometry;
}

/** Polished rounded-rectangular ring (frame) with a rounded window. */
function roundedRingGeometry(outerW, outerH, outerR, innerW, innerH, innerR, depth, bevel = 0.22) {
  const shape = roundedRectPath(new THREE.Shape(), outerW, outerH, outerR);
  shape.holes.push(roundedRectPath(new THREE.Path(), innerW, innerH, innerR));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 20,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return nativeBufferGeometry(geometry);
}

/** Beveled articulated link with a shallow longitudinal curve, not a pillow.
 *  Chamfer and curvature are illustrative surface choices; no hidden hinge. */
function linkColumnGeometry(width, height, depth, crown = 0.16) {
  const x = width / 2;
  const y = height / 2;
  const chamfer = Math.min(width, height) * 0.08;
  const shape = new THREE.Shape();
  shape.moveTo(-x + chamfer, -y);
  shape.lineTo(x - chamfer, -y);
  shape.lineTo(x, -y + chamfer);
  for (const fraction of [-0.5, 0, 0.5]) shape.lineTo(x, y * fraction);
  shape.lineTo(x, y - chamfer);
  shape.lineTo(x - chamfer, y);
  shape.lineTo(-x + chamfer, y);
  shape.lineTo(-x, y - chamfer);
  for (const fraction of [0.5, 0, -0.5]) shape.lineTo(-x, y * fraction);
  shape.lineTo(-x, -y + chamfer);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1,
    bevelSegments: 2, curveSegments: 8,
  });
  geometry.translate(0, 0, -depth / 2);
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    const vertexY = positions.getY(i);
    const t = Math.min(1, Math.abs(vertexY) / y);
    positions.setZ(i, positions.getZ(i) + crown * Math.cos(t * PI / 2));
    // Transform the original cap/bevel normal by the crown's inverse transpose.
    // Recomputing nonindexed triangle normals creates faceted cap reflections.
    const slope = Math.abs(vertexY) < y ? -crown * PI / (2 * y) * Math.sin(t * PI / 2) * Math.sign(vertexY) : 0;
    const nx = normals.getX(i);
    const nz = normals.getZ(i);
    const ny = normals.getY(i) - slope * nz;
    const inverseLength = 1 / Math.hypot(nx, ny, nz);
    normals.setXYZ(i, nx * inverseLength, ny * inverseLength, nz * inverseLength);
  }
  positions.needsUpdate = true;
  normals.needsUpdate = true;
  return nativeBufferGeometry(geometry);
}

function extrudeFlatShape(shape, depth) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return nativeBufferGeometry(geometry);
}

/** Nearly parallel baton, with a short tail and a minimally tapered tip. */
function handShape(length, tail, halfWidth) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth * 0.65, -tail);
  shape.lineTo(-halfWidth, 0);
  shape.lineTo(-halfWidth * 0.85, length * 0.88);
  shape.lineTo(-halfWidth * 0.25, length);
  shape.lineTo(halfWidth * 0.25, length);
  shape.lineTo(halfWidth * 0.85, length * 0.88);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth * 0.65, -tail);
  shape.closePath();
  return shape;
}

function needleHandShape(length, tail, halfWidth) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, -tail);
  shape.lineTo(halfWidth, -tail);
  shape.lineTo(halfWidth * 0.5, 0);
  shape.lineTo(halfWidth * 0.35, length);
  shape.lineTo(-halfWidth * 0.35, length);
  shape.lineTo(-halfWidth * 0.5, 0);
  shape.closePath();
  return shape;
}

// Reverse stacks live at -Z but stay in the assembled recto frame so behavior.js
// explosion offsets apply verbatim. rotateY(PI) is a proper rotation: the face
// turns outward through -Z without mirroring the drawn text.
function bakeReverse(geometry) {
  geometry.rotateY(PI);
  geometry.computeVertexNormals();
  return nativeBufferGeometry(geometry);
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function tag(node, meta) {
  node.name = meta.name;
  node.userData = {
    ...node.userData,
    id: meta.id,
    label: meta.label || meta.name,
    part: meta.part || null,
    evidenceStatus: meta.evidenceStatus || 'unknown',
    sourceIds: meta.sourceIds || [],
    geometryStatus: meta.geometryStatus || 'unknown',
    illustrative: meta.illustrative !== false,
    description: meta.description || '',
  };
  return node;
}

function group(id, meta = {}) {
  const node = new THREE.Group();
  return tag(node, { id, name: id, label: meta.label || id, ...meta });
}

function captureAssembled(node) {
  if (!node.userData.assembledPosition) node.userData.assembledPosition = node.position.toArray();
  if (!node.userData.assembledQuaternion) node.userData.assembledQuaternion = node.quaternion.toArray();
  if (!node.userData.assembledScale) node.userData.assembledScale = node.scale.toArray();
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function createWatch(sceneSpec) {
  const L = PARAMETERS.illustrative;

  const rectoDialTexture = canvasTexture(dialRectoCanvas());
  const reverseDialTexture = canvasTexture(dialReverseCanvas());

  const steelPolished = new THREE.MeshPhysicalMaterial({
    color: 0xdde0e4, metalness: 1, roughness: 0.16, envMapIntensity: 1.25,
  });
  const steelSatin = new THREE.MeshPhysicalMaterial({
    color: 0xcbd0d6, metalness: 1, roughness: 0.3, envMapIntensity: 1.1,
    anisotropy: 0.35, anisotropyRotation: PI / 2,
  });
  const blueSteel = new THREE.MeshPhysicalMaterial({
    color: 0x102741, metalness: 0.9, roughness: 0.2, envMapIntensity: 1.05,
  });
  const silverHand = new THREE.MeshPhysicalMaterial({
    color: 0xd9dde3, metalness: 1, roughness: 0.2, envMapIntensity: 1.2,
  });
  // Dials face their own viewer only (FrontSide). The reverse dial's outward
  // facing is baked into its geometry, so its front face is the -Z side.
  const rectoDialMaterial = new THREE.MeshStandardMaterial({
    map: rectoDialTexture, color: 0xffffff, metalness: 0.28, roughness: 0.62,
    transparent: true, alphaTest: 0.12, side: THREE.FrontSide,
  });
  const reverseDialMaterial = new THREE.MeshStandardMaterial({
    map: reverseDialTexture, color: 0xffffff, metalness: 0.12, roughness: 0.5,
    transparent: true, alphaTest: 0.12, side: THREE.FrontSide,
  });
  // Clear crystal volumes; IOR and thickness are illustrative rendering choices.
  // The reference is reported as sapphire, but the owner's crystal is untested.
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.025, transmission: 0.98,
    thickness: L.crystalThickness_mm, ior: 1.76, transparent: true, opacity: 0.24,
    side: THREE.FrontSide, depthWrite: false, envMapIntensity: 0.85,
  });

  const root = group('W000', {
    label: 'watch_root',
    evidenceStatus: 'project_defined',
    sourceIds: ['G01'],
    geometryStatus: 'none',
    illustrative: false,
    description: 'Project root. Assembled recto frame: +X crown, +Y 12, +Z recto crystal.',
  });

  // -------------------------------------------------------------------------
  // C000 fixed assembly: cradle, end attachments, bracelet
  // -------------------------------------------------------------------------
  const fixed = group('C000', {
    label: 'fixed_assembly',
    evidenceStatus: 'project_defined',
    sourceIds: ['G01'],
    geometryStatus: 'none',
    illustrative: false,
    description: 'Cradle and wrist attachment. Stationary during case reversal.',
  });
  root.add(fixed);

  const cradle = group('C001', {
    label: 'fixed_cradle',
    evidenceStatus: 'observed_owner',
    sourceIds: ['U01'],
    geometryStatus: 'illustrative_profile',
    description: 'Polished rounded-rectangular cradle frame with an open window so the moving case shows on both faces.',
  });
  // Narrow rail frame: long thin side cheeks plus a slim end structure, so the
  // case reads as a tall rectangle carried by rails rather than a plate. Only
  // the 26 x 42.2 mm outer boundary is sourced; rail width is illustrative.
  const cradleMesh = new THREE.Mesh(
    roundedRingGeometry(L.cradleWidth_mm, L.cradleLength_mm, 0.9, L.cradleWindowWidth_mm, L.cradleWindowLength_mm, 0.6, L.cradleDepth_mm, 0.12),
    steelPolished,
  );
  cradleMesh.position.z = L.cradleRecessZ_mm;
  tag(cradleMesh, {
    id: 'C001', name: 'C001_frame', label: 'cradle frame', part: 'frame',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative_profile',
    description: 'Outer 26 x 42.2 mm uses the catalogue envelope; the rail and end thicknesses are illustrative.',
  });
  cradle.add(cradleMesh);
  fixed.add(cradle);

  const addEndStructure = (id, sign, label) => {
    const endGroup = group(id, {
      label,
      evidenceStatus: 'observed_owner',
      sourceIds: ['U01'],
      geometryStatus: 'unknown_construction',
      description: 'Visible end attachment region. Hidden attachment internals are not modelled.',
    });
    // Two shaped end cheeks, leaving the articulated end link between them.
    for (const side of [-1, 1]) {
      const fitting = new THREE.Mesh(linkColumnGeometry(2.0, 4.0, 2.6, 0.08), steelPolished);
      fitting.position.set(side * 10.6, sign * 20.8, -0.6);
      fitting.rotation.z = side * sign * 0.12;
      tag(fitting, {
        id, name: `${id}_cheek_${side < 0 ? 'left' : 'right'}`, part: 'attachment fitting', label: 'end cheek',
        evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
        description: 'Illustrative tapered attachment cheek; hidden fasteners are not inferred.',
      });
      endGroup.add(fitting);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, L.braceletWidth_mm - 0.4, 20), steelPolished);
    bar.rotation.z = PI / 2;
    bar.position.set(0, sign * 21.8, -0.6);
    tag(bar, {
      id, name: `${id}_attach_bar`, part: 'attachment bar', label: 'bracelet attachment bar',
      evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
      description: 'Visible bracelet attachment bar. No spring bar, screw or pivot is modelled.',
    });
    endGroup.add(bar);
    fixed.add(endGroup);
    return endGroup;
  };
  addEndStructure('C002', 1, 'upper_lug_end_structure');
  addEndStructure('C003', -1, 'lower_lug_end_structure');

  // Unresolved interfaces: present for grouping, deliberately without invented
  // mechanism geometry (no rails, springs, detents, pins or screws).
  const unresolved = (id, label, description, parent, sourceIds = ['G01']) => {
    const node = group(id, {
      label, evidenceStatus: 'unknown', sourceIds, geometryStatus: 'unknown',
      description,
    });
    parent.add(node);
    return node;
  };
  unresolved('C004', 'slide_pivot_interface', 'Sliding and reversing interface. Geometry unresolved; nothing invented.', fixed, ['S05']);

  // Bracelet: repeated multi-link units, upper and lower, with stable group IDs.
  const bracelet = group('B000', {
    label: 'bracelet_assembly',
    evidenceStatus: 'observed_owner',
    sourceIds: ['U01'],
    geometryStatus: 'illustrative_pattern',
    description: 'Articulated multi-link metal bracelet. Visible rhythm reproduced; hidden structure unresolved.',
  });
  fixed.add(bracelet);

  // Five polished columns with half-pitch longitudinal staggering (U01), not
  // a checkerboard of square tiles. Reuse one link mesh profile per column.
  const braceletColumns = L.braceletColumns;
  const columnPitch = L.braceletWidth_mm / braceletColumns;
  const columnWidth = columnPitch - L.braceletLinkGap_mm - 0.2;
  const linkGeometry = linkColumnGeometry(columnWidth, L.braceletUnitPitch_mm - L.braceletLinkGap_mm - 0.2, L.braceletLinkDepth_mm, L.braceletLinkCrown_mm);
  const buildLinkRow = (parent, idPrefix, y, sign) => {
    for (let c = 0; c < braceletColumns; c++) {
      const x = (c - (braceletColumns - 1) / 2) * columnPitch;
      const linkY = y + sign * (c % 2) * L.braceletUnitPitch_mm * L.braceletStaggerFraction;
      const distance = Math.abs(linkY) - L.braceletStartY_mm;
      const curveZ = -L.braceletCurve_mm * distance * distance;
      const dome = 0.12 * (1 - Math.abs(x) / (L.braceletWidth_mm / 2));
      const link = new THREE.Mesh(linkGeometry, steelPolished);
      link.position.set(x, linkY, -0.6 + dome + curveZ);
      link.rotation.x = -Math.atan(2 * L.braceletCurve_mm * distance * sign);
      tag(link, {
        id: idPrefix.split('_')[0],
        name: `${idPrefix}_c${String(c + 1)}`,
        part: 'link',
        label: 'bracelet link',
        evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
        description: 'Narrow beveled polished link in a staggered five-column rhythm. Link count and curvature are illustrative.',
      });
      parent.add(link);
    }
  };

  const buildEndLink = (id, sign, label) => {
    const end = group(id, {
      label,
      evidenceStatus: 'observed_owner',
      sourceIds: ['U01'],
      geometryStatus: 'unknown_construction',
      description: 'End link joining the bracelet to the cradle attachment bar.',
    });
    const shape = new THREE.Shape();
    shape.moveTo(-9.7, -1.15);
    shape.lineTo(9.7, -1.15);
    shape.lineTo(8.3, 1.15);
    shape.lineTo(-8.3, 1.15);
    shape.closePath();
    const block = new THREE.Mesh(extrudeFlatShape(shape, 2.0), steelPolished);
    block.position.set(0, sign * 22.0, -0.6);
    block.rotation.z = sign > 0 ? 0 : PI;
    tag(block, {
      id, name: `${id}_shaped`, part: 'end link', label: 'shaped end link',
      evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
      description: 'Tapered end link with staggered fingers; construction is illustrative, no hinge internals.',
    });
    end.add(block);
    for (let c = 1; c < braceletColumns; c += 2) {
      const finger = new THREE.Mesh(linkColumnGeometry(columnWidth, 2.2, L.braceletLinkDepth_mm, L.braceletLinkCrown_mm), steelPolished);
      finger.position.set((c - (braceletColumns - 1) / 2) * columnPitch, sign * 24.1, -0.6);
      tag(finger, {
        id, name: `${id}_finger_${c}`, part: 'end link', label: 'end-link finger',
        evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
        description: 'Visible staggered transition to the first articulated columns; no pin geometry inferred.',
      });
      end.add(finger);
    }
    bracelet.add(end);
    return end;
  };
  buildEndLink('B001', 1, 'upper_bracelet_end');
  buildEndLink('B002', -1, 'lower_bracelet_end');

  const repeating = group('B003', {
    label: 'repeating_link_groups',
    evidenceStatus: 'observed_owner',
    sourceIds: ['U01'],
    geometryStatus: 'illustrative_pattern',
    description: 'Repeating articulated link runs, upper and lower. Count is a display choice.',
  });
  bracelet.add(repeating);
  const buildRun = (id, sign) => {
    const run = group(id, {
      label: id,
      evidenceStatus: 'observed_owner',
      sourceIds: ['U01'],
      geometryStatus: 'illustrative_pattern',
      description: 'Repeating link run.',
    });
    for (let i = 0; i < L.braceletUnitsPerSide; i++) {
      const y = sign * (L.braceletStartY_mm + i * L.braceletUnitPitch_mm);
      buildLinkRow(run, `${id}_u${String(i + 1).padStart(2, '0')}`, y, sign);
    }
    repeating.add(run);
    return run;
  };
  buildRun('B003_upper_run', 1);
  buildRun('B003_lower_run', -1);
  unresolved('B004', 'clasp', 'Clasp position. Underside photography needed; no clasp mechanism is modelled.', bracelet, ['G01']);

  // -------------------------------------------------------------------------
  // C100 moving assembly: case, displays, calibre envelope, controls
  // -------------------------------------------------------------------------
  const moving = group('C100', {
    label: 'moving_assembly',
    evidenceStatus: 'project_defined',
    sourceIds: ['G01'],
    geometryStatus: 'none',
    illustrative: false,
    description: 'Moving case, both display stacks, calibre envelope and controls. All reversal motion is applied here.',
  });
  root.add(moving);

  const caseBody = group('C101', {
    label: 'moving_case_body',
    evidenceStatus: 'observed_owner',
    sourceIds: ['U01'],
    geometryStatus: 'illustrative_profile',
    description: 'Polished rounded rectangular case. Moving-case size is illustrative; only the outer envelope is sourced.',
  });
  const caseShell = new THREE.Mesh(
    roundedRingGeometry(L.movingCaseWidth_mm, L.movingCaseLength_mm, L.caseCornerRadius_mm, L.dialApertureWidth_mm, L.dialApertureHeight_mm, 0.35, L.movingCaseDepth_mm, 0.28),
    steelPolished,
  );
  tag(caseShell, {
    id: 'C101', name: 'C101_shell', part: 'case shell', label: 'case shell / bezel',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative_profile',
    description: 'Tall rectangular ring forming both bezels and the case wall. Thin bezel so the dial fills the face.',
  });
  caseBody.add(caseShell);

  // Midframe web: an open ring, so the calibre envelope and both dial stacks
  // stay visible through the case instead of being hidden behind an opaque slab.
  const caseMidframe = new THREE.Mesh(
    roundedRingGeometry(L.movingCaseWidth_mm, L.movingCaseLength_mm, L.caseCornerRadius_mm, L.dialApertureWidth_mm - 0.6, L.dialApertureHeight_mm - 0.6, 1.0, 1.2, 0.1),
    steelSatin,
  );
  tag(caseMidframe, {
    id: 'C101', name: 'C101_midframe', part: 'midframe', label: 'case midframe',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
    description: 'Open interior web linking both bezels. Its window is larger than the calibre envelope, so nothing opaque blocks the exploded stacks.',
  });
  caseBody.add(caseMidframe);

  // Three distinct horizontal ridges at each end span the full moving face.
  // Cross-section and spacing follow the photo's rhythm, not measured machining.
  const buildGadroons = (id, sign, label) => {
    const band = group(id, {
      label,
      evidenceStatus: 'observed_owner',
      sourceIds: ['U01'],
      geometryStatus: 'unknown_cross_section',
      description: 'Triple horizontal decorative ridges at a case end. Cross-section is illustrative.',
    });
    // Sit the ridges just proud of the polished end face so the triple grooves
    // actually read in the front view (a thin cylinder flush to the bevel
    // vanished at render scale).
    const surface = L.movingCaseDepth_mm / 2;
    const yBase = L.movingCaseLength_mm / 2 - 0.8;
    const ridgeLength = L.movingCaseWidth_mm - 0.1;
    for (let i = 0; i < L.gadroonCountPerEnd; i++) {
      const y = sign * (yBase - i * L.gadroonPitch_mm);
      for (const face of [1, -1]) {
        const ridge = new THREE.Mesh(
          new THREE.CylinderGeometry(L.gadroonRadius_mm, L.gadroonRadius_mm, ridgeLength, 24),
          steelPolished,
        );
        ridge.rotation.z = PI / 2;
        ridge.position.set(0, y, face * (surface + 0.03));
        tag(ridge, {
          id, name: `${id}_${face > 0 ? 'front' : 'back'}_${i + 1}`, part: 'gadroon',
          label: 'gadroon ridge',
          evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
          description: 'Illustrative ridge; machined cross-section not inferred from photo highlights.',
        });
        band.add(ridge);
      }
    }
    caseBody.add(band);
    return band;
  };
  buildGadroons('C102', 1, 'upper_gadroons');
  buildGadroons('C103', -1, 'lower_gadroons');
  moving.add(caseBody);

  unresolved('C104', 'movement_retention', 'Movement retention. Geometry unresolved; nothing invented.', moving, ['G01']);
  unresolved('C107', 'sealing_elements', 'Candidate seals. Geometry unresolved; nothing invented.', moving, ['G01']);

  // Recto stack (authored flat in the recto frame, +Z toward the recto viewer).
  const rectoDial = new THREE.Mesh(new THREE.PlaneGeometry(L.dialWidth_mm, L.dialHeight_mm), rectoDialMaterial);
  rectoDial.position.set(0, 0, 2.3);
  tag(rectoDial, {
    id: 'D001', name: 'D001', label: 'recto dial',
    evidenceStatus: 'observed_owner', sourceIds: ['U01', 'U02'], geometryStatus: 'illustrative',
    description: 'Silver dial: tall black Arabic numerals without a large 6, fine central pattern, circular small seconds in a lower inset.',
  });
  moving.add(rectoDial);
  const addDialBack = (dial, face, material) => {
    const shape = roundedRectPath(new THREE.Shape(), L.dialWidth_mm, L.dialHeight_mm, 0.45);
    const backing = new THREE.Mesh(extrudeFlatShape(shape, 0.08), material);
    backing.position.z = -face * 0.1;
    tag(backing, {
      id: dial.userData.id, name: `${dial.name}_backing`, part: 'dial support', label: 'dial backing',
      evidenceStatus: dial.userData.evidenceStatus, sourceIds: dial.userData.sourceIds,
      geometryStatus: 'illustrative', description: 'Thin explanatory dial backing; thickness and underside are not measured.',
    });
    dial.add(backing);
  };
  addDialBack(rectoDial, 1, steelSatin);

  const rectoHour = new THREE.Mesh(extrudeFlatShape(handShape(L.rectoHourLength_mm, 0.45, L.rectoHourHalfWidth_mm), 0.18), blueSteel);
  rectoHour.position.set(0, 0, 2.75);
  tag(rectoHour, {
    id: 'D002', name: 'D002', label: 'recto hour hand',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
    description: 'Blue-black straight baton hour hand, separate central pivot; width and length are editable photo-informed proportions.',
  });
  moving.add(rectoHour);

  const rectoMinute = new THREE.Mesh(extrudeFlatShape(handShape(L.rectoMinuteLength_mm, 0.55, L.rectoMinuteHalfWidth_mm), 0.18), blueSteel);
  rectoMinute.position.set(0, 0, 2.95);
  tag(rectoMinute, {
    id: 'D003', name: 'D003', label: 'recto minute hand',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
    description: 'Blue-black straight baton minute hand, separate central pivot with visible cap; no broad leaf shape.',
  });
  moving.add(rectoMinute);
  const addPivotCap = (hand, name, radius, face, material) => {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.13, 32), material);
    cap.rotation.x = PI / 2;
    cap.position.z = face * 0.16;
    tag(cap, {
      id: hand.userData.id, name, part: 'hand cap', label: 'display pivot cap',
      evidenceStatus: hand.userData.evidenceStatus, sourceIds: hand.userData.sourceIds, geometryStatus: 'illustrative',
      description: 'Visible display-hand cap only; no hidden pivot or movement construction inferred.',
    });
    hand.add(cap);
  };
  addPivotCap(rectoMinute, 'D003_pivot_cap', 0.52, 1, blueSteel);

  const rectoSeconds = new THREE.Mesh(extrudeFlatShape(needleHandShape(3.1, 0.6, 0.1), 0.16), blueSteel);
  rectoSeconds.position.set(0, L.rectoSecondsCenterY_mm, 2.85);
  tag(rectoSeconds, {
    id: 'D004', name: 'D004', label: 'recto small seconds hand',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
    description: 'Small seconds hand on its own lower pivot, independent of the main hand pivot.',
  });
  moving.add(rectoSeconds);
  addPivotCap(rectoSeconds, 'D004_pivot_cap', 0.25, 1, blueSteel);

  const crystalShape = roundedRectPath(new THREE.Shape(), L.crystalWidth_mm, L.crystalHeight_mm, 0.4);
  const crystalGeometry = extrudeFlatShape(crystalShape, L.crystalThickness_mm);
  const rectoCrystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
  rectoCrystal.position.set(0, 0, 3.4);
  tag(rectoCrystal, {
    id: 'C105', name: 'C105', label: 'recto crystal',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
    description: 'True transparent crystal. The source reports sapphire for the reference (S08); the owner crystal is untested and no optical value is measured.',
  });
  moving.add(rectoCrystal);

  // Reverse stack: direct children of C100 in the assembled recto frame, with the
  // -Z facing baked into the geometry so explosion offsets apply verbatim.
  const reverseDial = new THREE.Mesh(bakeReverse(new THREE.PlaneGeometry(L.dialWidth_mm, L.dialHeight_mm)), reverseDialMaterial);
  reverseDial.position.set(0, 0, -2.3);
  tag(reverseDial, {
    id: 'D101', name: 'D101', label: 'reverse dial',
    evidenceStatus: 'observed_supplied_photo', sourceIds: ['U03'], geometryStatus: 'illustrative',
    description: 'Dark dial: upper circular time display with 12/3/9 markers, DAY / NIGHT labels, lower provisional 24-hour register.',
  });
  moving.add(reverseDial);
  addDialBack(reverseDial, -1, steelSatin);

  const reverseHour = new THREE.Mesh(bakeReverse(extrudeFlatShape(handShape(6.2, 1.7, 0.5), 0.34)), silverHand);
  reverseHour.position.set(0, L.reverseTimeCenterY_mm, -2.75);
  tag(reverseHour, {
    id: 'D102', name: 'D102', label: 'reverse hour hand',
    evidenceStatus: 'observed_supplied_photo', sourceIds: ['U03'], geometryStatus: 'illustrative',
    description: 'Silver reverse hour hand, pivot at the upper circular display centre.',
  });
  moving.add(reverseHour);

  const reverseMinute = new THREE.Mesh(bakeReverse(extrudeFlatShape(handShape(8.0, 2.0, 0.42), 0.34)), silverHand);
  reverseMinute.position.set(0, L.reverseTimeCenterY_mm, -2.95);
  tag(reverseMinute, {
    id: 'D103', name: 'D103', label: 'reverse minute hand',
    evidenceStatus: 'observed_supplied_photo', sourceIds: ['U03'], geometryStatus: 'illustrative',
    description: 'Silver reverse minute hand, pivot at the upper circular display centre.',
  });
  moving.add(reverseMinute);
  addPivotCap(reverseMinute, 'D103_pivot_cap', 0.46, -1, silverHand);
  const handInsetMaterial = new THREE.MeshStandardMaterial({ color: 0xb9c3be, metalness: 0.12, roughness: 0.66 });
  for (const [hand, length, halfWidth] of [[reverseHour, 4.8, 0.14], [reverseMinute, 6.8, 0.11]]) {
    const inset = new THREE.Mesh(bakeReverse(new THREE.ShapeGeometry(handShape(length, 0, halfWidth))), handInsetMaterial);
    inset.position.z = -0.24;
    tag(inset, {
      id: hand.userData.id, name: `${hand.name}_inset`, part: 'visible hand inset', label: 'light hand inset',
      evidenceStatus: 'observed_supplied_photo', sourceIds: ['U03'], geometryStatus: 'illustrative',
      description: 'Light inset appearance from U03; not an assertion of luminous composition.',
    });
    hand.add(inset);
  }

  const reverse24 = new THREE.Mesh(bakeReverse(extrudeFlatShape(needleHandShape(4.0, 1.1, 0.17), 0.26)), silverHand);
  reverse24.position.set(0, L.reverse24hCenterY_mm, -2.85);
  tag(reverse24, {
    id: 'D104', name: 'D104', label: 'reverse 24-hour hand',
    evidenceStatus: 'observed_supplied_photo', sourceIds: ['U03'], geometryStatus: 'illustrative',
    description: '24-hour pointer on its own lower pivot. The track zero orientation is artistic and unresolved.',
  });
  moving.add(reverse24);
  addPivotCap(reverse24, 'D104_pivot_cap', 0.27, -1, silverHand);

  const reverseCrystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
  reverseCrystal.position.set(0, 0, -3.4);
  tag(reverseCrystal, {
    id: 'C106', name: 'C106', label: 'reverse crystal',
    evidenceStatus: 'observed_supplied_photo', sourceIds: ['U03'], geometryStatus: 'illustrative',
    description: 'True transparent reverse crystal.',
  });
  moving.add(reverseCrystal);

  // Source-informed educational internals; physical footprint and pivots stay unknown.
  moving.add(createMovement({
    width: L.moduleWidth_mm, height: L.moduleHeight_mm, depth: L.moduleDepth_mm,
  }));

  // Controls remain children of C100. Geometric grip ridges survive native/GLB
  // export; polished steel needs no dark painted knurl texture.
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(L.crownDiameter_mm / 2, L.crownDiameter_mm / 2, L.crownLength_mm, 48), steelPolished);
  crown.rotation.z = PI / 2;
  crown.position.set(L.crownPositionX_mm, L.crownCenterY_mm, 0);
  tag(crown, {
    id: 'I001', name: 'I001', label: 'crown',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'unknown_dimensions',
    description: 'Knurled crown on the moving-case right flank. Diameter, groove count and seal profile are unknown.',
  });
  moving.add(crown);
  const knurlGeometry = new THREE.CylinderGeometry(L.crownKnurlRadius_mm, L.crownKnurlRadius_mm, L.crownLength_mm - 0.1, 6);
  for (let i = 0; i < L.crownKnurlCount; i++) {
    const angle = i * PI * 2 / L.crownKnurlCount;
    const ridge = new THREE.Mesh(knurlGeometry, steelPolished);
    ridge.position.set(Math.cos(angle) * L.crownDiameter_mm / 2, 0, Math.sin(angle) * L.crownDiameter_mm / 2);
    tag(ridge, {
      id: 'I001', name: `I001_knurl_${i + 1}`, part: 'crown knurl', label: 'crown grip ridge',
      evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'illustrative',
      description: 'Visible knurled grip; ridge count is an editable artistic choice, not an OEM count.',
    });
    crown.add(ridge);
  }

  // ponytail: rounded rectangular head only; replace the artistic flank profile
  // with measured geometry when a sharp orthogonal control photograph exists.
  const pusherProfile = roundedRectPath(new THREE.Shape(), L.pusherDepth_mm, L.pusherHeight_mm, 0.32);
  const pusherGeometry = new THREE.ExtrudeGeometry(pusherProfile, {
    depth: L.pusherWidth_mm, bevelEnabled: true, bevelThickness: 0.12,
    bevelSize: 0.12, bevelSegments: 4, curveSegments: 12,
  });
  pusherGeometry.translate(0, 0, -L.pusherWidth_mm / 2);
  pusherGeometry.rotateY(PI / 2);
  const pusher = new THREE.Mesh(nativeBufferGeometry(pusherGeometry), steelPolished);
  pusher.position.set(L.pusherPositionX_mm, L.pusherCenterY_mm, 0);
  tag(pusher, {
    id: 'I003', name: 'I003', label: 'GMT pusher',
    evidenceStatus: 'observed_owner', sourceIds: ['U01'], geometryStatus: 'unknown_stroke',
    description: 'Rounded rectangular GMT pusher near numeral 2, above the crown. Head intersects the flank; profile and stroke remain illustrative.',
  });
  moving.add(pusher);

  unresolved('I002', 'winding_stem', 'Crown to mechanism connection. Geometry unresolved; nothing invented.', moving, ['G01']);
  unresolved('I004', 'pusher_linkage', 'Reverse correction linkage. Geometry unresolved; nothing invented.', moving, ['S01']);

  // -------------------------------------------------------------------------
  // Finalise: unique names + assembled transforms for every node
  // -------------------------------------------------------------------------
  const names = new Map();
  root.traverse(node => {
    captureAssembled(node);
    const previous = names.get(node.name);
    if (previous) {
      throw new Error(`model/exterior.js: duplicate node name "${node.name}" breaks glTF track binding`);
    }
    names.set(node.name, true);
  });

  const nodeIds = [...names.keys()];

  root.userData = {
    ...root.userData,
    reference: sceneSpec ? sceneSpec.reference : 'Q2718110',
    calibre: sceneSpec ? sceneSpec.calibre : '854/1',
    authoringUnits: 'mm',
    gltfUnits: 'm',
    mmToM: 0.001,
    coordinateFrame: { x: 'recto right toward crown', y: 'toward 12', z: 'out through recto crystal', origin: 'project cradle-center datum' },
    precision: 'Photograph-informed exterior; only the 42.2 x 26 mm case envelope is sourced. M000 groups use reviewed visual references and schematic display works; all internal dimensions remain illustrative.',
    evidencePolicy: 'No factory dimension, OEM part number, tooth count, screw length or calibrated pivot coordinate is asserted. Movement groups are source-informed or explicitly schematic; hidden clasp and case mechanisms remain unmodeled.',
    illustrativeParameters: PARAMETERS,
    nodeIds,
  };

  const meta = {
    contract: 'createWatch(sceneSpec) -> { root, parameters, meta }',
    nodeIds,
    hierarchy: {
      W000: { C000: ['C001', 'C002', 'C003', 'C004', 'B000'], C100: ['C101', 'C102', 'C103', 'C104', 'C105', 'C106', 'C107', 'D001', 'D002', 'D003', 'D004', 'D101', 'D102', 'D103', 'D104', 'M000', 'I001', 'I002', 'I003', 'I004'] },
      note: 'C102/C103 are children of C101. B001/B002/B003/B004 are children of B000. Calibre subsystem groups are children of M000.',
    },
    hands: {
      recto: [
        { id: 'D002', role: 'hour', pivot_mm: [0, 0, 2.75], frame: 'recto flat (+Z)', material: 'blue steel' },
        { id: 'D003', role: 'minute', pivot_mm: [0, 0, 2.95], frame: 'recto flat (+Z)', material: 'blue steel' },
        { id: 'D004', role: 'small seconds', pivot_mm: [0, L.rectoSecondsCenterY_mm, 2.85], frame: 'recto flat (+Z), independent lower pivot', material: 'blue steel' },
      ],
      reverse: [
        { id: 'D102', role: 'hour', pivot_mm: [0, L.reverseTimeCenterY_mm, -2.75], frame: 'reverse own visible frame (geometry baked rotateY(PI)), node rotation identity', material: 'silver' },
        { id: 'D103', role: 'minute', pivot_mm: [0, L.reverseTimeCenterY_mm, -2.95], frame: 'reverse own visible frame (baked)', material: 'silver' },
        { id: 'D104', role: '24-hour', pivot_mm: [0, L.reverse24hCenterY_mm, -2.85], frame: 'reverse own visible frame (baked), independent lower pivot', material: 'silver' },
      ],
      note: 'Hands point at 12 (+Y) at angle zero with node rotation identity. The viewer derives the clockwise sign per face, so both faces run clockwise.',
    },
    presentation: {
      dialZeroAngleIsArtistic: true,
      reverse24hZeroOrientation: 'drawn at the top of the lower register; the true track zero is unresolved (data/scene-spec.json)',
      neutralTime: PARAMETERS.presentation.neutralTime,
      crystals: 'true transparent (transmission, low opacity, no opaque map)',
      dialTextures: 'programmatically drawn; the owner photograph is never used as a texture',
      opaqueBackdrops: 'none: dial/crystal plates are sized to the aperture with transparent corners, so no opaque texture background obscures other stacks in the explosion',
    },
    movement: 'Source-informed support, winding, barrel, train and oscillator groups; display transfer groups explicitly schematic. Physical geometry remains uncalibrated.',
    reversal: 'Controls (I001, I003) are direct children of C100, so a half-turn about Y moves them to the reverse-left with the pusher still above the crown.',
  };

  return {
    root,
    parameters: PARAMETERS,
    meta,
  };
}
