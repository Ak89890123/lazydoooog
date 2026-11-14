// Stateless per scroll sample; only active, non-fixed centres change.
export function resolveContacts(boxes) {
  const active = boxes.filter(box => box.active !== false);
  const fixed = active.filter(box => box.fixed).sort((a, b) => (a.x - a.hx) - (b.x - b.hx));
  const bodies = active.filter(box => !box.fixed);
  if (!bodies.length || active.length < 2) return boxes;
  bodies.sort((a, b) => Math.max(b.hx, b.hy, b.hz) - Math.max(a.hx, a.hy, a.hz));
  const axes = ['x', 'y', 'z'];
  const extents = ['hx', 'hy', 'hz'];
  const levels = [];
  const hash = (x, y, z) => Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  // Fixed bounds may be smaller than any moving level. A static X sweep avoids
  // walking millions of tiny cells for a large moving storey; fixed-fixed is ignored.
  const fixedRight = new Float64Array(fixed.length);
  for (let i = 0; i < fixed.length; i += 1) {
    const box = fixed[i];
    fixedRight[i] = Math.max(i ? fixedRight[i - 1] : -Infinity, box.x + box.hx);
    for (let k = 0; k < 3; k += 1) {
      const axis = axes[k];
      lo[k] = Math.min(lo[k], box[axis] - box[`h${axis}`]);
      hi[k] = Math.max(hi[k], box[axis] + box[`h${axis}`]);
    }
  }
  let slot = 1;
  // Parts of one group move in their own arrangement (black-hole.js), so they never push each other apart.
  const apart = (box, other) => !box.group || box.group !== other.group;
  // Descending diameter order means every settled level is >= the querying box.
  // Store occupied cells at each box's power-of-two size: <= 8 insertions/lookups
  // per level. Numeric hash collisions only add candidates; AABBs decide contact.
  const intersection = box => {
    let left = 0, right = fixed.length;
    const minX = box.x - box.hx, maxX = box.x + box.hx;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (fixed[mid].x - fixed[mid].hx < maxX) left = mid + 1;
      else right = mid;
    }
    for (let j = left - 1; j >= 0 && fixedRight[j] > minX; j -= 1) {
      const other = fixed[j];
      if (other.x + other.hx > minX && apart(box, other) &&
          Math.abs(box.y - other.y) < box.hy + other.hy &&
          Math.abs(box.z - other.z) < box.hz + other.hz) return other;
    }
    for (let l = levels.length - 1; l >= 0; l -= 1) {
      const { size, grid } = levels[l];
      const x0 = Math.floor((box.x - box.hx) / size), x1 = Math.floor((box.x + box.hx) / size);
      const y0 = Math.floor((box.y - box.hy) / size), y1 = Math.floor((box.y + box.hy) / size);
      const z0 = Math.floor((box.z - box.hz) / size), z1 = Math.floor((box.z + box.hz) / size);
      for (let x = x0; x <= x1; x += 1)
        for (let y = y0; y <= y1; y += 1)
          for (let z = z0; z <= z1; z += 1) {
            const bucket = grid.get(hash(x, y, z));
            if (!bucket) continue;
            for (const other of bucket) {
              if (Math.abs(box.x - other.x) < box.hx + other.hx && apart(box, other) &&
                  Math.abs(box.y - other.y) < box.hy + other.hy &&
                  Math.abs(box.z - other.z) < box.hz + other.hz) return other;
            }
          }
    }
  };
  for (let i = 0; i < bodies.length; i += 1) {
    const box = bodies[i], origin = [box.x, box.y, box.z];
    const size = 2 ** Math.ceil(Math.log2(2 * Math.max(box.hx, box.hy, box.hz)));
    let level = levels[levels.length - 1];
    if (!level || level.size !== size) { level = { size, grid: new Map() }; levels.push(level); }
    const pad = 1e-9 * Math.max(1, Math.abs(box.x), Math.abs(box.y), Math.abs(box.z), size);
    let other = intersection(box);
    for (let pass = 0; other && pass < 8; pass += 1) {
      let best = Infinity, bestAxis, bestValue;
      // Choose the actual contact face nearest the original target, including containment.
      for (let j = 0; j < 3; j += 1) {
        const k = (i + j) % 3, axis = axes[k];
        const half = other[extents[k]] + box[extents[k]];
        const sign = origin[k] === other[axis] ? (i % 2 ? -1 : 1) : (origin[k] > other[axis] ? 1 : -1);
        const value = other[axis] + sign * (half + pad);
        // The unchanged two coordinates contribute the same distance to every face.
        const distance = (value - origin[k]) ** 2 - (box[axis] - origin[k]) ** 2;
        if (distance < best) { best = distance; bestAxis = axis; bestValue = value; }
      }
      box[bestAxis] = bestValue;
      other = intersection(box);
    }
    // ponytail: position constraints without inertia; bounded local contact pushes
    // fall back to outward 3D packing when dense contacts would otherwise cycle.
    // Dense same-size cells can still reach O(n²); crowded slots need not be optimal.
    for (let attempt = 0; other && attempt < 64; attempt += 1) {
      const r = Math.floor((Math.cbrt(slot) + 1) / 2), side = 2 * r + 1, inner = side - 2;
      let offset = slot++ - inner ** 3, x, y, z;
      if (offset < 2 * side * side) {
        x = offset < side * side ? -r : r;
        offset %= side * side; y = offset % side - r; z = Math.floor(offset / side) - r;
      } else if ((offset -= 2 * side * side) < 2 * inner * side) {
        y = offset < inner * side ? -r : r;
        offset %= inner * side; x = offset % inner - r + 1; z = Math.floor(offset / inner) - r;
      } else {
        offset -= 2 * inner * side;
        z = offset < inner * inner ? -r : r;
        offset %= inner * inner; x = offset % inner - r + 1; y = Math.floor(offset / inner) - r + 1;
      }
      box.x = origin[0] + x * (2 * box.hx + pad);
      box.y = origin[1] + y * (2 * box.hy + pad);
      box.z = origin[2] + z * (2 * box.hz + pad);
      other = intersection(box);
    }
    if (other) {
      // Guaranteed bounded escape: nearest outside face of all settled bounds.
      let best = Infinity, bestAxis, bestValue;
      for (let k = 0; k < 3; k += 1) {
        const axis = axes[k];
        for (const value of [lo[k] - box[`h${axis}`] - pad, hi[k] + box[`h${axis}`] + pad]) {
          const distance = (value - origin[k]) ** 2;
          if (distance < best) { best = distance; bestAxis = axis; bestValue = value; }
        }
        box[axis] = origin[k];
      }
      box[bestAxis] = bestValue;
    }
    const x0 = Math.floor((box.x - box.hx) / size), x1 = Math.floor((box.x + box.hx) / size);
    const y0 = Math.floor((box.y - box.hy) / size), y1 = Math.floor((box.y + box.hy) / size);
    const z0 = Math.floor((box.z - box.hz) / size), z1 = Math.floor((box.z + box.hz) / size);
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) for (let z = z0; z <= z1; z += 1) {
      const key = hash(x, y, z), bucket = level.grid.get(key);
      if (bucket) bucket.push(box);
      else level.grid.set(key, [box]);
    }
    for (let k = 0; k < 3; k += 1) {
      const axis = axes[k];
      lo[k] = Math.min(lo[k], box[axis] - box[`h${axis}`]);
      hi[k] = Math.max(hi[k], box[axis] + box[`h${axis}`]);
    }
  }
  return boxes;
}
