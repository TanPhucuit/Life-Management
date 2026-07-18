export const AURORA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vElevation;

  uniform float uTime;
  uniform float uMotion;
  uniform vec2 uPointer;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float firstWave = sin(position.x * 0.38 + uTime * 0.13);
    float secondWave = cos(position.y * 0.55 - uTime * 0.09);
    float pointerWave = sin(length(position.xy - uPointer * 5.0) * 0.72 - uTime * 0.35);
    vElevation = (firstWave * 0.55 + secondWave * 0.35 + pointerWave * 0.1) * uMotion;
    transformed.z += vElevation;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`
export const AURORA_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying float vElevation;

  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  void main() {
    vec2 uv = vUv;
    float veilA = sin(uv.x * 8.0 + uv.y * 2.0 + uTime * 0.12) * 0.5 + 0.5;
    float veilB = sin(uv.x * 5.0 - uv.y * 7.0 - uTime * 0.09) * 0.5 + 0.5;
    float organicNoise = noise(uv * 5.5 + vec2(uTime * 0.025, -uTime * 0.018));
    float verticalFade = smoothstep(0.0, 0.28, uv.y) * (1.0 - smoothstep(0.72, 1.0, uv.y));
    float edgeFade = smoothstep(0.0, 0.18, uv.x) * (1.0 - smoothstep(0.82, 1.0, uv.x));
    float ribbon = pow(clamp(veilA * 0.58 + veilB * 0.28 + organicNoise * 0.35, 0.0, 1.0), 2.25);
    vec3 color = mix(uColorA, uColorB, veilA);
    color = mix(color, uColorC, veilB * organicNoise * 0.72);
    color += abs(vElevation) * uColorC * 0.2;
    float alpha = ribbon * verticalFade * (0.42 + edgeFade * 0.58) * uIntensity;
    gl_FragColor = vec4(color, alpha);
  }
`

export const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aPhase;
  attribute float aScale;
  attribute float aLayer;

  varying float vStrength;
  varying float vLayer;

  uniform float uTime;
  uniform float uMotion;
  uniform float uPointSize;
  uniform float uMode;
  uniform vec2 uPointer;

  void main() {
    vec3 animated = position;
    float localTime = uTime * (0.08 + aLayer * 0.1) + aPhase;
    float orbit = 0.12 + aLayer * 0.16;
    animated.x += sin(localTime + position.y * 0.32 + uMode) * orbit * uMotion;
    animated.y += cos(localTime * 0.73 + position.x * 0.27) * orbit * uMotion;
    animated.z += sin(localTime * 0.47 + position.x * 0.18) * orbit * 0.7 * uMotion;
    animated.xy += uPointer * (0.012 + aLayer * 0.01) * uMotion;

    vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uPointSize * aScale * (18.0 / max(3.0, -viewPosition.z));
    vStrength = aScale;
    vLayer = aLayer;
  }
`

export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  varying float vStrength;
  varying float vLayer;

  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(centered);
    float glow = smoothstep(0.5, 0.0, distanceToCenter);
    glow = pow(glow, 1.65);
    vec3 color = mix(uColorA, uColorB, vLayer);
    gl_FragColor = vec4(color, glow * uOpacity * (0.42 + vStrength * 0.58));
  }
`
