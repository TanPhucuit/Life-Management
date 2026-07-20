import * as THREE from 'three';
import { TreeLayout, TreeLayoutEdge, TreeLayoutNode, TreeTaskInput } from './types';

// A grown tree, not a diagram: children fan out on a cone around whatever
// direction their parent grew in, so every branch keeps its own heading and the
// whole thing reads as organic rather than as a radial chart.
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

export function buildTreeLayout(tasks: TreeTaskInput[], rootId: string): TreeLayout {
  const byParent = new Map<string | null, TreeTaskInput[]>();
  tasks.forEach((task) => {
    const key = task.parentId;
    byParent.set(key, [...(byParent.get(key) || []), task]);
  });

  const root = tasks.find((task) => task.id === rootId);
  const nodes: TreeLayoutNode[] = [];
  const edges: TreeLayoutEdge[] = [];
  if (!root) return { nodes, edges, growthEndsAt: 0, completionEndsAt: 0, reach: 0 };

  const axisByNode = new Map<string, THREE.Vector3>();
  const positionByNode = new Map<string, THREE.Vector3>();
  const rootPosition = new THREE.Vector3(0, 0, 0);
  const rootAxis = new THREE.Vector3(0, 1, 0);
  positionByNode.set(root.id, rootPosition);
  axisByNode.set(root.id, rootAxis);
  nodes.push({ ...root, depth: 0, position: [0, 0, 0], growAt: 0, completeAt: 0 });

  let reach = 0;
  const queue: Array<{ id: string; depth: number; grownAt: number }> = [{ id: root.id, depth: 0, grownAt: 0 }];
  const basisU = new THREE.Vector3();
  const basisV = new THREE.Vector3();
  const helper = new THREE.Vector3();

  while (queue.length && nodes.length < MAX_NODES) {
    const current = queue.shift() as { id: string; depth: number; grownAt: number };
    const children = byParent.get(current.id) || [];
    if (!children.length) continue;

    const parentPosition = positionByNode.get(current.id) as THREE.Vector3;
    const axis = axisByNode.get(current.id) as THREE.Vector3;
    // Any vector not parallel to the axis gives a stable perpendicular basis.
    helper.set(Math.abs(axis.y) > 0.92 ? 1 : 0, Math.abs(axis.y) > 0.92 ? 0 : 1, 0);
    basisU.copy(helper).cross(axis).normalize();
    basisV.copy(axis).cross(basisU).normalize();

    const cone = children.length === 1
      ? 0.16
      : Math.min(0.85, Math.max(0.34, 0.78 - current.depth * 0.1)) * (children.length > 5 ? 1.15 : 1);
    const length = SEGMENT_BASE * Math.pow(SEGMENT_FALLOFF, current.depth) * (children.length > 6 ? 1.25 : 1);

    children.forEach((child, index) => {
      if (nodes.length >= MAX_NODES) return;
      // Golden-angle offset per depth stops grandchildren from landing in the
      // same plane as their aunts and uncles.
      const spin = (index / children.length) * Math.PI * 2 + current.depth * 2.39996;
      const direction = new THREE.Vector3()
        .copy(axis).multiplyScalar(Math.cos(cone))
        .addScaledVector(basisU, Math.sin(cone) * Math.cos(spin))
        .addScaledVector(basisV, Math.sin(cone) * Math.sin(spin))
        .normalize();
      const position = new THREE.Vector3().copy(parentPosition).addScaledVector(direction, length);

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
      reach = Math.max(reach, position.length());
      queue.push({ id: child.id, depth: current.depth + 1, grownAt: endAt });
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
    growthEndsAt,
    completionEndsAt: completionStart + Math.max(0, completionIndex - 1) * COMPLETION_STEP_MS,
    reach: Math.max(1.4, reach),
  };
}
