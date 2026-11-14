// The hand-built interior belongs to the broken model, not the intact facade.
export function hideShopBacking(source) {
  const material = source.clone();
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float _backing; varying float vShopBacking;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShopBacking = _backing;');
    shader.fragmentShader = 'varying float vShopBacking;\n' + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vShopBacking > 0.5) discard;');
  };
  material.customProgramCacheKey = () => 'runner-intact-storefront';
  return material;
}

// Fetch one solved compound transform instead of evaluating gravity and inverse
// matrices separately for every vertex. Each contact part moves as one rigid piece.
export function structureMaterial(source, uniforms) {
  const material = source.clone();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute float backing, contact;
      varying float vBackingVisible;
      uniform sampler2D contactTexture;
      uniform vec2 contactSize;
      vec4 contactAt(float offset) {
        float at = contact * 3.0 + offset;
        return texture2D(contactTexture, (vec2(mod(at, contactSize.x), floor(at / contactSize.x)) + 0.5) / contactSize);
      }
      vec3 rotatePart(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
      ` + shader.vertexShader.replace('void main() {', `void main() {
        vec4 destination = contactAt(0.0), origin = contactAt(1.0), spin = contactAt(2.0);
        vBackingVisible = backing * (1.0 - step(0.015, origin.w));
        vec3 relative = (modelMatrix * vec4(position, 1.0)).xyz - origin.xyz;
        vec3 contactWorld = destination.xyz + rotatePart(spin, relative * destination.w);
      `).replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        transformedNormal = mat3(viewMatrix) * rotatePart(spin, transpose(mat3(viewMatrix)) * transformedNormal);
      `).replace('#include <project_vertex>', `
        vec4 mvPosition = viewMatrix * vec4(contactWorld, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `).replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(contactWorld, 1.0);');
    shader.fragmentShader = 'varying float vBackingVisible;\n' + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vBackingVisible > 0.5) discard;');
  };
  material.customProgramCacheKey = () => 'runner-contact-structure';
  return material;
}
