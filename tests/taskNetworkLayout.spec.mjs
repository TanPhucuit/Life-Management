// Đo độ chồng lấn của bố cục toả tròn, chạy trên CÂY THẬT:
//   TASKS_JSON=<dump.json> npx tsx tests/taskNetworkLayout.spec.mjs
//
// Mỗi node vẽ ra là một vòng tròn 74px kèm nhãn nằm ngay dưới, rộng tới 190px.
// Nên "rối mắt" đo được: đếm số cặp node có ô chữ nhật bao (tròn + nhãn) đè lên
// nhau. Đó chính là các nhãn chồng chữ lên nhau trong ảnh người dùng gửi.

import { readFileSync } from 'fs';
import { buildNetworkLayout, findDefaultCollapsed, MAX_EXPANDED_CHILDREN } from '../app/components/taskNetworkLayout.ts';

const raw = JSON.parse(readFileSync(process.env.TASKS_JSON, 'utf-8'));
const topic = raw.topics.find((t) => /english/i.test(t.name));
const all = raw.tasks.filter((t) => t.topic_id === topic.id && !t.archived_at);
const byId = new Map(all.map((t) => [t.id, t]));
const ROOT = `topic:${topic.id}`;
const tasks = all.map((t) => ({
  id: t.id,
  parentId: t.parent_task_id && byId.has(t.parent_task_id) ? t.parent_task_id : null,
  title: t.title,
}));

// Ô bao thực tế: vòng tròn 74px, nhãn rộng tối đa 190px nằm dưới, cao ~22px.
const NODE_CIRCLE = 74;
const LABEL_MAX = 190;
const boxOf = (task, position) => {
  const labelWidth = Math.min(LABEL_MAX, 16 + (task?.title?.length || 6) * 6.2);
  const width = Math.max(NODE_CIRCLE, labelWidth);
  const height = NODE_CIRCLE + 8 + 22;
  return { x: position.x - width / 2, y: position.y - NODE_CIRCLE / 2, width, height };
};

// Cách xếp CŨ, chép nguyên văn từ TaskManager: bán kính CHỈ theo độ sâu, và là
// hình bầu dục nên chiều dọc còn bị bóp thêm.
function legacy() {
  const byParent = new Map();
  tasks.forEach((t) => byParent.set(t.parentId ?? ROOT, [...(byParent.get(t.parentId ?? ROOT) || []), t]));
  const children = (id) => byParent.get(id) || [];
  const leafCount = (t) => (children(t.id).length ? children(t.id).reduce((s, c) => s + leafCount(c), 0) : 1);
  const roots = children(ROOT);
  const totalLeaves = Math.max(1, roots.reduce((s, r) => s + leafCount(r), 0));
  const rootRadiusX = 430;
  const rootRadiusY = 285;
  const positions = { [ROOT]: { x: 0, y: 0 } };
  let cursor = 0;
  const assign = (t, depth) => {
    const kids = children(t.id);
    const angle = kids.length
      ? kids.reduce((s, c) => s + assign(c, depth + 1), 0) / kids.length
      : -Math.PI / 2 + (cursor++ / totalLeaves) * Math.PI * 2;
    positions[t.id] = {
      x: Math.cos(angle) * (rootRadiusX + (depth - 1) * 176),
      y: Math.sin(angle) * (rootRadiusY + (depth - 1) * 112),
    };
    return angle;
  };
  roots.forEach((r) => assign(r, 1));
  return { positions, hiddenIds: new Set(), hiddenChildCount: {} };
}

function measure(label, layout) {
  const visible = Object.keys(layout.positions).filter((id) => !layout.hiddenIds.has(id));
  const boxes = visible.map((id) => ({ id, ...boxOf(byId.get(id), layout.positions[id]) }));

  let overlaps = 0;
  let worst = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (dx > 0 && dy > 0) {
        overlaps += 1;
        worst = Math.max(worst, Math.min(dx, dy));
      }
    }
  }

  const extent = Math.max(...boxes.map((b) => Math.max(Math.abs(b.x), Math.abs(b.x + b.width), Math.abs(b.y), Math.abs(b.y + b.height))));
  console.log(
    `${label.padEnd(32)} hien=${String(visible.length).padStart(4)}/${tasks.length + 1}` +
      ` nhan_chong_nhau=${String(overlaps).padStart(5)}` +
      ` de_nhau_toi_da=${String(Math.round(worst)).padStart(4)}px` +
      ` ban_kinh=${String(Math.round(extent)).padStart(5)}px`,
  );
}

const base = { rootId: ROOT, tasks, baseRadius: 430, depthStep: 176, nodeFootprint: 198 };

console.log(`\nChu de "${topic.name}": ${tasks.length} task\n`);
measure('CU: ban kinh theo do sau', legacy());
measure('MOI: ban kinh du rong', buildNetworkLayout(base));
const folded = new Set(findDefaultCollapsed(tasks, ROOT));
measure(`MOI: + gap san (>${MAX_EXPANDED_CHILDREN} con)`, buildNetworkLayout({ ...base, collapsedIds: folded }));
console.log(`\nSo nhom gap san: ${folded.size}\n`);
