// Đo mức chồng lấn của bố cục cây, chạy bằng: node tests/treeLayout.spec.mjs
//
// Bố cục là hình học thuần tuý nên đo được bằng số, không cần nhìn bằng mắt:
// đếm số cặp node nằm gần nhau hơn bán kính vẽ của chúng. Đó chính là thứ tạo
// ra cảm giác "chằng chịt, chồng lấn" trên màn hình.

import { buildTreeLayout } from '../app/components/topic-orbit/treeLayout.ts';

// Bán kính vẽ thực tế lấy từ KnowledgeTree3D: 0.135 * 0.92^depth, nhân 1.18 cho
// node có con và 0.86 cho node lá.
function drawnRadius(node) {
  return 0.135 * Math.pow(0.92, node.depth) * (node.isLeaf ? 0.86 : 1.18);
}

function makeTasks(rootId, shape) {
  const tasks = [{ id: rootId, parentId: null, title: rootId, done: false, isLeaf: false, urgent: false }];
  let frontier = [rootId];
  shape.forEach((count, depth) => {
    const next = [];
    frontier.forEach((parentId) => {
      for (let i = 0; i < count; i += 1) {
        const id = `${parentId}.${i}`;
        tasks.push({
          id,
          parentId,
          title: id,
          done: false,
          isLeaf: depth === shape.length - 1,
          urgent: false,
        });
        next.push(id);
      }
    });
    frontier = next;
  });
  return tasks;
}

function measure(label, tasks, rootId) {
  const layout = buildTreeLayout(tasks, rootId);
  const nodes = layout.nodes;

  let collisions = 0;
  let worstOverlap = 0;
  let minGap = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = a.position[0] - b.position[0];
      const dy = a.position[1] - b.position[1];
      const dz = a.position[2] - b.position[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const needed = drawnRadius(a) + drawnRadius(b);
      minGap = Math.min(minGap, distance - needed);
      if (distance < needed) {
        collisions += 1;
        worstOverlap = Math.max(worstOverlap, needed - distance);
      }
    }
  }

  // Khoảng cách nhỏ nhất giữa hai đoạn thẳng không chung đầu mút — đây mới là
  // thứ tạo cảm giác "chằng chịt": các nhánh chạy sát/cắt qua nhau.
  const segmentDistance = (p1, p2, p3, p4) => {
    const u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v = [p4[0] - p3[0], p4[1] - p3[1], p4[2] - p3[2]];
    const w = [p1[0] - p3[0], p1[1] - p3[1], p1[2] - p3[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w);
    const D = a * c - b * b;
    let sc, sN, sD = D, tc, tN, tD = D;
    if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; }
    else {
      sN = b * e - c * d; tN = a * e - b * d;
      if (sN < 0) { sN = 0; tN = e; tD = c; }
      else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
    }
    if (tN < 0) { tN = 0; if (-d < 0) sN = 0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } }
    else if (tN > tD) { tN = tD; if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD; else { sN = -d + b; sD = a; } }
    sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD;
    tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
    const dp = [w[0] + sc * u[0] - tc * v[0], w[1] + sc * u[1] - tc * v[1], w[2] + sc * u[2] - tc * v[2]];
    return Math.sqrt(dot(dp, dp));
  };

  const edges = layout.edges;
  let edgeClashes = 0;
  let minEdgeGap = Infinity;
  const NEAR = 0.06; // xấp xỉ bề dày nhánh vẽ ra
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i], b = edges[j];
      // Bỏ qua các cạnh chung đầu mút (cha-con, anh-em) vì chúng phải chạm nhau.
      if (a.fromId === b.fromId || a.fromId === b.toId || a.toId === b.fromId || a.toId === b.toId) continue;
      const gap = segmentDistance(a.from, a.to, b.from, b.to);
      minEdgeGap = Math.min(minEdgeGap, gap);
      if (gap < NEAR) edgeClashes += 1;
    }
  }

  // Cây trải quá rộng thì dù không chồng lấn vẫn rất mệt khi di chuyển: phải
  // kéo rất xa mới tới được nhánh kế bên. Đo luôn cả hai.
  const farthest = Math.max(...nodes.map((n) => Math.hypot(n.position[0], n.position[1], n.position[2])));
  const longestEdge = Math.max(
    0,
    ...layout.edges.map((e) => Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1], e.to[2] - e.from[2])),
  );

  const pairs = (nodes.length * (nodes.length - 1)) / 2;
  console.log(
    `${label.padEnd(34)} nodes=${String(nodes.length).padStart(4)}` +
      ` xa_nhat=${farthest.toFixed(2).padStart(6)}` +
      ` nhanh_dai_nhat=${longestEdge.toFixed(2).padStart(6)}` +
      ` va_cham=${String(collisions).padStart(5)}/${String(pairs).padStart(6)}` +
      ` (${((collisions / Math.max(1, pairs)) * 100).toFixed(2)}%)` +
      ` khe_node=${minGap === Infinity ? 'n/a' : minGap.toFixed(3)}` +
      ` nhanh_sat_nhau=${String(edgeClashes).padStart(5)}` +
      ` khe_nhanh=${minEdgeGap === Infinity ? 'n/a' : minEdgeGap.toFixed(3)}`,
  );
  return { nodes: nodes.length, collisions, worstOverlap, edgeClashes };
}

