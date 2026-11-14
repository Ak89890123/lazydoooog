// The exterior keeps the original box's UVs while each storey has real walls and a slab.
export function createHillsideHome(THREE, mergeGeometries, { x, y, z, w, h, d }, { wall, roof, windowFor }) {
  const home = new THREE.Group();
  home.name = 'runner-home';
  home.position.set(x, y, z);
  const parts = new Map();
  const part = (material, size, center, cluster, masonry = false) => {
    const geometry = new THREE.BoxGeometry(...size).translate(...center);
    const position = geometry.attributes.position;
    if (masonry) {
      const uv = geometry.attributes.uv;
      for (let i = 0; i < position.count; i += 1) {
        const face = Math.floor(i / 4), px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
        const u = face === 0 ? d / 2 - pz : face === 1 ? pz + d / 2 : face === 5 ? w / 2 - px : px + w / 2;
        const v = face === 2 ? d / 2 - pz : face === 3 ? pz + d / 2 : py;
        uv.setXY(i, u / 4, v / 4);
      }
    }
    const shards = new Float32Array(position.count * 3), clusters = new Float32Array(position.count * 3);
    for (let i = 0; i < shards.length; i += 3) {
      shards.set(center, i);
      clusters.set(cluster, i);
    }
    geometry.setAttribute('_shard', new THREE.BufferAttribute(shards, 3));
    geometry.setAttribute('_cluster', new THREE.BufferAttribute(clusters, 3));
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(geometry);
  };

  const thickness = 0.12;
  let windowY = 1.6, topCluster;
  for (let bottom = 0; bottom < h; bottom += 2.4, windowY += 2.4) {
    const top = Math.min(bottom + 2.4, h), height = top - bottom;
    const cluster = [0, (bottom + top) / 2, 0];
    topCluster = cluster;
    const slab = Math.min(thickness, height);
    part(wall, [w - 2 * thickness, slab, d - 2 * thickness], [0, bottom + slab / 2, 0], cluster, true);
    for (const side of [-1, 1]) {
      part(wall, [w, height, thickness], [0, cluster[1], side * (d - thickness) / 2], cluster, true);
      part(wall, [thickness, height, d - 2 * thickness], [side * (w - thickness) / 2, cluster[1], 0], cluster, true);
    }
    if (windowY < h - 0.5) {
      for (const [side, dx] of [-w / 4, w / 4].entries()) {
        part(windowFor(windowY, side), [0.8, 1.1, 0.06], [dx, windowY, d / 2 + 0.04], cluster);
      }
    }
  }
  part(roof, [w + 0.1, 0.18, d + 0.2], [0, h - 0.09, 0], topCluster);
  for (const [material, geometries] of parts) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach(source => source.dispose());
    home.add(new THREE.Mesh(geometry, material));
  }
  return home;
}
