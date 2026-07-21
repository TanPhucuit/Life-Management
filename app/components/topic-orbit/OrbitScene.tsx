'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { BinaryStar } from './BinaryStar';
import { BlackHole } from './BlackHole';
import { CameraRig } from './CameraRig';
import { DEBRIS_TRAIL_POINTS, DebrisSwarm } from './DebrisSwarm';
import { GalaxyBackground } from './GalaxyBackground';
import { KnowledgeTree3D, TreeNodeMenuRequest } from './KnowledgeTree3D';
import { NeutronStar } from './NeutronStar';
import { OrbitBody } from './OrbitBody';
import { OrbitRings } from './OrbitRings';
import { SolarWind } from './SolarWind';
import { FORM_MS, SILENCE_MS, overviewDistance } from './diskLayout';
import { makeTidalStream, streamPhiForRadius } from './tidalStream';
import { THEMES, type OrbitTheme } from './themes';
import { DiskBody, DiskGeometry, OrbitClock, SceneQuality, TreeLayout } from './types';

// How many full turns the tidal debris stream winds around the hole before it
// is swallowed. Real TDE streams wrap several times before self-intersection
// circularises them. Set generously so that even material starting well inside
// the system still gets three or four turns of its own before the horizon.
const STREAM_TURNS = 6;

// Fragments per body, against a TOTAL budget. The swarm's cost is fragment
// overdraw, which depends on how many sprites are on screen — not on how many
// tasks the topic happens to have — so the budget is split rather than
// multiplied. Each fragment draws TRAIL_POINTS sprites.
function debrisPerBody(bodyCount: number, totalPoints: number, ceiling: number) {
  if (bodyCount <= 0) return ceiling;
  return Math.max(40, Math.min(ceiling, Math.floor(totalPoints / (bodyCount * DEBRIS_TRAIL_POINTS))));
}

