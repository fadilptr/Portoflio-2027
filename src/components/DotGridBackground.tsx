import { useEffect, useRef } from 'react';
import { frameEngine } from '../utils/frameEngine';

interface DotGridBackgroundProps {
  reducedMotion: boolean;
}

/**
 * Fine 28px radial-gradient dot grid on a fixed background layer.
 * On desktop fine pointers, dots within 120px of the cursor brighten and tint
 * with the accent color via CSS variables updated on the shared frameEngine.
 * Automatically pauses during fast scrolling or adaptive quality tier >= 1 (Part H).
 */
export function DotGridBackground({ reducedMotion }: DotGridBackgroundProps) {
  const glowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const isCoarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse) return;

    const el = glowRef.current;
    if (!el) return;

    let nextX = -999;
    let nextY = -999;
    let hasPointer = false;
    let dirty = false;
    let glowVisible = false;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      nextX = event.clientX;
      nextY = event.clientY;
      hasPointer = true;
      dirty = true;
    };

    const handlePointerLeave = () => {
      nextX = -999;
      nextY = -999;
      hasPointer = false;
      dirty = true;
    };

    const unsubscribe = frameEngine.subscribe((ctx) => {
      // Pause dot-grid cursor highlight while scrolling fast or when quality stepped down
      const shouldShow =
        hasPointer && !ctx.isScrollingFast && ctx.qualityTier < 1;

      if (shouldShow !== glowVisible) {
        glowVisible = shouldShow;
        el.style.opacity = shouldShow ? '1' : '0';
      }

      if (shouldShow && dirty) {
        dirty = false;
        el.style.setProperty('--cursor-x', `${nextX}px`);
        el.style.setProperty('--cursor-y', `${nextY}px`);
      }
    });

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave);

    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [reducedMotion]);

  return (
    <div
      aria-hidden="true"
      data-testid="dot-grid-bg"
      className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden"
    >
      <div className="dot-grid-base absolute inset-0 theme-surface" />

      {!reducedMotion && (
        <div
          ref={glowRef}
          style={{ opacity: 0 }}
          className="dot-grid-glow absolute inset-0 transition-opacity duration-200"
        />
      )}
    </div>
  );
}
