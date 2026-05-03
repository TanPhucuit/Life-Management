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
    name: 'sky',
    label: 'Xanh trời',
    text: '#bae6fd',
    border: 'rgba(56, 189, 248, 0.42)',
    background: 'rgba(12, 74, 110, 0.48)',
    backgroundSoft: 'rgba(56, 189, 248, 0.10)',
    backgroundStrong: 'rgba(2, 132, 199, 0.62)',
    shadow: 'rgba(14, 165, 233, 0.24)',
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
    name: 'violet',
    label: 'Violet',
    text: '#ede9fe',
    border: 'rgba(139, 92, 246, 0.44)',
    background: 'rgba(76, 29, 149, 0.50)',
    backgroundSoft: 'rgba(139, 92, 246, 0.10)',
    backgroundStrong: 'rgba(109, 40, 217, 0.66)',
    shadow: 'rgba(124, 58, 237, 0.24)',
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
    name: 'rose',
    label: 'Hồng rose',
    text: '#ffe4e6',
    border: 'rgba(251, 113, 133, 0.42)',
    background: 'rgba(136, 19, 55, 0.50)',
    backgroundSoft: 'rgba(251, 113, 133, 0.10)',
    backgroundStrong: 'rgba(225, 29, 72, 0.62)',
    shadow: 'rgba(244, 63, 94, 0.24)',
  },
  {
    name: 'yellow',
    label: 'Vàng',
    text: '#fef3c7',
    border: 'rgba(251, 191, 36, 0.42)',
    background: 'rgba(113, 63, 18, 0.50)',
    backgroundSoft: 'rgba(251, 191, 36, 0.11)',
    backgroundStrong: 'rgba(202, 138, 4, 0.62)',
    shadow: 'rgba(234, 179, 8, 0.24)',
  },
  {
    name: 'amber',
    label: 'Amber',
    text: '#fde68a',
    border: 'rgba(245, 158, 11, 0.44)',
    background: 'rgba(120, 53, 15, 0.52)',
    backgroundSoft: 'rgba(245, 158, 11, 0.11)',
    backgroundStrong: 'rgba(217, 119, 6, 0.64)',
    shadow: 'rgba(245, 158, 11, 0.24)',
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
    name: 'silver',
    label: 'White soft',
    text: '#ffffff',
    border: 'rgba(255, 255, 255, 0.42)',
    background: 'rgba(82, 82, 91, 0.44)',
    backgroundSoft: 'rgba(255, 255, 255, 0.07)',
    backgroundStrong: 'rgba(161, 161, 170, 0.48)',
    shadow: 'rgba(255, 255, 255, 0.14)',
  },
];

export const getTopicColor = (index: number) => topicColorPalette[index % topicColorPalette.length];

export const getTopicColorByName = (name: string | null | undefined, fallbackIndex = 0) => {
  return topicColorPalette.find((color) => color.name === name) || getTopicColor(fallbackIndex);
};