// Cây LỆCH: anh em có subtree to nhỏ rất khác nhau — đúng hình dạng dữ liệu
// thật (READING có con vừa là lá, vừa là nhánh 21 mục). Chia đều góc cho mọi
// anh em ở đây chính là chỗ vỡ trận.
function makeLopsided(rootId, childSizes) {
  const tasks = [{ id: rootId, parentId: null, title: rootId, done: false, isLeaf: false, urgent: false }];
  childSizes.forEach((size, index) => {
    const branchId = `${rootId}.b${index}`;
    tasks.push({ id: branchId, parentId: rootId, title: branchId, done: false, isLeaf: size === 0, urgent: false });
    for (let i = 0; i < size; i += 1) {
      tasks.push({ id: `${branchId}.${i}`, parentId: branchId, title: `${branchId}.${i}`, done: false, isLeaf: true, urgent: false });
    }
  });
  return tasks;
}

console.log('');
measure('hep      (3 x 3 x 3)', makeTasks('r', [3, 3, 3]), 'r');
measure('rong     (1 node, 21 con)', makeTasks('r', [21]), 'r');
measure('rat rong (1 node, 40 con)', makeTasks('r', [40]), 'r');
measure('that     (4 mode x 21 set)', makeTasks('r', [4, 21]), 'r');
measure('sau      (2 x 2 x 2 x 2 x 2)', makeTasks('r', [2, 2, 2, 2, 2]), 'r');
measure('lech     (0,0,21,0,84,0,3)', makeLopsided('r', [0, 0, 21, 0, 84, 0, 3]), 'r');
measure('lech nhe (1,2,20,2,1)', makeLopsided('r', [1, 2, 20, 2, 1]), 'r');
console.log('');

// Tự gập: nút quá nhiều con phải mở ở trạng thái đã gập, và số node hiện ra
// ngay từ đầu phải nhỏ hơn hẳn tổng số node.
function visibleCount(tasks, rootId) {
  const layout = buildTreeLayout(tasks, rootId);
  const childrenOf = new Map();
  layout.edges.forEach((e) => childrenOf.set(e.fromId, [...(childrenOf.get(e.fromId) || []), e.toId]));
  const hidden = new Set();
  const queue = [...layout.defaultCollapsedIds];
  while (queue.length) {
    const id = queue.shift();
    (childrenOf.get(id) || []).forEach((childId) => { hidden.add(childId); queue.push(childId); });
  }
  return { total: layout.nodes.length, visible: layout.nodes.length - hidden.size, folded: layout.defaultCollapsedIds.length };
}

console.log('--- tu gap node nhieu con ---');
for (const [label, tasks] of [
  ['lech (0,0,21,0,84,0,3)', makeLopsided('r', [0, 0, 21, 0, 84, 0, 3])],
  ['that (4 mode x 21 set)', makeTasks('r', [4, 21])],
  ['hep  (3 x 3 x 3)', makeTasks('r', [3, 3, 3])],
]) {
  const r = visibleCount(tasks, 'r');
  console.log(`${label.padEnd(26)} tong=${String(r.total).padStart(4)} hien_ngay=${String(r.visible).padStart(4)} nut_gap=${r.folded}`);
}
console.log('');
