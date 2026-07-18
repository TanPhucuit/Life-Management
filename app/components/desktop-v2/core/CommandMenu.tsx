'use client';

import {
  KeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, CornerDownLeft, Search, Sparkles, X } from 'lucide-react';
import { MOTION_SPRINGS, useMotionDirector } from './MotionDirector';

export interface DesktopCommand {
  id: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  shortcut?: string;
  icon?: ReactNode;
  group?: string;
  onSelect: () => void;
}

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly DesktopCommand[];
}

export function CommandMenu({
  open,
  onOpenChange,
  commands,
}: CommandMenuProps) {
  const { reducedMotion, startActivity } = useMotionDirector();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return commands;
    return commands.filter((command) =>
      [command.label, command.description ?? '', ...(command.keywords ?? [])]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    const stop = startActivity('interaction');
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';
    setQuery('');
    setSelectedIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      stop();
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, startActivity]);

  useEffect(() => {
    setSelectedIndex((current) =>
      Math.min(current, Math.max(0, filteredCommands.length - 1)),
    );
  }, [filteredCommands.length]);

  const selectCommand = (command: DesktopCommand | undefined) => {
    if (!command) return;
    onOpenChange(false);
    command.onSelect();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) =>
        filteredCommands.length ? (current + 1) % filteredCommands.length : 0,
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) =>
        filteredCommands.length
          ? (current - 1 + filteredCommands.length) % filteredCommands.length
          : 0,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectCommand(filteredCommands[selectedIndex]);
    }
  };

  const trapDialogFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] grid place-items-start overflow-y-auto px-6 pb-16 pt-[12vh]"
          role="presentation"
        >
          <motion.button
            type="button"
            aria-label="Close command menu"
            className="fixed inset-0 bg-[#02030a]/[.72] backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.24 }}
            onClick={() => onOpenChange(false)}
          />

          <motion.section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Command menu"
            className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-[30px] border border-white/[0.12] bg-[#090c18]/95 text-white shadow-[0_42px_120px_rgba(0,0,0,.7),0_0_90px_rgba(99,102,241,.14)] backdrop-blur-3xl"
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -34, scale: 0.94, rotateX: -8 }
            }
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -22, scale: 0.97 }
            }
            transition={MOTION_SPRINGS.sharedLayout}
            style={{ transformPerspective: 1200 }}
            onKeyDown={trapDialogFocus}
          >
            <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-5">
              <Search className="h-5 w-5 shrink-0 text-cyan-200/80" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                className="h-[72px] min-w-0 flex-1 bg-transparent text-[17px] text-white outline-none placeholder:text-white/35"
                placeholder="Search actions, spaces, and destinations..."
                aria-label="Search commands"
                aria-controls="desktop-command-results"
                aria-activedescendant={
                  filteredCommands[selectedIndex]
                    ? `desktop-command-${filteredCommands[selectedIndex].id}`
                    : undefined
                }
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              id="desktop-command-results"
              role="listbox"
              aria-label="Command results"
              className="max-h-[min(56vh,520px)] overflow-y-auto p-3"
            >
              {filteredCommands.length ? (
                filteredCommands.map((command, index) => {
                  const selected = index === selectedIndex;
                  return (
                    <motion.button
                      id={`desktop-command-${command.id}`}
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="group relative flex min-h-[64px] w-full items-center gap-3 overflow-hidden rounded-2xl px-3 text-left"
                      onPointerMove={() => setSelectedIndex(index)}
                      onClick={() => selectCommand(command)}
                      whileTap={reducedMotion ? undefined : { scale: 0.985 }}
                    >
                      {selected && (
                        <motion.span
                          layoutId="desktop-command-highlight"
                          className="absolute inset-0 rounded-2xl border border-cyan-200/10 bg-gradient-to-r from-cyan-300/[0.11] via-violet-400/[0.09] to-transparent"
                          transition={MOTION_SPRINGS.sharedLayout}
                        />
                      )}
                      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.055] text-cyan-100/85 transition group-hover:border-cyan-200/20">
                        {command.icon ?? <Sparkles className="h-4 w-4" />}
                      </span>
                      <span className="relative min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white/90">
                          {command.label}
                        </span>
                        {command.description && (
                          <span className="mt-0.5 block truncate text-xs text-white/40">
                            {command.description}
                          </span>
                        )}
                      </span>
                      {command.shortcut && (
                        <kbd className="relative rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium text-white/45">
                          {command.shortcut}
                        </kbd>
                      )}
                      <CornerDownLeft
                        className={`relative h-4 w-4 text-cyan-100 transition ${selected ? 'opacity-70' : 'opacity-0'}`}
                      />
                    </motion.button>
                  );
                })
              ) : (
                <div className="grid min-h-44 place-items-center px-8 text-center">
                  <div>
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/35">
                      <Search className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white/70">
                      No matching command
                    </p>
                    <p className="mt-1 text-xs text-white/35">
                      Try a destination, task action, or focus command.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <footer className="flex items-center gap-4 border-t border-white/[0.07] px-5 py-3 text-[10px] font-medium text-white/35">
              <span className="flex items-center gap-1.5">
                <ArrowUp className="h-3 w-3" />
                <ArrowDown className="h-3 w-3" /> navigate
              </span>
              <span className="flex items-center gap-1.5">
                <CornerDownLeft className="h-3 w-3" /> select
              </span>
              <span className="ml-auto">Esc to close</span>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
