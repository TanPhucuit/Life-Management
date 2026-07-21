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
import { SolarWind } from './SolarWind';
import { FORM_MS, SILENCE_MS, overviewDistance } from './diskLayout';
import { makeTidalStream, streamPhiForRadius } from './tidalStream';
import { THEMES, type OrbitTheme } from './themes';
import { DiskBody, DiskGeometry, OrbitClock, TreeLayout } from './types';

// How many full turns the tidal debris stream winds around the hole before it
// is swallowed. Real TDE streams wrap several times before self-intersection
// circularises them. Set generously so that even material starting well inside
// the system still gets three or four turns of its own before the horizon.
const STREAM_TURNS = 6;

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
    // Dev harness hook: /preview/orbit sets this to watch the destruction beat
    // in slow motion. Everything is timed on the one clock, so scaling it here
    // slows the entire cinematic coherently.
    const timeScale = Number((window as Window & { __ORBIT_TIME_SCALE__?: number }).__ORBIT_TIME_SCALE__ ?? 1) || 1;
    // Clamped so a backgrounded tab does not resume with a huge time jump that
    // would teleport every body along the disk.
    clock.ms += Math.min(delta, 0.05) * 1000 * clock.speed * timeScale;
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
  // A wave leaves the centre at the merger/burst and sweeps outward; a planet
  // only comes apart when it arrives. waveTravel is calibrated against the
  // wave shell's on-screen speed so the shatter always coincides with the
  // visible front passing through the body. Used for the binary merger, whose
  // shockwave genuinely is a spherical front.
  const waveLaunch = (dissolveStartMs || 0) + destroyMs * config.waveAt;
  const waveTravel = config.waveTravel;
  const arrivalOf = useMemo(
    () => (body: DiskBody) => waveLaunch + (body.radius / Math.max(1, systemReach)) * destroyMs * waveTravel,
    [destroyMs, systemReach, waveLaunch, waveTravel],
  );
  const dissolveKind: 'tidal' | 'burst' = config.destruction === 'spiral_infall' ? 'tidal' : 'burst';

  // Black hole: the tidal disruption stream. One logarithmic spiral that every
  // disrupted body joins, winding TURNS times before it reaches the horizon —
  // see tidalStream.ts for the physics. Kepler's r^{3/2} fallback law then
  // orders the bodies along it by radius with nothing else to schedule.
  const stream = useMemo(() => {
    if (dissolveKind !== 'tidal' || !bodies.length || dissolveStartMs === null) return null;
    const outermost = bodies.reduce((maximum, body) => Math.max(maximum, body.radius), 0);
    // Start the stream where the innermost body — the first to be disrupted —
    // actually was, so the spiral grows out of the real system rather than
    // from an arbitrary angle.
    const head = bodies.reduce((closest, body) => (body.radius < closest.radius ? body : closest), bodies[0]);
    const entryAngle = head.startAngle
      + (Math.max(0, dissolveStartMs - head.revealAt) / 1000) * head.angularSpeed;
    return makeTidalStream(outermost, disk.horizonRadius, entryAngle, STREAM_TURNS);
  }, [bodies, disk.horizonRadius, dissolveKind, dissolveStartMs]);

  // Azimuth spacing between neighbouring bodies on the stream. Each body's
  // tidal stretch is sized to close its own gap, which is what welds the queue
  // into a single continuous ribbon instead of a row of separate streaks.
  const streamGaps = useMemo(() => {
    const gaps = new Map<string, number>();
    if (!stream) return gaps;
    const ordered = [...bodies].sort((a, b) => a.radius - b.radius);
    ordered.forEach((body, index) => {
      const next = ordered[index + 1] || body;
      const phi = streamPhiForRadius(stream, body.radius);
      const nextPhi = streamPhiForRadius(stream, next.radius);
      // Falls back to the spacing of the pair below it for the outermost body.
      const gap = Math.abs(phi - nextPhi) || (index > 0
        ? Math.abs(streamPhiForRadius(stream, ordered[index - 1].radius) - phi)
        : 0.5);
      gaps.set(body.id, gap);
    });
    return gaps;
  }, [bodies, stream]);

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
          spin={collapsing ? 3.4 : 1}
          transitioning={collapsing}
          destroyMs={destroyMs}
        />
      )}
      {theme === 'binary_star' && (
        <BinaryStar
          title={topicName}
          accent={topicAccent}
          separation={config.bandStart * (config.starSeparation || 0.82)}
          settled={holeSettled}
          dimmed={Boolean(selectedId)}
          clockRef={clockRef}
          dissolveStartMs={dissolveStartMs}
          destroyMs={destroyMs}
          reach={systemReach}
        />
      )}
      {theme === 'neutron_star' && (
        <NeutronStar
          title={topicName}
          accent={topicAccent}
          // Spec: a small, dense object against orbits of 15-40. Held well
          // under a tenth of the innermost orbit so the density still reads,
          // but large enough that the crust, the arcs and the field lines are
          // all legible rather than a bright dot.
          coreRadius={2.1}
          settled={holeSettled}
          dimmed={Boolean(selectedId)}
          clockRef={clockRef}
          dissolveStartMs={dissolveStartMs}
          destroyMs={destroyMs}
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
          stream={stream}
          streamGapPhi={streamGaps.get(body.id) || 0.5}
          burstSplits={Boolean(config.burstSplits)}
          onSelect={onSelect}
        />
      ))}

      {theme === 'neutron_star' && (
        <SolarWind
          clockRef={clockRef}
          innerRadius={config.bandStart * 0.22}
          outerRadius={disk.outerRadius * 0.95}
          accent={topicAccent}
          intensity={collapsing ? 0.85 : 0.06}
          count={quality === 'high' ? 3200 : 1400}
        />
      )}

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
          // The debris must finish its own life inside the destruction beat.
          // An infall rides the whole stream, exactly as the bodies do, so the
          // ribbon and the dust it sheds stay locked together; a burst only
          // starts when the wave arrives, so it gets the remainder.
          durationMs={dissolveKind === 'burst'
            ? destroyMs * (1 - config.waveAt - config.waveTravel)
            : destroyMs}
          arrivalOf={arrivalOf}
          stream={stream}
          // The infalling arm is the centrepiece of the black hole sequence and
          // it has to read as a solid band of burning matter, so it gets a much
          // denser sampling than a scatter of sparks would need.
          perBody={dissolveKind === 'tidal' ? (quality === 'high' ? 420 : 200) : 130}
        />
      )}
      {/* Binary star forms its planets purely through OrbitBody's own molten
          -to-crust shader — a debris ring condensing from a small fixed point
          near the origin has nothing to do with two suns ~10 units apart and
          only reads as a stray leftover disc. */}
      {bodies.length > 0 && theme !== 'binary_star' && (
        <DebrisSwarm
          key={`out-${bodies[0].id}-${bodies[0].revealAt}`}
          bodies={bodies}
          clockRef={clockRef}
          innerRadius={disk.horizonRadius}
          mode="out"
          startMs={0}
          durationMs={FORM_MS}
          stream={null}
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
          {/* Phase 1 is "the disk burns brighter and the space around it closes
              in" — a modest bloom lift plus a deeper vignette. Pushing bloom
              harder than this blows the whole frame to white and destroys the
              very thing the sequence is meant to show. */}
          <Bloom
            intensity={(quality === 'high' ? 1.15 : 0.7) * (collapsing ? 1.35 : 1)}
            luminanceThreshold={collapsing ? 0.24 : 0.28}
            luminanceSmoothing={0.32}
            mipmapBlur
            radius={collapsing ? 0.86 : 0.82}
          />
          <Noise premultiply opacity={0.028} />
          <Vignette eskil={false} offset={collapsing ? 0.12 : 0.2} darkness={collapsing ? 0.86 : 0.62} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
