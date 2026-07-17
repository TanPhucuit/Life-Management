'use client';

import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Sparkles, User, UserPlus } from 'lucide-react';
import { useAppStore } from '@/app/lib/store';
import { authUtils } from '@/app/lib/auth';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setUser } = useAppStore();
  const router = useRouter();

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setIsLoading(true);
    try {
      const response = isLogin ? await authUtils.login(username, password) : await authUtils.register(username, password);
      if (response.error) setError(response.error);
      else if (response.user) { setUser(response.user); router.replace('/overview'); }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'We could not complete that request. Please try again.');
    } finally { setIsLoading(false); }
  };

  return (
    <main className="aurora-stage relative grid min-h-dvh overflow-hidden bg-[var(--background)] p-3 text-[var(--foreground)] lg:grid-cols-[1.1fr_.9fr] lg:p-5">
      <section className="relative hidden overflow-hidden rounded-[36px] bg-[#07152d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(64,156,255,.4),transparent_38%),radial-gradient(circle_at_80%_75%,rgba(167,139,250,.38),transparent_42%),linear-gradient(145deg,#07152d,#111026)]" />
        <motion.div className="absolute -right-24 top-1/4 h-96 w-96 rounded-full border border-white/20 bg-white/10 blur-sm" animate={{ y: [-12, 18, -12], rotate: [0, 8, 0], scale: [1, 1.04, 1] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute right-16 top-1/3 h-64 w-64 rounded-[42%_58%_55%_45%] bg-gradient-to-br from-blue-400/40 via-violet-400/30 to-emerald-300/30 blur-2xl" animate={{ borderRadius: ['42% 58% 55% 45%', '58% 42% 38% 62%', '42% 58% 55% 45%'], rotate: [0, 18, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
        <div className="relative flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur-xl"><Sparkles className="h-5 w-5" /></div><div><p className="font-semibold">Life Management</p><p className="text-xs text-white/55">Your personal operating system</p></div></div>
        <div className="relative max-w-xl">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-4 text-sm font-semibold uppercase tracking-[.22em] text-blue-300">Clarity, beautifully organized</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 }} className="text-5xl font-semibold leading-[1.04] tracking-[-.055em] xl:text-7xl">Design a life you can move through.</motion.h1>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .16 }} className="mt-6 max-w-lg text-lg leading-8 text-white/62">Tasks, focus, learning, and progress — brought together in one calm, intelligent workspace.</motion.p>
        </div>
        <div className="relative flex gap-6 text-sm text-white/60">{['Private workspace', 'Live progress', 'Designed for focus'].map((item) => <span key={item} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{item}</span>)}</div>
      </section>

      <section className="flex items-center justify-center px-2 py-8 sm:px-8 lg:px-12">
        <motion.div initial={{ opacity: 0, y: 24, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .55, ease: [.16, 1, .3, 1] }} className="glass-panel w-full max-w-md rounded-[30px] p-5 sm:p-8">
          <div className="mb-7 lg:hidden"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] text-white"><Sparkles className="h-5 w-5" /></div><p className="font-semibold">Life Management</p></div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--primary)]">{isLogin ? 'Welcome back' : 'Create your space'}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-.045em]">{isLogin ? 'Sign in to continue.' : 'Start your journey.'}</h2>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">{isLogin ? 'Your workspace is ready when you are.' : 'One account for every part of your progress.'}</p>

          <form onSubmit={handleAuth} className="mt-7 space-y-5">
            <div><label htmlFor="username" className="mb-2 block text-sm font-semibold">Username</label><div className="relative"><User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-subtle)]" /><input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="premium-input pl-10" placeholder="Enter your username" disabled={isLoading} required /></div></div>
            <div><label htmlFor="password" className="mb-2 block text-sm font-semibold">Password</label><div className="relative"><Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground-subtle)]" /><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="premium-input px-10" placeholder="Enter your password" disabled={isLoading} required /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-[var(--foreground-muted)] hover:bg-[var(--surface-soft)]" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
            {error && <motion.div role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{error}</motion.div>}
            <button type="submit" disabled={isLoading} className="btn-primary w-full">{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isLogin ? <ArrowRight className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{isLoading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}</button>
          </form>
          <div className="mt-6 text-center text-sm text-[var(--foreground-muted)]">{isLogin ? 'New to Life Management?' : 'Already have an account?'}<button type="button" onClick={() => { setIsLogin((current) => !current); setError(''); }} className="ml-2 min-h-11 font-semibold text-[var(--primary)] hover:underline">{isLogin ? 'Create an account' : 'Sign in'}</button></div>
        </motion.div>
      </section>
    </main>
  );
}
