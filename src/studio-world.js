import {
  ACESFilmicToneMapping, AmbientLight, Box3, CatmullRomCurve3,
  CircleGeometry, Color, CylinderGeometry, DirectionalLight, Group, MathUtils,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, Scene, SRGBColorSpace, TextureLoader, TorusGeometry, TubeGeometry,
  Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** One renderer changes hosts. Scroll owns composition; pointer adds a small yaw.
 * No perpetual rendering: redraw only after state, texture, pointer, or size changes.
 */
export async function createStudioWorld(config) {
  const hosts = Object.fromEntries(['hero', 'about', 'contact'].map((id) => [id, document.querySelector(`[data-world-${id}]`)]));
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, config.pixelRatioCap));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new Scene();
  const screenRenderer = new CSS3DRenderer();
  screenRenderer.domElement.className = 'world-screen-layer';
  const consoleRoot = document.querySelector('.about-console');
  const consoleElements = [...consoleRoot.querySelectorAll('[data-console-screen]')];
  const consoleStyles = consoleElements.map((element) => element.getAttribute('style'));
  let screensMounted = false;
  const camera = new PerspectiveCamera(36, 1, 0.1, 80);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new AmbientLight(0xe4ecdf, 0.8));
  const key = new DirectionalLight(0xf1ffdc, 3);
  key.position.set(-4, 8, 5);
  scene.add(key);
  const rim = new DirectionalLight(0x83acff, 2);
  rim.position.set(5, 3, -4);
  scene.add(rim);

  const workshop = new Group();
  const phoneGroup = new Group();
  scene.add(workshop, phoneGroup);
  const dark = new MeshStandardMaterial({ color: 0x232a26, roughness: 0.42, metalness: 0.8 });
  const rubber = new MeshStandardMaterial({ color: 0x111511, roughness: 0.9, metalness: 0.1 });
  const chrome = new MeshStandardMaterial({ color: 0x8d9b8f, roughness: 0.22, metalness: 0.94 });
  const lime = new MeshStandardMaterial({ color: 0xc8ff35, emissive: 0x71971a, emissiveIntensity: 0.2, roughness: 0.35, metalness: 0.4 });
  const orange = new MeshStandardMaterial({ color: 0xe86d31, roughness: 0.5, metalness: 0.5 });
  const blue = new MeshStandardMaterial({ color: 0x53a8ff, emissive: 0x1b4e81, emissiveIntensity: 0.4, roughness: 0.45, metalness: 0.25 });
  const glass = new MeshStandardMaterial({ color: 0x102018, roughness: 0.27, metalness: 0.45 });
  const add = (geometry, material, position, parent = workshop) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  const box = (size, material, position, parent) => add(new RoundedBoxGeometry(...size, 2, Math.min(...size) * 0.2), material, position, parent);
  const pipe = (points, radius, material, parent = workshop) => add(
    new TubeGeometry(new CatmullRomCurve3(points.map((point) => new Vector3(...point))), 40, radius, 8, false), material, [0, 0, 0], parent,
  );

  // A physical workbench: metal deck, machined perimeter, rails and three monitors.
  box([8.8, 0.28, 4.3], dark, [0, -0.3, 0]);
  box([8.35, 0.045, 3.85], rubber, [0, -0.135, 0]);
  box([8.82, 0.07, 0.08], chrome, [0, -0.2, 2.16]);
  box([8.82, 0.06, 0.035], lime, [0, -0.3, 2.2]);
  for (const x of [-3.8, 3.8]) for (const z of [-1.5, 1.5]) {
    add(new CylinderGeometry(0.16, 0.21, 0.55, 12), chrome, [x, -0.65, z]);
    box([0.62, 0.09, 0.65], rubber, [x, -0.95, z]);
  }
  for (let i = 0; i < 14; i += 1) box([0.04, 0.018, 3.6], dark, [-3.8 + i * 0.58, -0.105, 0]);
  const arch = pipe([[-4.05, -0.1, -1.6], [-4.05, 4.3, -1.6], [-3.6, 4.75, -1.6], [3.6, 4.75, -1.6], [4.05, 4.3, -1.6], [4.05, -0.1, -1.6]], 0.075, chrome);
  const archLight = box([6.5, 0.035, 0.12], lime, [0, 4.65, -1.5]);
  for (const x of [-3.8, 3.8]) {
    box([0.38, 0.32, 0.32], orange, [x, 0.1, -1.6]);
    box([0.035, 0.2, 0.35], chrome, [x, 0.1, -1.6]);
  }

  const monitors = [];
  for (let i = 0; i < 3; i += 1) {
    const group = new Group();
    group.position.set((i - 1) * 2.6, 2.1, -0.95);
    group.rotation.y = (1 - i) * 0.09;
    workshop.add(group);
    box([2.32, 1.65, 0.21], dark, [0, 0, 0], group);
    box([2.18, 1.48, 0.025], chrome, [0, 0, 0.115], group);
    const screen = box([2.09, 1.37, 0.03], glass.clone(), [0, 0.035, 0.14], group);
    box([0.15, 1.1, 0.18], chrome, [0, -1.1, -0.04], group);
    box([1.1, 0.055, 0.65], dark, [0, -2.18, -0.02], group);
    const lamp = box([0.055, 0.026, 0.02], lime.clone(), [0.96, -0.73, 0.145], group);
    const lines = new Group();
    group.add(lines);
    for (let n = 0; n < 4; n += 1) {
      box([n === 0 ? 1.45 : 1.1 - n * 0.13, 0.028, 0.01], n === 0 ? lime : chrome, [-0.12, 0.4 - n * 0.18, 0.168], lines);
      box([0.07, 0.07, 0.01], i === 1 ? blue : lime, [-0.83, 0.4 - n * 0.18, 0.17], lines);
    }
    monitors.push({ group, screen, lamp, lines });
  }
  pipe([[-3.55, -0.04, 0.8], [-1.5, 0.02, 1.4], [0.8, 0.03, 0.5], [3.65, 0, 1.4]], 0.026, lime);
  pipe([[-3.55, -0.07, 1], [-1.5, -0.01, 1.6], [0.8, 0, 0.7], [3.65, -0.03, 1.6]], 0.05, chrome);
  const rail = pipe([[-3.3, 0.55, 1.1], [-1.7, 0.55, 1.1], [1.7, 0.55, 1.1], [3.3, 0.55, 1.1]], 0.047, chrome);
  for (const x of [-2.8, 2.8]) box([0.07, 0.6, 0.07], chrome, [x, 0.2, 1.1]);
  const stamp = add(new TorusGeometry(1.1, 0.035, 8, 64), orange, [-3.25, 0.3, -0.9]);
  stamp.rotation.y = Math.PI / 2;

  const dogMaterial = new MeshBasicMaterial({ transparent: true, alphaTest: 0.04, depthWrite: false, toneMapped: false });
  const dog = add(new PlaneGeometry(2.35, 3.55), dogMaterial, [1.35, 1.65, 1.65]);
  dog.renderOrder = 2;
  const shadow = add(new CircleGeometry(1, 48), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }), [1.35, -0.075, 1.55]);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 0.55, 1);
  let surface = 'hero';
  let progress = 0;
  let yaw = 0;
  let pitch = 0;
  let disposed = false;
  let phoneLoaded = false;
  let phoneRequested = false;
  let phone;
  let frame = 0;
  let host = hosts.hero;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  const render = () => {
    frame = 0;
    if (disposed || document.hidden || !host || host.offsetWidth === 0) return;
    const isAbout = surface === 'about';
    workshop.visible = surface !== 'contact';
    phoneGroup.visible = surface === 'contact';
    workshop.rotation.set(isAbout ? 0 : 0.02, (isAbout ? 0 : -0.38) + yaw, isAbout ? 0 : -0.035);
    camera.fov = isAbout ? 32 : 36;
    camera.updateProjectionMatrix();
    camera.position.set(...(surface === 'contact' ? [0, 0, 8.8] : isAbout ? [0, 3.1, 8.4] : [9.2, 7.8, 13.6]));
    camera.lookAt(0, surface === 'contact' ? 0 : (isAbout ? 1.0 : 1.1) + pitch, 0);
    if (surface !== 'contact') {
      const x = isAbout ? MathUtils.lerp(-3.2, 3.2, progress) : 1.15;
      dog.position.set(x, isAbout ? 0.93 + Math.sin(progress * Math.PI * 6) ** 2 * 0.2 : 1.7, isAbout ? 1.8 : 1.65);
      dog.scale.setScalar(isAbout ? 0.7 : 1.3);
      dog.quaternion.copy(camera.quaternion);
      dog.rotateY(-workshop.rotation.y);
      shadow.position.x = x;
      rail.visible = isAbout;
      arch.visible = true;
      arch.scale.y = isAbout ? 0.78 : 1;
      archLight.position.y = isAbout ? 3.61 : 4.65;
      monitors.forEach(({ screen, lamp, lines }, i) => {
        const powered = !isAbout || progress >= config.screenUnlocks[i];
        screen.material.emissive = new Color(powered ? 0x193827 : 0x000000);
        screen.material.emissiveIntensity = powered ? 0.38 : 0;
        lamp.visible = powered;
        lines.visible = powered;
      });
    }
    if (phone) {
      phoneGroup.rotation.set(-0.07 + pitch * 0.15, -1.1 + yaw * 3, 0.12);
    }
    renderer.render(scene, camera);
    if (surface === 'about' && host === hosts.about) screenRenderer.render(scene, camera);
  };
  const requestRender = () => { if (!frame && !disposed) frame = requestAnimationFrame(render); };
  const resize = () => {
    if (disposed || !host) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    if (host === hosts.about) screenRenderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const disposeObject = (object) => object.traverse((child) => {
    child.geometry?.dispose();
    const materials = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value?.isTexture) value.dispose(); });
      material.dispose();
    });
  });
  const loadPhone = () => {
    if (phoneRequested) return;
    phoneRequested = true;
    loader.load('/assets/models/contact-iphone.glb', (gltf) => {
      if (disposed) { disposeObject(gltf.scene); return; }
      phone = gltf.scene;
      const bounds = new Box3().setFromObject(phone);
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      const scale = 4.8 / Math.max(size.x, size.y, size.z);
      phone.position.copy(center).multiplyScalar(-scale);
      phone.scale.setScalar(scale);
      phoneGroup.add(phone);
      phoneLoaded = true;
      if (surface === 'contact') host.classList.add('is-webgl');
      requestRender();
    }, undefined, () => { /* Existing phone poster remains the fallback. */ });
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  host.append(renderer.domElement);
  new TextureLoader().load(config.dogTexture, (texture) => {
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = SRGBColorSpace;
    dogMaterial.map = texture;
    dogMaterial.needsUpdate = true;
    requestRender();
    hosts.hero.classList.add('is-webgl');
  }, undefined, () => {});
  const onPointer = (event) => {
    if (!host || disposed) return;
    const rect = host.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    yaw = MathUtils.clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5) * 0.13;
    pitch = MathUtils.clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5) * 0.2;
    requestRender();
  };
  const onVisibility = () => { if (!document.hidden) requestRender(); };
  const onContextLost = (event) => {
    event.preventDefault();
    Object.values(hosts).forEach((item) => item.classList.remove('is-webgl'));
  };
  const onContextRestored = () => { if (surface !== 'contact' || phoneLoaded) host.classList.add('is-webgl'); requestRender(); };
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
  resize();

  return {
    setSurface(next, { preview = false } = {}) {
      const nextHost = preview ? hosts.hero : hosts[next];
      if (disposed || (next === surface && nextHost === host)) return;
      surface = next;
      observer.unobserve(host);
      host = nextHost;
      host.append(renderer.domElement);
      if (next === 'about' && !preview && !screensMounted) {
        screensMounted = true;
        consoleRoot.classList.add('is-projected');
        hosts.about.append(screenRenderer.domElement);
        consoleElements.forEach((element, i) => {
          element.style.width = '380px';
          element.style.height = '249px';
          const screenObject = new CSS3DObject(element);
          screenObject.position.set(0, 0.035, 0.18);
          screenObject.scale.setScalar(2.09 / 380);
          monitors[i].group.add(screenObject);
        });
      }
      observer.observe(host);
      if (next === 'contact') { loadPhone(); if (phoneLoaded) host.classList.add('is-webgl'); }
      else host.classList.add('is-webgl');
      resize();
    },
    setProgress(value) { progress = MathUtils.clamp(value, 0, 1); requestRender(); },
    resize,
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposeObject(workshop);
      disposeObject(phoneGroup);
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      consoleElements.forEach((element, i) => {
        consoleRoot.append(element);
        if (consoleStyles[i] === null) element.removeAttribute('style');
        else element.setAttribute('style', consoleStyles[i]);
      });
      consoleRoot.classList.remove('is-projected');
      screenRenderer.domElement.remove();
      Object.values(hosts).forEach((item) => item.classList.remove('is-webgl'));
    },
  };
}
