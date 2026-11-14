// Scene only: the parent owns rendering, scroll, HTML, the paper sticker and reduced-motion policy.
// journey 0 / 1 / 2 docks at campus / manufacturing / marketing; travel adds warp trails.
// A docked globe is centred with its lower half below the screen and its top planetTop down the viewport
// (a fraction from the parent's layout); the warp converges on the screen centre.
// reveal scales the planets into view after the initial black-hole crossing.
export function createCareerUniverse(THREE, planetTop) {
  const TAU = Math.PI * 2;
  const RADIUS = 2.3;
  const DISTANCE = 10;
  const SPACING = 42;
  const TILT = -0.5; // tips each globe's dressed face up towards a camera that looks down on it
  const resources = new Set();
  const own = (resource) => { resources.add(resource); return resource; };
  let live = true;
  let journey = 0;
  let travel = 0;
  let reveal = 1;
  let seed = 27031;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030711');
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.08, 340);
  // Height in view at the docking distance; only the aspect changes on resize, so it is constant.
  const viewHeight = 2 * DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const planetScale = (1 - planetTop) * viewHeight / RADIUS;
  scene.add(camera);
  const sun = new THREE.DirectionalLight('#ffe0b5', 3.1);
  const fill = new THREE.DirectionalLight('#76a8db', 1.4);
  scene.add(new THREE.HemisphereLight('#819db9', '#10121c', 1.15), sun, sun.target, fill, fill.target);

  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 14));
  const ball = own(new THREE.IcosahedronGeometry(1, 2));
  const sphere = own(new THREE.SphereGeometry(RADIUS, 80, 56));
  const metal = (color, roughness = 0.6, metalness = 0.35) =>
    own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const slate = metal('#293a49');
  const steel = metal('#7e929b', 0.38, 0.7);
  const copper = metal('#a96841', 0.42, 0.72);
  const stone = metal('#c4bba0', 0.9, 0.05);
  const roof = metal('#244c50', 0.65, 0.25);
  const leaves = metal('#3e6650', 0.95, 0);
  const bark = metal('#514238', 1, 0);
  const blueGlass = metal('#112a39', 0.23, 0.5);
  const signal = (color, intensity) => own(new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.25,
  }));
  const dataLight = signal('#71bbd3', 0.8);
  const warmLight = signal('#efad66', 0.75);
  const mesh = (parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) => {
    const node = new THREE.Mesh(geometry, material);
    node.position.set(...position);
    node.scale.set(...scale);
    parent.add(node);
    return node;
  };
  const block = (parent, material, position, scale) => mesh(parent, box, material, position, scale);
  const ring = (parent, radius, tube, material) =>
    mesh(parent, own(new THREE.TorusGeometry(radius, tube, 6, 112)), material);
  const pipe = (parent, points, radius, material) => mesh(parent, own(new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points), Math.max(24, points.length * 6), radius, 6, false,
  )), material);
  // A site's local +Y points away from the globe; buildings have real roofs, sides and foundations.
  const mount = (parent, x, y) => {
    const normal = new THREE.Vector3(x, y, Math.sqrt(1 - x * x - y * y));
    const site = new THREE.Group();
    site.position.copy(normal).multiplyScalar(RADIUS * 0.997);
    site.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    parent.add(site);
    return site;
  };
  const noiseGLSL = `
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.13, 0.37, 0.71));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                     mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                     mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
      float sum = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) {
        sum += a * noise(p);
        p = p * 2.03 + vec3(7.1, 3.7, 5.9);
        a *= 0.5;
      }
      return sum;
    }
  `;
  const surfaceVertex = `
    varying vec3 vLocal, vNormal, vEye;
    varying vec2 vUv;
    void main() {
      vLocal = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vEye = -view.xyz;
      gl_Position = projectionMatrix * view;
    }
  `;
  const planetMaterial = (kind) => own(new THREE.ShaderMaterial({
    uniforms: { kind: { value: kind } },
    vertexShader: surfaceVertex,
    fragmentShader: `
      uniform float kind;
      varying vec3 vLocal, vNormal, vEye;
      varying vec2 vUv;
      ${noiseGLSL}
      void main() {
        vec3 p = normalize(vLocal);
        float terrain = fbm(p * 4.6);
        float grain = noise(p * 190.0);
        vec3 albedo, emission = vec3(0.0);
        float gloss = 0.16;
        if (kind < 0.5) {
          float land = smoothstep(0.39, 0.57, terrain);
          albedo = mix(vec3(0.006, 0.015, 0.027), vec3(0.042, 0.075, 0.095), land);
          vec2 grid = vUv * vec2(180.0, 90.0);
          vec2 cell = abs(fract(grid) - 0.5);
          float streets = 1.0 - smoothstep(0.035, 0.085, min(cell.x, cell.y));
          float city = step(0.58, noise(p * 31.0)) * land;
          float windows = step(0.56, hash(vec3(floor(grid), 2.0)));
          emission = mix(vec3(0.025, 0.10, 0.14), vec3(0.24, 0.13, 0.045), windows)
            * streets * city * 0.8;
          albedo *= 0.86 + grain * 0.22;
          gloss = 0.55;
        } else if (kind < 1.5) {
          float seams = pow(0.5 + 0.5 * sin(p.y * 115.0 + terrain * 5.0), 28.0);
          albedo = mix(vec3(0.065, 0.029, 0.017), vec3(0.28, 0.145, 0.068), terrain);
          albedo *= 0.68 + grain * 0.45;
          albedo = mix(albedo, vec3(0.025, 0.034, 0.039), seams * 0.65);
          emission = vec3(0.26, 0.055, 0.012) * seams * step(0.62, terrain) * 0.4;
          gloss = 0.4;
        } else {
          float coast = sin(p.x * 3.1 + 0.5) + cos(p.y * 4.3 - 0.8) + sin(p.z * 3.7 + p.x);
          float land = smoothstep(0.18, 0.44, coast + (terrain - 0.5) * 0.55);
          vec3 ocean = mix(vec3(0.009, 0.055, 0.079), vec3(0.025, 0.15, 0.16), terrain);
          vec3 forest = mix(vec3(0.025, 0.065, 0.035), vec3(0.11, 0.17, 0.067), terrain);
          albedo = mix(ocean, forest * (0.85 + grain * 0.25), land);
          albedo += vec3(0.10, 0.10, 0.055) * (1.0 - abs(land * 2.0 - 1.0)) * 0.3;
          gloss = mix(0.7, 0.05, land);
        }
        vec3 N = normalize(vNormal), V = normalize(vEye);
        vec3 L = normalize(vec3(-0.65, 0.8, 0.9));
        float light = max(dot(N, L), 0.0);
        float fill = max(dot(N, normalize(vec3(0.8, -0.1, 0.3))), 0.0);
        float specular = pow(max(dot(N, normalize(L + V)), 0.0), 48.0) * gloss;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 colour = albedo * (vec3(0.16, 0.20, 0.28) + vec3(1.65, 1.49, 1.22) * light);
        colour += albedo * vec3(0.16, 0.26, 0.39) * fill;
        colour += vec3(1.0, 0.88, 0.73) * specular * 0.55;
        colour += emission * (1.0 - light * 0.6) + vec3(0.025, 0.055, 0.08) * rim;
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));

  const orbiters = [];
  const planets = [0x66abc9, 0xd79760, 0x6dbbad].map((color, index) => {
    const root = new THREE.Group();
    root.name = ['career-marketing', 'career-manufacturing', 'career-campus'][index];
    scene.add(root);
    const globe = new THREE.Group();
    globe.rotation.set(TILT, 0, [-0.12, 0.16, -0.18][index]);
    root.add(globe);
    mesh(globe, sphere, planetMaterial(index));
    const atmosphere = own(new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(color) } },
      vertexShader: surfaceVertex,
      fragmentShader: `
        uniform vec3 tint;
        varying vec3 vNormal, vEye;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vEye))), 3.5);
          float lit = 0.35 + 0.65 * max(dot(normalize(vNormal), normalize(vec3(-0.6,0.7,0.8))), 0.0);
          gl_FragColor = vec4(tint, rim * lit * 0.28);
          #include <colorspace_fragment>
        }
      `,
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    }));
    mesh(globe, sphere, atmosphere, [0, 0, 0], [1.045, 1.045, 1.045]);
    const moon = mesh(root, ball, metal(['#74838c', '#8c7462', '#788b84'][index], 0.95, 0.05),
      [-3.4, 3.1 - index * 0.35, -2.4], [0.19, 0.19, 0.19]);
    moon.rotation.set(index, 0.3, 0.7);
    return { root, globe };
  });

  // Marketing: physical server districts, orbital relays and paths that hug the globe.
  const marketing = planets[0].globe;
  [[-0.43, 0.5], [0.22, 0.6], [0.5, 0.12], [-0.23, -0.3], [0.33, -0.52]].forEach(([x, y], cluster) => {
    const site = mount(marketing, x, y);
    block(site, slate, [0, 0.025, 0], [0.5, 0.05, 0.33]);
    for (let i = 0; i < 5; i += 1) {
      const height = 0.14 + random() * 0.28;
      const px = (i % 3 - 1) * 0.14;
      const pz = Math.floor(i / 3) * 0.15 - 0.08;
      block(site, i % 2 ? steel : slate, [px, height / 2 + 0.045, pz], [0.09, height, 0.095]);
      for (let row = 0; row < 3; row += 1) {
        block(site, cluster % 2 ? warmLight : dataLight, [px, 0.09 + row * 0.065, pz + 0.05], [0.06, 0.008, 0.006]);
      }
    }
  });
  for (let i = 0; i < 7; i += 1) {
    const points = Array.from({ length: 20 }, (_, k) => {
      const t = k / 19;
      const longitude = -1.1 + t * 2.0;
      const latitude = -0.65 + i * 0.2 + Math.sin(t * Math.PI) * 0.16;
      return new THREE.Vector3(Math.sin(longitude) * Math.cos(latitude), Math.sin(latitude),
        Math.cos(longitude) * Math.cos(latitude)).multiplyScalar(RADIUS * 1.006);
    });
    pipe(marketing, points, 0.009, i % 3 ? steel : dataLight);
  }
  for (let i = 0; i < 2; i += 1) {
    const orbit = new THREE.Group();
    orbit.rotation.set(0.7 + i * 0.55, -0.28, -0.3 + i * 0.65);
    marketing.add(orbit);
    const radius = RADIUS * (1.16 + i * 0.07);
    ring(orbit, radius, 0.009, steel);
    const satellite = new THREE.Group();
    orbit.add(satellite);
    block(satellite, steel, [0, 0, 0], [0.11, 0.1, 0.1]);
    block(satellite, blueGlass, [-0.16, 0, 0], [0.17, 0.012, 0.15]);
    block(satellite, blueGlass, [0.16, 0, 0], [0.17, 0.012, 0.15]);
    mesh(satellite, ball, dataLight, [0, 0.08, 0], [0.025, 0.025, 0.025]);
    orbiters.push({ node: satellite, radius, phase: 0.6 + i * 2.9 });
  }

  // Manufacturing: copper jackets, pressure vessels, pipe collars and connecting manifolds.
  const factory = planets[1].globe;
  for (const latitude of [-0.46, 0.15, 0.52]) {
    const band = ring(factory, RADIUS * Math.sqrt(1 - latitude * latitude) + 0.025, 0.028, copper);
    band.rotation.x = Math.PI / 2;
    band.position.y = latitude * RADIUS;
  }
  [[-0.44, 0.43], [0.24, 0.59], [0.46, -0.12], [-0.23, -0.42]].forEach(([x, y], index) => {
    const site = mount(factory, x, y);
    block(site, slate, [0, 0.035, 0], [0.63, 0.07, 0.42]);
    for (let i = 0; i < 3; i += 1) {
      const height = 0.34 + (i === 1 ? 0.28 : 0.04 * index);
      const px = (i - 1) * 0.19;
      mesh(site, cylinder, i === 1 ? copper : steel, [px, height / 2 + 0.07, 0], [0.068, height, 0.068]);
      mesh(site, ball, i === 1 ? copper : steel, [px, height + 0.07, 0], [0.068, 0.05, 0.068]);
      for (const level of [0.16, 0.32]) {
        const collar = ring(site, 0.074, 0.009, slate);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(px, level, 0);
      }
      block(site, warmLight, [px, height + 0.1, 0.02], [0.023, 0.018, 0.025]);
    }
    block(site, steel, [0, 0.24, 0.17], [0.6, 0.025, 0.08]);
    pipe(site, [new THREE.Vector3(-0.22, 0.07, 0.17), new THREE.Vector3(-0.22, 0.39, 0.17),
      new THREE.Vector3(0.22, 0.39, 0.17), new THREE.Vector3(0.22, 0.12, 0.17)], 0.022, copper);
  });

  // Campus: limestone teaching buildings and porticos, a lake, paths and planted groves.
  const campus = planets[2].globe;
  [[-0.38, 0.51], [0.34, 0.33], [-0.22, -0.3]].forEach(([x, y], index) => {
    const site = mount(campus, x, y);
    block(site, stone, [0, 0.025, 0], [0.65, 0.05, 0.49]);
    for (const side of [-1, 1]) {
      block(site, stone, [side * 0.24, 0.14, 0], [0.16, 0.23, 0.42]);
      block(site, roof, [side * 0.24, 0.27, 0], [0.19, 0.045, 0.46]);
      for (let floor = 0; floor < 2; floor += 1) {
        block(site, blueGlass, [side * 0.24, 0.1 + floor * 0.085, 0.216], [0.12, 0.035, 0.008]);
      }
    }
    block(site, stone, [0, 0.17, -0.13], [0.38, 0.28, 0.15]);
    block(site, roof, [0, 0.33, -0.11], [0.43, 0.05, 0.2]);
    block(site, roof, [0, 0.22, 0.12], [0.32, 0.035, 0.16]);
    for (let i = 0; i < 4; i += 1) {
      mesh(site, cylinder, stone, [(i - 1.5) * 0.08, 0.13, 0.17], [0.014, 0.18, 0.014]);
    }
    if (index === 0) {
      block(site, stone, [0, 0.39, -0.12], [0.115, 0.26, 0.12]);
      block(site, roof, [0, 0.535, -0.12], [0.15, 0.035, 0.15]);
    }
  });
  const treeTrunks = new THREE.InstancedMesh(cylinder, bark, 150);
  const treeCrowns = new THREE.InstancedMesh(ball, leaves, 150);
  campus.add(treeTrunks, treeCrowns);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  let treeCount = 0;
  for (let i = 0; i < 420 && treeCount < 150; i += 1) {
    const normal = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
    const coast = Math.sin(normal.x * 3.1 + 0.5) + Math.cos(normal.y * 4.3 - 0.8) + Math.sin(normal.z * 3.7 + normal.x);
    if (coast < 0.65) continue;
    if (normal.z > 0 && [[-0.38, 0.51], [0.34, 0.33], [-0.22, -0.3]].some(([x, y]) =>
      Math.hypot(normal.x - x, normal.y - y) < 0.23)) continue;
    const height = 0.08 + random() * 0.11;
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.position.copy(normal).multiplyScalar(RADIUS + height * 0.35);
    dummy.scale.set(0.012, height, 0.012);
    dummy.updateMatrix();
    treeTrunks.setMatrixAt(treeCount, dummy.matrix);
    dummy.position.copy(normal).multiplyScalar(RADIUS + height);
    dummy.scale.set(height * 0.42, height * 0.65, height * 0.42);
    dummy.updateMatrix();
    treeCrowns.setMatrixAt(treeCount, dummy.matrix);
    treeCount += 1;
  }
  treeTrunks.count = treeCrowns.count = treeCount;
  treeTrunks.instanceMatrix.needsUpdate = treeCrowns.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < 2; i += 1) {
    pipe(campus, Array.from({ length: 24 }, (_, k) => {
      const t = k / 23;
      const x = -0.65 + t * 1.25;
      const y = 0.13 + Math.sin(t * Math.PI * 1.4 + i) * 0.22 - i * 0.48;
      return new THREE.Vector3(x, y, Math.sqrt(1 - x * x - y * y)).multiplyScalar(RADIUS * 1.006);
    }), 0.018, stone);
  }
  // The route follows the resume from the start: campus (森林系) -> manufacturing (卜蜂) -> marketing (零一).
  planets.reverse().forEach(({ root }, index) => { root.position.set(0, -viewHeight / 2, -index * SPACING); });

  const skyUniforms = { aspect: { value: 16 / 9 }, journey: { value: 0 } };
  const sky = mesh(scene, own(new THREE.PlaneGeometry(2, 2)), own(new THREE.ShaderMaterial({
    uniforms: skyUniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `
      uniform float aspect, journey;
      varying vec2 vUv;
      ${noiseGLSL}
      void main() {
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        vec3 q = vec3(p * 2.6, journey * 0.15);
        float dust = fbm(q + fbm(q * 0.7) * 2.1);
        float band = exp(-pow((p.y - p.x * 0.34 - 0.12) * 3.2, 2.0));
        float cloud = smoothstep(0.35, 0.79, dust) * band;
        float left = 1.0 - smoothstep(0.36, 0.82, vUv.x);
        vec3 colour = vec3(0.0012, 0.0025, 0.006);
        colour += mix(vec3(0.008, 0.015, 0.035), vec3(0.026, 0.023, 0.055), dust) * cloud * left;
        colour += vec3(0.005, 0.016, 0.023) * pow(dust, 3.0) * left;
        colour *= 0.8 + 0.2 * smoothstep(0.1, 0.8, vUv.y);
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })));
  sky.frustumCulled = false;
  sky.renderOrder = -100;

  // World-space star depths create real parallax as the camera moves down the route.
  const starCount = 1600;
  const positions = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const colors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    positions.set([(random() - 0.5) * 160, (random() - 0.5) * 100, 12 - random() * 270], i * 3);
    sizes[i] = 0.45 + random() ** 5 * 2.0;
    const warm = random();
    colors.set(warm > 0.85 ? [0.8, 0.65, 0.45] : [0.48 + warm * 0.3, 0.65 + warm * 0.2, 0.9], i * 3);
  }
  const starsGeometry = own(new THREE.BufferGeometry());
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const starUniforms = { height: { value: 900 }, journey: { value: 0 } };
  const stars = new THREE.Points(starsGeometry, own(new THREE.ShaderMaterial({
    uniforms: starUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float height, journey;
      attribute float size;
      attribute vec3 color;
      varying vec3 vColour;
      varying float vAlpha;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(size * 230.0 / max(1.0, -view.z), 0.65, 2.6) * clamp(height / 800.0, 0.7, 1.5);
        vAlpha = (0.45 + 0.15 * sin(size * 19.0 + journey * 2.0))
          * smoothstep(0.5, 4.0, -view.z) * (1.0 - smoothstep(180.0, 290.0, -view.z));
        vColour = color;
      }
    `,
    fragmentShader: `
      varying vec3 vColour;
      varying float vAlpha;
      void main() {
        float glow = 1.0 - smoothstep(0.05, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vColour, glow * vAlpha);
        #include <colorspace_fragment>
      }
    `,
  })));
  scene.add(stars);

  const streakCount = 240;
  const streakPositions = new Float32Array(streakCount * 6);
  const ends = new Float32Array(streakCount * 2);
  for (let i = 0; i < streakCount; i += 1) {
    const angle = random() * TAU;
    const radius = 2.2 + random() * 26;
    const position = [Math.cos(angle) * radius, Math.sin(angle) * radius, random() * 80];
    streakPositions.set(position, i * 6);
    streakPositions.set(position, i * 6 + 3);
    ends.set([0, 1], i * 2);
  }
  const streakGeometry = own(new THREE.BufferGeometry());
  streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
  streakGeometry.setAttribute('end', new THREE.BufferAttribute(ends, 1));
  const streakUniforms = { journey: { value: 0 }, travel: { value: 0 } };
  const streaks = new THREE.LineSegments(streakGeometry, own(new THREE.ShaderMaterial({
    uniforms: streakUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float journey, travel;
      attribute float end;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float depth = 2.0 + mod(p.z - journey * 135.0, 80.0);
        p.z = -depth - end * (0.1 + travel * 8.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vAlpha = travel * travel * mix(0.65, 0.04, end)
          * smoothstep(2.0, 9.0, depth) * (1.0 - smoothstep(55.0, 81.0, depth));
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(0.38, 0.65, 0.9, vAlpha);
        #include <colorspace_fragment>
      }
    `,
  })));
  streaks.frustumCulled = false; // The shader wraps streaks in camera space around the view axis.
  camera.add(streaks);

  function update(nextJourney, nextTravel = 0, nextReveal = 1) {
    // Past the last stop the camera flies on until that globe has left the view (journey - index >= 0.45).
    journey = THREE.MathUtils.clamp(nextJourney, 0, 2.45);
    travel = THREE.MathUtils.clamp(nextTravel, 0, 1);
    reveal = THREE.MathUtils.clamp(nextReveal, 0, 1);
    const bend = Math.sin(journey * Math.PI);
    camera.position.set(bend * travel * 0.22, bend * travel * 0.07, DISTANCE - journey * SPACING);
    camera.rotation.set(0, 0, bend * travel * 0.012);
    planets.forEach(({ root, globe }, index) => {
      // A passed globe slides out of the bottom of the view as the camera flies over it.
      root.scale.setScalar(planetScale * reveal);
      root.visible = reveal > 0 && journey - index < 0.45;
      globe.rotation.y = (journey - index) * 0.22;
    });
    orbiters.forEach(({ node, radius, phase }) => {
      const angle = phase + journey * 1.1;
      node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      node.rotation.z = angle;
    });
    sun.position.set(-6, 8, camera.position.z + 3);
    sun.target.position.set(-2, 0, camera.position.z - DISTANCE);
    fill.position.set(7, 1, camera.position.z - 1);
    fill.target.position.copy(sun.target.position);
    skyUniforms.journey.value = starUniforms.journey.value = streakUniforms.journey.value = journey;
    streakUniforms.travel.value = travel;
    streaks.visible = travel > 0;
    camera.updateMatrixWorld(true);
  }

  function resize(width, height) {
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
    skyUniforms.aspect.value = camera.aspect;
    starUniforms.height.value = height;
    update(journey, travel, reveal);
  }

  resize(1600, 900);
  return {
    scene, camera, update, resize,
    dispose() {
      if (!live) return;
      live = false;
      treeTrunks.dispose();
      treeCrowns.dispose();
      resources.forEach((resource) => resource.dispose());
      resources.clear();
      scene.clear();
    },
  };
}
