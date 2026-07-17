# Life Management — Design System Master

> Generated with UI/UX Pro Max, then resolved against the product brief. Page overrides in `pages/` take precedence.

## Direction

- Apple-inspired Bento Grid with selective Liquid Glass and low-opacity Aurora lighting.
- Light and dark themes have equal feature support.
- Glass is reserved for navigation, floating controls, dialogs, and hero moments. Data surfaces remain solid.
- Geist is the only UI family; Geist Mono is used for timers and tabular figures.

## Semantic palette

| Role | Light | Dark |
|---|---|---|
| Background | `#F5F5F7` | `#0B0B0F` |
| Surface | `#FFFFFF` | `#17181E` |
| Foreground | `#1D1D1F` | `#F5F5F7` |
| Muted text | `#63636A` | `#B0B0B8` |
| Primary | `#006EDC` | `#409CFF` |
| Secondary | `#7259D6` | `#A78BFA` |
| Accent | `#008B68` | `#35D399` |
| Warning | `#A65400` | `#FFB340` |
| Danger | `#C9342F` | `#FF6961` |

Use CSS variables from `app/globals.css`; do not introduce raw component-level colors unless they encode task/topic data.

## Shape, spacing, and depth

- Spacing follows a 4/8px rhythm; common section gaps are 16, 24, and 32px.
- Controls use 12px radius; floating controls 16px; cards and sheets 24px; major auth/hero frames 30–36px.
- Use three semantic shadow levels from CSS variables. Avoid black outlines and heavy drop shadows.
- All touch targets are at least 44×44px.

## Motion

- Framer Motion only; no GSAP.
- Micro-interactions: 150–240ms. Page transition: 300–400ms. Stagger: 30–50ms.
- Prefer transform and opacity. Never animate layout dimensions on large task trees or charts.
- Strong motion is limited to login, route transitions, highlighted bento cards, KPI/chart entrance, and dialogs.
- `prefers-reduced-motion` disables continuous aurora, tilt, parallax, and long transitions.

## Responsive and accessibility

- Validate 375, 768, 1024, and 1440px plus mobile landscape.
- Desktop uses sidebar, mobile uses four primary tabs plus More.
- Body copy is 14–16px with 1.5 line height; form inputs stay 16px on mobile where needed.
- Normal text contrast is at least 4.5:1; focus indicators are always visible.
- Icons come from Lucide, include accessible names when icon-only, and never communicate state by color alone.
