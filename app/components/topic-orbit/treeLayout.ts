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
// about 0.11, so this still leaves a visible gap rather than letting spheres
// kiss — while keeping the tree small enough to move around in.
const LEAF_RADIUS = 0.24;
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

/** Smallest radius at which this set of children fits side by side on one ring. */
function ringRadiusFor(radii: number[]): number {
  if (radii.length <= 1) return 0;
  const largest = Math.max(...radii);
  const demand = (radius: number) =>
    radii.reduce((total, r) => total + 2 * Math.asin(Math.min(1, r / radius)), 0);
  let low = largest;
  let high = largest * radii.length + 1;
  const budget = Math.PI * 2 * RING_SLACK;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (demand(middle) > budget) low = middle;
    else high = middle;
  }
  return high;
}

/**
 * How far a single ring may grow past its innermost allowed radius before it is
 * cheaper to start a new ring further out. Without a limit every child lands on
 * one enormous ring; with it set too low, two children get a ring each and a
 * deep tree stretches out forever. Three keeps small fans on one ring and still
 * breaks large ones up.
 */
const RING_GROWTH = 3;

interface ChildSlot {
  /** Distance from the cone's centre line. */
  radius: number;
  angle: number;
}

/**
 * Lay children out on CONCENTRIC rings around the cone axis.
 *
 * One single ring was the reason branches ended up so far away: 84 children
 * each needing 0.24 of room have to sit on a circle whose circumference can
 * hold them all, which puts them roughly 9 world units out in one step. Rings
 * fill by area instead, so the same 84 children land under 3 units out and the
 * tree stays something you can pan around.
 *
 * Children are taken largest-first, so a heavy subtree claims the inner ring
 * and the small ones fill in outwards.
 */
function packRings(childRadii: number[]): ChildSlot[] {
  const slots: ChildSlot[] = new Array(childRadii.length);
  if (childRadii.length === 0) return slots;
  if (childRadii.length === 1) {
    slots[0] = { radius: 0, angle: 0 };
    return slots;
  }

  const order = childRadii
    .map((radius, index) => ({ radius, index }))
    .sort((left, right) => right.radius - left.radius);

  // A child at ring radius R blocks a half-angle of asin(r / R) either side.
  const slice = (radius: number, ring: number) => 2 * Math.asin(Math.min(1, radius / ring));

  let inner = 0;
  let cursor = 0;
  let ringIndex = 0;
  while (cursor < order.length) {
    const widest = order[cursor].radius;
    // A ring may never sit closer in than whatever the previous ring occupies.
    const floorRadius = inner + widest;
    const members: Array<{ radius: number; index: number }> = [];
    let ring = floorRadius;
    while (cursor < order.length) {
      const trial = [...members, order[cursor]].map((member) => member.radius);
      const needed = Math.max(floorRadius, ringRadiusFor(trial));
      // Keep taking children while widening this ring stays cheaper than
      // starting another one further out.
      if (members.length && needed > floorRadius * RING_GROWTH) break;
      ring = needed;
      members.push(order[cursor]);
      cursor += 1;
    }

    // Golden angle per ring so rings do not line up into visible spokes.
    let angle = ringIndex * 2.39996;
    const total = members.reduce((sum, member) => sum + slice(member.radius, ring), 0) || 1;
    members.forEach((member) => {
      const share = (slice(member.radius, ring) / total) * Math.PI * 2;
      angle += share / 2;
      slots[member.index] = { radius: ring, angle };
      angle += share / 2;
    });

    inner = ring + widest;
    ringIndex += 1;
  }

  return slots;
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
  const slotsOf = new Map<string, ChildSlot[]>();
  const measure = (id: string, depth: number): number => {
    const cached = radiusOf.get(id);
    if (cached !== undefined) return cached;
    const children = byParent.get(id) || [];
    if (!children.length || depth >= 12) {
      radiusOf.set(id, LEAF_RADIUS);
      return LEAF_RADIUS;
    }
    const childRadii = children.map((child) => measure(child.id, depth + 1));
    const slots = packRings(childRadii);
    slotsOf.set(id, slots);
    // The subtree reaches as far as its outermost child's own edge.
    const radius = Math.max(...childRadii.map((childRadius, index) => slots[index].radius + childRadius));
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
    const slots = slotsOf.get(current.id) ?? packRings(childRadii);
    // Segment length stays on its original, compact scale. It used to be
    // stretched to match the ring, which turned a wide fan into a branch many
    // world units long and made the tree tiring to move around in.
    const length = SEGMENT_BASE * Math.pow(SEGMENT_FALLOFF, current.depth);

    children.forEach((child, index) => {
      if (nodes.length >= MAX_NODES) return;
      const slot = slots[index] ?? { radius: 0, angle: 0 };
      // A lone child carries on nearly straight ahead rather than sitting dead
      // centre on the axis, so the tree still looks grown rather than ruled.
      const offset = slot.radius > 0 ? slot.radius : length * SINGLE_CHILD_LEAN;
      const angle = slot.angle + current.depth * 2.39996;
      const position = new THREE.Vector3()
        .copy(parentPosition)
        .addScaledVector(axis, length)
        .addScaledVector(basisU, Math.cos(angle) * offset)
        .addScaledVector(basisV, Math.sin(angle) * offset);

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
