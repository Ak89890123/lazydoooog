import {
  ClampToEdgeWrapping,
  CanvasTexture,
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  WebGLRenderer,
} from 'three';

const clamp = (min, max, value) => Math.min(max, Math.max(min, value));
const fract = (value) => value - Math.floor(value);
const power2Out = (value) => 1 - (1 - value) ** 2;
const smoothstep = (value) => value * value * (3 - 2 * value);

const ORIGINAL_WIDTH = 3;
const ORIGINAL_HEIGHT = 2;
const ORIGINAL_TEAR_WIDTH = 0.4;
const ORIGINAL_TEAR_WIDTH_RATIO = ORIGINAL_TEAR_WIDTH / ORIGINAL_WIDTH;
const CAMERA_FOV = 30;

/**
 * The CodePen bend math is applied to two full-size sheets. Each row rotates
 * around the configured seam, while the fragment shader performs the actual
 * diagonal cut. The source image geometry therefore remains unstretched.
 */
export const ripVertexShader = `
	uniform float uTearAmount;
	uniform float uTearXAngle;
	uniform float uTearYAngle;
	uniform float uTearZAngle;
	uniform float uTearXOffset;
	uniform float uSeamTopX;
	uniform float uSeamBottomX;

	varying vec2 vUv;
	varying float vAmount;

	mat4 rotationX( in float angle ) {
		return mat4(	1.0,		0,			0,			0,
						0, 	cos(angle),	-sin(angle),		0,
						0, 	sin(angle),	 cos(angle),		0,
						0, 			0,			  0, 		1);
	}

	mat4 rotationY( in float angle ) {
		return mat4(	cos(angle),		0,		sin(angle),	0,
								0,		1.0,			 0,	0,
						-sin(angle),	0,		cos(angle),	0,
								0, 		0,				0,	1);
	}

	mat4 rotationZ( in float angle ) {
		return mat4(	cos(angle),		-sin(angle),	0,	0,
						sin(angle),		cos(angle),		0,	0,
								0,				0,		1,	0,
								0,				0,		0,	1);
	}

	void main(){

		float yAmount = max(0.0, (uTearAmount - (1.0 - uv.y)));
		float zRotate = uTearZAngle * yAmount;
		float xRotate = uTearXAngle * yAmount;
		float yRotate = uTearYAngle * yAmount;
		vec3 rotation = vec3(xRotate * yAmount, yRotate * yAmount, zRotate * yAmount);


		float seamX = mix(uSeamBottomX, uSeamTopX, uv.y);
		float seamWorldX = (seamX - 0.5) * float(FULL_WIDTH);
		vec4 vertex = vec4(position.x - seamWorldX, position.y, position.z, 1.0);

		vertex = vertex * rotationY(rotation.y) * rotationX(rotation.x) * rotationZ(rotation.z);
		vertex.x += seamWorldX + uTearXOffset * yAmount;

		vec4 modelPosition = modelMatrix * vertex;
		vec4 viewPosition = viewMatrix * modelPosition;
		vec4 projectedPosition = projectionMatrix * viewPosition;

		gl_Position = projectedPosition;

		vUv = uv;
		vAmount = yAmount;
	}
`;

/**
 * Both sheets sample the full, unchanged Hero frame. The photographed rip
 * texture clips pixels around a top-to-bottom seam; it never pulls the photo
 * mesh sideways. Depth tint remains limited to the torn edge.
 */
export const ripFragmentShader = `
	uniform sampler2D uMap;
	uniform sampler2D uRip;
	uniform sampler2D uBorder;

	uniform vec3 uShadeColor;
	uniform float uRipSide;
	uniform float uShadeAmount;
	uniform float uTearWidthRatio;
	uniform float uSeamTopX;
	uniform float uSeamBottomX;
	uniform float uWhiteThreshold;
	uniform float uTearOffset;

	varying vec2 vUv;
	varying float vAmount;

	void main () {

		bool rightSide = uRipSide == 1.0;
		vec4 textureColor = texture2D(uMap, vUv);
		vec4 borderColor = texture2D(uBorder, vUv);
		if(borderColor.r > 0.0) textureColor = vec4(vec3(0.95), 1.0);

		float alpha = 1.0;
		float seamX = mix(uSeamBottomX, uSeamTopX, vUv.y);
		float ripStart = seamX - uTearWidthRatio * 0.5;
		float ripX = (vUv.x - ripStart) / uTearWidthRatio;
		float ripY = vUv.y * 0.5 + (0.5 * uTearOffset);
		vec4 ripCut = texture2D(uRip, vec2(ripX, ripY));
		vec4 ripColor = texture2D(uRip, vec2(ripX * 0.9, ripY - 0.02));

		float whiteness = dot(vec4(1.0), ripCut) / 4.0;

		if (vAmount > 0.0001) {
			if (!rightSide && whiteness <= uWhiteThreshold)
			{
				whiteness = dot(vec4(1.0), ripColor) / 4.0;
				if(whiteness >= uWhiteThreshold) textureColor = ripColor;
				else alpha = 0.0;
			}
			if (rightSide && whiteness >= uWhiteThreshold) alpha = 0.0;
		}

		if (alpha <= 0.0) discard;

		float tearShadeMask = 1.0 - smoothstep(0.04, 0.26, abs(ripX - 0.5));
		float shadeMix = vAmount * uShadeAmount * tearShadeMask * 0.35;
		gl_FragColor = mix(vec4(textureColor.rgb, alpha), vec4(uShadeColor, alpha), shadeMix);
		#include <colorspace_fragment>
	}
`;

