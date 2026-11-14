import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHillsideHome } from './hillside-structure.js';
import { prepareTowerGeometry } from './skate-runner.js';
import { createGroundBlackHole } from './black-hole.js';

test('homes retain their exterior while authored storeys and screens keep local pivots', () => {
  const dims = { x: 17, y: 9, z: -20, w: 6, h: 7, d: 5 };
  const wall = new THREE.MeshBasicMaterial(), roof = new THREE.MeshBasicMaterial();
  const lit = new THREE.MeshBasicMaterial(), dark = new THREE.MeshBasicMaterial();
  const home = createHillsideHome(THREE, mergeGeometries, dims, {
    wall, roof, windowFor: (floor, side) => side ? dark : lit,
  });
  assert.deepEqual(home.position.toArray(), [dims.x, dims.y, dims.z]);
  assert.equal(home.children.length, 4, 'parts share one draw call per used material');

  const components = (material) => {
    const geometry = home.children.find(mesh => mesh.material === material).geometry;
    const { position, normal, _shard: shard, _cluster: cluster } = geometry.attributes;
    assert.equal(position.count, shard.count);
    assert.equal(position.count, cluster.count);
    for (let i = 0; i < geometry.index.count; i += 3) {
      const indices = [0, 1, 2].map(offset => geometry.index.getX(i + offset));
      for (const attribute of [shard, cluster]) {
        const pivots = indices.map(index => new THREE.Vector3().fromBufferAttribute(attribute, index).toArray());
        assert.deepEqual(pivots[0], pivots[1]);
        assert.deepEqual(pivots[1], pivots[2]);
      }
    }
    const parts = new Map();
    for (let i = 0; i < position.count; i += 1) {
      const pivot = new THREE.Vector3().fromBufferAttribute(shard, i);
      const group = new THREE.Vector3().fromBufferAttribute(cluster, i);
      const key = pivot.toArray().join(',');
      if (!parts.has(key)) parts.set(key, { pivot, group, bounds: new THREE.Box3(), uv: [] });
      const part = parts.get(key);
      assert.ok(part.group.distanceTo(group) < 1e-5);
      const point = new THREE.Vector3().fromBufferAttribute(position, i);
      part.bounds.expandByPoint(point);
      part.uv.push({ point, normal: new THREE.Vector3().fromBufferAttribute(normal, i), u: geometry.attributes.uv.getX(i), v: geometry.attributes.uv.getY(i) });
    }
    return [...parts.values()];
  };
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
  const walls = components(wall), roofs = components(roof);
  assert.equal(walls.length, 15, 'three storeys each have a slab and four walls');
  assert.deepEqual([...new Set(walls.map(part => part.group.y.toFixed(2)))], ['1.20', '3.60', '5.90']);
  const seenFaces = new Set();
  walls.forEach(({ pivot, bounds, uv }) => {
    assert.ok(bounds.getCenter(new THREE.Vector3()).distanceTo(pivot) < 1e-5);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.x <= 0.121 || size.y <= 0.121 || size.z <= 0.121, 'no solid storey-sized box');
    uv.forEach(({ point, normal, u, v }) => {
      if (normal.z && Math.abs(point.z - normal.z * dims.d / 2) < 1e-5) {
        near(u, (dims.w / 2 + normal.z * point.x) / 4);
        near(v, point.y / 4);
        seenFaces.add(`z${normal.z}`);
      }
      if (normal.x && Math.abs(point.x - normal.x * dims.w / 2) < 1e-5) {
        near(u, (dims.d / 2 - normal.x * point.z) / 4);
        near(v, point.y / 4);
        seenFaces.add(`x${normal.x}`);
      }
      if (normal.y) {
        near(u, (point.x + dims.w / 2) / 4);
        near(v, (dims.d / 2 - normal.y * point.z) / 4);
        seenFaces.add(`y${normal.y}`);
      }
    });
  });
  assert.deepEqual([...seenFaces].sort(), ['x-1', 'x1', 'y-1', 'y1', 'z-1', 'z1']);
  assert.equal(roofs.length, 1);
  near(roofs[0].bounds.min.x, -(dims.w + 0.1) / 2);
  near(roofs[0].bounds.max.y, dims.h);
  near(roofs[0].bounds.max.z, (dims.d + 0.2) / 2);
  near(roofs[0].group.y, 5.9);
  for (const [material, x] of [[lit, -dims.w / 4], [dark, dims.w / 4]]) {
    const windows = components(material);
    assert.equal(windows.length, 3);
    windows.forEach(({ pivot, group, bounds }, floor) => {
      near(pivot.x, x); near(pivot.y, 1.6 + 2.4 * floor); near(pivot.z, dims.d / 2 + 0.04);
      near(group.y, [1.2, 3.6, 5.9][floor]);
      const size = bounds.getSize(new THREE.Vector3());
      near(size.x, 0.8); near(size.y, 1.1); near(size.z, 0.06);
    });
  }
  const scene = new THREE.Scene(); scene.add(home);
  const hole = createGroundBlackHole(THREE, scene, { center: [17, 0.025, 1], maxRadius: 3.1, gravity: 2100, duration: 9, openUntil: 0.56 });
  hole.addBody(home); hole.update(0.7);
  const fragments = scene.getObjectByName('runner-fragments-runner-home');
  assert.equal(fragments.visible, true);
  assert.equal(home.visible, false);
  assert.equal(fragments.children.length, home.children.length);
  assert.equal(new Set(fragments.children.flatMap(mesh => [...mesh.geometry.attributes.contact.array])).size, 3,
    'each authored storey is one contact part');
  hole.update(0); assert.equal(home.visible, true);
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), wall);
  terrace.name = 'runner-terrace'; terrace.position.set(17, 4, -15); scene.add(terrace);
  hole.addBody(terrace);
  const farHome = home.clone(); farHome.position.x += 200; scene.add(farHome); hole.addBody(farHome);
  const sourceVertices = [...home.children, ...farHome.children, terrace].reduce((sum, mesh) =>
    sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count), 0);
  hole.batch(mergeGeometries);
  const batches = scene.children.filter(mesh => mesh.name === 'runner-hillside-batch');
  assert.ok(batches.length > 0 && batches.length <= 4, 'mixed indexed and distant geometry batches by material');
  assert.equal(batches.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0), sourceVertices,
    'normal street batches retain full geometry even in a neighbourhood far from the hole');
  home.children.forEach(mesh => assert.equal(mesh.layers.test(new THREE.Layers()), false));
  hole.update(0.4);
  assert.ok(batches.every(mesh => Number.isFinite(mesh.boundingSphere.radius) && mesh.boundingSphere.radius > 0));
  hole.update(0); hole.dispose();
  home.children.forEach(mesh => assert.ok(mesh.layers.test(new THREE.Layers()), 'cleanup restores original drawing layers'));
  assert.ok(!scene.children.some(mesh => mesh.name === 'runner-hillside-batch'));

  for (const indexed of [true, false]) {
    const source = new THREE.BoxGeometry(2, 4, 1).translate(3, 5, -2);
    const geometry = indexed ? source : source.toNonIndexed();
    const data = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < data.length; i += 3) data.set([4 + i / 16, 6 - i / 32, -1 + i / 64], i);
    geometry.setAttribute('_shard', new THREE.BufferAttribute(data, 3));
    geometry.setAttribute('_cluster', new THREE.BufferAttribute(data.slice(), 3));
    const screen = new THREE.Mesh(geometry, { name: 'Ad screen' });
    const sibling = screen.clone();
    screen.scale.set(2, 3, 4); screen.rotation.y = Math.PI / 2;
    screen.updateMatrixWorld();
    const originalMatrix = screen.matrixWorld.clone();
    const originalAttributes = Object.fromEntries(['position', '_shard', '_cluster'].map(name => [name, geometry.attributes[name].array.slice()]));
    prepareTowerGeometry(THREE, screen);
    screen.updateMatrixWorld();
    for (const name of ['position', '_shard', '_cluster']) {
      const before = sibling.geometry.attributes[name], after = screen.geometry.attributes[name];
      assert.deepEqual(before.array, originalAttributes[name], 'shared source attributes stay unchanged');
      for (let i = 0; i < after.count; i += 1) {
        const sourceIndex = geometry.index ? geometry.index.getX(i) : i;
        const oldPoint = new THREE.Vector3().fromBufferAttribute(before, sourceIndex).applyMatrix4(originalMatrix);
        const newPoint = new THREE.Vector3().fromBufferAttribute(after, i).applyMatrix4(screen.matrixWorld);
        assert.ok(oldPoint.distanceTo(newPoint) < 1e-5, `${name} vertex ${i} stays in place`);
      }
    }
  }
  const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(2, 3, 4), { name: 'Ad screen' });
  prepareTowerGeometry(THREE, plain);
  assert.equal(plain.geometry.attributes._shard, undefined);
  assert.equal(plain.geometry.attributes._cluster, undefined);
});
