'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Mode = 'candidate' | 'employer';

interface ModeSwitcherProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

interface ModeFormTransitionProps {
  /** Use the current mode as the key so AnimatePresence detects a real swap. */
  modeKey: string;
  children: ReactNode;
}

const OPTIONS: { value: Mode; label: string }[] = [
  { value: 'candidate', label: "I'm looking for work" },
  { value: 'employer', label: "I'm hiring" },
];

const formVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
};

// ─── Switcher ────────────────────────────────────────────────────────────────

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <motion.div
      className="flex w-full max-w-md mx-auto gap-2"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {OPTIONS.map(({ value, label }) => {
        const isActive = mode === value;
        return (
          <Button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={[
              'flex-1 h-11 rounded-full font-medium text-sm transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-transparent border border-border text-muted-foreground hover:bg-muted',
            ].join(' ')}
            variant="ghost"
          >
            {label}
          </Button>
        );
      })}
    </motion.div>
  );
}

// ─── Form crossfade wrapper ───────────────────────────────────────────────────

/**
 * Wrap the active form in this component on the auth page:
 *
 * ```tsx
 * <ModeFormTransition modeKey={mode}>
 *   {mode === 'candidate' ? <CandidateForm /> : <EmployerForm />}
 * </ModeFormTransition>
 * ```
 */
export function ModeFormTransition({ modeKey, children }: ModeFormTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={modeKey}
        variants={formVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
