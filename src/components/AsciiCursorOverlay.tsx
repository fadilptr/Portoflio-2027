import { useEffect, useRef } from 'react';
import {
  CURSOR_GLYPHS,
  computeBurstCountForSpeed,
  shouldSpawnCursorParticle,
  trimParticles,
} from '../utils/portfolioLogic';
import { frameEngine } from '../utils/frameEngine';

interface AsciiCursorOverlayProps {
  reducedMotion: boolean;
  isDark: boolean;
}

interface CursorParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  char: string;
  bornAt: number;
  lifeMs: number;
  sizePx: number;
}

const MAX_PARTICLES_FULL = 240;
const MAX_PARTICLES_MINIMAL = 40;
const SPAWN_DISTANCE_NORMAL = 18;
const SPAWN_DISTANCE_FAST_SCROLL = 46;

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * High-density ASCII cursor trail (desktop), 12–20 character desktop click
 * burst, and touch tap burst on a single canvas driven by frameEngine (zero
 * second rAF loop).
 * Caps DPR <= 2, throttles spawn rate during fast scrolling or adaptive quality
 * tier >= 2, pauses automatically when tab is hidden, and disables completely
 * under prefers-reduced-motion.
 */
export function AsciiCursorOverlay({
  reducedMotion,
  isDark,
}: AsciiCursorOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: CursorParticle[] = [];
    let lastSpawnX = -999;
    let lastSpawnY = -999;
    let lastMoveTime = performance.now();
    let hadRenderedParticles = false;
    let scrollingFast = false;
    let qualityTier = frameEngine.getQualityTier();
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    const isCoarsePointer = () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      canvas.width = Math.floor(viewportWidth * dpr);
      canvas.height = Math.floor(viewportHeight * dpr);
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${viewportHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();

    const pickGlyph = () =>
      CURSOR_GLYPHS[Math.floor(Math.random() * CURSOR_GLYPHS.length)];

    const getMaxParticles = () =>
      qualityTier >= 2 ? MAX_PARTICLES_MINIMAL : MAX_PARTICLES_FULL;

    const spawnRadialBurst = (
      x: number,
      y: number,
      count: number,
      speedMin: number,
      speedMax: number
    ) => {
      const now = performance.now();
      const effectiveCount =
        qualityTier >= 2 ? Math.max(4, Math.round(count * 0.4)) : count;
      for (let i = 0; i < effectiveCount; i++) {
        const angle =
          (Math.PI * 2 * i) / effectiveCount + (Math.random() - 0.5) * 0.45;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        particles.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rotation: (Math.random() - 0.5) * 0.55,
          vRot: (Math.random() - 0.5) * 0.5,
          char: pickGlyph(),
          bornAt: now,
          lifeMs: 620 + Math.random() * 280,
          sizePx: 10 + Math.floor(Math.random() * 7),
        });
      }
      particles = trimParticles(particles, getMaxParticles());
    };

    let trailSpawnAccumulator = 1;

    const handleMouseMove = (event: MouseEvent) => {
      if (isCoarsePointer() || document.visibilityState === 'hidden') return;
      const x = event.clientX;
      const y = event.clientY;
      const now = performance.now();

      const minDist =
        scrollingFast || qualityTier >= 2
          ? SPAWN_DISTANCE_FAST_SCROLL
          : SPAWN_DISTANCE_NORMAL;

      if (
        lastSpawnX === -999 ||
        shouldSpawnCursorParticle(lastSpawnX, lastSpawnY, x, y, minDist)
      ) {
        const dist =
          lastSpawnX === -999
            ? minDist
            : Math.hypot(x - lastSpawnX, y - lastSpawnY);
        const dt = Math.max(8, now - lastMoveTime);
        const speedPxPerMs = dist / dt;

        lastSpawnX = x;
        lastSpawnY = y;
        lastMoveTime = now;

        const spawnFactor = frameEngine.getTrailSpawnFactor();
        if (spawnFactor < 1) {
          trailSpawnAccumulator += spawnFactor;
          if (trailSpawnAccumulator < 1) {
            return;
          }
          trailSpawnAccumulator -= 1;
        } else {
          trailSpawnAccumulator = 1;
        }

        let spawnCount = computeBurstCountForSpeed(speedPxPerMs);
        if (qualityTier >= 2) {
          spawnCount = 1;
        } else if (scrollingFast) {
          spawnCount = Math.min(2, spawnCount);
        } else if (spawnFactor < 1) {
          spawnCount = Math.max(1, Math.round(spawnCount * spawnFactor));
        }

        for (let i = 0; i < spawnCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const drift = 0.45 + Math.random() * 0.95;
          particles.push({
            x: x + (Math.random() - 0.5) * 14,
            y: y + (Math.random() - 0.5) * 14,
            vx: Math.cos(angle) * drift,
            vy: Math.sin(angle) * drift - 0.25,
            rotation: (Math.random() - 0.5) * 0.48,
            vRot: (Math.random() - 0.5) * 0.4,
            char: pickGlyph(),
            bornAt: now,
            lifeMs: 600 + Math.random() * 300,
            sizePx: 10 + Math.floor(Math.random() * 7),
          });
        }
        particles = trimParticles(particles, getMaxParticles());
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (isCoarsePointer() || document.visibilityState === 'hidden' || event.button !== 0) {
        return;
      }
      const count = 12 + Math.floor(Math.random() * 9);
      spawnRadialBurst(event.clientX, event.clientY, count, 1.0, 2.35);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (document.visibilityState === 'hidden') return;
      const touch = event.touches[0];
      if (!touch) return;
      const count = 11 + Math.floor(Math.random() * 4);
      spawnRadialBurst(touch.clientX, touch.clientY, count, 0.95, 2.05);
    };

    const handleCustomBurst = (event: Event) => {
      if (document.visibilityState === 'hidden') return;
      const detail = (event as CustomEvent<{ x?: number; y?: number; count?: number }>).detail;
      if (!detail || typeof detail.x !== 'number' || typeof detail.y !== 'number') return;
      const count =
        typeof detail.count === 'number'
          ? Math.max(12, Math.min(16, Math.round(detail.count)))
          : 12 + Math.floor(Math.random() * 5);
      spawnRadialBurst(detail.x, detail.y, count, 1.1, 2.4);
    };

    const unsubscribe = frameEngine.subscribe((frame) => {
      scrollingFast = frame.isScrollingFast;
      qualityTier = frame.qualityTier;

      if (particles.length === 0) {
        if (hadRenderedParticles) {
          ctx.clearRect(0, 0, viewportWidth, viewportHeight);
          hadRenderedParticles = false;
        }
        return;
      }

      hadRenderedParticles = true;
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);

      const accentRgb: [number, number, number] = isDarkRef.current
        ? [255, 85, 13]
        : [217, 59, 0];
      const grayRgb: [number, number, number] = isDarkRef.current
        ? [157, 156, 148]
        : [92, 91, 85];

      const alive: CursorParticle[] = [];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const elapsed = frame.now - p.bornAt;
        if (elapsed >= p.lifeMs) continue;

        const progress = Math.max(0, elapsed / p.lifeMs);
        const easedOut = 1 - Math.pow(1 - progress, 2);
        const alpha = (1 - progress) * 0.94;
        const px = p.x + p.vx * easedOut * 38;
        const py = p.y + p.vy * easedOut * 38;
        const rot = p.rotation + p.vRot * progress;

        const colorProgress = Math.min(1, progress * 1.25);
        const r = lerpChannel(accentRgb[0], grayRgb[0], colorProgress);
        const g = lerpChannel(accentRgb[1], grayRgb[1], colorProgress);
        const b = lerpChannel(accentRgb[2], grayRgb[2], colorProgress);

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.font = `600 ${p.sizePx}px "JetBrains Mono", monospace`;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.fillText(p.char, 0, 0);
        ctx.restore();

        alive.push(p);
      }

      particles = alive;
    });

    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('fmp:ascii-burst', handleCustomBurst);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('fmp:ascii-burst', handleCustomBurst);
    };
  }, [reducedMotion]);

  if (reducedMotion) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="ascii-cursor-canvas"
      className="fixed inset-0 z-[80] pointer-events-none"
    />
  );
}
