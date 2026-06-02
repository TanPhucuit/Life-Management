export interface TopicColor {
  name: string;
  label: string;
  text: string;
  border: string;
  background: string;
  backgroundSoft: string;
  backgroundStrong: string;
  shadow: string;
}

export const topicColorPalette: TopicColor[] = [
  {
    name: 'orange',
    label: 'Cam',
    text: '#ea580c',
    border: 'rgba(251, 146, 60, 0.42)',
    background: 'rgba(255, 237, 213, 0.9)',
    backgroundSoft: 'rgba(251, 146, 60, 0.10)',
    backgroundStrong: 'rgba(251, 146, 60, 0.18)',
    shadow: 'rgba(251, 146, 60, 0.18)',
  },
  {
    name: 'blue',
    label: 'Xanh',
    text: '#2563eb',
    border: 'rgba(96, 165, 250, 0.42)',
    background: 'rgba(219, 234, 254, 0.9)',
    backgroundSoft: 'rgba(96, 165, 250, 0.10)',
    backgroundStrong: 'rgba(96, 165, 250, 0.18)',
    shadow: 'rgba(59, 130, 246, 0.18)',
  },
  {
    name: 'sky',
    label: 'Xanh trời',
    text: '#0284c7',
    border: 'rgba(56, 189, 248, 0.42)',
    background: 'rgba(224, 242, 254, 0.9)',
    backgroundSoft: 'rgba(56, 189, 248, 0.10)',
    backgroundStrong: 'rgba(56, 189, 248, 0.18)',
    shadow: 'rgba(14, 165, 233, 0.18)',
  },
  {
    name: 'purple',
    label: 'Tím',
    text: '#7e22ce',
    border: 'rgba(167, 139, 250, 0.42)',
    background: 'rgba(243, 232, 255, 0.9)',
    backgroundSoft: 'rgba(167, 139, 250, 0.10)',
    backgroundStrong: 'rgba(167, 139, 250, 0.18)',
    shadow: 'rgba(168, 85, 247, 0.18)',
  },
  {
    name: 'violet',
    label: 'Violet',
    text: '#6d28d9',
    border: 'rgba(139, 92, 246, 0.44)',
    background: 'rgba(237, 233, 254, 0.9)',
    backgroundSoft: 'rgba(139, 92, 246, 0.10)',
    backgroundStrong: 'rgba(139, 92, 246, 0.18)',
    shadow: 'rgba(124, 58, 237, 0.18)',
  },
  {
    name: 'pink',
    label: 'Hồng',
    text: '#be185d',
    border: 'rgba(244, 114, 182, 0.42)',
    background: 'rgba(252, 231, 243, 0.9)',
    backgroundSoft: 'rgba(244, 114, 182, 0.10)',
    backgroundStrong: 'rgba(244, 114, 182, 0.18)',
    shadow: 'rgba(236, 72, 153, 0.18)',
  },
  {
    name: 'rose',
    label: 'Hồng rose',
    text: '#e11d48',
    border: 'rgba(251, 113, 133, 0.42)',
    background: 'rgba(255, 228, 230, 0.9)',
    backgroundSoft: 'rgba(251, 113, 133, 0.10)',
    backgroundStrong: 'rgba(251, 113, 133, 0.18)',
    shadow: 'rgba(244, 63, 94, 0.18)',
  },
  {
    name: 'yellow',
    label: 'Vàng',
    text: '#a16207',
    border: 'rgba(251, 191, 36, 0.42)',
    background: 'rgba(254, 249, 195, 0.9)',
    backgroundSoft: 'rgba(251, 191, 36, 0.11)',
    backgroundStrong: 'rgba(251, 191, 36, 0.18)',
    shadow: 'rgba(234, 179, 8, 0.18)',
  },
  {
    name: 'amber',
    label: 'Amber',
    text: '#b45309',
    border: 'rgba(245, 158, 11, 0.44)',
    background: 'rgba(254, 243, 199, 0.9)',
    backgroundSoft: 'rgba(245, 158, 11, 0.11)',
    backgroundStrong: 'rgba(245, 158, 11, 0.18)',
    shadow: 'rgba(245, 158, 11, 0.18)',
  },
  {
    name: 'slate',
    label: 'Xám',
    text: '#475569',
    border: 'rgba(148, 163, 184, 0.42)',
    background: 'rgba(241, 245, 249, 0.9)',
    backgroundSoft: 'rgba(148, 163, 184, 0.10)',
    backgroundStrong: 'rgba(148, 163, 184, 0.18)',
    shadow: 'rgba(148, 163, 184, 0.16)',
  },
];

export const getTopicColor = (index: number) => topicColorPalette[index % topicColorPalette.length];

export const getTopicColorByName = (name: string | null | undefined, fallbackIndex = 0) => {
  return topicColorPalette.find((color) => color.name === name) || getTopicColor(fallbackIndex);
};
