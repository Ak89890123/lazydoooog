const clamp = v => Math.max(0, Math.min(1, v));
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };

export const OPENING_START = 0.22;
export const openingAt = (progress, config) => smooth((progress - OPENING_START) / (config.openUntil - OPENING_START));

// The rider flies in on its own clock (skate-runner.js). The scroll rocks it from 0.3 while the mouth widens,
// then from 0.62 to 0.9 it loses: it shrinks and is drawn down through the throat's black cover from wherever
// its flight has got to (at), slowly enough for the camera to follow it down.
export function riderCollapseFrame(progress, at, center, radius) {
  const flight = clamp((progress - 0.62) / 0.28);
  const shake = smooth((progress - 0.3) / 0.3) * (1 - smooth(flight / 0.65));
  const phase = (progress - 0.3) * 65;
  const pull = flight ** 2;
  return { scale: 1 - 0.988 * pull,
    position: [at.x + (center.x - at.x) * pull,
      at.y + Math.sin(phase * 1.3) * shake * 0.06 - radius * 2 * pull,
      at.z + (center.z - at.z) * pull],
    rock: [Math.sin(phase * 0.7) * shake * 0.08, 0, Math.sin(phase) * shake * 0.16 + pull * 0.65] };
}

// Resistance is a distance field across all street rows, not a queue of buildings.
export function collapseFrame(progress, distance, config) {
  const resistance = 0.13 + 0.77 * distance / (distance + 40);
  const start = OPENING_START + (config.openUntil - OPENING_START) * (0.5 - Math.sin(Math.asin(1 - 2 * resistance) / 3));
  // The street is in by about 0.7, while the camera starts following the rider down (skate-runner.js).
  const duration = Math.max(0.16, Math.min(0.2, 1.11 * Math.sqrt(Math.max(distance, 2) ** 3 / config.gravity) / config.duration));
  const stress = openingAt(progress, config) / resistance;
  return { start, duration, stress, flight: clamp((progress - start) / duration),
    shake: smooth((stress - 0.35) / 0.65) * (1 - smooth((progress - start) / 0.045)) };
}

// How far a part has closed on the mouth. Gravity: it gathers speed all the way in, never settling short of it.
// The part also shrinks by the same fraction (it is scaled about the mouth), so the city keeps its arrangement
// and roughly its size on screen as it comes in towards the camera, and only vanishes in the throat.
export const collapsePull = flight => flight * flight;
// Turn round the mouth like water into a drain: the turn grows as 1/r, so a part far out comes almost straight
// in and only circles once it is close, never swinging wide past the camera beside the mouth.
export const collapseSwirl = (reach, pull) => 3 * (1 / Math.max(reach * (1 - pull), 0.5) - 1 / Math.max(reach, 0.5));
// Lean towards the mouth about the ground beneath: a little while it still holds, then over as it is pulled.
export const collapseLean = flight => 0.3 * smooth(flight / 0.35) + 0.5 * flight * flight;
