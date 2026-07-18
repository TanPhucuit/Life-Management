# Desktop V2 scene integration

This directory is intentionally client-only and should be loaded from the desktop
experience chunk, after the `min-width: 1280px`, fine-pointer and hover gate has
been locked for the lifetime of the page.

```tsx
<SceneProvider
  initialSnapshot={{
    route: pathname,
    completion: 0.64,
    overdue: 2,
    activeSpaces: 4,
    focusedMinutes: 55,
    cycleCount: 7,
  }}
>
  <SceneHost />
  <DesktopShell />
</SceneProvider>
```

Route/data owners update the persistent scene without remounting its Canvas:

```tsx
const scene = useSceneActions()

scene.updateSnapshot({ route: pathname, completion })
scene.triggerPulse('complete', [pointerX, pointerY])
```

`SceneHost` owns one R3F Canvas. Animation mutates Three objects and shader
uniforms only. React state changes are limited to route/data snapshots, quality
tier transitions, interaction priority, visibility and WebGL lifecycle events.

Required runtime packages:

- `react` / `react-dom` 19.2.x
- `three` 0.185.x
- `@react-three/fiber` 9.6.x
- `@react-three/drei` 10.7.x
- `@react-three/postprocessing` 3.0.x
- `postprocessing` (peer runtime used by the effects package)