export const normalizeTearConfig = (config = {}) => {
  const seamX = clamp(0.22, 0.78, Number.isFinite(config.seamX) ? config.seamX : 0.5);

  return {
    seamX,
    seamTopX: clamp(
      0.22,
      0.78,
      Number.isFinite(config.seamTopX) ? config.seamTopX : seamX,
    ),
    seamBottomX: clamp(
      0.22,
      0.78,
      Number.isFinite(config.seamBottomX) ? config.seamBottomX : seamX,
    ),
    tearWidthRatio: clamp(
      0.06,
      0.2,
      Number.isFinite(config.tearWidthRatio)
        ? config.tearWidthRatio
        : ORIGINAL_TEAR_WIDTH_RATIO,
    ),
    ripWhiteThreshold: clamp(
      0.5,
      0.86,
      Number.isFinite(config.ripWhiteThreshold) ? config.ripWhiteThreshold : 0.7,
    ),
    tearOffset: clamp(
      0,
      1,
      Number.isFinite(config.tearOffset)
        ? config.tearOffset
        : fract((Number.isFinite(config.seed) ? config.seed : 4.731) * 0.173),
    ),
    seed: Number.isFinite(config.seed) ? config.seed : 4.731,
    releaseAt: clamp(0.5, 0.9, Number.isFinite(config.releaseAt) ? config.releaseAt : 0.72),
    tearReleaseAmount: clamp(
      1.02,
      1.35,
      Number.isFinite(config.tearReleaseAmount) ? config.tearReleaseAmount : 1.15,
    ),
    tearEndAmount: clamp(
      1.5,
      3,
      Number.isFinite(config.tearEndAmount) ? config.tearEndAmount : 2.25,
    ),
    releaseDistanceScale: clamp(
      0.4,
      1.2,
      Number.isFinite(config.releaseDistanceScale) ? config.releaseDistanceScale : 1,
    ),
    releaseRotationScale: clamp(
      0.3,
      1.2,
      Number.isFinite(config.releaseRotationScale) ? config.releaseRotationScale : 1,
    ),
    ripTexture: config.ripTexture || '/assets/textures/codepen-rip.jpg',
    pixelRatioCap: clamp(1, 2, Number.isFinite(config.pixelRatioCap) ? config.pixelRatioCap : 1.5),
  };
};

export const createSheetSettings = (textureAspect = 1.5, config = {}) => {
  const normalized = normalizeTearConfig(config);
  const safeAspect = clamp(0.5, 3, Number.isFinite(textureAspect) ? textureAspect : 1.5);
  const height = ORIGINAL_HEIGHT;
  const width = height * safeAspect;
  const tearWidth = width * normalized.tearWidthRatio;

  return {
    widthSegments: 30,
    heightSegments: 50,
    tearOffset: normalized.tearOffset,
    width,
    height,
    tearAmount: 0,
    tearWidth,
    seamTopX: normalized.seamTopX,
    seamBottomX: normalized.seamBottomX,
    tearWidthRatio: normalized.tearWidthRatio,
    ripWhiteThreshold: normalized.ripWhiteThreshold,
    releaseAt: normalized.releaseAt,
    tearReleaseAmount: normalized.tearReleaseAmount,
    tearEndAmount: normalized.tearEndAmount,
    releaseDistanceScale: normalized.releaseDistanceScale,
    releaseRotationScale: normalized.releaseRotationScale,
    seed: normalized.seed,
    groupX: 0,
    left: {
      width,
      ripSide: 0,
      tearXAngle: -0.01,
      tearYAngle: -0.1,
      tearZAngle: 0.05,
      tearXOffset: 0,
      shadeColor: new Color('white'),
      shadeAmount: 0,
    },
    right: {
      width,
      ripSide: 1,
      tearXAngle: 0.2,
      tearYAngle: 0.1,
      tearZAngle: -0.1,
      tearXOffset: 0,
      shadeColor: new Color('black'),
      shadeAmount: 0.4,
    },
  };
};

