// Đo độ chật của cây task toả tròn (view "task network"), chạy bằng:
//   TASKS_JSON=<dump.json> npx tsx tests/taskNetworkSpacing.spec.mjs
//
// Bố cục cho mỗi LÁ đang hiện một góc chia đều trên 360 độ, còn bán kính thì
// chỉ theo độ sâu. Nên độ chật phụ thuộc thẳng vào SỐ NODE ĐANG MỞ: mở càng
// nhiều, cung dành cho mỗi nhãn càng hẹp, tới lúc nhãn đè lên nhau.
//
// Đây là lý do "bấm một phát mở nguyên cây con" phải bỏ: nó nhảy thẳng từ vài
// node lên 140 node, tức từ thoáng sang không đọc nổi, chỉ trong một cú bấm.

import { readFileSync } from 'fs';

const raw = JSON.parse(readFileSync(process.env.TASKS_JSON, 'utf-8'));
const topic = raw.topics.find((t) => /english/i.test(t.name));
const all = raw.tasks.filter((t) => t.topic_id === topic.id && !t.archived_at);
const byId = new Map(all.map((t) => [t.id, t]));
const ROOT = 'topic';
const byParent = new Map();
all.forEach((t) => {
  const key = t.parent_task_id && byId.has(t.parent_task_id) ? t.parent_task_id : ROOT;
  byParent.set(key, [...(byParent.get(key) || []), t]);
});

// Vòng tròn 74px, nhãn nằm dưới rộng tới 190px — lấy từ .desktop-network-node.
const NODE_CIRCLE = 74;
const LABEL_MAX = 190;

// Công thức bố cục hiện tại, chép từ TaskManager: góc chia đều cho lá, bán kính
// theo độ sâu, và là hình bầu dục.
function layout(expanded) {
  const children = (id) => (expanded.has(id) || id === ROOT ? byParent.get(id) || [] : []);
  const leafCount = (t) => (children(t.id).length ? children(t.id).reduce((s, c) => s + leafCount(c), 0) : 1);
  const roots = children(ROOT);
  const total = Math.max(1, roots.reduce((s, r) => s + leafCount(r), 0));
  const positions = {};
  let cursor = 0;
  const assign = (t, depth) => {
    const kids = children(t.id);
    const angle = kids.length
      ? kids.reduce((s, c) => s + assign(c, depth + 1), 0) / kids.length
      : -Math.PI / 2 + (cursor++ / total) * Math.PI * 2;
    positions[t.id] = {
      title: t.title,
      x: Math.cos(angle) * (430 + (depth - 1) * 176),
      y: Math.sin(angle) * (285 + (depth - 1) * 112),
    };
    return angle;
  };
  roots.forEach((r) => assign(r, 1));
  return positions;
}

function overlaps(positions) {
  const boxes = Object.values(positions).map((p) => {
    const width = Math.max(NODE_CIRCLE, Math.min(LABEL_MAX, 16 + (p.title?.length || 6) * 6.2));
    return { x: p.x - width / 2, y: p.y - NODE_CIRCLE / 2, width, height: NODE_CIRCLE + 30 };
  });
  let count = 0;
  let worst = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (dx > 0 && dy > 0) {
        count += 1;
        worst = Math.max(worst, Math.min(dx, dy));
      }
    }
  }
  return { count, worst, nodes: boxes.length };
}

// Mở nguyên cây con dưới một node — đúng cách cũ làm khi bấm vào node đó.
function wholeSubtree(id) {
  const set = new Set();
  const walk = (parentId) => {
    (byParent.get(parentId) || []).forEach((child) => {
      if (!(byParent.get(child.id) || []).length) return;
      set.add(child.id);
      walk(child.id);
    });
  };
  set.add(id);
  walk(id);
  return set;
}

const reading = (byParent.get(ROOT) || []).find((t) => /^READING$/i.test(t.title));
console.log(`\nChu de "${topic.name}": ${all.length} task, bam vao "${reading.title}"\n`);

const oneLevel = new Set([reading.id]);
const a = overlaps(layout(oneLevel));
console.log(`mo MOT cap   node hien=${String(a.nodes).padStart(4)}  nhan de nhau=${String(a.count).padStart(4)}  de nhau toi da=${Math.round(a.worst)}px`);

const everything = wholeSubtree(reading.id);
const b = overlaps(layout(everything));
console.log(`mo CA CAY CON node hien=${String(b.nodes).padStart(4)}  nhan de nhau=${String(b.count).padStart(4)}  de nhau toi da=${Math.round(b.worst)}px`);
console.log('');
