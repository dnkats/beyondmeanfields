// Impostors: a tree seen from far away is a textured quad. At load time each tree type is rendered from several azimuths into
// an atlas (lit by the same fixed sun), and far cells draw one instanced quad per tree that picks the view closest to the camera.
import * as THREE from 'three';

const quadGeo = new THREE.PlaneGeometry(1, 1, 1, 1); quadGeo.translate(0, 0.5, 0);   // unit quad, base at y = 0

/**
 * Renders `parts` ([{ geometry, material }]) from `views` azimuths into one atlas row. Returns { tex, w, h, views } where w and h are
 * the model's footprint width and height in model units (used to size the quads). Colours are stored linear in a half-float
 * target, so the main pass applies tone mapping and fog to impostors exactly as to meshes.
 */
export function bakeImpostor(renderer, parts, sunDir, { views = 8, size = 256, envIntensity = 0.7 } = {}) {
  const group = new THREE.Group(); const box = new THREE.Box3();
  for (const p of parts) { const m = new THREE.Mesh(p.geometry, p.material); group.add(m); p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.04, h = box.max.y * 1.02, cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const mini = new THREE.Scene(); mini.add(group);
  const sun = new THREE.DirectionalLight(0xfff3df, 3.8); sun.position.copy(sunDir).multiplyScalar(50); mini.add(sun, sun.target);
  mini.add(new THREE.HemisphereLight(0xbcd4ff, 0x4f5a3a, 0.35), new THREE.AmbientLight(0xffffff, envIntensity * 0.9));   // stands in for the HDRI environment
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, w * 4);   // the camera sits at half height, so the image spans y = 0 … h
  const rt = new THREE.WebGLRenderTarget(size * views, size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace; rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping; rt.texture.anisotropy = 4;
  const prev = { target: renderer.getRenderTarget(), tone: renderer.toneMapping, autoClear: renderer.autoClear, shadow: renderer.shadowMap.enabled };
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = false; renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rt); renderer.clear();
  for (let v = 0; v < views; v++) {
    const a = (v / views) * Math.PI * 2;
    cam.position.set(cx + Math.sin(a) * w * 2, h / 2, cz + Math.cos(a) * w * 2); cam.lookAt(cx, h / 2, cz); cam.updateProjectionMatrix();
    // the target's own viewport and scissor are in texels; renderer.setViewport would be scaled by the pixel ratio
    rt.viewport.set(v * size, 0, size, size); rt.scissor.set(v * size, 0, size, size); rt.scissorTest = true; renderer.setRenderTarget(rt);
    renderer.render(mini, cam);
  }
  rt.scissorTest = false; rt.viewport.set(0, 0, size * views, size); rt.scissor.set(0, 0, size * views, size);
  renderer.setRenderTarget(prev.target); renderer.toneMapping = prev.tone; renderer.shadowMap.enabled = prev.shadow; renderer.setClearColor(prevClear, prevAlpha);
  return { tex: rt.texture, w, h, views, cx, cz };
}

/** Instanced, cylindrically billboarded quads. Instance matrices are the same as for the meshes (position, yaw, uniform scale). */
export function impostorMaterial(imp, fog) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tAtlas: { value: imp.tex }, uViews: { value: imp.views }, uSize: { value: new THREE.Vector2(imp.w, imp.h) }, uOffset: { value: new THREE.Vector2(imp.cx, imp.cz) },
      fogColor: { value: fog ? fog.color : new THREE.Color() }, fogNear: { value: fog ? fog.near : 1 }, fogFar: { value: fog ? fog.far : 1000 } },
    vertexShader: `
      uniform float uViews; uniform vec2 uSize, uOffset;
      varying vec2 vUv; varying float vFogDepth;
      void main() {
        // instance transform: translation, uniform scale (length of the first column), yaw θ around Y (first column = (cos θ, 0, -sin θ) · scale)
        vec3 ip = instanceMatrix[3].xyz; float sc = length(instanceMatrix[0].xyz); float c = instanceMatrix[0].x / sc, s = -instanceMatrix[0].z / sc;
        vec3 toCam = cameraPosition - ip;
        // the camera direction in model space picks the baked view (view v was rendered from model-space azimuth v · step)
        vec2 tm = vec2(toCam.x * c - toCam.z * s, toCam.x * s + toCam.z * c); float step = 6.2831853 / uViews;
        float vi = mod(floor(atan(tm.x, tm.y) / step + 0.5), uViews);
        // a vertical quad facing the camera, centred on the model's footprint centre (rotated by θ)
        vec3 right = length(toCam.xz) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(vec3(toCam.z, 0.0, -toCam.x));
        vec3 centre = ip + vec3(c * uOffset.x + s * uOffset.y, 0.0, -s * uOffset.x + c * uOffset.y) * sc;
        vec3 wp = centre + right * position.x * uSize.x * sc + vec3(0.0, position.y * uSize.y * sc, 0.0);
        vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv; vFogDepth = -mv.z;
        vUv = vec2((vi + uv.x) / uViews, uv.y);
      }`,
    fragmentShader: `
      uniform sampler2D tAtlas; uniform vec3 fogColor; uniform float fogNear, fogFar;
      varying vec2 vUv; varying float vFogDepth;
      void main() {
        vec4 c = texture2D(tAtlas, vUv); if (c.a < 0.35) discard;
        c.rgb /= max(c.a, 1e-3);   // undo the premultiplication of the mip filter so edges keep the leaf colour
        gl_FragColor = vec4(c.rgb, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float f = smoothstep(fogNear, fogFar, vFogDepth); gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, f);
      }`,
    side: THREE.DoubleSide, transparent: false,
  });
  mat.toneMapped = true;
  return mat;
}
export const impostorGeometry = quadGeo;
