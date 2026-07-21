'use client';

// Dev-only harness for the Topic Orbit scene: it mounts the real view with
// synthetic tasks so the visuals can be checked without a Supabase session.
import { useCallback, useMemo, useState } from 'react';
import { TopicOrbitView } from '@/app/components/topic-orbit/TopicOrbitView';
import type { OrbitPlanetInput, TreeTaskInput } from '@/app/components/topic-orbit/types';

const ACCENTS = ['#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#fb7185', '#60a5fa'];

// Stand-ins for real life roots — the label on the hole is always the topic name.
const TOPICS = [
  { id: 'career', name: 'Career & Craft', accent: '#7c3aed', count: 9 },
  { id: 'health', name: 'Health & Energy', accent: '#0ea5e9', count: 5 },
  { id: 'study', name: 'IELTS & Study', accent: '#f97316', count: 14 },
];

function makeMockData(topicId: string, planetCount: number) {
  const planets: OrbitPlanetInput[] = [];
  const subtrees = new Map<string, TreeTaskInput[]>();

  for (let index = 0; index < planetCount; index += 1) {
    const id = `${topicId}-p${index}`;
    const completion = (index % 5) / 4;
    const done = completion >= 1;
    // A scattering of "due today" work at both levels, so the amber can be
    // checked on a planet and on a buried node without needing real data.
    const planetDueToday = !done && index % 4 === 1;
    planets.push({
      id,
      title: `Project ${index + 1}`,
      status: done ? 'completed' : completion > 0 ? 'in_progress' : 'not_completed',
      importance: ((index * 37) % 100) / 100,
      childCount: 2 + (index % 4),
      accent: ACCENTS[index % ACCENTS.length],
      completion,
      dueToday: planetDueToday,
    });

    const nodes: TreeTaskInput[] = [
      { id, parentId: null, title: `Project ${index + 1}`, done, isLeaf: false, dueToday: planetDueToday },
    ];
    const branches = 2 + (index % 4);
    for (let b = 0; b < branches; b += 1) {
      const branchId = `${id}-b${b}`;
      const branchDone = b % 3 === 0;
      nodes.push({
        id: branchId, parentId: id, title: `Branch ${b + 1}`, done: branchDone, isLeaf: false,
        dueToday: !branchDone && (index + b) % 3 === 0,
      });
      const leaves = 2 + ((index + b) % 3);
      for (let l = 0; l < leaves; l += 1) {
        const leafId = `${branchId}-l${l}`;
        const leafDone = (l + b) % 2 === 0;
        nodes.push({
          id: leafId, parentId: branchId, title: `Task ${b + 1}.${l + 1}`, done: leafDone, isLeaf: l % 3 !== 0,
          dueToday: !leafDone && (l + index) % 3 === 1,
        });
        if (l % 3 === 0) {
          for (let g = 0; g < 2; g += 1) {
            nodes.push({
              id: `${leafId}-g${g}`, parentId: leafId, title: `Step ${g + 1}`, done: g === 0, isLeaf: true,
              dueToday: g === 1 && index % 2 === 0,
            });
          }
        }
      }
    }
    subtrees.set(id, nodes);
  }
  return { planets, subtrees };
}

export default function OrbitPreviewPage() {
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const topic = TOPICS.find((entry) => entry.id === topicId) || TOPICS[0];
  const { planets, subtrees } = useMemo(() => makeMockData(topic.id, topic.count), [topic.count, topic.id]);
  const getSubtree = useCallback((taskId: string) => subtrees.get(taskId) || [], [subtrees]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#01030a' }}>
      <TopicOrbitView
        topicName={topic.name}
        topicAccent={topic.accent}
        planets={planets}
        reducedMotion={false}
        getSubtree={getSubtree}
        onOpenTask={(id) => console.log('open', id)}
        onToggleTask={(id) => console.log('toggle', id)}
        controls={
          <select className="topic-orbit-hud-select" value={topicId} onChange={(event) => setTopicId(event.target.value)}>
            {TOPICS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        }
      />
    </div>
  );
}
