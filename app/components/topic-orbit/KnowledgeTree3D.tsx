import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DiskBody, OrbitClockRef, TreeLayout } from './types';
import { bodyPositionAt, treeGrowthDirection } from './diskLayout';
import { EDGE_DURATION_MS } from './treeLayout';
import { COSMIC } from './cosmicPalette';

// Branches are real geometry, not 1px lines: over a bright accretion disk a GL
// line disappears completely, and the parent→child connection is the whole
// point of the tree. Each branch is cut into segments so the reveal can travel
// along it in either direction — outward while it grows, inward while its
// completion colour climbs back toward the parent.
const BRANCH_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const NODE_GEOMETRY = new THREE.IcosahedronGeometry(1, 2);
const UP = new THREE.Vector3(0, 1, 0);
const SEGMENTS_PER_BRANCH = 12;
const SEGMENT_POP_MS = 120;
const NODE_POP_MS = 320;
const RETRACT_MS = 260;
// A finished node lights first; only then does its branch start filling.
const NODE_TO_BRANCH_DELAY_MS = 300;
const BRANCH_FILL_MS = 560;
const RETRACT_SPEED = 2.4;
const REEXPAND_COMPLETION_GAP_MS = 520;
const REEXPAND_COMPLETION_STEP_MS = 160;

const DONE_COLOR = new THREE.Color(COSMIC.aurora);
const NODE_COLOR = new THREE.Color(COSMIC.ice);
const TODAY_COLOR = new THREE.Color(COSMIC.today);
const SIGNAL_COLOR = new THREE.Color(COSMIC.signal);
const SPARK_COLOR = new THREE.Color(COSMIC.spark);

export type TreeNodeMenuRequest = {
  id: string;
  title: string;
  done: boolean;
  x: number;
  y: number;
};

