'use client'

import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from 'react'

interface SceneErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  resetKey: string
  onError?: (error: Error, info: ErrorInfo) => void
}
interface SceneErrorBoundaryState {
  failed: boolean
}

export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(previousProps: SceneErrorBoundaryProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const FALLBACK_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  background:
    'radial-gradient(circle at 52% 42%, rgba(112, 101, 255, .26), transparent 18%), radial-gradient(circle at 58% 48%, rgba(74, 225, 239, .16), transparent 34%), linear-gradient(145deg, rgba(6, 14, 31, .94), rgba(11, 8, 29, .96))',
}

const FALLBACK_CORE_STYLE: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '46%',
  width: 260,
  height: 260,
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  border: '1px solid rgba(153, 225, 255, .2)',
  background:
    'radial-gradient(circle at 40% 34%, rgba(228, 251, 255, .72), rgba(104, 220, 255, .23) 18%, rgba(119, 84, 255, .22) 43%, transparent 72%)',
  boxShadow:
    '0 0 90px rgba(92, 212, 255, .18), inset 0 0 70px rgba(139, 104, 255, .16)',
}

export function SceneFallback() {
  return (
    <div aria-hidden="true" style={FALLBACK_STYLE}>
      <div style={FALLBACK_CORE_STYLE} />
    </div>
  )
}
