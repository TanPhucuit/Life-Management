import * as THREE from 'three';
import { TreeLayout, TreeLayoutEdge, TreeLayoutNode, TreeTaskInput } from './types';

// A grown tree, not a diagram: children fan out on a cone around whatever
// direction their parent grew in, so every branch keeps its own heading and the
// whole thing reads as organic rather than as a radial chart.
//
// Where the children sit on that cone is NOT shared out evenly, though. Equal
// angular shares were what made the scene unreadable on real data: a parent
// whose children are "one leaf, one leaf, a 21-item branch, an 84-item branch"
// gave the two huge branches exactly as much room as the two leaves, so their
// subtrees grew straight into each other. Measured on that exact shape, 168
// pairs of nodes overlapped. Each child now gets an angular slice sized to its
// own subtree, and the ring they sit on is widened until every slice fits.
const SEGMENT_BASE = 1.55;
const SEGMENT_FALLOFF = 0.84;
// Deliberately unhurried: a branch that snaps into place reads as a pop-in,
// not as a signal travelling from parent to child.
export const EDGE_DURATION_MS = 900;
const SIBLING_STAGGER_MS = 150;
const COMPLETION_GAP_MS = 520;
const COMPLETION_STEP_MS = 160;
// Hard cap: a runaway subtree must not be able to stall the scene.
const MAX_NODES = 260;

// Space a childless node needs to itself, in world units. Its drawn radius is
// about 0.12, so this leaves a clear gap rather than letting spheres kiss.
const LEAF_RADIUS = 0.34;
// Leave a tenth of the ring unused so branches have visible daylight between
// them instead of being packed corner to corner.
const RING_SLACK = 0.9;
// A lone child carries on nearly straight ahead; a tiny offset keeps the tree
// looking grown rather than like a ruler-drawn chain.
const SINGLE_CHILD_LEAN = 0.16;

/**
 * Above this many children, a node opens folded and shows a "+N" badge instead
 * of dumping its whole list into the scene. Eight is about what stays readable
 * on one cone; a "LEARN ENG_ENG" node with 21 practice sets does not.
 */
export const MAX_EXPANDED_CHILDREN = 8;

/** Smallest ring radius that fits every child's angular slice without overlap. */
function packRingRadius(childRadii: number[]): number {
  if (childRadii.length === 0) return 0;
  if (childRadii.length === 1) return 0;

  const largest = Math.max(...childRadii);
  // A child at ring radius R occupies a half-angle of asin(r / R), so the ring
  // is wide enough once every slice adds up to no more than a full turn.
  const angularDemand = (radius: number) =>
    childRadii.reduce((total, r) => total + 2 * Math.asin(Math.min(1, r / radius)), 0);

  let low = largest;
  let high = largest * childRadii.length + 1;
  const budget = Math.PI * 2 * RING_SLACK;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (angularDemand(middle) > budget) low = middle;
    else high = middle;
  }
  return high;
}

