'use client';

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Orbit, RotateCcw } from 'lucide-react';
import { OrbitScene } from './OrbitScene';
import { TopicOrbitDetailPanel } from './TopicOrbitDetailPanel';
import { layoutPlanets } from './orbitLayout';
import { OrbitPlanetInput } from './types';

// The panel waits until the camera has visibly committed to the approach, so
// the tree never slides in on top of a camera that is still far away.
const PANEL_DELAY_MS = 620;

export function TopicOrbitView({
  topicName,
  topicAccent,
  planets: planetInputs,
  reducedMotion,
  renderDetail,
  onSelectPlanet,
  emptyState,
  controls,
}: {
  topicName: string;
  topicAccent: string;
  planets: OrbitPlanetInput[];
  reducedMotion: boolean;
  // Mounts the EXISTING 2D tree, rooted at this task. Orbit never renders a
  // tree itself — it only hands the id over.
  renderDetail: (taskId: string) => ReactNode;
  onSelectPlanet?: (taskId: string | null) => void;
  emptyState?: ReactNode;
  // Rendered into the HUD — lets the workspace keep owning things like the
  // life-root picker instead of Orbit growing its own task UI.
  controls?: ReactNode;
}) {
  const planets = useMemo(() => layoutPlanets(planetInputs, reducedMotion), [planetInputs, reducedMotion]);
  const [sunSettled, setSunSettled] = useState(reducedMotion);
  const [revealedCount, setRevealedCount] = useState(reducedMotion ? planetInputs.length : 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [replayNonce, setReplayNonce] = useState(0);
  const panelTimerRef = useRef<number | null>(null);

  // Which planets exist — NOT their live status. Ticking a task off refreshes
  // every task object, and the intro must not replay just because the data
  // came back; it replays only when the system itself changes shape.
  const systemSignature = useMemo(() => planetInputs.map((planet) => planet.id).join('|'), [planetInputs]);
  const planetsRef = useRef(planets);
  planetsRef.current = planets;

  // Construction sequence: sun settles, then one planet forms at a time. Timers
  // are derived from the same revealAt values the scene animates against.
  useEffect(() => {
    const current = planetsRef.current;
    if (reducedMotion) {
      setSunSettled(true);
      setRevealedCount(current.length);
      return;
    }
    setSunSettled(false);
    setRevealedCount(0);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setSunSettled(true), 120));
    current.forEach((planet, index) => {
      timers.push(window.setTimeout(() => setRevealedCount((count) => Math.max(count, index + 1)), planet.revealAt));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [systemSignature, reducedMotion, replayNonce]);

  const closePanel = useCallback(() => {
    if (panelTimerRef.current !== null) window.clearTimeout(panelTimerRef.current);
    setPanelOpen(false);
    setSelectedId(null);
    onSelectPlanet?.(null);
  }, [onSelectPlanet]);

  const handleSelect = useCallback((taskId: string) => {
    if (panelTimerRef.current !== null) window.clearTimeout(panelTimerRef.current);
    setSelectedId(taskId);
    onSelectPlanet?.(taskId);
    setPanelOpen(false);
    panelTimerRef.current = window.setTimeout(() => setPanelOpen(true), reducedMotion ? 0 : PANEL_DELAY_MS);
  }, [onSelectPlanet, reducedMotion]);

  useEffect(() => () => {
    if (panelTimerRef.current !== null) window.clearTimeout(panelTimerRef.current);
  }, []);

  // A planet that disappears (task deleted, topic switched) must not leave the
  // camera anchored to nothing.
  useEffect(() => {
    if (selectedId && !planetInputs.some((planet) => planet.id === selectedId)) closePanel();
  }, [closePanel, planetInputs, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePanel, selectedId]);

  const selected = planetInputs.find((planet) => planet.id === selectedId) || null;

  return (
    <section className="topic-orbit-shell" data-focused={selectedId ? 'true' : 'false'}>
      {planetInputs.length ? (
        <OrbitScene
          topicName={topicName}
          topicAccent={topicAccent}
          planets={planets}
          revealedCount={revealedCount}
          sunSettled={sunSettled}
          selectedId={selectedId}
          clockResetNonce={replayNonce}
          reducedMotion={reducedMotion}
          onSelect={handleSelect}
          onBackgroundClick={closePanel}
        />
      ) : (
        <div className="topic-orbit-empty">{emptyState || 'This topic has no first-level tasks to put in orbit yet.'}</div>
      )}

      <div className="topic-orbit-hud">
        {controls}
        <span className="topic-orbit-hud-chip"><Orbit className="h-3.5 w-3.5" /> {planetInputs.length} first-level {planetInputs.length === 1 ? 'task' : 'tasks'}</span>
        <span className="topic-orbit-hud-hint">Drag to rotate · scroll to zoom · click a planet to land · Esc to return</span>
        <button type="button" className="topic-orbit-hud-replay" onClick={() => { closePanel(); setReplayNonce((current) => current + 1); }}>
          <RotateCcw className="h-3.5 w-3.5" /> Replay
        </button>
      </div>

      <TopicOrbitDetailPanel
        open={panelOpen && Boolean(selected)}
        title={selected?.title || ''}
        subtitle={selected ? `${selected.childCount} direct ${selected.childCount === 1 ? 'child' : 'children'} · ${Math.round(selected.completion * 100)}% complete` : undefined}
        reducedMotion={reducedMotion}
        onClose={closePanel}
      >
        {/* Remounted per planet so the existing tree replays its propagation
            reveal from this node every time the user lands somewhere new. */}
        {selected && <div key={selected.id} className="topic-orbit-detail-tree">{renderDetail(selected.id)}</div>}
      </TopicOrbitDetailPanel>
    </section>
  );
}

export default TopicOrbitView;
