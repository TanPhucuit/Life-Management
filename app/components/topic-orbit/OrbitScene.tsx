'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { BinaryStar } from './BinaryStar';
import { BlackHole } from './BlackHole';
import { CameraRig } from './CameraRig';
import { DebrisSwarm } from './DebrisSwarm';
import { GalaxyBackground } from './GalaxyBackground';
import { KnowledgeTree3D, TreeNodeMenuRequest } from './KnowledgeTree3D';
import { NeutronStar } from './NeutronStar';
import { OrbitBody } from './OrbitBody';
import { OrbitRings } from './OrbitRings';
import { FORM_MS, SILENCE_MS, overviewDistance } from './diskLayout';
import { THEMES, type OrbitTheme } from './themes';
import { DiskBody, DiskGeometry, OrbitClock, TreeLayout } from './types';

// Advances the one shared simulation clock. Mounted first so every other
// useFrame subscriber in the scene reads a value from this same frame.
function ClockDriver({
  clockRef,
  targetSpeed,
  resetNonce,
}: {
  clockRef: React.MutableRefObject<OrbitClock>;
  targetSpeed: number;
  resetNonce: number;
}) {
  const lastResetRef = useRef(resetNonce);
  useFrame((_, delta) => {
    if (lastResetRef.current !== resetNonce) {
      lastResetRef.current = resetNonce;
      clockRef.current.ms = 0;
    }
    const clock = clockRef.current;
    clock.speed += (targetSpeed - clock.speed) * Math.min(1, delta * 2.2);
    // Clamped so a backgrounded tab does not resume with a huge time jump that
    // would teleport every body along the disk.
    clock.ms += Math.min(delta, 0.05) * 1000 * clock.speed;
  });
  return null;
}