export function buildTreeLayout(tasks: TreeTaskInput[], rootId: string): TreeLayout {
  const byParent = new Map<string | null, TreeTaskInput[]>();
  tasks.forEach((task) => {
    const key = task.parentId;
    byParent.set(key, [...(byParent.get(key) || []), task]);
  });

  const root = tasks.find((task) => task.id === rootId);
  const nodes: TreeLayoutNode[] = [];
  const edges: TreeLayoutEdge[] = [];
  const defaultCollapsedIds: string[] = [];
  if (!root) {
    return { nodes, edges, defaultCollapsedIds, growthEndsAt: 0, completionEndsAt: 0, reach: 0 };
  }

  // Pass 1, bottom-up: how much room does each subtree need, measured across
  // the cone its parent will place it on. Nothing can be positioned until this
  // is known, which is exactly what the old single-pass walk was missing.
  const radiusOf = new Map<string, number>();
  const ringOf = new Map<string, number>();
  const measure = (id: string, depth: number): number => {
    const cached = radiusOf.get(id);
    if (cached !== undefined) return cached;
    const children = byParent.get(id) || [];
    if (!children.length || depth >= 12) {
      radiusOf.set(id, LEAF_RADIUS);
      return LEAF_RADIUS;
    }
    const childRadii = children.map((child) => measure(child.id, depth + 1));
    const ring = packRingRadius(childRadii);
    ringOf.set(id, ring);
    const radius = ring + Math.max(...childRadii);
    radiusOf.set(id, radius);
    return radius;
  };
  measure(root.id, 0);

  const positionByNode = new Map<string, THREE.Vector3>();
  const axisByNode = new Map<string, THREE.Vector3>();
  const rootPosition = new THREE.Vector3(0, 0, 0);
  positionByNode.set(root.id, rootPosition);
  axisByNode.set(root.id, new THREE.Vector3(0, 1, 0));
  nodes.push({ ...root, depth: 0, position: [0, 0, 0], growAt: 0, completeAt: 0 });

  let reach = 0;
  const queue: Array<{ id: string; depth: number; grownAt: number; hidden: boolean }> = [
    { id: root.id, depth: 0, grownAt: 0, hidden: false },
  ];
  const basisU = new THREE.Vector3();
  const basisV = new THREE.Vector3();
  const helper = new THREE.Vector3();

  while (queue.length && nodes.length < MAX_NODES) {
    const current = queue.shift() as { id: string; depth: number; grownAt: number; hidden: boolean };
    const children = byParent.get(current.id) || [];
    if (!children.length) continue;

    // Too many children to read at once: this one opens folded. Its subtree is
    // still laid out and still animates open on click — it just is not in the
    // way until asked for.
    const foldsByDefault = children.length > MAX_EXPANDED_CHILDREN;
    if (foldsByDefault && current.depth > 0) defaultCollapsedIds.push(current.id);

    const parentPosition = positionByNode.get(current.id) as THREE.Vector3;
    const axis = axisByNode.get(current.id) as THREE.Vector3;
    // Any vector not parallel to the axis gives a stable perpendicular basis.
    helper.set(Math.abs(axis.y) > 0.92 ? 1 : 0, Math.abs(axis.y) > 0.92 ? 0 : 1, 0);
    basisU.copy(helper).cross(axis).normalize();
    basisV.copy(axis).cross(basisU).normalize();

    const childRadii = children.map((child) => radiusOf.get(child.id) ?? LEAF_RADIUS);
    const ring = ringOf.get(current.id) ?? packRingRadius(childRadii);
    // The axial step keeps pace with how wide the ring got, so a fan of many
    // children reads as a cone opening away from the parent rather than as a
    // flat disc pasted onto it.
    const length = Math.max(SEGMENT_BASE * Math.pow(SEGMENT_FALLOFF, current.depth), ring * 0.85);

    // Each child owns a slice of the ring proportional to its own subtree, so
    // a heavy branch is handed the room it needs and a leaf takes only a sliver.
    const totalDemand = childRadii.reduce(
      (total, radius) => total + (ring > 0 ? 2 * Math.asin(Math.min(1, radius / ring)) : Math.PI * 2 / children.length),
      0,
    );
    // Golden-angle offset per depth stops grandchildren from landing in the
    // same plane as their aunts and uncles.
    let angle = current.depth * 2.39996;

    children.forEach((child, index) => {
      if (nodes.length >= MAX_NODES) return;
      const childRadius = childRadii[index];
      const slice = ring > 0
        ? (2 * Math.asin(Math.min(1, childRadius / ring)) / totalDemand) * Math.PI * 2
        : 0;
      angle += slice / 2;

      const offset = ring > 0 ? ring : length * SINGLE_CHILD_LEAN;
      const position = new THREE.Vector3()
        .copy(parentPosition)
        .addScaledVector(axis, length)
        .addScaledVector(basisU, Math.cos(angle) * offset)
        .addScaledVector(basisV, Math.sin(angle) * offset);
      angle += slice / 2;

      const direction = new THREE.Vector3().subVectors(position, parentPosition).normalize();
      const startAt = current.grownAt + index * SIBLING_STAGGER_MS;
      const endAt = startAt + EDGE_DURATION_MS;
      positionByNode.set(child.id, position);
      axisByNode.set(child.id, direction);
      nodes.push({
        ...child,
        depth: current.depth + 1,
        position: [position.x, position.y, position.z],
        growAt: endAt,
        completeAt: 0,
      });
      edges.push({
        id: `${current.id}:${child.id}`,
        fromId: current.id,
        toId: child.id,
        from: [parentPosition.x, parentPosition.y, parentPosition.z],
        to: [position.x, position.y, position.z],
      });
      const hidden = current.hidden || foldsByDefault;
      // The camera frames what is actually on screen; counting folded-away
      // branches would zoom out to fit a tree nobody can see yet.
      if (!hidden) reach = Math.max(reach, position.length());
      queue.push({ id: child.id, depth: current.depth + 1, grownAt: endAt, hidden });
    });
  }

  const growthEndsAt = nodes.reduce((maximum, node) => Math.max(maximum, node.growAt), 0);

  // Progress is revealed only after the whole structure stands, and it climbs:
  // the deepest finished tasks light first, then their parents — the same
  // child-to-parent direction the connectors fill in.
  const completionStart = growthEndsAt + COMPLETION_GAP_MS;
  let completionIndex = 0;
  nodes
    .slice()
    .sort((left, right) => right.depth - left.depth || left.growAt - right.growAt || left.id.localeCompare(right.id))
    .forEach((node) => {
      if (!node.done) return;
      node.completeAt = completionStart + completionIndex * COMPLETION_STEP_MS;
      completionIndex += 1;
    });

  return {
    nodes,
    edges,
    defaultCollapsedIds,
    growthEndsAt,
    completionEndsAt: completionStart + Math.max(0, completionIndex - 1) * COMPLETION_STEP_MS,
    reach: Math.max(1.4, reach),
  };
}
