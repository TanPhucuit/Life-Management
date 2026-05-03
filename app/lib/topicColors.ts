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
    text: '#fed7aa',
    border: 'rgba(251, 146, 60, 0.42)',
    background: 'rgba(124, 45, 18, 0.52)',
    backgroundSoft: 'rgba(251, 146, 60, 0.10)',
    backgroundStrong: 'rgba(154, 52, 18, 0.72)',
    shadow: 'rgba(251, 146, 60, 0.24)',
  },
  {
    name: 'blue',
    label: 'Xanh',
    text: '#bfdbfe',
    border: 'rgba(96, 165, 250, 0.42)',
    background: 'rgba(30, 58, 138, 0.48)',
    backgroundSoft: 'rgba(96, 165, 250, 0.10)',
    backgroundStrong: 'rgba(37, 99, 235, 0.64)',
    shadow: 'rgba(59, 130, 246, 0.24)',
  },
  {
    name: 'purple',
    label: 'Tím',
    text: '#ddd6fe',
    border: 'rgba(167, 139, 250, 0.42)',
    background: 'rgba(88, 28, 135, 0.52)',
    backgroundSoft: 'rgba(167, 139, 250, 0.10)',
    backgroundStrong: 'rgba(126, 34, 206, 0.66)',
    shadow: 'rgba(168, 85, 247, 0.24)',
  },
  {
    name: 'pink',
    label: 'Hồng',
    text: '#fbcfe8',
    border: 'rgba(244, 114, 182, 0.42)',
    background: 'rgba(131, 24, 67, 0.52)',
    backgroundSoft: 'rgba(244, 114, 182, 0.10)',
    backgroundStrong: 'rgba(190, 24, 93, 0.66)',
    shadow: 'rgba(236, 72, 153, 0.24)',
  },
  {
    name: 'white',
    label: 'Trắng',
    text: '#f8fafc',
    border: 'rgba(226, 232, 240, 0.36)',
    background: 'rgba(71, 85, 105, 0.42)',
    backgroundSoft: 'rgba(226, 232, 240, 0.08)',
    backgroundStrong: 'rgba(100, 116, 139, 0.56)',
    shadow: 'rgba(226, 232, 240, 0.16)',
  },
  {
    name: 'green',
    label: 'Xanh lá',
    text: '#bbf7d0',
    border: 'rgba(74, 222, 128, 0.38)',
    background: 'rgba(20, 83, 45, 0.48)',
    backgroundSoft: 'rgba(74, 222, 128, 0.10)',
    backgroundStrong: 'rgba(22, 163, 74, 0.58)',
    shadow: 'rgba(34, 197, 94, 0.22)',
  },
];

export const getTopicColor = (index: number) => topicColorPalette[index % topicColorPalette.length];

export const getTopicColorByName = (name: string | null | undefined, fallbackIndex = 0) => {
  return topicColorPalette.find((color) => color.name === name) || getTopicColor(fallbackIndex);
};