// Watches the SIMULATION clock and reports when the destruction beat is over.
//
// This has to be the simulation clock and not a wall-clock timer. The clock is
// deliberately clamped to 50ms per frame so a backgrounded tab cannot teleport
// every body along the disk on resume — which means that whenever the scene
// runs below 20fps, or while the clock is still easing back to full speed after
// a planet was deselected, simulated time falls behind real time. A setTimeout
// then fires while the sequence is still visibly mid-flight and the whole
// system is replaced under it: the stars are cut off before they detonate, the
// stream is cut off while it is still winding in. The worse the frame rate, the
// earlier it cuts.
function TransitionWatcher({
  clockRef,
  endAtMs,
  onComplete,
}: {
  clockRef: React.MutableRefObject<OrbitClock>;
  endAtMs: number | null;
  onComplete: () => void;
}) {
  const firedFor = useRef<number | null>(null);
  useFrame(() => {
    if (endAtMs === null) {
      firedFor.current = null;
      return;
    }
    if (firedFor.current === endAtMs) return;
    if (clockRef.current.ms >= endAtMs) {
      firedFor.current = endAtMs;
      onComplete();
    }
  });
  return null;
}

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
  onDissolveComplete,
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
  quality: SceneQuality;
  nodeFocus: { position: [number, number, number]; radius: number; nonce: number } | null;
  // Non-null while the previous topic's system is being destroyed.
  dissolveStartMs: number | null;
  theme: OrbitTheme;
  onSelect: (id: string) => void;
  onTreeClosed: () => void;
  onFocusNode: (localPosition: [number, number, number], radius: number) => void;
  onNodeMenu: (request: TreeNodeMenuRequest) => void;
  // Fired from the simulation clock once the destruction beat and the silence
  // after it are genuinely over, which is when the caller may swap the system.
  onDissolveComplete: () => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  // Ultra is an explicit instruction, not a guess: the user has asked for
  // fidelity and accepted the cost, so nothing here is allowed to quietly
  // trade it back for frames.
  const ultra = quality === 'ultra';
  const rich = ultra || quality === 'high';
  // Adaptive resolution. The ceiling is what the machine is allowed to reach,
  // never what it is forced to run at — see the PerformanceMonitor below.
  const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  // Capped at 2 even under Ultra. Past that the cost grows with the square of
  // the ratio while the return is nil — dpr 2 is already four samples per
  // displayed pixel, which is finer than any panel resolves — and those
  // pixels are far better spent holding the frame rate up.
  const maxDpr = ultra ? Math.max(1.75, Math.min(2, deviceDpr)) : rich ? 1.75 : 1.25;
  const startDpr = ultra ? maxDpr : rich ? 1.35 : 1;
  const [dpr, setDpr] = useState(startDpr);
  useEffect(() => { setDpr(startDpr); }, [startDpr]);
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

  // Everything belonging to the OLD system is taken out over the last stretch
  // of the beat and is fully gone by the time it ends. The silence that
  // follows is therefore genuinely empty, and the swap at the end of it has
  // nothing on screen to interrupt.
  // Late enough that every theme has finished its own destruction first: the
  // binary's planets are done breaking up at 0.86 of the beat, the magnetar's
  // at 0.82, and the black hole's stream is at the horizon by 1.0 with most of
  // it already radiated away.
  const clearFromMs = dissolveStartMs === null ? 0 : dissolveStartMs + destroyMs * 0.9;
  const clearToMs = dissolveStartMs === null ? 0 : dissolveStartMs + destroyMs;
  const dissolveEndsAtMs = dissolveStartMs === null ? null : dissolveStartMs + destroyMs + SILENCE_MS;

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
      // Resolution is handed to the adaptive controller below; this is only
      // the starting point and the ceiling it may climb back to.
      dpr={dpr}
      // antialias is deliberately OFF. Everything is rendered into the
      // EffectComposer's own target, so the canvas's MSAA back buffer is
      // allocated, resolved and then never looked at — pure bandwidth on the
      // hottest surface in the frame.
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      // ACES filmic: the disk is deliberately over-bright, and this is what
      // rolls those highlights off into film-like colour instead of clipping.
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}
      camera={{ position: [distance * 0.34, distance * 0.42, distance * 0.86], fov: 48, near: 0.1, far: 4000 }}
    >
      {/* Resolution follows the frame rate rather than being fixed to a guess
          about the machine. It steps down when frames run long and climbs back
          when there is headroom, so a slow GPU loses sharpness instead of
          dropping frames — and a fast one is not capped for nothing.
          `flipflops` stops it oscillating: after a few reversals it settles and
          leaves the value alone, which is what keeps the adaptation itself from
          becoming the stutter.

          Deliberately absent under Ultra. Adapting is the right default, but
          it directly contradicts an explicit "give me maximum quality": the
          controller would spend the first seconds pulling the resolution back
          down again. */}
      {!ultra && (
        <PerformanceMonitor
          bounds={() => [48, 58]}
          flipflops={3}
          onIncline={() => setDpr((current) => Math.min(maxDpr, +(current + 0.25).toFixed(2)))}
          onDecline={() => setDpr((current) => Math.max(0.75, +(current - 0.25).toFixed(2)))}
          onFallback={() => setDpr(0.75)}
        />
      )}
      <ClockDriver clockRef={clockRef} targetSpeed={selectedId ? 0.28 : 1} resetNonce={clockResetNonce} />
      <TransitionWatcher clockRef={clockRef} endAtMs={dissolveEndsAtMs} onComplete={onDissolveComplete} />
      <color attach="background" args={['#01030a']} />
      <ambientLight intensity={collapsing ? 0.1 : 0.22} />
      <GalaxyBackground
        radius={distance * 6}
        // Point sprites are alpha-blended, so their real cost is overdraw in
        // the fragment stage, not the vertex count — and at a high resolution
        // six figures of them is one of the most expensive things in the
        // scene for something the eye reads as "a lot of stars" either way.
        // Ultra buys the density back.
        starCount={ultra ? 150000 : rich ? 34000 : 14000}
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
          clearFromMs={clearFromMs}
          clearToMs={clearToMs}
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
          count={ultra ? 9000 : rich ? 3200 : 1400}
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
          clearFromMs={clearFromMs}
          clearToMs={clearToMs}
          // The infalling arm is the centrepiece of the black hole sequence, so
          // it is sampled densely — but against a TOTAL budget rather than a
          // per-planet count. Multiplying a fixed per-planet figure by the
          // number of tasks meant a topic with forty of them asked for several
          // times the fragments of one with eight, and the transition got
          // slower exactly where the system was already busiest.
          perBody={debrisPerBody(
            bodies.length,
            dissolveKind === 'tidal'
              ? (ultra ? 90000 : rich ? 34000 : 14000)
              : (ultra ? 34000 : 14000),
            dissolveKind === 'tidal' ? 1100 : 340,
          )}
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

      {/* No multisampling, at any quality — including Ultra.

          This is not a corner being cut. MSAA here applies to the composer's
          own HDR target: a full-resolution float buffer that then feeds the
          bloom mip chain, so each sample costs several times what it would on
          an ordinary back buffer. At 8x and a high pixel ratio it was, on its
          own, larger than everything else in the frame combined.

          And it buys almost nothing in this scene. MSAA only antialiases
          GEOMETRIC edges; what is actually on screen is bloom, point sprites
          and soft shader falloffs, none of which it touches. Supersampling
          through the pixel ratio antialiases all of it, including the parts
          MSAA cannot reach — so the same budget spent on resolution is
          strictly better looking as well as far cheaper. */}
      {!reducedMotion && (
        <EffectComposer enableNormalPass={false} multisampling={0}>
          {/* Phase 1 is "the disk burns brighter and the space around it closes
              in" — a modest bloom lift plus a deeper vignette. Pushing bloom
              harder than this blows the whole frame to white and destroys the
              very thing the sequence is meant to show. */}
          <Bloom
            intensity={(ultra ? 1.35 : rich ? 1.15 : 0.7) * (collapsing ? 1.35 : 1)}
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