export const mapTearProgress = (value, settings = normalizeTearConfig()) => {
  const progress = clamp(0, 1, Number.isFinite(value) ? value : 0);
  const releaseAt = clamp(0.5, 0.9, settings.releaseAt ?? 0.72);
  const tearReleaseAmount = settings.tearReleaseAmount ?? 1.15;
  const tearEndAmount = Math.max(tearReleaseAmount, settings.tearEndAmount ?? 2.25);

  if (progress <= releaseAt) {
    return {
      progress,
      release: 0,
      fall: 0,
      tearAmount: (progress / releaseAt) * tearReleaseAmount,
    };
  }

  const release = (progress - releaseAt) / (1 - releaseAt);
  return {
    progress,
    release,
    fall: smoothstep(release),
    tearAmount: tearReleaseAmount
      + (tearEndAmount - tearReleaseAmount) * power2Out(release),
  };
};

const seededRandom = (seed, salt) => fract(Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453123);

export const createReleaseTargets = (
  seed,
  distanceScale = 1,
  rotationScale = 1,
) => ({
  groupZ: distanceScale,
  left: {
    x: -(2 + seededRandom(seed, 1.1) * 3) * 0.5 * distanceScale,
    y: (-3 - seededRandom(seed, 2.2) * 3) * distanceScale,
    zRotation: (2 + seededRandom(seed, 3.3) * 3) * 0.5 * rotationScale,
  },
  right: {
    x: (2 + seededRandom(seed, 4.4) * 3) * 0.5 * distanceScale,
    y: (-3 - seededRandom(seed, 5.5) * 3) * distanceScale,
    zRotation: -(2 + seededRandom(seed, 6.6) * 3) * 0.5 * rotationScale,
  },
});

