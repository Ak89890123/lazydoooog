import { structureMaterial } from './structure-motion.js';
import { openingAt, collapseFrame, collapseLean, collapsePull, collapseSwirl } from './collapse-motion.js';
import { resolveContacts } from './collapse-contacts.js';

const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { const t = clamp(v); return t * t * (3 - 2 * t); };

// The road and mouth share the runner's curved projection. Modelled building
// parts follow one distance-ordered, scroll-sampled attraction field.
// pause(need) yields until an idle period has about need ms for the next piece of work a loading street spreads out.
export function createGroundBlackHole(THREE, scene, config, onReady, pause = () => new Promise((resolve) => (
  window.requestIdleCallback ? requestIdleCallback(resolve, { timeout: 500 }) : setTimeout(resolve, 50, { timeRemaining: () => 0 })))) {
  const center = new THREE.Vector3(...config.center);
  const viewDistance = config.viewDistance ?? Infinity;
  const bodies = [];
  const geometryCache = new Map();
  const geometries = new Set();
  const batches = [];
  const cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const contacts = [];
  let contactTexture;
  const uniforms = { contactTexture: { value: null }, contactSize: { value: new THREE.Vector2() } };
  const structureGeometry = (source, ids, distant) => {
    const cached = geometryCache.get(source);
    const layout = `${distant}:${ids.join(',')}`;
    if (cached.layouts.has(layout)) return cached.layouts.get(layout);
    const geometry = new THREE.BufferGeometry();
    if (distant) {
      // Models outside the camera's original range enter as small silhouettes,
      // not millions of detailed triangles that were never visible on the street.
      const count = cached.groups.length * 36;
      const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2), contact = new Float32Array(count);
      cached.groups.forEach(({ bounds }, part) => {
        const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
        for (let v = 0; v < 36; v += 1) {
          const i = part * 36 + v;
          for (let a = 0; a < 3; a += 1) {
            positions[i * 3 + a] = center.getComponent(a) + cube.attributes.position.array[v * 3 + a] * size.getComponent(a);
            normals[i * 3 + a] = cube.attributes.normal.array[v * 3 + a];
          }
          uv[i * 2] = cube.attributes.uv.getX(v); uv[i * 2 + 1] = cube.attributes.uv.getY(v);
          contact[i] = ids[part];
        }
      });
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geometry.setAttribute('contact', new THREE.BufferAttribute(contact, 1));
      geometry.setAttribute('backing', new THREE.BufferAttribute(new Float32Array(count), 1));
    } else {
      geometry.setIndex(source.index);
      for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
      source.groups.forEach(({ start, count, materialIndex }) => geometry.addGroup(start, count, materialIndex));
      geometry.setAttribute('backing', source.attributes._backing ??
        new THREE.BufferAttribute(new Float32Array(source.attributes.position.count), 1));
      const { indices } = cached, contact = new Float32Array(indices.length); // a plain loop: from() with a map callback is slow
      for (let i = 0; i < contact.length; i += 1) contact[i] = ids[indices[i]];
      geometry.setAttribute('contact', new THREE.BufferAttribute(contact, 1));
    }
    geometries.add(geometry);
    cached.layouts.set(layout, geometry);
    return geometry;
  };
  const sourceParts = source => {
    if (geometryCache.has(source)) return geometryCache.get(source);
    // Plain float arrays, read directly: this runs once per model, too rarely for accessor calls to be optimised.
    const position = source.attributes.position.array, cluster = source.attributes._cluster?.array;
    const count = source.attributes.position.count;
    const groups = [], lookup = new Map(), indices = new Uint32Array(count);
    if (!source.boundingBox) source.computeBoundingBox();
    const fallback = source.boundingBox.getCenter(new THREE.Vector3());
    let lastX, lastY, lastZ, id, min, max;
    for (let i = 0, a = 0; i < count; i += 1, a += 3) {
      const x = cluster ? cluster[a] : fallback.x, y = cluster ? cluster[a + 1] : fallback.y, z = cluster ? cluster[a + 2] : fallback.z;
      if (x !== lastX || y !== lastY || z !== lastZ) { // a part's vertices run together: key only on a change
        const key = `${x},${y},${z}`;
        id = lookup.get(key);
        if (id === undefined) {
          id = groups.length; lookup.set(key, id);
          groups.push({ pivot: new THREE.Vector3(x, y, z), bounds: new THREE.Box3() });
        }
        ({ min, max } = groups[id].bounds);
        [lastX, lastY, lastZ] = [x, y, z];
      }
      indices[i] = id;
      const px = position[a], py = position[a + 1], pz = position[a + 2];
      if (px < min.x) min.x = px;
      if (px > max.x) max.x = px;
      if (py < min.y) min.y = py;
      if (py > max.y) max.y = py;
      if (pz < min.z) min.z = pz;
      if (pz > max.z) max.z = pz;
    }
    const data = { groups, indices, layouts: new Map() };
    geometryCache.set(source, data);
    return data;
  };
  const materials = new Map();
  let progress = 0;
  // Fragments matter only once the ground opens. Bodies registered after the hillside batch are cut one at a
  // time in idle time, so a loading street does not stall the page; the first opening frame cuts the rest.
  const pending = new Set();
  let deferring = false, cutting = false;
  const cut = (body) => { pending.delete(body); prepare(body); sample(body); }; // sample hides the fresh fragments
  const flush = () => pending.forEach(cut);
  const cutLater = async () => {
    if (cutting) return;
    cutting = true;
    while (pending.size) {
      await pause(10);
      const [body] = pending;
      if (body) cut(body);
    }
    cutting = false;
  };
  const cutRadius = { value: 0 };
  const radiusAt = (p) => config.maxRadius * openingAt(p, config);
  const hole = new THREE.Group();
  const funnelDepth = 0.55;
  const upperRadius = 1.3 * 1.2, throatRadius = 0.25 * 1.3;
  // A part over the opening follows the road's funnel down (the shader in addSurface); past the throat edge it drops away.
  const sinkAt = (r) => {
    const R = cutRadius.value, bowl = Math.max(0, 1 - (r / Math.max(R * upperRadius, 1e-6)) ** 2);
    return funnelDepth * R / (1 - (throatRadius / upperRadius) ** 2) ** 2 * bowl * bowl + Math.max(0, R * throatRadius - r) * 8;
  };
  hole.name = 'runner-ground-hole';
  hole.position.copy(center);
  hole.scale.setScalar(0);
  const material = new THREE.MeshBasicMaterial({ color: '#000', side: THREE.DoubleSide, fog: false });
  // Only the deep throat is black; the visible funnel is the asphalt itself.
  // Overlap below the cut edge so its triangulated boundary cannot expose the sky.
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(throatRadius * 1.15, 128), material);
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = -funnelDepth - 0.02;
  hole.add(mouth);
  hole.visible = false;
  scene.add(hole);
  const partMaterial = source => {
    if (!materials.has(source)) materials.set(source, structureMaterial(source, uniforms));
    return materials.get(source);
  };
  const release = (body, restore = true) => {
    body.live = false;
    body.fragments?.removeFromParent();
    body.nodes.forEach(({ source, layers }) => { if (layers !== undefined) source.layers.mask = layers; });
    if (body.intact) return; // its owner placed it
    if (restore) {
      body.root.position.copy(body.position);
      body.root.quaternion.copy(body.quaternion);
      body.root.scale.copy(body.scale);
    }
    body.root.visible = body.visible;
  };
  const syncMaterials = () => materials.forEach((material, source) => {
    material.color.copy(source.color);
    if (material.map !== source.map) { material.map = source.map; material.needsUpdate = true; }
  });
  const prepare = body => {
    const { root } = body;
    body.base = contacts.length;
    const fragments = new THREE.Group();
    fragments.name = `runner-fragments-${root.name || root.id}`;
    const groups = new Map();
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    root.traverseVisible(node => {
      if (!node.isMesh) return;
      const parts = sourceParts(node.geometry);
      const local = inverse.clone().multiply(node.matrixWorld);
      const ids = parts.groups.map(({ pivot, bounds }) => {
        const point = pivot.clone().applyMatrix4(local);
        const key = point.toArray().map(v => Math.round(v * 1e5)).join(',');
        let entry = groups.get(key);
        if (!entry) {
          entry = { id: groups.size, bounds: new THREE.Box3() };
          groups.set(key, entry);
        }
        entry.bounds.union(bounds.clone().applyMatrix4(node.matrixWorld));
        return entry.id;
      });
      const material = Array.isArray(node.material) ? node.material.map(partMaterial) : partMaterial(node.material);
      const contactIds = ids.map(id => body.base + id);
      const mesh = new THREE.Mesh(structureGeometry(node.geometry, contactIds, body.far), material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(node.matrixWorld);
      mesh.boundingSphere = new THREE.Sphere();
      fragments.add(mesh);
      body.nodes.push({ source: node, mesh, contactIds, inverse: node.matrixWorld.clone().invert() });
    });
    for (const { bounds } of groups.values()) {
      const origin = bounds.getCenter(new THREE.Vector3()), half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const entry = { body, origin, half, bounds: new THREE.Box3(), spin: new THREE.Quaternion(),
        x: origin.x, y: origin.y, z: origin.z, hx: half.x, hy: half.y, hz: half.z, active: false,
        // The hillside's cells stand side by side: they lean into one another rather than wedge each other apart.
        group: body.hillside ? 'hillside' : body };
      contacts.push(entry); body.contacts.push(entry);
    }
    body.fragments = fragments;
    scene.add(fragments);
  };
  const sample = (body) => {
    if (body.intact) return; // moved by its owner, never by the hole
    const { root, visible, distance, delay } = body;
    const frame = collapseFrame(progress - delay, distance, config);
    root.position.copy(body.position);
    root.quaternion.copy(body.quaternion);
    root.scale.copy(body.scale);
    const phase = progress * 190 + body.origin.x * 1.7 + body.origin.z * 2.3;
    const amplitude = frame.shake ** 2 * 0.055 * (1 - smooth((frame.stress - 0.85) / 0.15));
    root.position.x += Math.sin(phase) * amplitude;
    root.position.y += Math.sin(phase * 1.37) * amplitude * 0.35;
    root.rotateZ(Math.sin(phase * 0.83) * amplitude * 0.075);
    const broken = frame.stress >= 1;
    root.visible = visible && (!broken || !body.fragments);
    if (body.fragments) {
      body.fragments.visible = visible && broken && !body.batched;
      body.nodes.forEach(({ source, mesh }) => {
        mesh.visible = source === root ? visible : source.visible;
        for (let parent = source.parent; parent && parent !== root; parent = parent.parent) mesh.visible &&= parent.visible;
      });
    }
  };
  const point = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  const rotation = new THREE.Matrix4(), offset = new THREE.Vector3();
  const updateContacts = () => {
    const height = 2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil(contacts.length / 256))));
    if (!contactTexture || contactTexture.image.height < height) {
      contactTexture?.dispose();
      contactTexture = new THREE.DataTexture(new Float32Array(768 * height * 4), 768, height, THREE.RGBAFormat, THREE.FloatType);
      uniforms.contactTexture.value = contactTexture;
      uniforms.contactSize.value.set(768, height);
    }
    for (const entry of contacts) {
      const { body, origin, half, spin } = entry;
      if (body.intact) {
        // Wherever its owner has put it now (the rider on its own clock): a fixed volume the pieces flow around.
        body.bounds.setFromObject(body.root).getCenter(point);
        body.bounds.getSize(offset).multiplyScalar(0.5);
        Object.assign(entry, { x: point.x, y: point.y, z: point.z, hx: offset.x, hy: offset.y, hz: offset.z,
          flight: 0, scale: 1, active: body.live && body.root.visible, fixed: true });
        continue;
      }
      const { flight } = collapseFrame(progress - body.delay, body.distance, config);
      const pull = collapsePull(flight);
      entry.flight = flight;
      entry.scale = 1 - pull;
      // A building goes as one rigid piece: it leans about the ground beneath it, and is drawn in on the mouth,
      // shrinking about it as it closes and circling it at the last. One swirl angle per building, turning its
      // parts with it, so a home never parts from the terrace it stands on.
      turn.setFromAxisAngle(up, -collapseSwirl(Math.hypot(body.hinge.x - center.x, body.hinge.z - center.z), pull));
      spin.setFromAxisAngle(body.axis, collapseLean(flight));
      offset.copy(origin).sub(body.hinge).applyQuaternion(spin).add(body.hinge).sub(center)
        .applyQuaternion(turn).multiplyScalar(1 - pull);
      spin.premultiply(turn);
      entry.x = center.x + offset.x;
      entry.y = center.y + offset.y - sinkAt(Math.hypot(offset.x, offset.z));
      entry.z = center.z + offset.z;
      rotation.makeRotationFromQuaternion(spin);
      const e = rotation.elements, scale = entry.scale;
      entry.hx = (Math.abs(e[0]) * half.x + Math.abs(e[4]) * half.y + Math.abs(e[8]) * half.z) * scale;
      entry.hy = (Math.abs(e[1]) * half.x + Math.abs(e[5]) * half.y + Math.abs(e[9]) * half.z) * scale;
      entry.hz = (Math.abs(e[2]) * half.x + Math.abs(e[6]) * half.y + Math.abs(e[10]) * half.z) * scale;
      entry.active = body.live && body.visible && body.nodes.some(({ mesh }) => mesh.visible) && flight < 0.98;
      entry.active &&= Math.hypot(entry.x - center.x, entry.y - center.y, entry.z - center.z)
        <= viewDistance + Math.hypot(entry.hx, entry.hy, entry.hz);
      entry.fixed = flight <= 0.03;
    }
    resolveContacts(contacts);
    const data = contactTexture.image.data;
    for (let i = 0; i < contacts.length; i += 1) {
      const entry = contacts[i], { body, origin, spin } = entry;
      const at = i * 12;
      data[at] = entry.x; data[at + 1] = entry.y; data[at + 2] = entry.z;
      data[at + 3] = entry.flight >= 0.98 || !body.live ? 0 : entry.scale;
      data[at + 4] = origin.x; data[at + 5] = origin.y; data[at + 6] = origin.z;
      data[at + 7] = smooth((entry.flight - 0.08) / 0.4);
      data[at + 8] = spin.x; data[at + 9] = spin.y; data[at + 10] = spin.z; data[at + 11] = spin.w;
      entry.bounds.min.set(entry.x - entry.hx, entry.y - entry.hy, entry.z - entry.hz);
      entry.bounds.max.set(entry.x + entry.hx, entry.y + entry.hy, entry.z + entry.hz);
    }
    // Each mesh receives the actual moved bounds in its local space so the
    // existing Three.js frustum culling also works after shader displacement.
    for (const body of bodies) {
      if (!body.fragments) continue;
      const bounds = body.bounds.makeEmpty();
      body.contacts.forEach(entry => bounds.union(entry.bounds));
      const gone = body.contacts.every(entry => entry.flight >= 0.98);
      for (const { mesh, inverse } of body.nodes) {
        mesh.visible &&= !gone;
        bounds.getBoundingSphere(mesh.boundingSphere);
        mesh.boundingSphere.applyMatrix4(inverse);
      }
    }
    for (const { mesh, bodies } of batches) {
      const bounds = mesh.geometry.boundingBox.makeEmpty();
      bodies.forEach(body => bounds.union(body.bounds));
      bounds.getBoundingSphere(mesh.boundingSphere);
    }
    contactTexture.needsUpdate = true;
  };
  return {
    // Procedural hillside uses shared materials. Draw it in material batches both
    // at rest and in flight instead of hundreds of separate walls/windows.
    // With pause (an async yield), the work is split for a page that keeps scrolling; without it, synchronous.
    async batch(mergeGeometries, pause) {
      const groups = new Map();
      for (const body of bodies) {
        if (!body.hillside) continue;
        if (pause) await pause(3);
        body.batched = true;
        for (const node of body.nodes) {
          const { source, mesh } = node;
          const full = structureGeometry(source.geometry, node.contactIds, false);
          node.layers = source.layers.mask;
          source.layers.disable(0);
          const prepared = new THREE.BufferGeometry();
          if (full.index) prepared.setIndex(full.index);
          for (const name of ['position', 'normal', 'uv', 'backing', 'contact']) {
            prepared.setAttribute(name, full.attributes[name]);
          }
          const geometry = prepared.index ? prepared.toNonIndexed() : prepared.clone();
          geometry.applyMatrix4(mesh.matrix);
          if (!groups.has(mesh.material)) groups.set(mesh.material, { geometries: [], bodies: new Set() });
          const group = groups.get(mesh.material);
          group.geometries.push(geometry); group.bodies.add(body);
        }
      }
      for (const [material, group] of groups) {
        if (pause) await pause(10);
        const geometry = mergeGeometries(group.geometries);
        group.geometries.forEach(geometry => geometry.dispose());
        geometry.boundingBox = new THREE.Box3();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'runner-hillside-batch'; mesh.boundingSphere = new THREE.Sphere();
        geometries.add(geometry); scene.add(mesh);
        batches.push({ mesh, bodies: [...group.bodies] });
      }
      bodies.forEach(sample); updateContacts();
      deferring = true;
    },
    // Road and paint use the same world-space depression, including their surface normals.
    addSurface(root) {
      root.traverse((node) => {
        if (!node.isMesh) return;
        if (node.geometry.type === 'PlaneGeometry') {
          node.updateWorldMatrix(true, false);
          const local = node.worldToLocal(center.clone());
          const { width, height } = node.geometry.parameters;
          // Refine only the hole neighbourhood; retain large flat spans elsewhere.
          const axis = (length, at) => {
            const values = [-length / 2, length / 2];
            const start = Math.max(-length / 2, at - config.maxRadius * upperRadius - 0.15);
            const end = Math.min(length / 2, at + config.maxRadius * upperRadius + 0.15);
            for (let x = start; x <= end; x += 0.1) values.push(x);
            return [...new Set(values)].sort((a, b) => a - b);
          };
          const xs = axis(width, local.x), ys = axis(height, local.y).reverse();
          const source = node.geometry;
          const uv = source.attributes.uv;
          const geometry = new THREE.PlaneGeometry(width, height, xs.length - 1, ys.length - 1);
          for (let y = 0; y < ys.length; y += 1) for (let x = 0; x < xs.length; x += 1) {
            const i = y * xs.length + x;
            geometry.attributes.position.setXY(i, xs[x], ys[y]);
            geometry.attributes.uv.setXY(i,
              uv.getX(0) + (xs[x] / width + 0.5) * (uv.getX(1) - uv.getX(0)),
              uv.getY(2) + (ys[y] / height + 0.5) * (uv.getY(0) - uv.getY(2)));
          }
          geometry.computeBoundingSphere();
          node.geometry = geometry;
          source.dispose();
        }
        for (const surface of [node.material].flat()) {
          surface.onBeforeCompile = (shader) => {
            shader.uniforms.holeRadius = cutRadius;
            shader.uniforms.funnelDepth = { value: funnelDepth };
            shader.uniforms.funnelRadii = { value: new THREE.Vector2(upperRadius, throatRadius) };
            shader.uniforms.holeCenter = { value: center };
            shader.vertexShader = `varying vec3 vHoleWorld;
              uniform float holeRadius, funnelDepth; uniform vec3 holeCenter; uniform vec2 funnelRadii;
              ` + shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
                vec3 groundWorld = (modelMatrix * vec4(position, 1.0)).xyz;
                vec2 delta = groundWorld.xz - holeCenter.xz;
                float radius = max(holeRadius * funnelRadii.x, 0.0001);
                float r = length(delta) / radius;
                float bowl = max(0.0, 1.0 - r * r);
                float depth = funnelDepth * holeRadius / pow(1.0 - pow(funnelRadii.y / funnelRadii.x, 2.0), 2.0);
                if (r < 1.0) {
                  vec2 slope = 4.0 * depth * bowl * delta / (radius * radius);
                  objectNormal = inverse(mat3(modelMatrix)) * normalize(vec3(-slope.x, 1.0, -slope.y));
                }
              `).replace('#include <begin_vertex>', `#include <begin_vertex>
                transformed += inverse(mat3(modelMatrix)) * vec3(0.0, -depth * bowl * bowl, 0.0);
              `).replace('#include <project_vertex>',
                'vHoleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
            shader.fragmentShader = 'varying vec3 vHoleWorld; uniform float holeRadius; uniform vec3 holeCenter; uniform vec2 funnelRadii;\n'
              + shader.fragmentShader.replace('#include <clipping_planes_fragment>',
                '#include <clipping_planes_fragment>\nif (distance(vHoleWorld.xz, holeCenter.xz) < holeRadius * funnelRadii.y) discard;')
                .replace('#include <fog_fragment>', `#include <fog_fragment>
                  // Fade after fog too: atmosphere must not relight the throat seam.
                  float shade = smoothstep(funnelRadii.y * 1.25, funnelRadii.x * 0.85,
                    distance(vHoleWorld.xz, holeCenter.xz) / max(holeRadius, 0.0001));
                  gl_FragColor.rgb *= shade * shade;`);
          };
          surface.customProgramCacheKey = () => 'runner-ground-funnel';
          surface.needsUpdate = true;
        }
      });
    },
    addBody(root, { intact = false } = {}) {
      const existing = bodies.findIndex(body => body.root === root);
      if (existing >= 0) { pending.delete(bodies[existing]); release(bodies[existing], false); }
      root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(root);
      const nearest = bounds.clampPoint(center, new THREE.Vector3());
      const origin = bounds.getCenter(new THREE.Vector3());
      const jitter = Math.abs(Math.sin(origin.x * 12.9898 + origin.z * 78.233) * 43758.5453) % 1;
      const body = { root, visible: root.visible, live: true, fragments: null, nodes: [],
        contacts: [], bounds: new THREE.Box3(), base: contacts.length, scale: root.scale.clone(),
        intact, position: root.position.clone(), quaternion: root.quaternion.clone(), origin,
        // Ground distance: a home goes with the terrace it stands on. Models out of the street camera's original
        // range (far) are drawn as outlines.
        distance: Math.hypot(nearest.x - center.x, nearest.z - center.z), far: nearest.distanceTo(center) > 80,
        hillside: ['runner-home', 'runner-terrace'].includes(root.name),
        delay: 0.04 * jitter, // neighbours break loose a little apart
        hinge: new THREE.Vector3(origin.x, center.y, origin.z),
        axis: new THREE.Vector3(center.z - origin.z, 0.0001, origin.x - center.x).normalize() };
      if (existing < 0) bodies.push(body);
      else bodies[existing] = body;
      if (intact) {
        const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const entry = { body, origin: body.origin, half, bounds: new THREE.Box3(), spin: new THREE.Quaternion(), active: false };
        contacts.push(entry); body.contacts.push(entry);
      } else if (body.visible && deferring) { pending.add(body); cutLater(); } else if (body.visible) prepare(body);
      sample(body);
      if (progress > 0) { flush(); bodies.forEach(sample); updateContacts(); onReady?.(); }
    },
    update(nextProgress) {
      syncMaterials();
      if (progress === 0 && nextProgress === 0) return;
      flush();
      progress = clamp(nextProgress);
      hole.visible = progress > 0;
      hole.scale.setScalar(radiusAt(progress));
      cutRadius.value = radiusAt(progress);
      bodies.forEach(sample);
      updateContacts();
    },
    dispose() {
      progress = 0;
      cutRadius.value = 0;
      pending.clear();
      bodies.forEach(body => release(body));
      geometries.forEach(geometry => geometry.dispose());
      geometries.clear();
      materials.forEach(material => material.dispose());
      contactTexture?.dispose();
      cube.dispose();
      geometryCache.clear(); materials.clear();
      hole.removeFromParent();
      batches.forEach(({ mesh }) => mesh.removeFromParent());
      mouth.geometry.dispose();
      material.dispose();
      bodies.length = 0;
      contacts.length = 0;
    },
  };
}