export function KnowledgeTree3D({
  layout,
  body,
  clockRef,
  closing,
  reducedMotion,
  onClosed,
  onFocusNode,
  onNodeMenu,
}: {
  layout: TreeLayout;
  body: DiskBody;
  clockRef: OrbitClockRef;
  closing: boolean;
  reducedMotion: boolean;
  onClosed: () => void;
  onFocusNode: (localPosition: [number, number, number], radius: number) => void;
  onNodeMenu: (request: TreeNodeMenuRequest) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<THREE.InstancedMesh>(null);
  const branchesRef = useRef<THREE.InstancedMesh>(null);
  const localMs = useRef(reducedMotion ? layout.completionEndsAt + 800 : 0);
  const anchor = useMemo(() => new THREE.Vector3(), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const scratchColor = useMemo(() => new THREE.Color(), []);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [grownCount, setGrownCount] = useState(0);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // The root of the tree IS the planet, so it is never drawn as a node.
  const drawnNodes = useMemo(() => layout.nodes.filter((node) => node.depth > 0), [layout.nodes]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, string[]>();
    layout.edges.forEach((edge) => map.set(edge.fromId, [...(map.get(edge.fromId) || []), edge.toId]));
    return map;
  }, [layout.edges]);

  // Live timing, kept in refs so a subtree can be folded away and re-grown at
  // any moment without rebuilding the layout or re-rendering React.
  const showAtRef = useRef(new Map<string, number>());
  const hideAtRef = useRef(new Map<string, number>());
  const completeAtRef = useRef(new Map<string, number>());
  const doneSnapshotRef = useRef(new Set<string>());
  const initialisedRef = useRef('');

  if (initialisedRef.current !== body.id) {
    initialisedRef.current = body.id;
    showAtRef.current = new Map(layout.nodes.map((node) => [node.id, node.growAt]));
    hideAtRef.current = new Map();
    completeAtRef.current = new Map(layout.nodes.filter((node) => node.done).map((node) => [node.id, node.completeAt]));
    doneSnapshotRef.current = new Set(layout.nodes.filter((node) => node.done).map((node) => node.id));
  }

  // A task ticked off while the tree is open must animate from *now*, not jump
  // to the colour it would have had during the opening sequence.
  useEffect(() => {
    const previous = doneSnapshotRef.current;
    const next = new Set<string>();
    layout.nodes.forEach((node) => {
      if (!node.done) {
        completeAtRef.current.delete(node.id);
        return;
      }
      next.add(node.id);
      if (!previous.has(node.id)) completeAtRef.current.set(node.id, localMs.current);
      else if (!completeAtRef.current.has(node.id)) completeAtRef.current.set(node.id, node.completeAt);
    });
    doneSnapshotRef.current = next;
  }, [layout.nodes]);

  const forEachDescendant = (rootId: string, visit: (id: string, relativeDepth: number) => void) => {
    const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
    while (queue.length) {
      const current = queue.shift() as { id: string; depth: number };
      (childrenOf.get(current.id) || []).forEach((childId) => {
        visit(childId, current.depth + 1);
        queue.push({ id: childId, depth: current.depth + 1 });
      });
    }
  };

  const collapseNode = (nodeId: string) => {
    const now = localMs.current;
    let deepest = 0;
    forEachDescendant(nodeId, (_, depth) => { deepest = Math.max(deepest, depth); });
    // Folds inward: the leaves retract first, then their parents.
    forEachDescendant(nodeId, (id, depth) => {
      hideAtRef.current.set(id, now + (deepest - depth) * 60);
    });
    setCollapsedIds((current) => new Set(current).add(nodeId));
  };

  const expandNode = (nodeId: string) => {
    const now = localMs.current;
    const origin = nodeById.get(nodeId);
    if (!origin) return;
    let reach = 0;
    let growthEndsAt = now;
    const reopened: Array<{ id: string; depth: number }> = [];
    const originPosition = new THREE.Vector3().fromArray(origin.position);
    forEachDescendant(nodeId, (id) => {
      const node = nodeById.get(id);
      if (!node) return;
      hideAtRef.current.delete(id);
      // Replays the original stagger, rebased on the moment of the click, so a
      // re-opened branch grows exactly the way it did the first time.
      const showAt = now + (node.growAt - origin.growAt);
      showAtRef.current.set(id, showAt);
      growthEndsAt = Math.max(growthEndsAt, showAt);
      reach = Math.max(reach, point.fromArray(node.position).distanceTo(originPosition));
      if (node.done) reopened.push({ id, depth: node.depth });
      else completeAtRef.current.delete(id);
    });

    // Progress is NOT restored the instant the branch reappears: the whole
    // branch is traversed first, and only then does the completion colour climb
    // back through it, deepest task upward — exactly like the opening sequence.
    const completionStart = growthEndsAt + REEXPAND_COMPLETION_GAP_MS;
    reopened
      .sort((left, right) => right.depth - left.depth || left.id.localeCompare(right.id))
      .forEach((entry, index) => {
        completeAtRef.current.set(entry.id, completionStart + index * REEXPAND_COMPLETION_STEP_MS);
      });
    setCollapsedIds((current) => {
      const next = new Set(current);
      next.delete(nodeId);
      return next;
    });
    onFocusNode(origin.position, Math.max(1.2, reach));
  };

  // Static per-branch geometry: heading, length, orientation, thickness.
  const branches = useMemo(() => {
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    return layout.edges.map((edge) => {
      from.fromArray(edge.from);
      to.fromArray(edge.to);
      const direction = new THREE.Vector3().subVectors(to, from);
      const length = direction.length();
      direction.normalize();
      const child = nodeById.get(edge.toId);
      return {
        childId: edge.toId,
        from: from.clone(),
        direction: direction.clone(),
        length,
        quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction),
        radius: 0.024 * Math.pow(0.86, child?.depth ?? 1),
      };
    });
  }, [layout.edges, nodeById]);

  const segmentCount = branches.length * SEGMENTS_PER_BRANCH;

  // Fixed heading, decided once: the tree grows outward from the hole and tilts
  // up, and it must NOT swing around as the body continues to orbit.
  const orientation = useMemo(() => {
    const here = bodyPositionAt(body, clockRef.current.ms, new THREE.Vector3());
    const growth = treeGrowthDirection(here, new THREE.Vector3());
    return new THREE.Quaternion().setFromUnitVectors(UP, growth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.id]);

  useEffect(() => {
    // Nothing is visible on the first frame — everything grows in.
    [nodesRef.current, branchesRef.current].forEach((mesh) => {
      if (!mesh) return;
      matrix.makeScale(0.0001, 0.0001, 0.0001);
      for (let index = 0; index < mesh.count; index += 1) mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      // InstancedMesh.raycast bails early on a cached bounding sphere, and it
      // would cache the one computed right now — every instance parked at the
      // origin at scale 0, i.e. a sphere nothing can ever hit. Pin a sphere
      // that actually covers the grown tree instead of recomputing per frame.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), layout.reach + 1.5);
    });
  }, [layout.reach, matrix, segmentCount]);

  // 1 while fully present, 0 while folded away — shared by a node and by the
  // branch that feeds it.
  const presenceOf = (id: string, time: number, appearMs: number) => {
    const hideAt = hideAtRef.current.get(id);
    if (hideAt !== undefined) return 1 - Math.min(1, Math.max(0, (time - hideAt) / RETRACT_MS));
    const showAt = showAtRef.current.get(id) ?? 0;
    return Math.min(1, Math.max(0, (time - showAt) / appearMs));
  };

  useFrame((_, delta) => {
    const group = groupRef.current;
    const nodes = nodesRef.current;
    const branchMesh = branchesRef.current;
    if (!group || !nodes || !branchMesh) return;

    // The tree keeps its own wall clock: growth must not slow down just because
    // the disk simulation does while a body is focused.
    const step = Math.min(delta, 0.05) * 1000;
    localMs.current += closing ? -step * RETRACT_SPEED : step;
    if (closing && localMs.current <= 0) {
      localMs.current = 0;
      onClosed();
      return;
    }
    const time = localMs.current;
    group.position.copy(bodyPositionAt(body, clockRef.current.ms, anchor));

    branches.forEach((branch, branchIndex) => {
      const childShowAt = showAtRef.current.get(branch.childId) ?? 0;
      const hideAt = hideAtRef.current.get(branch.childId);
      const completeAt = completeAtRef.current.get(branch.childId);
      const segmentLength = branch.length / SEGMENTS_PER_BRANCH;

      for (let segment = 0; segment < SEGMENTS_PER_BRANCH; segment += 1) {
        const instance = branchIndex * SEGMENTS_PER_BRANCH + segment;
        const along = (segment + 0.5) / SEGMENTS_PER_BRANCH;
        // Parent end first: this is the signal travelling outward.
        const segmentShowAt = childShowAt - EDGE_DURATION_MS + (segment / SEGMENTS_PER_BRANCH) * EDGE_DURATION_MS;
        let presence: number;
        if (hideAt !== undefined) {
          // Retracts from the child end back toward the parent.
          const segmentHideAt = hideAt + ((SEGMENTS_PER_BRANCH - 1 - segment) / SEGMENTS_PER_BRANCH) * 180;
          presence = 1 - Math.min(1, Math.max(0, (time - segmentHideAt) / RETRACT_MS));
        } else {
          presence = Math.min(1, Math.max(0, (time - segmentShowAt) / SEGMENT_POP_MS));
        }

        point.copy(branch.from).addScaledVector(branch.direction, along * branch.length);
        scale.set(branch.radius * presence, Math.max(0.0001, segmentLength * presence), branch.radius * presence);
        matrix.compose(point, branch.quaternion, scale);
        branchMesh.setMatrixAt(instance, matrix);

        // Completion climbs the other way: from the finished child up to its
        // parent, and only after the child itself has turned green.
        let filled = false;
        if (completeAt !== undefined) {
          const fillStart = completeAt + NODE_TO_BRANCH_DELAY_MS
            + ((SEGMENTS_PER_BRANCH - 1 - segment) / SEGMENTS_PER_BRANCH) * BRANCH_FILL_MS;
          filled = time >= fillStart;
        }
        scratchColor.copy(filled ? DONE_COLOR : SIGNAL_COLOR);
        // The leading segment of a growing branch burns white.
        const front = time - segmentShowAt;
        if (hideAt === undefined && front >= 0 && front < 220) scratchColor.lerp(SPARK_COLOR, 1 - front / 220);
        branchMesh.setColorAt(instance, scratchColor);
      }
    });
    branchMesh.instanceMatrix.needsUpdate = true;
    if (branchMesh.instanceColor) branchMesh.instanceColor.needsUpdate = true;

    let grown = 0;
    drawnNodes.forEach((node, index) => {
      const presence = presenceOf(node.id, time, NODE_POP_MS);
      const eased = presence <= 0 ? 0 : 1 - Math.pow(1 - presence, 3);
      if (eased > 0.6) grown += 1;
      const hovered = hoveredIndex === index;
      const collapsed = collapsedIds.has(node.id);
      const size = 0.135 * Math.pow(0.92, node.depth)
        * (hovered ? 1.5 : 1)
        * (node.isLeaf ? 0.86 : 1.18)
        // A folded branch keeps a slightly denser core, so it reads as "there
        // is more inside this one".
        * (collapsed ? 1.22 : 1);
      const finalScale = Math.max(0.0001, size * eased);
      matrix.makeScale(finalScale, finalScale, finalScale);
      matrix.setPosition(node.position[0], node.position[1], node.position[2]);
      nodes.setMatrixAt(index, matrix);

      const completeAt = completeAtRef.current.get(node.id);
      const completed = completeAt !== undefined && time >= completeAt;
      const sinceComplete = completed ? (time - (completeAt as number)) / 420 : 0;
      const flash = completed ? Math.exp(-sinceComplete * sinceComplete * 3) : 0;
      // Due today wins over the neutral node colour, and is left at full
      // strength rather than dimmed — the whole point is that it stands out
      // from the branch it is buried in. Completing it still takes over, since
      // a finished task is no longer due.
      if (!completed && node.dueToday) {
        scratchColor.copy(TODAY_COLOR);
      } else {
        scratchColor.copy(completed ? DONE_COLOR : NODE_COLOR);
        if (!completed) scratchColor.multiplyScalar(0.62);
      }
      if (flash > 0.01) scratchColor.lerp(SPARK_COLOR, flash * 0.8);
      nodes.setColorAt(index, scratchColor);
    });
    nodes.instanceMatrix.needsUpdate = true;
    if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true;
    if (grown !== grownCount) setGrownCount(grown);
  });

  const labelNodes = useMemo(
    () => drawnNodes
      .map((node, index) => ({ node, index }))
      .filter(({ node, index }) => node.depth <= 1 || hoveredIndex === index || collapsedIds.has(node.id)),
    [collapsedIds, drawnNodes, hoveredIndex],
  );

  return (
    <group ref={groupRef} quaternion={orientation}>
      <instancedMesh
        ref={branchesRef}
        args={[BRANCH_GEOMETRY, undefined, Math.max(1, segmentCount)]}
        frustumCulled={false}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh
        ref={nodesRef}
        args={[NODE_GEOMETRY, undefined, Math.max(1, drawnNodes.length)]}
        frustumCulled={false}
        onPointerMove={(event) => { event.stopPropagation(); setHoveredIndex(event.instanceId ?? null); }}
        onPointerOut={() => { setHoveredIndex(null); document.body.style.cursor = 'auto'; }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onContextMenu={(event) => {
          event.stopPropagation();
          event.nativeEvent.preventDefault();
          const node = event.instanceId === undefined ? null : drawnNodes[event.instanceId];
          if (node) onNodeMenu({ id: node.id, title: node.title, done: node.done, x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
        }}
        onClick={(event) => {
          event.stopPropagation();
          const node = event.instanceId === undefined ? null : drawnNodes[event.instanceId];
          if (!node) return;
          const hasChildren = (childrenOf.get(node.id) || []).length > 0;
          if (!hasChildren) {
            onFocusNode(node.position, 1.2);
            return;
          }
          if (collapsedIds.has(node.id)) expandNode(node.id);
          else collapseNode(node.id);
        }}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {labelNodes.map(({ node, index }) => (
        <Html
          key={node.id}
          position={node.position}
          center
          distanceFactor={9}
          style={{
            pointerEvents: 'none',
            opacity: grownCount > index || hoveredIndex === index ? 1 : 0,
            transition: 'opacity .28s ease',
          }}
        >
          <div
            className="topic-orbit-node-label"
            data-done={node.done ? 'true' : 'false'}
            data-due-today={!node.done && node.dueToday ? 'true' : 'false'}
          >
            {node.title}
            {collapsedIds.has(node.id) && <span className="topic-orbit-node-folded">+{(childrenOf.get(node.id) || []).length}</span>}
          </div>
        </Html>
      ))}
    </group>
  );
}