export function OrbitScene({
  clockRef,
  topicName,
  topicAccent,
  bodies,
  disk,
  holeSettled,
  selectedId,
  treeLayout,
  treeClosing,
  clockResetNonce,
  reducedMotion,
  quality,
  nodeFocus,
  dissolveStartMs,
  theme,
  onSelect,
  onTreeClosed,
  onFocusNode,
  onNodeMenu,
}: {
  clockRef: React.MutableRefObject<OrbitClock>;
  topicName: string;
  topicAccent: string;
  bodies: DiskBody[];
  disk: DiskGeometry;
  holeSettled: boolean;
  selectedId: string | null;
  treeLayout: TreeLayout | null;
  treeClosing: boolean;
  clockResetNonce: number;
  reducedMotion: boolean;
  quality: 'high' | 'low';
  nodeFocus: { position: [number, number, number]; radius: number; nonce: number } | null;
  // Non-null while the previous topic's system is being destroyed.
  dissolveStartMs: number | null;
  theme: OrbitTheme;
  onSelect: (id: string) => void;
  onTreeClosed: () => void;
  onFocusNode: (localPosition: [number, number, number], radius: number) => void;
  onNodeMenu: (request: TreeNodeMenuRequest) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const distance = useMemo(() => overviewDistance(disk), [disk]);
  const selectedBody = selectedId ? bodies.find((body) => body.id === selectedId) || null : null;
  // Labels for a hundred bodies would be a wall of DOM; past that threshold
  // only the focused one stays annotated.
  const labelEveryBody = bodies.length <= 30;
  // Phase 1 of a topic change is pure light: the hole burns brighter and the
  // space around it closes in, before anything has visibly moved.
  const collapsing = dissolveStartMs !== null;
  const config = THEMES[theme];
  const destroyMs = config.destroyMs;
  // How far out the wave has to travel before the system is clear.
  const systemReach = disk.outerRadius;
  // Progress through the destruction beat, read live from the clock by the
  // central object so its own simulation stays frame-accurate.
  const eventProgress = collapsing
    ? Math.min(1, Math.max(0, (clockRef.current.ms - (dissolveStartMs as number)) / destroyMs))
    : null;
  // A wave leaves the centre at the merger/burst and sweeps outward; a planet
  // only comes apart when it arrives.
  const waveLaunch = (dissolveStartMs || 0) + destroyMs * (theme === 'binary_star' ? 0.55 : 0.4);
  const arrivalOf = useMemo(
    () => (body: DiskBody) => waveLaunch + (body.radius / Math.max(1, systemReach)) * destroyMs * 0.3,
    [destroyMs, systemReach, waveLaunch],
  );
  const dissolveKind: 'tidal' | 'burst' = config.destruction === 'spiral_infall' ? 'tidal' : 'burst';

  return (
    <Canvas
      className="topic-orbit-canvas"
      dpr={[1, quality === 'high' ? 1.85 : 1.25]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      // ACES filmic: the disk is deliberately over-bright, and this is what
      // rolls those highlights off into film-like colour instead of clipping.
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}
      camera={{ position: [distance * 0.34, distance * 0.42, distance * 0.86], fov: 48, near: 0.1, far: 4000 }}
    >
      <ClockDriver clockRef={clockRef} targetSpeed={selectedId ? 0.28 : 1} resetNonce={clockResetNonce} />
      <color attach="background" args={['#01030a']} />
      <ambientLight intensity={collapsing ? 0.1 : 0.22} />
      <GalaxyBackground
        radius={distance * 6}
        starCount={quality === 'high' ? 90000 : 18000}
        accent={topicAccent}
        lensing={collapsing ? 1 : 0.28}
      />

      {theme === 'black_hole' && (
        <BlackHole
          title={topicName}
          accent={topicAccent}
          disk={disk}
          settled={holeSettled}
          dimmed={Boolean(selectedId)}
          clockRef={clockRef}
          quality={quality}
          spin={collapsing ? 5.5 : 1}
        />
      )}
      {theme === 'binary_star' && (
        <BinaryStar
          title={topicName}
          accent={topicAccent}
          separation={disk.innerRadius * 1.5}
          settled={holeSettled}
          dimmed={Boolean(selectedId)}
          clockRef={clockRef}
          progress={eventProgress}
          reach={systemReach}
        />
      )}
      {theme === 'neutron_star' && (
        <NeutronStar
          title={topicName}
          accent={topicAccent}
          coreRadius={disk.horizonRadius * 0.32}
          settled={holeSettled}
          dimmed={Boolean(selectedId)}
          clockRef={clockRef}
          progress={eventProgress}
          reach={systemReach}
        />
      )}

      {bodies.map((body) => (
        <OrbitBody
          key={body.id}
          body={body}
          clockRef={clockRef}
          selected={selectedId === body.id}
          dimmed={Boolean(selectedId) && selectedId !== body.id}
          showLabel={labelEveryBody || selectedId === body.id}
          dissolveStartMs={dissolveKind === 'burst' && dissolveStartMs !== null ? arrivalOf(body) : dissolveStartMs}
          dissolveKind={dissolveKind}
          destroyMs={destroyMs}
          waveAt={config.waveAt}
          onSelect={onSelect}
        />
      ))}

      {config.rings && (
        <OrbitRings
          bodies={bodies}
          clockRef={clockRef}
          accent={topicAccent}
          dimmed={Boolean(selectedId)}
          dissolveStartMs={dissolveStartMs}
          destroyMs={destroyMs}
          collapses={dissolveKind === 'tidal'}
        />
      )}

      {/* Debris: the old system tumbling down the spiral, and the new one
          streaming back out of the disk to build the next set of bodies. */}
      {dissolveStartMs !== null && (
        <DebrisSwarm
          key={`in-${dissolveStartMs}`}
          bodies={bodies}
          clockRef={clockRef}
          innerRadius={disk.horizonRadius}
          mode={dissolveKind === 'burst' ? 'burst' : 'in'}
          startMs={dissolveStartMs}
          durationMs={destroyMs}
          arrivalOf={arrivalOf}
        />
      )}
      {bodies.length > 0 && (
        <DebrisSwarm
          key={`out-${bodies[0].id}-${bodies[0].revealAt}`}
          bodies={bodies}
          clockRef={clockRef}
          innerRadius={disk.horizonRadius}
          mode="out"
          startMs={0}
          durationMs={FORM_MS}
          perBody={90}
        />
      )}

      {selectedBody && treeLayout && (
        <KnowledgeTree3D
          key={selectedBody.id}
          layout={treeLayout}
          body={selectedBody}
          clockRef={clockRef}
          closing={treeClosing}
          reducedMotion={reducedMotion}
          onClosed={onTreeClosed}
          onFocusNode={onFocusNode}
          onNodeMenu={onNodeMenu}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.055}
        rotateSpeed={0.5}
        zoomSpeed={0.65}
        panSpeed={0.55}
        minDistance={disk.horizonRadius * 1.6}
        maxDistance={distance * 3}
        makeDefault
      />
      <CameraRig
        bodies={bodies}
        selectedId={selectedId}
        focusReach={treeLayout?.reach || 2.4}
        nodeFocus={nodeFocus}
        controlsRef={controlsRef}
        clockRef={clockRef}
        overviewDistance={distance}
        introKey={clockResetNonce}
        transition={dissolveStartMs !== null ? {
          startMs: dissolveStartMs,
          durationMs: destroyMs + SILENCE_MS,
          // The jolt lands when the event actually happens: at once for a hole
          // opening up, at the merger for a binary, at the burst for a magnetar.
          waveAt: config.waveAt,
          dolly: config.dolly,
          craneDegrees: config.craneDegrees,
        } : null}
      />

      {!reducedMotion && (
        <EffectComposer enableNormalPass={false} multisampling={quality === 'high' ? 4 : 0}>
          <Bloom
            intensity={(quality === 'high' ? 1.15 : 0.7) * (collapsing ? 2.1 : 1)}
            luminanceThreshold={collapsing ? 0.16 : 0.28}
            luminanceSmoothing={0.32}
            mipmapBlur
            radius={collapsing ? 0.9 : 0.82}
          />
          <Noise premultiply opacity={0.028} />
          <Vignette eskil={false} offset={collapsing ? 0.12 : 0.2} darkness={collapsing ? 0.86 : 0.62} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
