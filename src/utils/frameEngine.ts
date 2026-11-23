import Lenis from 'lenis';
import {
  createQualityMonitorState,
  stepQualityMonitor,
  type QualityTier,
} from './portfolioLogic';

export interface FrameContext {
  now: number;
  deltaMs: number;
  scrollY: number;
  scrollVelocity: number;
  isScrollingFast: boolean;
  qualityTier: QualityTier;
}

type FrameListener = (ctx: FrameContext) => void;

/**
 * PART H — Single Shared Animation Clock.
 * Drives Lenis (with autoRaf: false), scroll velocity tracking, adaptive quality
 * monitoring, cursor canvas, dot-grid pointer highlight, pixel transitions, and
 * scroll-linked layout updates from ONE requestAnimationFrame loop.
 * Automatically pauses when the document tab is hidden.
 */
class SharedFrameEngine {
  private listeners = new Set<FrameListener>();
  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private tabHidden = false;
  private lenis: Lenis | null = null;
  private reducedMotion = false;
  private scrollVelocity = 0;
  private lastNativeScrollY = 0;
  private qualityState = createQualityMonitorState();
  private qualityListeners = new Set<(tier: QualityTier) => void>();
  private trailSpawnFactor = 1;

  constructor() {
    if (typeof document !== 'undefined') {
      this.tabHidden = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public setTrailSpawnFactor(factor: number): void {
    this.trailSpawnFactor = Math.max(0, Math.min(1, factor));
  }

  public getTrailSpawnFactor(): number {
    return this.trailSpawnFactor;
  }

  public initLenis(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.destroyLenis();

    if (typeof window === 'undefined' || reducedMotion) {
      this.scrollVelocity = 0;
      return;
    }

    // Lenis with autoRaf: false, lerp ~0.10, wheelMultiplier 1, native mobile touch scroll
    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.1,
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
    });

    lenis.on('scroll', ({ velocity }: { velocity: number }) => {
      this.scrollVelocity = velocity;
    });

    this.lenis = lenis;
    this.ensureRunning();
  }

  public destroyLenis(): void {
    if (this.lenis) {
      this.lenis.destroy();
      this.lenis = null;
    }
  }

  public stopScroll(): void {
    this.lenis?.stop();
  }

  public startScroll(): void {
    this.lenis?.start();
  }

  public scrollTo(
    target: number | HTMLElement,
    options?: { immediate?: boolean; offset?: number; duration?: number }
  ): void {
    if (this.lenis && !this.reducedMotion) {
      this.lenis.start();
      this.lenis.resize();
      this.lenis.scrollTo(target, {
        immediate: options?.immediate ?? false,
        offset: options?.offset ?? 0,
        duration: options?.duration,
        force: options?.immediate ?? false,
        easing: options?.duration
          ? (t: number) => 1 - Math.pow(1 - t, 3)
          : undefined,
      });
      if (options?.immediate && typeof target === 'number') {
        window.scrollTo({ top: target, behavior: 'instant' });
      }
    } else if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior: 'instant' });
    } else {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }

  public getQualityTier(): QualityTier {
    return this.qualityState.tier;
  }

  public subscribeQuality(fn: (tier: QualityTier) => void): () => void {
    this.qualityListeners.add(fn);
    fn(this.qualityState.tier);
    return () => {
      this.qualityListeners.delete(fn);
    };
  }

  public subscribe(fn: FrameListener): () => void {
    this.listeners.add(fn);
    this.ensureRunning();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0 && !this.lenis) {
        this.stop();
      }
    };
  }

  private ensureRunning(): void {
    if (this.running || this.tabHidden || typeof window === 'undefined') return;
    this.running = true;
    this.lastTime = performance.now();
    this.lastNativeScrollY = window.scrollY;
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  private stop(): void {
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.running = false;
  }

  private handleVisibilityChange = (): void => {
    this.tabHidden = document.visibilityState === 'hidden';
    if (this.tabHidden) {
      this.stop();
    } else if (this.listeners.size > 0 || this.lenis) {
      this.ensureRunning();
    }
  };

  private tick = (now: number): void => {
    if (this.tabHidden) {
      this.running = false;
      return;
    }

    const deltaMs = Math.max(0, Math.min(100, now - this.lastTime));
    this.lastTime = now;

    if (this.lenis) {
      this.lenis.raf(now);
      if (Math.abs(this.lenis.velocity) < 0.04) {
        this.scrollVelocity = 0;
      }
    } else {
      const currentY = window.scrollY;
      this.scrollVelocity = deltaMs > 0 ? (currentY - this.lastNativeScrollY) : 0;
      this.lastNativeScrollY = currentY;
    }

    const scrollY = window.scrollY;
    const absVel = Math.abs(this.scrollVelocity);
    const isScrolling = absVel > 0.35;
    const isScrollingFast = absVel > 14;

    // Adaptive quality monitoring during active scrolling
    const prevTier = this.qualityState.tier;
    this.qualityState = stepQualityMonitor(
      this.qualityState,
      deltaMs,
      now,
      isScrolling
    );
    if (this.qualityState.tier !== prevTier) {
      this.qualityListeners.forEach((cb) => cb(this.qualityState.tier));
    }

    const ctx: FrameContext = {
      now,
      deltaMs,
      scrollY,
      scrollVelocity: this.scrollVelocity,
      isScrollingFast,
      qualityTier: this.qualityState.tier,
    };

    this.listeners.forEach((listener) => listener(ctx));

    if (this.listeners.size > 0 || this.lenis) {
      this.rafId = window.requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };
}

export const frameEngine = new SharedFrameEngine();
