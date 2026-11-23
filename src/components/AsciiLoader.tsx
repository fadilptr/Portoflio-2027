import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { formatAsciiProgress } from '../utils/portfolioLogic';
import { frameEngine } from '../utils/frameEngine';
import { waitForArealFont } from '../utils/arealFontLoader';

interface AsciiLoaderProps {
  reducedMotion: boolean;
  onComplete: () => void;
}

const SESSION_KEY = 'fmp-loader-seen-2027';
const TARGET_DURATION_MS = 1950;
const HARD_CAP_MS = 3000;
const BAR_WIDTH = 16;

const CURTAIN_BLOCKS = '████████████████████████████████████████████████████████';
const CURTAIN_SHADES = '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓';
const CURTAIN_MID    = '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒';
const CURTAIN_LIGHT  = '░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░';

function hasSeenLoaderThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markLoaderSeen(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Ignore storage restrictions
  }
}

/**
 * Full-screen ASCII progress loader (000 -> 100%).
 * Driven by the shared frameEngine clock (zero second rAF loop).
 * Tied to document.fonts.ready, guaranteed ~2s and never >3s, shown once per
 * session, skippable via click or key press, exits with an upward dissolving
 * block-character curtain wipe (or 300ms fade under prefers-reduced-motion).
 */
export function AsciiLoader({ reducedMotion, onComplete }: AsciiLoaderProps) {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (window.location.search.includes('autostart=1')) {
      markLoaderSeen();
      return false;
    }
    return !hasSeenLoaderThisSession();
  });

  const [progress, setProgress] = useState<number>(0);
  const [scrambleSeed, setScrambleSeed] = useState<number>(0);
  const finishedRef = useRef<boolean>(false);

  const finishLoader = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markLoaderSeen();
    setProgress(100);
    setVisible(false);
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!visible) {
      onComplete();
    }
  }, [visible, onComplete]);

  useEffect(() => {
    if (!visible) return;

    if (reducedMotion) {
      setProgress(100);
      const timer = window.setTimeout(finishLoader, 300);
      return () => window.clearTimeout(timer);
    }

    let fontsLoaded = false;
    let completionScheduled = false;
    let completionTimer = 0;
    let lastCommittedProgress = -1;
    let lastScrambleAt = 0;
    const startTime = performance.now();

    waitForArealFont(HARD_CAP_MS)
      .then(() => {
        fontsLoaded = true;
      })
      .catch(() => {
        fontsLoaded = true;
      });

    const capTimer = window.setTimeout(finishLoader, HARD_CAP_MS);

    const unsubscribe = frameEngine.subscribe((ctx) => {
      if (finishedRef.current || completionScheduled) return;

      const elapsed = Math.max(0, ctx.now - startTime);
      const timeRatio = Math.max(0, Math.min(1, elapsed / TARGET_DURATION_MS));
      const maxAllowed = fontsLoaded || elapsed >= HARD_CAP_MS - 120 ? 100 : 94;
      const eased = 1 - Math.pow(1 - timeRatio, 2.2);
      const nextValue = Math.max(0, Math.min(maxAllowed, Math.round(eased * 100)));

      if (nextValue !== lastCommittedProgress) {
        lastCommittedProgress = nextValue;
        setProgress(nextValue);
      }

      // Throttle scramble flicker cadence to ~22fps for crisp terminal pacing
      if (ctx.now - lastScrambleAt >= 45) {
        lastScrambleAt = ctx.now;
        setScrambleSeed((seed) => seed + 1);
      }

      if (nextValue >= 100 && timeRatio >= 0.96) {
        completionScheduled = true;
        completionTimer = window.setTimeout(finishLoader, 110);
      }
    });

    const handleSkipKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      finishLoader();
    };

    window.addEventListener('keydown', handleSkipKey);

    return () => {
      unsubscribe();
      window.clearTimeout(capTimer);
      window.clearTimeout(completionTimer);
      window.removeEventListener('keydown', handleSkipKey);
    };
  }, [visible, reducedMotion, finishLoader]);

  const { bar, digits } = formatAsciiProgress(
    progress,
    BAR_WIDTH,
    scrambleSeed,
    reducedMotion
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          aria-label={`Loading portfolio ${progress}%`}
          data-testid="ascii-loader"
          onClick={finishLoader}
          initial={{ opacity: 1, y: '0%' }}
          exit={
            reducedMotion
              ? { opacity: 0, transition: { duration: 0.3, ease: 'easeOut' } }
              : {
                  y: '-112%',
                  transition: { duration: 0.58, ease: [0.76, 0, 0.24, 1] },
                }
          }
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)] select-none cursor-pointer"
        >
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="font-mono-ui text-sm sm:text-base font-medium tracking-[0.16em] text-[var(--text-primary)]">
              <span className="text-[var(--accent)]">{bar}</span>{' '}
              <span className="tabular-nums">{digits}</span>
            </div>
            <span className="font-mono-ui text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
              PRESS ANY KEY OR CLICK TO SKIP
            </span>
          </div>

          {!reducedMotion && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-full inset-x-0 overflow-hidden font-mono-ui text-lg sm:text-2xl leading-[0.82] tracking-tighter text-[var(--bg-canvas)] select-none"
            >
              <div className="whitespace-nowrap overflow-hidden text-[var(--text-primary)] opacity-90">
                {CURTAIN_BLOCKS}
              </div>
              <div className="whitespace-nowrap overflow-hidden text-[var(--accent)] opacity-75">
                {CURTAIN_SHADES}
              </div>
              <div className="whitespace-nowrap overflow-hidden text-[var(--text-primary)] opacity-45">
                {CURTAIN_MID}
              </div>
              <div className="whitespace-nowrap overflow-hidden text-[var(--text-muted)] opacity-25">
                {CURTAIN_LIGHT}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
