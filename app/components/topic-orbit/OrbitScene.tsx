'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CameraRig } from './CameraRig';
import { Planet } from './Planet';
import { Starfield } from './Starfield';
import { TopicSun } from './TopicSun';
import { overviewDistance } from './orbitLayout';
import { OrbitClock, OrbitPlanet } from './types';

// Advances the one shared simulation clock. Mounted first so every other
// useFrame subscriber in the scene reads a value from this same frame.
function ClockDriver({ clockRef, targetSpeed, resetNonce }: { clockRef: React.MutableRefObject<OrbitClock>; targetSpeed: number; resetNonce: number }) {
  const lastResetRef = useRef(resetNonce);
  useFrame((_, delta) => {
    // Rewinding the clock replays the whole construction sequence (rings drawn,
    // planets forming) without tearing down the WebGL context.
    if (lastResetRef.current !== resetNonce) {
      lastResetRef.current = resetNonce;
      clockRef.current.ms = 0;
    }
    const clock = clockRef.current;
    clock.speed += (targetSpeed - clock.speed) * Math.min(1, delta * 2.2);
    // Clamped so a backgrounded tab does not resume with a huge time jump that
    // would teleport every planet along its orbit.
    clock.ms += Math.min(delta, 0.05) * 1000 * clock.speed;
  });
  return null;
}

export function OrbitScene({
  topicName,
  topicAccent,
  planets,
  revealedCount,
  sunSettled,
  selectedId,
  clockResetNonce,
  reducedMotion,
  onSelect,
  onBackgroundClick,
}: {
  topicName: string;
  topicAccent: string;
  planets: OrbitPlanet[];
  revealedCount: number;
  sunSettled: boolean;
  selectedId: string | null;
  clockResetNonce: number;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onBackgroundClick: () => void;
}) {
  const clockRef = useRef<OrbitClock>({ ms: 0, speed: 1 });
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const distance = useMemo(() => overviewDistance(planets), [planets]);
  // Labels for every planet in a 100-planet system would be a wall of DOM;
  // past that threshold only the focused one is annotated.
  const labelEveryPlanet = planets.length <= 28;
  const effects = !reducedMotion && planets.length <= 64;

  return (
    <Canvas
      className="topic-orbit-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, distance * 0.42, distance], fov: 46, near: 0.1, far: 900 }}
      onPointerMissed={onBackgroundClick}
    >
      <ClockDriver clockRef={clockRef} targetSpeed={selectedId ? 0.35 : 1} resetNonce={clockResetNonce} />
      <color attach="background" args={['#03060f']} />
      <fog attach="fog" args={['#03060f', distance * 1.5, distance * 3.4]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#93c5fd', '#0b1120', 0.5]} />
      <Starfield radius={Math.max(180, distance * 3)} />

      <TopicSun title={topicName} accent={topicAccent} settled={sunSettled} dimmed={Boolean(selectedId)} clockRef={clockRef} />

      {planets.map((planet, index) => (
        <Planet
          key={planet.id}
          planet={planet}
          clockRef={clockRef}
          revealed={index < revealedCount}
          selected={selectedId === planet.id}
          dimmed={Boolean(selectedId) && selectedId !== planet.id}
          showLabel={labelEveryPlanet || selectedId === planet.id}
          onSelect={onSelect}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        panSpeed={0.6}
        minDistance={2.2}
        maxDistance={distance * 2.6}
        makeDefault
      />
      <CameraRig
        planets={planets}
        selectedId={selectedId}
        controlsRef={controlsRef}
        clockRef={clockRef}
        overviewDistance={distance}
      />

      {effects && (
        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={0.62} luminanceThreshold={0.42} luminanceSmoothing={0.24} mipmapBlur />
          <Vignette eskil={false} offset={0.22} darkness={0.5} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