const createNeutralBorderTexture = () => {
  // The CodePen border map creates a white photo frame. The user explicitly
  // rejected that frame, so the original uBorder contract receives black.
  const texture = new DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const loadTexture = async (url, colorSpace) => {
  const texture = await new TextureLoader().loadAsync(url);
  texture.colorSpace = colorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = colorSpace === SRGBColorSpace
    ? LinearMipmapLinearFilter
    : LinearFilter;
  texture.magFilter = LinearFilter;
  if (colorSpace === NoColorSpace) texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const imageDimensions = (image) => ({
  width: image?.naturalWidth || image?.videoWidth || image?.width || 16,
  height: image?.naturalHeight || image?.videoHeight || image?.height || 9,
});

const drawContainedFrame = ({ canvas, image, width, height, pixelRatioCap }) => {
  const cappedRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
  const maxTextureSide = 2048;
  const requestedWidth = Math.max(1, Math.round(width * cappedRatio));
  const requestedHeight = Math.max(1, Math.round(height * cappedRatio));
  const textureScale = Math.min(
    1,
    maxTextureSide / requestedWidth,
    maxTextureSide / requestedHeight,
  );
  const outputWidth = Math.max(1, Math.round(requestedWidth * textureScale));
  const outputHeight = Math.max(1, Math.round(requestedHeight * textureScale));

  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;

  const context = canvas.getContext('2d', { alpha: false });
  const source = imageDimensions(image);
  const containScale = Math.min(outputWidth / source.width, outputHeight / source.height);
  const drawWidth = source.width * containScale;
  const drawHeight = source.height * containScale;
  const drawX = (outputWidth - drawWidth) * 0.5;
  const drawY = (outputHeight - drawHeight) * 0.5;

  context.fillStyle = '#000';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
};

export class Photo {
  constructor(textures, destroyCallback = () => {}, sheetSettings) {
    this.destroyCallback = destroyCallback;
    this.photoTexture = textures.photo;
    this.borderTexture = textures.border;
    this.ripTexture = textures.rip;
    this.interactive = false;
    this.sheetSettings = sheetSettings;
    this.releaseTargets = createReleaseTargets(
      sheetSettings.seed,
      sheetSettings.releaseDistanceScale,
      sheetSettings.releaseRotationScale,
    );
    this.group = new Group();
    this.group.rotation.z = 0;
    this.group.position.y = 0;
    this.group.position.x = sheetSettings.groupX;

    this.sides = [
      { id: 'left', mesh: null, material: null, geometry: null },
      { id: 'right', mesh: null, material: null, geometry: null },
    ];

    this.sides.forEach((side) => {
      const sideSettings = this.sheetSettings[side.id];
      side.geometry = new PlaneGeometry(
        this.sheetSettings.width,
        this.sheetSettings.height,
        this.sheetSettings.widthSegments,
        this.sheetSettings.heightSegments,
      );
      side.material = this.getRipMaterial(side.id);
      side.mesh = new Mesh(side.geometry, side.material);

      if (sideSettings.tearXAngle > 0) side.mesh.position.z += 0.0001;
      this.group.add(side.mesh);
    });
  }

  getRipMaterial(side) {
    const sideSettings = this.sheetSettings[side];
    return new ShaderMaterial({
      defines: {
        HEIGHT: this.sheetSettings.height.toFixed(8),
        FULL_WIDTH: this.sheetSettings.width.toFixed(8),
        HEIGHT_SEGMENTS: this.sheetSettings.heightSegments,
        WIDTH_SEGMENTS: this.sheetSettings.widthSegments,
      },
      uniforms: {
        uMap: { value: this.photoTexture },
        uRip: { value: this.ripTexture },
        uBorder: { value: this.borderTexture },
        uRipSide: { value: sideSettings.ripSide },
        uSeamTopX: { value: this.sheetSettings.seamTopX },
        uSeamBottomX: { value: this.sheetSettings.seamBottomX },
        uTearWidthRatio: { value: this.sheetSettings.tearWidthRatio },
        uWhiteThreshold: { value: this.sheetSettings.ripWhiteThreshold },
        uTearAmount: { value: this.sheetSettings.tearAmount },
        uTearOffset: { value: this.sheetSettings.tearOffset },
        uTearXAngle: { value: sideSettings.tearXAngle },
        uTearYAngle: { value: sideSettings.tearYAngle },
        uTearZAngle: { value: sideSettings.tearZAngle },
        uTearXOffset: { value: sideSettings.tearXOffset },
        uShadeColor: { value: sideSettings.shadeColor },
        uShadeAmount: { value: sideSettings.shadeAmount },
      },
      transparent: true,
      vertexShader: ripVertexShader,
      fragmentShader: ripFragmentShader,
      toneMapped: false,
    });
  }

  updateUniforms() {
    this.sides.forEach((side) => {
      const uniforms = side.mesh.material.uniforms;
      const sideSettings = this.sheetSettings[side.id];

      uniforms.uTearAmount.value = this.sheetSettings.tearAmount;
      uniforms.uTearOffset.value = this.sheetSettings.tearOffset;
      uniforms.uSeamTopX.value = this.sheetSettings.seamTopX;
      uniforms.uSeamBottomX.value = this.sheetSettings.seamBottomX;
      uniforms.uTearWidthRatio.value = this.sheetSettings.tearWidthRatio;
      uniforms.uTearXAngle.value = sideSettings.tearXAngle;
      uniforms.uTearYAngle.value = sideSettings.tearYAngle;
      uniforms.uTearZAngle.value = sideSettings.tearZAngle;
      uniforms.uTearXOffset.value = sideSettings.tearXOffset;
      uniforms.uShadeColor.value = sideSettings.shadeColor;
      uniforms.uShadeAmount.value = sideSettings.shadeAmount;
      uniforms.uWhiteThreshold.value = this.sheetSettings.ripWhiteThreshold;
    });
  }

  setProgress(value) {
    const state = mapTearProgress(value, this.sheetSettings);
    this.sheetSettings.tearAmount = state.tearAmount;
    this.group.position.z = this.releaseTargets.groupZ * state.fall;

    this.sides.forEach((side) => {
      const target = this.releaseTargets[side.id];
      const baseZ = this.sheetSettings[side.id].tearXAngle > 0 ? 0.0001 : 0;
      side.mesh.position.set(target.x * state.fall, target.y * state.fall, baseZ);
      side.mesh.rotation.z = target.zRotation * state.fall;
    });

    this.updateUniforms();
    return state;
  }

  setViewportFit(scaleX, scaleY) {
    this.group.scale.set(scaleX, scaleY, Math.min(scaleX, scaleY));
    this.group.position.x = this.sheetSettings.groupX * scaleX;
  }

  reset() {
    this.setProgress(0);
  }

  destroyMe() {
    this.sides.forEach((side) => {
      side.geometry.dispose();
      side.material.dispose();
      this.group.remove(side.mesh);
    });
    this.destroyCallback();
  }
}

export const createPaperTearTransition = async ({ canvas, imageUrl, config = {} }) => {
  if (typeof HTMLCanvasElement === 'undefined' || !(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError('Paper tear transition requires a canvas element');
  }
  if (!imageUrl) throw new TypeError('Paper tear transition requires a final-frame image');

  const normalized = normalizeTearConfig(config);
  const [sourceFrameTexture, ripTexture] = await Promise.all([
    loadTexture(imageUrl, SRGBColorSpace),
    loadTexture(normalized.ripTexture, NoColorSpace),
  ]);
  const parent = canvas.parentElement;
  const initialWidth = Math.max(1, parent?.clientWidth || canvas.clientWidth || window.innerWidth);
  const initialHeight = Math.max(1, parent?.clientHeight || canvas.clientHeight || window.innerHeight);
  const paperSurface = document.createElement('canvas');
  drawContainedFrame({
    canvas: paperSurface,
    image: sourceFrameTexture.image,
    width: initialWidth,
    height: initialHeight,
    pixelRatioCap: normalized.pixelRatioCap,
  });
  const photoTexture = new CanvasTexture(paperSurface);
  photoTexture.colorSpace = SRGBColorSpace;
  photoTexture.minFilter = LinearFilter;
  photoTexture.magFilter = LinearFilter;
  photoTexture.generateMipmaps = false;
  photoTexture.needsUpdate = true;
  const borderTexture = createNeutralBorderTexture();
  const sheetSettings = createSheetSettings(initialWidth / initialHeight, normalized);
  const photo = new Photo(
    { photo: photoTexture, rip: ripTexture, border: borderTexture },
    () => {},
    sheetSettings,
  );

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: window.devicePixelRatio === 1,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 16 / 9, 0.1, 100);
  camera.position.z = sheetSettings.height
    / (2 * Math.tan((CAMERA_FOV * Math.PI) / 360));
  scene.add(camera, photo.group);

  let currentProgress = 0;
  let renderFrame = 0;
  let destroyed = false;
  let textureWidth = 0;
  let textureHeight = 0;

  const render = () => {
    renderFrame = 0;
    if (!destroyed) renderer.render(scene, camera);
  };

  const requestRender = () => {
    if (!renderFrame && !destroyed) renderFrame = requestAnimationFrame(render);
  };

  const resize = () => {
    if (destroyed) return;
    const width = Math.max(1, parent?.clientWidth || canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, parent?.clientHeight || canvas.clientHeight || window.innerHeight);
    const viewportAspect = width / height;

    if (width !== textureWidth || height !== textureHeight) {
      textureWidth = width;
      textureHeight = height;
      drawContainedFrame({
        canvas: paperSurface,
        image: sourceFrameTexture.image,
        width,
        height,
        pixelRatioCap: normalized.pixelRatioCap,
      });
      photoTexture.needsUpdate = true;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, normalized.pixelRatioCap));
    renderer.setSize(width, height, false);
    camera.aspect = viewportAspect;
    camera.updateProjectionMatrix();

    const verticalFrustum = 2 * Math.tan((CAMERA_FOV * Math.PI) / 360) * camera.position.z;
    const horizontalFrustum = verticalFrustum * viewportAspect;
    photo.setViewportFit(
      horizontalFrustum / sheetSettings.width,
      verticalFrustum / sheetSettings.height,
    );
    requestRender();
  };

  const setProgress = (value) => {
    currentProgress = clamp(0, 1, Number.isFinite(value) ? value : 0);
    photo.setProgress(currentProgress);
    requestRender();
  };

  const onContextLost = (event) => event.preventDefault();
  const onContextRestored = () => {
    resize();
    setProgress(currentProgress);
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(resize)
    : null;
  if (resizeObserver && canvas.parentElement) resizeObserver.observe(canvas.parentElement);
  else window.addEventListener('resize', resize, { passive: true });

  resize();
  setProgress(0);

  return {
    get progress() {
      return currentProgress;
    },
    setProgress,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (renderFrame) cancelAnimationFrame(renderFrame);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      scene.remove(photo.group);
      photo.destroyMe();
      sourceFrameTexture.dispose();
      photoTexture.dispose();
      ripTexture.dispose();
      borderTexture.dispose();
      renderer.dispose();
    },
  };
};
