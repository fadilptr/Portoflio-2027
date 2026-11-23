import { useEffect, useRef } from 'react';
import { frameEngine } from '../utils/frameEngine';

export interface PixelTransitionRequest {
  id: number;
  mode: 'open' | 'close' | 'route';
  onMidpoint: () => void;
  onComplete: () => void;
}

interface PixelTransitionOverlayProps {
  request: PixelTransitionRequest | null;
  isDark: boolean;
  reducedMotion: boolean;
}

function shuffleIndices(count: number): Uint32Array {
  const arr = new Uint32Array(count);
  for (let i = 0; i < count; i++) arr[i] = i;
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Single full-screen <canvas> pixelated transition shared by project detail
 * open/close and top-level page routing (`mode: 'route'`).
 * - `'open'`: ~420ms cover + swap + ~420ms reveal (cap 980ms)
 * - `'close'`: ~250ms cover + swap + ~250ms reveal (cap 680ms)
 * - `'route'`: ~240ms cover + swap + ~240ms reveal (cap 680ms, never blocks >700ms)
 * Under prefers-reduced-motion, uses a crisp 200ms crossfade for route swaps (250ms for project open/close).
 */
export function PixelTransitionOverlay({
  request,
  isDark,
  reducedMotion,
}: PixelTransitionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fadeRef = useRef<HTMLDivElement | null>(null);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  useEffect(() => {
    if (!request) return;

    let finished = false;
    let midpointFired = false;

    const fireMidpoint = () => {
      if (midpointFired) return;
      midpointFired = true;
      request.onMidpoint();
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      fireMidpoint();
      request.onComplete();
    };

    // Reduced motion: 200ms crossfade for route swaps, 250ms for project transitions
    if (reducedMotion) {
      const halfMs = request.mode === 'route' ? 100 : 125;
      const totalMs = request.mode === 'route' ? 205 : 260;
      const fadeEl = fadeRef.current;
      if (fadeEl) {
        fadeEl.style.transition = `opacity ${halfMs}ms ease-out`;
        fadeEl.style.opacity = '1';
      }
      const midTimer = window.setTimeout(() => {
        fireMidpoint();
        if (fadeEl) {
          fadeEl.style.opacity = '0';
        }
      }, halfMs);
      const doneTimer = window.setTimeout(finish, totalMs);
      return () => {
        window.clearTimeout(midTimer);
        window.clearTimeout(doneTimer);
      };
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      finish();
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      finish();
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cellSize = vw < 640 ? 84 : 64;
    const cols = Math.ceil(vw / cellSize);
    const rows = Math.ceil(vh / cellSize);
    const total = cols * rows;

    const enterOrder = shuffleIndices(total);
    const exitOrder = shuffleIndices(total);
    // ~9% of cells briefly flash accent as they flip ON
    const isAccentFlash = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      if (Math.random() < 0.09) isAccentFlash[i] = 1;
    }

    const enterDuration =
      request.mode === 'open' ? 420 : request.mode === 'route' ? 240 : 250;
    const holdDuration = request.mode === 'route' ? 24 : 28;
    const exitDuration =
      request.mode === 'open' ? 420 : request.mode === 'route' ? 240 : 250;
    const totalDuration = enterDuration + holdDuration + exitDuration;
    const safetyCapMs = request.mode === 'open' ? 980 : 680;
    const startTime = performance.now();

    // Hard safety cap so input is never blocked longer than 680ms (route/close) or 980ms (open)
    const safetyTimer = window.setTimeout(() => {
      ctx.clearRect(0, 0, vw, vh);
      finish();
    }, safetyCapMs);

    const unsubscribe = frameEngine.subscribe((frame) => {
      if (finished) return;

      const elapsed = Math.max(0, frame.now - startTime);
      const inkColor = isDarkRef.current ? '#0B0B0A' : '#161616';
      const accentColor = isDarkRef.current ? '#FF550D' : '#D93B00';

      ctx.clearRect(0, 0, vw, vh);

      if (elapsed < enterDuration) {
        const p = easeInOutQuad(elapsed / enterDuration);
        const litCount = Math.min(total, Math.ceil(p * total));
        const flashWindow = Math.max(2, Math.floor(total * 0.14));

        for (let k = 0; k < litCount; k++) {
          const cellIdx = enterOrder[k];
          const col = cellIdx % cols;
          const row = (cellIdx - col) / cols;
          const isFresh = litCount - k <= flashWindow;
          ctx.fillStyle =
            isFresh && isAccentFlash[cellIdx] ? accentColor : inkColor;
          ctx.fillRect(col * cellSize, row * cellSize, cellSize + 0.6, cellSize + 0.6);
        }
      } else if (elapsed < enterDuration + holdDuration) {
        ctx.fillStyle = inkColor;
        ctx.fillRect(0, 0, vw, vh);
        fireMidpoint();
      } else if (elapsed < totalDuration) {
        fireMidpoint();
        const exitElapsed = elapsed - enterDuration - holdDuration;
        const p = easeInOutQuad(Math.min(1, exitElapsed / exitDuration));
        const clearedCount = Math.min(total, Math.floor(p * total));
        const flashWindow = Math.max(2, Math.floor(total * 0.08));

        for (let k = clearedCount; k < total; k++) {
          const cellIdx = exitOrder[k];
          const col = cellIdx % cols;
          const row = (cellIdx - col) / cols;
          const isAboutToClear = k - clearedCount < flashWindow;
          ctx.fillStyle =
            isAboutToClear && isAccentFlash[cellIdx] ? accentColor : inkColor;
          ctx.fillRect(col * cellSize, row * cellSize, cellSize + 0.6, cellSize + 0.6);
        }
      } else {
        ctx.clearRect(0, 0, vw, vh);
        finish();
      }
    });

    return () => {
      unsubscribe();
      window.clearTimeout(safetyTimer);
      ctx.clearRect(0, 0, vw, vh);
    };
  }, [request, reducedMotion]);

  if (!request) {
    return null;
  }

  if (reducedMotion) {
    return (
      <div
        ref={fadeRef}
        aria-hidden="true"
        data-testid="pixel-transition-overlay"
        style={{ opacity: 0, transition: 'opacity 100ms ease-out' }}
        className="fixed inset-0 z-[95] bg-[var(--bg-canvas)] pointer-events-auto"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="pixel-transition-overlay"
      className="fixed inset-0 z-[95] pointer-events-auto"
    />
  );
}
