// Source-informed educational grouping, not an OEM parts list or workshop order.
import { clamp01, smoothstep } from './behavior.js';

export const ASSEMBLY_SECONDS = 12;
export const MOVEMENT_GROUPS = Object.freeze({
  M001: { name: 'Mainplate', offset: [0, 0, -3], start: 0, end: 0.14 },
  M020: { name: 'Barrel', offset: [-10, -3, 3], start: 0.14, end: 0.34 },
  M030: { name: 'Wheel train', offset: [8, -4, 6], start: 0.14, end: 0.34 },
  M040: { name: 'Escapement (schematic)', evidence: 'general_mechanical', offset: [10, 8, 5], start: 0.34, end: 0.46 },
  M002: { name: 'Upper bridges', offset: [0, 4, 10], start: 0.46, end: 0.60 },
  M090: { name: 'Bearings', offset: [0, 4, 11], start: 0.46, end: 0.60 },
  M091: { name: 'Fasteners', offset: [0, 4, 12], start: 0.46, end: 0.60 },
  M050: { name: 'Balance', offset: [-8, 6, 6], start: 0.60, end: 0.74 },
  M010: { name: 'Winding / setting', offset: [0, -8, 8], start: 0.74, end: 1 },
  M060: { name: 'Recto works (schematic)', evidence: 'general_mechanical', offset: [-8, 0, -6], start: 0.74, end: 1 },
  M070: { name: 'Reverse works (schematic)', evidence: 'general_mechanical', offset: [8, 0, -8], start: 0.74, end: 1 },
  M080: { name: '24-hour works (schematic)', evidence: 'general_mechanical', offset: [0, -8, -9], start: 0.74, end: 1 },
});
export const ASSEMBLY_STAGES = Object.freeze([
  { progress: 0, name: 'Separated groups', explanation: 'Identify the functional groups. Gaps and locations are enlarged for readability.' },
  { progress: 0.14, name: 'Mainplate seated', explanation: 'The mainplate provides the reference bed for the mechanism.' },
  { progress: 0.34, name: 'Barrel and train seated', explanation: 'The barrel supplies energy through the illustrative wheel train.' },
  { progress: 0.46, name: 'Escapement seated', explanation: 'The escapement meters energy toward the oscillator.' },
  { progress: 0.60, name: 'Supports seated', explanation: 'Bridges, bearings and fasteners support the moving mechanism.' },
  { progress: 0.74, name: 'Balance seated', explanation: 'The balance represents the regulating oscillator.' },
  { progress: 1, name: 'Winding and display works seated', explanation: 'Winding, setting and the two display works complete the educational grouping.' },
]);

const scaled = (value, amount) => value * amount === 0 ? 0 : value * amount;
export function movementExplosionOffsets(amount) {
  const phase = smoothstep(0, 1, clamp01(amount));
  return Object.fromEntries(Object.entries(MOVEMENT_GROUPS).map(([id, group]) =>
    [id, group.offset.map(value => scaled(value, phase))]));
}
export function assemblyOffsets(progress) {
  const p = clamp01(progress);
  return Object.fromEntries(Object.entries(MOVEMENT_GROUPS).map(([id, group]) =>
    [id, group.offset.map(value => scaled(value, 1 - smoothstep(group.start, group.end, p)))]));
}
export function assemblyStage(progress) {
  const p = clamp01(progress);
  const seated = ASSEMBLY_STAGES.findLast(stage => p >= stage.progress);
  const next = ASSEMBLY_STAGES.find(stage => stage.progress > p);
  return { ...seated, next: next?.name || null };
}
