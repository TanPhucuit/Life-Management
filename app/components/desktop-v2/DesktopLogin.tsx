'use client'

import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Check,
  Command,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Orbit,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react'
import { authUtils, type User as AuthUser } from '@/app/lib/auth'
import { useAppStore } from '@/app/lib/store'
import { SceneHost, SceneProvider, useSceneActions } from './scene'

type AuthMode = 'login' | 'register'
type AuthPhase = 'idle' | 'submitting' | 'success'

const MAGNETIC_SPRING = { stiffness: 500, damping: 38, mass: 0.7 }

const fieldClassName =
  'h-14 w-full rounded-[18px] border border-white/[0.09] bg-white/[0.055] px-12 text-[15px] text-white outline-none transition-[border-color,background-color] duration-200 placeholder:text-white/[0.28] hover:bg-white/[0.075] focus:border-cyan-300/[0.55] focus:bg-white/[0.085] disabled:cursor-wait disabled:opacity-60'

function DesktopLoginExperience() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [phase, setPhase] = useState<AuthPhase>('idle')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setUser = useAppStore((state) => state.setUser)
  const scene = useSceneActions()
  const router = useRouter()
  const prefersReducedMotion = Boolean(useReducedMotion())
  const usernameId = useId()
  const passwordId = useId()
  const errorId = useId()

  const pointerX = useMotionValue(50)
  const pointerY = useMotionValue(38)
  const tiltXSource = useMotionValue(0)
  const tiltYSource = useMotionValue(0)
  const tiltX = useSpring(tiltXSource, MAGNETIC_SPRING)
  const tiltY = useSpring(tiltYSource, MAGNETIC_SPRING)
  const cursorLight = useMotionTemplate`radial-gradient(520px circle at ${pointerX}% ${pointerY}%, rgba(103, 232, 249, .12), transparent 66%)`

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) clearTimeout(redirectTimerRef.current)
    }
  }, [])

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (prefersReducedMotion) return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(((event.clientX - bounds.left) / bounds.width) * 100)
    pointerY.set(((event.clientY - bounds.top) / bounds.height) * 100)
  }

  const handlePanelPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || phase !== 'idle') return
    const bounds = event.currentTarget.getBoundingClientRect()
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5
    tiltXSource.set(vertical * -2.8)
    tiltYSource.set(horizontal * 3.4)
  }

  const resetPanelTilt = () => {
    tiltXSource.set(0)
    tiltYSource.set(0)
  }

  const switchMode = (nextMode: AuthMode) => {
    if (phase !== 'idle' || nextMode === mode) return
    setMode(nextMode)
    setError('')
  }

  const finishSuccessfulAuth = (user: AuthUser) => {
    setPhase('success')
    scene.updateSnapshot({ completion: 1 })
    scene.triggerPulse('route', [0, 0])

    const transitionDuration = prefersReducedMotion ? 140 : 640
    redirectTimerRef.current = setTimeout(() => {
      setUser(user)
      router.replace('/overview')
    }, transitionDuration)
  }

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (phase !== 'idle') return

    setError('')
    setPhase('submitting')
    let succeeded = false

    try {
      const response = mode === 'login'
        ? await authUtils.login(username, password)
        : await authUtils.register(username, password)

      if (response.error) {
        setError(response.error)
        scene.triggerPulse('error')
      } else if (response.user) {
        succeeded = true
        finishSuccessfulAuth(response.user)
      } else {
        setError('We could not complete that request. Please try again.')
        scene.triggerPulse('error')
      }
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : 'We could not complete that request. Please try again.',
      )
      scene.triggerPulse('error')
    } finally {
      if (!succeeded) setPhase('idle')
    }
  }

  const isBusy = phase !== 'idle'

  return (
    <main
      className="experience-v2 dv2-login-stage relative min-h-dvh overflow-hidden bg-[#040711] text-white"
      onPointerMove={handleStagePointerMove}
    >
      <SceneHost zIndex={0} trackGlobalInteraction />

      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{ background: cursorLight }}
      />
      <div aria-hidden="true" className="dv2-login-grid pointer-events-none fixed inset-0 z-[1] opacity-[0.35]" />
      <div aria-hidden="true" className="dv2-login-vignette pointer-events-none fixed inset-0 z-[2]" />
      <div aria-hidden="true" className="dv2-login-grain pointer-events-none fixed inset-0 z-[3] opacity-[0.055]" />

      <AnimatePresence>
        {phase === 'success' ? (
          <motion.div
            key="success-tunnel"
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {!prefersReducedMotion ? (
              <>
                {[0, 1, 2, 3].map((ring) => (
                  <motion.div
                    key={ring}
                    className="absolute aspect-square w-[14vmin] rounded-full border border-cyan-100/50 shadow-[0_0_70px_rgba(103,232,249,.38)]"
                    initial={{ scale: 0.1, opacity: 0.9 }}
                    animate={{ scale: 14 + ring * 2.5, opacity: 0 }}
                    transition={{
                      duration: 0.62,
                      delay: ring * 0.045,
                      ease: [0.22, 0.7, 0.2, 1],
                    }}
                  />
                ))}
              </>
            ) : null}
            <motion.div
              className="absolute aspect-square w-16 rounded-full bg-white shadow-[0_0_120px_50px_rgba(103,232,249,.8)]"
              initial={{ scale: 0, opacity: 0 }}
              animate={prefersReducedMotion
                ? { scale: 1, opacity: [0, 1, 0] }
                : { scale: [0, 1.5, 0.08], opacity: [0, 1, 1] }}
              transition={{ duration: prefersReducedMotion ? 0.14 : 0.5, ease: 'easeInOut' }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className="relative z-10 grid min-h-dvh grid-cols-[minmax(0,1.25fr)_minmax(460px,.75fr)]"
        animate={phase === 'success'
          ? { scale: prefersReducedMotion ? 1 : 1.12, opacity: 0, filter: 'blur(8px)' }
          : { scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: prefersReducedMotion ? 0.1 : 0.48, ease: [0.32, 0, 0.67, 0] }}
      >
        <section className="relative flex min-w-0 flex-col justify-between px-[clamp(44px,5vw,88px)] py-12">
          <motion.div
            className="flex items-center gap-3"
            initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative grid h-11 w-11 place-items-center rounded-[15px] border border-white/15 bg-white/[0.075] shadow-[inset_0_1px_rgba(255,255,255,.12),0_16px_50px_rgba(0,0,0,.3)] backdrop-blur-xl">
              <Orbit className="h-5 w-5 text-cyan-200" strokeWidth={1.6} />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_3px_rgba(110,231,183,.45)]" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[-0.01em]">Life Management</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white/[0.38]">Aurora Life OS</p>
            </div>
          </motion.div>

          <div className="pointer-events-none absolute left-[52%] top-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              className="relative grid h-[29rem] w-[29rem] place-items-center"
              animate={prefersReducedMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
            >
              <div className="dv2-login-orbit absolute inset-0 rounded-full border border-cyan-100/[0.08]" />
              <div className="absolute inset-[17%] rounded-full border border-violet-200/[0.09] [transform:rotateX(68deg)_rotateZ(12deg)]" />
              <span className="absolute right-[8%] top-[33%] h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_24px_7px_rgba(103,232,249,.42)]" />
              <span className="absolute bottom-[16%] left-[29%] h-1.5 w-1.5 rounded-full bg-violet-200 shadow-[0_0_22px_6px_rgba(196,181,253,.36)]" />
            </motion.div>
          </div>

          <div className="relative max-w-[700px] pb-[2vh]">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="mb-5 flex items-center gap-3"
            >
              <span className="h-px w-9 bg-gradient-to-r from-cyan-300 to-transparent" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-100/[0.72]">Your attention, in orbit</span>
            </motion.div>
            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-[680px] text-[clamp(48px,5.3vw,88px)] font-medium leading-[0.94] tracking-[-0.065em] text-white"
            >
              Make your day feel <span className="dv2-login-iridescent">alive.</span>
            </motion.h1>
            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-[560px] text-[15px] leading-7 text-white/[0.48]"
            >
              Tasks, focus, learning, and momentum become one responsive system -- calm when you need clarity, electric when you take action.
            </motion.p>
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.42, duration: 0.5 }}
              className="mt-8 flex flex-wrap gap-x-7 gap-y-3 text-xs text-white/[0.42]"
            >
              {['One living plan', 'Focus without friction', 'Progress you can feel'].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <span className="grid h-4 w-4 place-items-center rounded-full border border-emerald-200/25 bg-emerald-300/10">
                    <Check className="h-2.5 w-2.5 text-emerald-200" strokeWidth={2.5} />
                  </span>
                  {item}
                </span>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-[clamp(32px,4vw,72px)] py-10">
          <motion.div
            aria-hidden="true"
            className="absolute inset-y-[8%] left-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.25, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />

          <motion.div
            onPointerMove={handlePanelPointerMove}
            onPointerLeave={resetPanelTilt}
            initial={prefersReducedMotion ? false : { opacity: 0, x: 38, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 1200 }}
            className="relative w-full max-w-[470px] rounded-[32px] border border-white/[0.105] bg-[#0c1020]/[0.72] p-2 shadow-[0_44px_120px_rgba(0,0,0,.48),inset_0_1px_rgba(255,255,255,.08)] backdrop-blur-2xl"
          >
            <div className="dv2-login-panel-highlight pointer-events-none absolute inset-0 rounded-[31px]" aria-hidden="true" />
            <div className="relative overflow-hidden rounded-[26px] border border-white/[0.055] bg-gradient-to-b from-white/[0.055] to-white/[0.018] px-8 pb-8 pt-7">
              <div className="mb-8 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.075] bg-black/[0.15] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.19em] text-white/[0.45]">
                  <Sparkles className="h-3 w-3 text-cyan-200" />
                  Private workspace
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-white/[0.27]">
                  <Command className="h-3 w-3" />
                  Command ready
                </div>
              </div>

              <div
                className="relative grid grid-cols-2 rounded-[16px] border border-white/[0.07] bg-black/20 p-1"
                role="tablist"
                aria-label="Authentication mode"
              >
                {(['login', 'register'] as const).map((item) => {
                  const active = mode === item
                  return (
                    <button
                      key={item}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={isBusy}
                      onClick={() => switchMode(item)}
                      className="relative z-10 h-10 rounded-xl text-xs font-semibold text-white/[0.45] transition-colors disabled:cursor-wait"
                    >
                      {active ? (
                        <motion.span
                          layoutId="desktop-auth-mode-capsule"
                          className="absolute inset-0 -z-10 rounded-xl border border-white/10 bg-white/[0.09] shadow-[0_8px_25px_rgba(0,0,0,.28),inset_0_1px_rgba(255,255,255,.09)]"
                          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                        />
                      ) : null}
                      <span className={active ? 'text-white' : undefined}>
                        {item === 'login' ? 'Sign in' : 'Create account'}
                      </span>
                    </button>
                  )
                })}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mode}
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(5px)' }}
                  transition={{ duration: prefersReducedMotion ? 0.1 : 0.24, ease: [0.16, 1, 0.3, 1] }}
                >
                  <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
                    {mode === 'login' ? 'Welcome back' : 'Begin your orbit'}
                  </p>
                  <h2 className="mt-2 text-[31px] font-medium leading-tight tracking-[-0.045em]">
                    {mode === 'login' ? 'Continue where you left off.' : 'Build your personal system.'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/40">
                    {mode === 'login'
                      ? 'Your tasks, focus cycles, and progress are waiting.'
                      : 'Create one account for every part of your progress.'}
                  </p>
                </motion.div>
              </AnimatePresence>

              <form className="mt-7 space-y-5" onSubmit={handleAuth} aria-describedby={error ? errorId : undefined}>
                <div>
                  <label htmlFor={usernameId} className="mb-2 block text-xs font-medium text-white/[0.65]">
                    Username
                  </label>
                  <div className="group relative">
                    <span aria-hidden="true" className="dv2-login-field-pulse pointer-events-none absolute inset-0 rounded-[18px] opacity-0 group-focus-within:opacity-100" />
                    <User className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/[0.28] transition-colors group-focus-within:text-cyan-200" />
                    <input
                      id={usernameId}
                      name="username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      placeholder="Enter your username"
                      className={fieldClassName}
                      disabled={isBusy}
                      aria-invalid={Boolean(error)}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={passwordId} className="mb-2 block text-xs font-medium text-white/[0.65]">
                    Password
                  </label>
                  <div className="group relative">
                    <span aria-hidden="true" className="dv2-login-field-pulse pointer-events-none absolute inset-0 rounded-[18px] opacity-0 group-focus-within:opacity-100" />
                    <Lock className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/[0.28] transition-colors group-focus-within:text-violet-200" />
                    <input
                      id={passwordId}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="Enter your password"
                      className={fieldClassName}
                      disabled={isBusy}
                      aria-invalid={Boolean(error)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={isBusy}
                      className="absolute right-1.5 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-[14px] text-white/[0.35] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-wait"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {error ? (
                    <motion.div
                      key={error}
                      id={errorId}
                      role="alert"
                      initial={{ opacity: 0, scale: 0.98, x: 0 }}
                      animate={prefersReducedMotion
                        ? { opacity: 1, scale: 1 }
                        : { opacity: 1, scale: 1, x: [0, -7, 6, -3, 0] }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: prefersReducedMotion ? 0.12 : 0.42 }}
                      className="relative overflow-hidden rounded-[16px] border border-rose-300/20 bg-rose-400/[0.08] px-4 py-3 text-xs leading-5 text-rose-100/85"
                    >
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-1 bg-rose-300"
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                      />
                      {error}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={isBusy}
                  whileHover={prefersReducedMotion || isBusy ? undefined : { scale: 1.012, y: -1 }}
                  whileTap={prefersReducedMotion || isBusy ? undefined : { scale: 0.985, y: 1 }}
                  transition={MAGNETIC_SPRING}
                  className="dv2-login-submit group relative flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-[18px] bg-white text-sm font-semibold text-[#07101e] shadow-[0_18px_45px_rgba(103,232,249,.14)] outline-none disabled:cursor-wait disabled:opacity-75 focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1020]"
                >
                  <span aria-hidden="true" className="absolute inset-0 translate-y-full bg-gradient-to-r from-cyan-200 via-white to-violet-200 transition-transform duration-300 group-hover:translate-y-0" />
                  <span className="relative flex items-center gap-2.5">
                    {phase === 'submitting' ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : mode === 'login' ? (
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {phase === 'submitting'
                      ? 'Opening your workspace...'
                      : phase === 'success'
                        ? mode === 'login' ? 'Welcome back' : 'Workspace ready'
                        : mode === 'login'
                          ? 'Enter your workspace'
                          : 'Create your workspace'}
                  </span>
                </motion.button>
              </form>

              <p className="mt-6 text-center text-[11px] leading-5 text-white/[0.27]">
                By continuing, you enter your private Life Management workspace.
              </p>
              <span className="sr-only" aria-live="polite">
                {phase === 'submitting' ? 'Authenticating.' : phase === 'success' ? 'Authentication successful. Opening your workspace.' : ''}
              </span>
            </div>
          </motion.div>
        </section>
      </motion.div>

      <style jsx global>{`
        .dv2-login-stage {
          color-scheme: dark;
          isolation: isolate;
        }

        .dv2-login-grid {
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: radial-gradient(circle at 46% 48%, black, transparent 75%);
        }

        .dv2-login-vignette {
          background:
            radial-gradient(circle at 48% 44%, transparent 20%, rgba(2, 4, 12, 0.22) 64%, rgba(2, 4, 10, 0.72) 118%),
            linear-gradient(90deg, rgba(2, 5, 15, 0.05), rgba(2, 5, 15, 0.12) 55%, rgba(2, 5, 15, 0.5));
        }

        .dv2-login-grain {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.82'/%3E%3C/svg%3E");
          animation: dv2-grain-shift 0.22s steps(2) infinite;
        }

        .dv2-login-orbit::before,
        .dv2-login-orbit::after {
          position: absolute;
          content: '';
          inset: 8%;
          border-radius: 9999px;
          border: 1px solid rgba(167, 243, 208, 0.055);
          transform: rotateX(72deg) rotateZ(-24deg);
        }

        .dv2-login-orbit::after {
          inset: 20%;
          border-color: rgba(196, 181, 253, 0.085);
          transform: rotateY(68deg) rotateZ(18deg);
        }

        .dv2-login-iridescent {
          color: transparent;
          background: linear-gradient(105deg, #ffffff 2%, #a5f3fc 38%, #c4b5fd 72%, #ffffff 96%);
          background-size: 220% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          animation: dv2-iridescent 8s ease-in-out infinite;
        }

        .dv2-login-panel-highlight {
          background: linear-gradient(125deg, rgba(255, 255, 255, 0.08), transparent 19%, transparent 76%, rgba(103, 232, 249, 0.06));
          mask-image: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
          padding: 1px;
        }

        .dv2-login-field-pulse {
          z-index: -1;
          box-shadow: 0 0 0 1px rgba(103, 232, 249, 0.2), 0 0 30px rgba(103, 232, 249, 0.09);
          transition: opacity 180ms ease;
        }

        .dv2-login-submit::after {
          position: absolute;
          content: '';
          width: 80px;
          height: 180%;
          top: -40%;
          left: -120px;
          transform: rotate(18deg);
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.82), transparent);
          transition: left 560ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .dv2-login-submit:hover::after {
          left: calc(100% + 80px);
        }

        @keyframes dv2-iridescent {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes dv2-grain-shift {
          0% { transform: translate3d(0, 0, 0); }
          25% { transform: translate3d(-1%, 1%, 0); }
          50% { transform: translate3d(1%, -1%, 0); }
          75% { transform: translate3d(1%, 1%, 0); }
          100% { transform: translate3d(-1%, -1%, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .dv2-login-grain,
          .dv2-login-iridescent {
            animation: none;
          }

          .dv2-login-submit::after {
            display: none;
          }
        }
      `}</style>
    </main>
  )
}

export default function DesktopLogin() {
  return (
    <SceneProvider
      initialSnapshot={{
        route: '/login',
        mode: 'login',
        completion: 0.18,
        overdue: 0,
        activeSpaces: 4,
        focusedMinutes: 0,
        cycleCount: 0,
      }}
    >
      <DesktopLoginExperience />
    </SceneProvider>
  )
}
