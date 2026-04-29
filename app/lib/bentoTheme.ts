// Bento.me Advanced Theme Configuration
export const bentoTheme = {
  colors: {
    // Dark Mode - Ultra Deep
    background: '#000000',
    cardBg: '#0A0A0A',
    
    // Borders
    border: '#1F1F1F',
    borderLight: '#2A2A2A', // border-t sáng hơn
    
    // Text
    textPrimary: '#FFFFFF',
    textSecondary: '#71717A',
    textTertiary: '#52525B',
    
    // Accents
    accentPurple: '#8B5CF6',
    accentBlue: '#3B82F6',
    accentCyan: '#06B6D4',
    
    // Glow effects
    glowPurple: 'rgba(139, 92, 246, 0.15)',
    glowBlue: 'rgba(59, 130, 246, 0.15)',
    glowCyan: 'rgba(6, 182, 212, 0.15)',
  },
  
  spacing: {
    gap: '24px',
    padding: '24px',
    paddingMd: '16px',
    paddingSm: '12px',
  },
  
  border: {
    radius: '32px',
    radiusMd: '24px',
    radiusSm: '16px',
  },
  
  typography: {
    // Font families (fallback to Inter if Geist not available)
    fontFamily: 'font-[\'Geist Sans\', system-ui, -apple-system, sans-serif]',
    
    // Font sizes
    h1: 'text-4xl font-semibold',
    h2: 'text-2xl font-semibold',
    h3: 'text-lg font-semibold',
    body: 'text-sm font-regular',
    bodyMd: 'text-base font-regular',
    caption: 'text-xs font-regular',
  },
  
  shadow: {
    // Box shadows
    borderShadow: '0 1px 0 #2A2A2A inset',
    glowSm: 'box-shadow: 0 0 8px rgba(139, 92, 246, 0.08)',
    glowMd: '0 0 16px rgba(139, 92, 246, 0.12)',
    glowLg: '0 0 24px rgba(139, 92, 246, 0.15)',
    
    // 3D effect
    hover3d: '0 0 32px rgba(139, 92, 246, 0.1), inset 0 1px 0 #2A2A2A',
  },
  
  animation: {
    hover: 'transition-all duration-300 ease-out',
    hoverSlow: 'transition-all duration-500 ease-out',
  },
};

// Motion presets for Framer Motion
export const motionPresets = {
  cardHover: {
    whileHover: {
      rotateX: 5,
      rotateY: -5,
      scale: 1.02,
      transition: { duration: 0.3 },
    },
    whileTap: {
      scale: 0.95,
      transition: { duration: 0.1 },
    },
  },
  
  glowPulse: {
    animate: {
      boxShadow: [
        '0 0 12px rgba(139, 92, 246, 0.08)',
        '0 0 20px rgba(139, 92, 246, 0.12)',
        '0 0 12px rgba(139, 92, 246, 0.08)',
      ],
    },
    transition: {
      duration: 3,
      repeat: Infinity,
    },
  },
  
  buttonPress: {
    whileHover: { scale: 1.05, transition: { duration: 0.2 } },
    whileTap: { scale: 0.92, transition: { duration: 0.1 } },
  },
};
