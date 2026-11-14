// Screen-space atmosphere: the street bends through tinyPlanet, the distant sky does not. Marching the
// clouds is nearly all of its cost, yet they drift only a pixel or two a second, so they march into
// their own half-size target CLOUD_RATE times a second; stars, moon and meteors stay full size each frame.
const CLOUD_RATE = 12;
// prepare(texture, image) puts the decoded moon into its texture; the runner does that with the upload in idle time.
export function createRunnerSky(THREE, config, onReady, prepare = (texture, image) => Object.assign(texture, { image, needsUpdate: true })) {
  const noiseSize = 64;
  const data = new Uint8Array(noiseSize ** 3);
  let seed = 731;
  for (let i = 0; i < data.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  const noise = new THREE.Data3DTexture(data, noiseSize, noiseSize, noiseSize);
  noise.format = THREE.RedFormat;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.needsUpdate = true;
  let live = true;
  let lastTime, lastCloud;
  // Decoded off the main thread (flipped there, as the texture loader's upload would); drawn once prepared.
  const moon = new THREE.Texture();
  moon.flipY = false;
  new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' }).load(config.moonMap, async (image) => {
    await prepare(moon, image);
    if (!live) return;
    uniforms.moonReady.value = true;
    lastTime = undefined;
    onReady();
  }, undefined, error => console.warn('Runner moon unavailable', error));
  moon.colorSpace = THREE.SRGBColorSpace;
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const clouds = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType }); // rgb light, a transmittance
  const uniforms = {
    noiseMap: { value: noise }, moonMap: { value: moon }, moonReady: { value: false },
    size: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, cloudTime: { value: 0 }, cloudMap: { value: clouds.texture },
    moonAt: { value: new THREE.Vector2(...config.moonPosition) }, moonRadius: { value: config.moonRadius },
    coverage: { value: config.cloudCoverage }, density: { value: config.cloudDensity },
    wind: { value: new THREE.Vector2(...config.wind) }, meteorInterval: { value: config.meteorInterval },
  };
  const head = `
      precision highp sampler3D;
      uniform sampler3D noiseMap;
      uniform sampler2D moonMap, cloudMap;
      uniform bool moonReady;
      uniform vec2 size, moonAt, wind;
      uniform float time, cloudTime, moonRadius, coverage, density, meteorInterval;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float fbm(vec3 p) {
        return texture(noiseMap, p / 64.0).r * 0.53
          + texture(noiseMap, (p * 2.03 + 17.1) / 64.0).r * 0.27
          + texture(noiseMap, (p * 4.11 + 31.7) / 64.0).r * 0.13
          + texture(noiseMap, (p * 8.23 + 11.3) / 64.0).r * 0.07;
      }
      float cloud(vec3 p) {
        vec3 q = p * vec3(2.0, 2.5, 2.0) + vec3(cloudTime * wind.x, 7.3, cloudTime * wind.y);
        float shape = fbm(q + fbm(q * 0.24) * 3.0);
        shape += (fbm(q * 0.35) - 0.5) * 0.4;
        float profile = smoothstep(1.8, 2.3, p.y) * (1.0 - smoothstep(3.0, 3.6, p.y));
        return smoothstep(coverage, coverage + 0.18, shape) * profile * density;
      }
      float stars(vec2 p, float scale) {
        vec2 grid = p * scale, cell = floor(grid);
        float seed = hash(cell);
        vec2 at = vec2(hash(cell + 7.1), hash(cell + 13.3));
        float d = length(fract(grid) - at);
        float radius = mix(0.025, 0.085, pow(seed, 12.0));
        float point = 1.0 - smoothstep(0.0, radius, d);
        return point * step(0.91, seed) * (0.72 + 0.28 * sin(time * 0.65 + seed * 90.0));
      }
    `;
  // Both passes share the view: p in viewport heights from the bottom centre, radius in moon radii.
  const view = `
        float aspect = size.x / size.y;
        vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y);
        vec2 moonCentre = vec2((moonAt.x - 0.5) * aspect, 1.0 - moonAt.y);
        vec2 m = (p - moonCentre) / moonRadius;
        float radius = length(m);
    `;
  const pass = (fragmentShader) => new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, fragmentShader,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  });
  const cloudMaterial = pass(`${head}
      void main() {
        ${view}
        // March a real cloud slab; sunward density supplies soft self-shadowing and silver edges.
        vec3 ray = normalize(vec3(p.x * 1.25, 1.0, (vUv.y - 0.5) * 1.25));
        vec3 lightDir = normalize(vec3(-0.6, 0.8, 0.2));
        float stepLength = 1.8 / (ray.y * 14.0);
        float t = 1.8 / ray.y + stepLength * 0.5;
        float transmittance = 1.0;
        vec3 clouds = vec3(0.0);
        for (int i = 0; i < 14; i++) {
          vec3 sampleAt = ray * t + vec3(1.7, 0.0, 4.1);
          float d = cloud(sampleAt);
          float shadow = cloud(sampleAt + lightDir * 0.35) + cloud(sampleAt + lightDir * 0.85) * 0.6;
          float illumination = exp(-shadow * 1.8);
          vec3 lit = mix(vec3(0.013, 0.024, 0.032), vec3(0.13, 0.18, 0.21), illumination);
          lit += vec3(0.055, 0.072, 0.09) * exp(-radius * 0.24) * illumination;
          float opacity = 1.0 - exp(-d * stepLength * 2.2);
          clouds += transmittance * opacity * lit;
          transmittance *= 1.0 - opacity;
          t += stepLength;
        }
        gl_FragColor = vec4(clouds, transmittance);
      }`);
  const material = pass(`${head}
      void main() {
        ${view}
        vec3 colour = mix(vec3(0.024, 0.040, 0.049), vec3(0.0035, 0.009, 0.018), smoothstep(0.08, 1.0, vUv.y));
        colour += vec3(0.020, 0.028, 0.033) * exp(-radius * 0.28);
        colour += vec3(0.10, 0.13, 0.16) * exp(-radius * 1.8) * 0.18;
        float starlight = stars(p, 115.0) * 0.36 + stars(p + 19.3, 67.0) * 0.15;
        colour += vec3(0.65, 0.78, 1.0) * starlight * smoothstep(0.1, 0.45, vUv.y);
        if (radius < 1.0 && moonReady) {
          vec3 n = vec3(m, sqrt(1.0 - dot(m, m)));
          vec2 uv = vec2(0.5 + atan(n.x, n.z) / 6.2831853, 0.5 + asin(n.y) / 3.14159265);
          vec3 albedo = texture2D(moonMap, uv).rgb;
          float light = smoothstep(-0.06, 0.23, dot(n, normalize(vec3(-0.42, 0.18, 0.89))));
          vec3 surface = albedo * (0.08 + 2.4 * light) * (0.65 + 0.35 * n.z);
          colour = mix(colour, surface, 1.0 - smoothstep(0.975, 1.0, radius));
        }
        // One brief, tapered streak per interval, alternating its origin deterministically.
        float cycle = floor(time / meteorInterval);
        float age = mod(time, meteorInterval) - 3.0;
        vec2 origin = vec2(mix(-0.50, 0.38, hash(vec2(cycle, 8.0))) * aspect, 0.88);
        vec2 direction = normalize(vec2(1.0, -0.48));
        vec2 head = origin + direction * age * 0.48;
        vec2 delta = p - head;
        float along = -dot(delta, direction), across = abs(delta.x * direction.y - delta.y * direction.x);
        float tail = exp(-across * across / 0.0000007) * (1.0 - smoothstep(0.0, 0.23, along)) * step(0.0, along);
        float core = exp(-dot(delta, delta) / 0.000004);
        float flash = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.65, 1.05, age));
        colour += vec3(0.65, 0.83, 1.0) * (tail * 0.7 + core) * flash;
        vec4 sky = texture2D(cloudMap, vUv);
        colour = colour * sky.a + sky.rgb;
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }`);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const cloudQuad = new THREE.Mesh(quad.geometry, cloudMaterial);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    texture: target.texture,
    // Start compiling both passes while the street loads (the cloud march is a large shader); the caller waits.
    compile(renderer) {
      renderer.setRenderTarget(target);
      const materials = [quad, cloudQuad].flatMap((mesh) => [...renderer.compile(mesh, camera)]);
      renderer.setRenderTarget(null);
      return materials;
    },
    resize(width, height) {
      lastTime = lastCloud = undefined;
      uniforms.size.value.set(width, height);
      const scale = Math.min(1, 1920 / width);
      const [w, h] = [Math.round(width * scale), Math.round(height * scale)];
      target.setSize(w, h);
      clouds.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    },
    render(renderer, time) {
      if (lastTime === time) return;
      lastTime = time;
      uniforms.time.value = time;
      const cloudTime = Math.floor(time * CLOUD_RATE) / CLOUD_RATE;
      if (cloudTime !== lastCloud) {
        lastCloud = uniforms.cloudTime.value = cloudTime;
        renderer.setRenderTarget(clouds);
        renderer.render(cloudQuad, camera);
      }
      renderer.setRenderTarget(target);
      renderer.render(quad, camera);
      renderer.setRenderTarget(null);
    },
    dispose() {
      live = false;
      noise.dispose(); moon.dispose(); target.dispose(); clouds.dispose(); quad.geometry.dispose(); material.dispose(); cloudMaterial.dispose();
    },
  };
}
