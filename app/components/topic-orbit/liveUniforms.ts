import * as THREE from 'three';

// Three.js does NOT keep the object you hand to `<shaderMaterial uniforms={…}>`:
// the material ends up owning a CLONE of it. Anything written to the original
// object after mount therefore never reaches the GPU — which silently kills
// every per-frame uniform (a planet's melt, a star's stress, the debris clock)
// while leaving the scene looking perfectly fine but frozen.
//
// So: build uniforms with `makeUniforms` for the initial values, and read the
// live set back off the material with `liveUniforms` inside useFrame before
// writing to it.
export type UniformMap = Record<string, THREE.IUniform>;

export function liveUniforms(object: THREE.Mesh | THREE.Points | null, fallback: UniformMap): UniformMap {
  const material = object?.material as THREE.ShaderMaterial | undefined;
  return material?.uniforms || fallback;
}
