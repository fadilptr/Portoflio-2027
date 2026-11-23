import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { HERO_ASCII, type PortfolioConfig } from '../config/portfolio';
import { computeFitFontSize } from '../utils/portfolioLogic';
import {
  buildEvenOddClipPath,
  hitTestLetterBoxes,
  stepHeroAsciiState,
  triggerTouchLitLetter,
  type ClipHoleRect,
  type LetterBox,
  type LitLetterState,
} from '../utils/heroAsciiLogic';
import { frameEngine } from '../utils/frameEngine';
import { waitForArealFont } from '../utils/arealFontLoader';

interface ProfileHeroProps {
  config: PortfolioConfig;
  reducedMotion: boolean;
  asciiEnabled?: boolean;
}

const REF_FONT_PX = 100;
const HERO_WORDS = ['GRAPHIC', 'DESIGNER'] as const;
const TOTAL_HERO_LETTERS = HERO_WORDS[0].length + HERO_WORDS[1].length;
const SLOTS_PER_LETTER = HERO_ASCII.maxChars;
const TOTAL_OVERLAY_SLOTS = TOTAL_HERO_LETTERS * SLOTS_PER_LETTER;
const OVERLAY_SLOT_INDICES = Array.from({ length: TOTAL_OVERLAY_SLOTS }, (_, i) => i);

interface HeroLayoutMetrics {
  isMobile: boolean;
  heroFontSize: number;
  settledScale: number;
  designerSettledX: number;
  designerHeroY: number;
  designerSettledY: number;
  heroStartY: number;
  settledHeaderHeight: number;
  measured: boolean;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Editorial Zoom Hero + 12-Column Intro Section set in Areal (Dinamo), plus the
 * interactive per-letter ASCII hover/tap effect on the resting GRAPHIC / DESIGNER
 * headline (configured via `HERO_ASCII` in `src/config/portfolio.ts`).
 * - Keeps the original headline text nodes completely intact (no per-letter spans)
 *   to preserve native kerning across Safari/Chromium.
 * - Measures letter boxes via DOM Range + Canvas cap-height metrics after fonts
 *   and fit-to-width settle, hides active glyphs via `clip-path: polygon(evenodd)`,
 *   and renders 1–5 accent monospace ASCII characters in an `aria-hidden` pooled
 *   overlay driven exclusively inside the shared `frameEngine` loop.
 */
export function ProfileHero({
  config,
  reducedMotion,
  asciiEnabled = true,
}: ProfileHeroProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const headlineWrapRef = useRef<HTMLDivElement | null>(null);
  const graphicWordRef = useRef<HTMLSpanElement | null>(null);
  const designerWordRef = useRef<HTMLSpanElement | null>(null);
  const graphicMeasureRef = useRef<HTMLSpanElement | null>(null);
  const designerMeasureRef = useRef<HTMLSpanElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const rawProgress = useMotionValue(reducedMotion ? 1 : 0);
  const smoothProgress = useSpring(rawProgress, {
    stiffness: 120,
    damping: 28,
    mass: 0.4,
  });

  // Cached section geometry (updated strictly on ResizeObserver / resize, never on scroll)
  const boundsRef = useRef({ top: 0, height: 1800, viewportHeight: 900 });

  // Refs for zero-re-render interactive hero ASCII engine
  const asciiEnabledRef = useRef(asciiEnabled && !reducedMotion);
  asciiEnabledRef.current = asciiEnabled && !reducedMotion;
  const letterBoxesRef = useRef<LetterBox[]>([]);
  const wrapperOriginRef = useRef({ left: 0, topAtScroll0: 0 });
  const wordSpanSizesRef = useRef<[ { width: number; height: number }, { width: number; height: number } ]>([
    { width: 0, height: 0 },
    { width: 0, height: 0 },
  ]);
  const litMapRef = useRef<Map<number, LitLetterState>>(new Map());
  const pointerRef = useRef({ active: false, x: -9999, y: -9999 });
  const touchTapRef = useRef({ pending: false, x: 0, y: 0 });
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [metrics, setMetrics] = useState<HeroLayoutMetrics>(() => {
    const mobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
    return {
      isMobile: mobile,
      heroFontSize: mobile ? 72 : 220,
      settledScale: mobile ? 0.55 : 0.52,
      designerSettledX: mobile ? 0 : 520,
      designerHeroY: mobile ? 58 : 176,
      designerSettledY: mobile ? 32 : 0,
      heroStartY: mobile ? 120 : 110,
      settledHeaderHeight: mobile ? 74 : 112,
      measured: false,
    };
  });
  const metricsMeasuredRef = useRef(metrics.measured);
  metricsMeasuredRef.current = metrics.measured;

  /**
   * Measures every character of GRAPHIC and DESIGNER using a DOM Range on the
   * intact text nodes plus Canvas `measureText('H')` for exact cap-height and
   * baseline alignment. Runs only when hero is at rest at the top.
   */
  const measureLetterBoxes = useCallback(() => {
    const wrapEl = headlineWrapRef.current;
    const graphicEl = graphicWordRef.current;
    const designerEl = designerWordRef.current;
    if (!wrapEl || !graphicEl || !designerEl || !metricsMeasuredRef.current) return;

    const currentProgress = smoothProgress.get();
    if (window.scrollY > HERO_ASCII.enableScrollMax || currentProgress >= 0.02) {
      return;
    }

    const wrapRect = wrapEl.getBoundingClientRect();
    wrapperOriginRef.current = {
      left: wrapRect.left,
      topAtScroll0: wrapRect.top + window.scrollY,
    };

    if (!measureCanvasRef.current) {
      measureCanvasRef.current = document.createElement('canvas');
    }
    const ctx = measureCanvasRef.current.getContext('2d');
    const range = document.createRange();

    const wordEls: [HTMLSpanElement, HTMLSpanElement] = [graphicEl, designerEl];
    const nextBoxes: LetterBox[] = [];
    let globalIdx = 0;

    for (let w = 0; w < 2; w++) {
      const wordEl = wordEls[w];
      const textNode = wordEl.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;

      const text = textNode.textContent ?? '';
      const wordRect = wordEl.getBoundingClientRect();
      wordSpanSizesRef.current[w] = {
        width: wordRect.width,
        height: wordRect.height,
      };

      const cs = window.getComputedStyle(wordEl);
      const fontSizePx = parseFloat(cs.fontSize) || 100;
      let fontAscent = fontSizePx * 0.88;
      let capAscent = fontSizePx * 0.72;

      if (ctx) {
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const mH = ctx.measureText('H');
        if (typeof mH.fontBoundingBoxAscent === 'number' && mH.fontBoundingBoxAscent > 0) {
          fontAscent = mH.fontBoundingBoxAscent;
        }
        if (typeof mH.actualBoundingBoxAscent === 'number' && mH.actualBoundingBoxAscent > 0) {
          capAscent = mH.actualBoundingBoxAscent;
        }
      }

      // First collect raw DOM Range rects for all letters in this word
      const rawRects: DOMRect[] = [];
      for (let i = 0; i < text.length; i++) {
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const clientRects = range.getClientRects();
        const rect =
          clientRects.length > 0 ? clientRects[0] : range.getBoundingClientRect();
        rawRects.push(rect);
      }

      for (let i = 0; i < rawRects.length; i++) {
        const rect = rawRects[i];
        const baseline = rect.top + fontAscent;
        const capTop = baseline - capAscent;
        const capHeight = Math.max(8, baseline - capTop);

        const relLeft = rect.left - wrapRect.left;
        const relTop = capTop - wrapRect.top;
        const insetX = rect.width * HERO_ASCII.hitInset;

        // Clip-path hole in word-span local coordinates with neighbor-safe horizontal inset
        const holeInsetLeft = i === 0 ? Math.max(0, rect.width * 0.01) : Math.max(1.5, rect.width * 0.04);
        const holeInsetRight =
          i === rawRects.length - 1
            ? Math.max(0, rect.width * 0.01)
            : Math.max(1.5, rect.width * 0.04);
        const holeVerticalBleed = Math.max(4, capHeight * 0.045);

        const holeLeft = rect.left - wordRect.left + holeInsetLeft;
        const holeRight = Math.max(
          holeLeft + 2,
          rect.right - wordRect.left - holeInsetRight
        );
        const holeTop = capTop - wordRect.top - holeVerticalBleed;
        const holeBottom = baseline - wordRect.top + holeVerticalBleed;

        nextBoxes.push({
          index: globalIdx,
          wordIndex: w as 0 | 1,
          charIndex: i,
          char: text[i],
          left: relLeft,
          top: relTop,
          width: rect.width,
          height: capHeight,
          hitLeft: relLeft + insetX,
          hitRight: relLeft + rect.width - insetX,
          hitTop: relTop,
          hitBottom: relTop + capHeight,
          holeLeft,
          holeTop,
          holeRight,
          holeBottom,
        });
        globalIdx += 1;
      }
    }

    range.detach?.();
    letterBoxesRef.current = nextBoxes;
  }, [smoothProgress]);

  /**
   * Synchronizes the evenodd clip-path polygons on the two word spans with the
   * currently lit letters, removing clip-path completely when no letter is lit.
   */
  const syncWordClipPaths = useCallback(() => {
    const graphicEl = graphicWordRef.current;
    const designerEl = designerWordRef.current;
    const boxes = letterBoxesRef.current;
    const litMap = litMapRef.current;

    const graphicHoles: ClipHoleRect[] = [];
    const designerHoles: ClipHoleRect[] = [];

    for (const letterIdx of litMap.keys()) {
      const box = boxes[letterIdx];
      if (!box) continue;
      const hole: ClipHoleRect = {
        left: box.holeLeft,
        top: box.holeTop,
        right: box.holeRight,
        bottom: box.holeBottom,
      };
      if (box.wordIndex === 0) {
        graphicHoles.push(hole);
      } else {
        designerHoles.push(hole);
      }
    }

    if (graphicEl) {
      const sz = wordSpanSizesRef.current[0];
      graphicEl.style.clipPath = buildEvenOddClipPath(sz.width, sz.height, graphicHoles);
    }
    if (designerEl) {
      const sz = wordSpanSizesRef.current[1];
      designerEl.style.clipPath = buildEvenOddClipPath(sz.width, sz.height, designerHoles);
    }
    if (overlayRef.current) {
      overlayRef.current.dataset.litCount = String(litMap.size);
    }
  }, []);

  /**
   * Hides all 5 pooled overlay spans for a single letter index.
   */
  const hideLetterSlots = useCallback((letterIndex: number) => {
    const base = letterIndex * SLOTS_PER_LETTER;
    for (let s = 0; s < SLOTS_PER_LETTER; s++) {
      const span = slotRefs.current[base + s];
      if (span) {
        span.style.opacity = '0';
      }
    }
  }, []);

  /**
   * Renders 1 centered large glyph (70% cap-height) or 2–5 glyphs in distinct
   * 3×3 grid cells (90% cell height) using translate3d + opacity on pre-allocated spans.
   */
  const paintLetterSlots = useCallback((state: LitLetterState) => {
    const box = letterBoxesRef.current[state.letterIndex];
    if (!box) return;

    const base = state.letterIndex * SLOTS_PER_LETTER;
    const { count, chars, cells } = state.roll;

    if (count === 1) {
      const span = slotRefs.current[base];
      if (span) {
        span.textContent = chars[0] ?? '#';
        span.style.width = `${box.width.toFixed(1)}px`;
        span.style.height = `${box.height.toFixed(1)}px`;
        span.style.fontSize = `${Math.max(12, Math.round(box.height * 0.7))}px`;
        span.style.transform = `translate3d(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px, 0)`;
        span.style.opacity = '1';
      }
      for (let s = 1; s < SLOTS_PER_LETTER; s++) {
        const extra = slotRefs.current[base + s];
        if (extra) extra.style.opacity = '0';
      }
      return;
    }

    const cellW = box.width / 3;
    const cellH = box.height / 3;
    const fontPx = Math.max(10, Math.round(cellH * 0.9));

    for (let s = 0; s < SLOTS_PER_LETTER; s++) {
      const span = slotRefs.current[base + s];
      if (!span) continue;
      if (s < count) {
        const cell = cells[s] ?? s;
        const col = cell % 3;
        const row = Math.floor(cell / 3);
        const x = box.left + col * cellW;
        const y = box.top + row * cellH;
        span.textContent = chars[s] ?? '#';
        span.style.width = `${cellW.toFixed(1)}px`;
        span.style.height = `${cellH.toFixed(1)}px`;
        span.style.fontSize = `${fontPx}px`;
        span.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        span.style.opacity = '1';
      } else {
        span.style.opacity = '0';
      }
    }
  }, []);

  /**
   * Immediately clears all lit letters, removes clip-paths, hides overlay spans,
   * and restores normal cursor trail spawn rate.
   */
  const clearAllLit = useCallback(() => {
    const litMap = litMapRef.current;
    if (litMap.size > 0) {
      for (const letterIdx of litMap.keys()) {
        hideLetterSlots(letterIdx);
      }
      litMap.clear();
    }
    if (graphicWordRef.current) graphicWordRef.current.style.clipPath = '';
    if (designerWordRef.current) designerWordRef.current.style.clipPath = '';
    if (overlayRef.current) overlayRef.current.dataset.litCount = '0';
    frameEngine.setTrailSpawnFactor(1);
  }, [hideLetterSlots]);

  // Wait for Areal (or 3s timeout) before first committed fit-to-width measurement,
  // then re-measure on every resize and whenever a font finishes loading.
  useLayoutEffect(() => {
    const container = stageContainerRef.current;
    const section = sectionRef.current;
    if (!container || !section) return;

    let cancelled = false;
    let fontGatePassed = false;
    const WORD_SPACE_EM = 0.22;

    const updateBounds = () => {
      const rect = section.getBoundingClientRect();
      boundsRef.current = {
        top: rect.top + window.scrollY,
        height: section.offsetHeight,
        viewportHeight: window.innerHeight,
      };
    };

    const recompute = () => {
      updateBounds();
      if (cancelled || !fontGatePassed) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw < 640;
      const contentWidth = container.clientWidth;

      const graphicW = graphicMeasureRef.current?.getBoundingClientRect().width ?? 0;
      const designerW = designerMeasureRef.current?.getBoundingClientRect().width ?? 0;

      if (contentWidth <= 0 || graphicW <= 0 || designerW <= 0) return;

      const safeWidth = contentWidth * 0.994;
      const navClearance = isMobile ? 76 : 92;
      const bottomClearance = isMobile ? 96 : 84;
      const availableH = Math.max(300, vh - navClearance - bottomClearance);

      // Fit longer word ("DESIGNER") edge-to-edge inside content margins
      const widthFittedHero = computeFitFontSize(
        safeWidth,
        designerW,
        REF_FONT_PX,
        40,
        460
      );

      const maxHeightFittedHero = (availableH * 0.86) / 1.6;
      const heroFontSize = Math.min(widthFittedHero, maxHeightFittedHero);

      const lineStepHero = heroFontSize * 0.8;
      const heroBlockHeight = heroFontSize * 1.6;
      const heroStartY = Math.max(8, (availableH - heroBlockHeight) * 0.44);

      if (isMobile) {
        const settledScale = 0.55;
        setMetrics({
          isMobile: true,
          heroFontSize,
          settledScale,
          designerSettledX: 0,
          designerHeroY: lineStepHero,
          designerSettledY: lineStepHero * settledScale,
          heroStartY,
          settledHeaderHeight: Math.round(heroBlockHeight * settledScale + 4),
          measured: true,
        });
      } else {
        // Exact single-line width = "GRAPHIC" + normal 0.22em word space + "DESIGNER"
        const wordSpaceAtRef = WORD_SPACE_EM * REF_FONT_PX;
        const fullLineW = graphicW + wordSpaceAtRef + designerW;

        const settledFontSize = computeFitFontSize(
          safeWidth,
          fullLineW,
          REF_FONT_PX,
          28,
          260
        );
        const settledScale = settledFontSize / heroFontSize;
        const designerSettledX =
          ((graphicW + wordSpaceAtRef) / REF_FONT_PX) * settledFontSize;

        setMetrics({
          isMobile: false,
          heroFontSize,
          settledScale,
          designerSettledX,
          designerHeroY: lineStepHero,
          designerSettledY: 0,
          heroStartY,
          settledHeaderHeight: Math.round(settledFontSize * 0.84),
          measured: true,
        });
      }
    };

    updateBounds();

    waitForArealFont(3000).then(() => {
      if (cancelled) return;
      fontGatePassed = true;
      recompute();
    });

    const observer = new ResizeObserver(() => {
      recompute();
    });
    observer.observe(container);
    observer.observe(section);

    const handleFontsLoaded = () => {
      if (fontGatePassed) recompute();
    };
    document.fonts?.addEventListener?.('loadingdone', handleFontsLoaded);
    window.addEventListener('resize', recompute, { passive: true });

    return () => {
      cancelled = true;
      observer.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', handleFontsLoaded);
      window.removeEventListener('resize', recompute);
    };
  }, []);

  // Re-measure DOM Range letter boxes after fit-to-width metrics update & fonts are ready
  useEffect(() => {
    if (!metrics.measured || reducedMotion) return;
    let cancelled = false;
    let timer = 0;

    const scheduleMeasure = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!cancelled) {
          measureLetterBoxes();
        }
      }, 32);
    };

    scheduleMeasure();
    document.fonts?.ready?.then(() => {
      if (!cancelled) scheduleMeasure();
    });

    const container = stageContainerRef.current;
    const ro = container ? new ResizeObserver(scheduleMeasure) : null;
    if (container && ro) ro.observe(container);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ro?.disconnect();
    };
  }, [metrics, reducedMotion, measureLetterBoxes]);

  // Instantly clear whenever effect becomes disabled (loader, transition, detail, reducedMotion)
  useEffect(() => {
    if (!asciiEnabled || reducedMotion) {
      clearAllLit();
    } else if (metrics.measured) {
      const t = window.setTimeout(() => measureLetterBoxes(), 32);
      return () => window.clearTimeout(t);
    }
  }, [asciiEnabled, reducedMotion, metrics.measured, clearAllLit, measureLetterBoxes]);

  // One passive pointermove + passive pointerdown (touch tap) + pointerleave on hero section
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || reducedMotion) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointerRef.current.active = true;
      pointerRef.current.x = event.clientX;
      pointerRef.current.y = event.clientY;
    };

    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      // Never call preventDefault — preserve native vertical touch scrolling
      touchTapRef.current.pending = true;
      touchTapRef.current.x = event.clientX;
      touchTapRef.current.y = event.clientY;
    };

    section.addEventListener('pointermove', handlePointerMove, { passive: true });
    section.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    section.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('blur', handlePointerLeave, { passive: true });

    return () => {
      section.removeEventListener('pointermove', handlePointerMove);
      section.removeEventListener('pointerleave', handlePointerLeave);
      section.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('blur', handlePointerLeave);
      clearAllLit();
    };
  }, [reducedMotion, clearAllLit]);

  // Single shared frameEngine subscription: drives hero zoom progress AND hero ASCII hit-test/ticks
  useEffect(() => {
    if (reducedMotion) {
      rawProgress.set(1);
      clearAllLit();
      return;
    }

    let lastValue = -1;
    let effectActive = false;
    let scrolledAway = false;
    let reEnableReadyAt = 0;
    let lastTrailThrottled = false;

    const unsubscribe = frameEngine.subscribe((ctx) => {
      // 1. Update hero zoom progress (zero DOM reads)
      const { top, height, viewportHeight } = boundsRef.current;
      const travel = Math.max(1, height - viewportHeight);
      const next = Math.max(0, Math.min(1, (ctx.scrollY - top) / travel));
      if (Math.abs(next - lastValue) > 0.0005) {
        lastValue = next;
        rawProgress.set(next);
      }

      // 2. Interactive hero ASCII guard: active ONLY at rest at top
      const zoomNow = smoothProgress.get();
      const canBeActive =
        asciiEnabledRef.current &&
        metricsMeasuredRef.current &&
        ctx.scrollY <= HERO_ASCII.enableScrollMax &&
        zoomNow < 0.02;

      if (!canBeActive) {
        if (ctx.scrollY > HERO_ASCII.enableScrollMax || zoomNow >= 0.02) {
          scrolledAway = true;
        }
        reEnableReadyAt = 0;
        touchTapRef.current.pending = false;
        if (effectActive || litMapRef.current.size > 0 || lastTrailThrottled) {
          effectActive = false;
          lastTrailThrottled = false;
          clearAllLit();
        }
        return;
      }

      // Re-enable with ~100ms debounce and fresh letter box measurement after returning to top
      if (!effectActive) {
        if (scrolledAway) {
          if (reEnableReadyAt === 0) {
            reEnableReadyAt = ctx.now + 100;
            return;
          }
          if (ctx.now < reEnableReadyAt) {
            return;
          }
          reEnableReadyAt = 0;
          scrolledAway = false;
          measureLetterBoxes();
        } else if (letterBoxesRef.current.length === 0) {
          measureLetterBoxes();
        }
        if (letterBoxesRef.current.length === 0) return;
        effectActive = true;
      }

      const boxes = letterBoxesRef.current;
      const origin = wrapperOriginRef.current;
      const wrapTopViewport = origin.topAtScroll0 - ctx.scrollY;
      const litMap = litMapRef.current;

      // Handle touch tap (500ms light duration)
      if (touchTapRef.current.pending) {
        touchTapRef.current.pending = false;
        const tapLocalX = touchTapRef.current.x - origin.left;
        const tapLocalY = touchTapRef.current.y - wrapTopViewport;
        const hitTap = hitTestLetterBoxes(boxes, tapLocalX, tapLocalY);
        if (hitTap >= 0) {
          const tapResult = triggerTouchLitLetter(
            litMap,
            hitTap,
            ctx.now,
            HERO_ASCII
          );
          for (const removedIdx of tapResult.removedLetters) {
            hideLetterSlots(removedIdx);
          }
          for (const rerolledIdx of tapResult.rerolledLetters) {
            const st = litMap.get(rerolledIdx);
            if (st) paintLetterSlots(st);
          }
          if (tapResult.clipChanged) {
            syncWordClipPaths();
          }
        }
      }

      // Hit-test pointer against cached letter boxes (no layout reads)
      let hoveredIndex = -1;
      if (pointerRef.current.active) {
        const localX = pointerRef.current.x - origin.left;
        const localY = pointerRef.current.y - wrapTopViewport;
        hoveredIndex = hitTestLetterBoxes(boxes, localX, localY);
      }

      // Reduce global cursor-trail spawn rate to 40% while over any hero letter box
      const shouldThrottleTrail = hoveredIndex >= 0;
      if (shouldThrottleTrail !== lastTrailThrottled) {
        lastTrailThrottled = shouldThrottleTrail;
        frameEngine.setTrailSpawnFactor(
          shouldThrottleTrail ? HERO_ASCII.trailSpawnFactor : 1
        );
      }

      if (hoveredIndex === -1 && litMap.size === 0) {
        return;
      }

      const step = stepHeroAsciiState(litMap, hoveredIndex, ctx.now, HERO_ASCII);

      for (const removedIdx of step.removedLetters) {
        hideLetterSlots(removedIdx);
      }
      for (const rerolledIdx of step.rerolledLetters) {
        const st = litMap.get(rerolledIdx);
        if (st) paintLetterSlots(st);
      }
      if (step.clipChanged) {
        syncWordClipPaths();
      }
    });

    return () => {
      unsubscribe();
      clearAllLit();
    };
  }, [
    reducedMotion,
    rawProgress,
    smoothProgress,
    clearAllLit,
    hideLetterSlots,
    measureLetterBoxes,
    paintLetterSlots,
    syncWordClipPaths,
  ]);

  const progressSource = reducedMotion ? rawProgress : smoothProgress;

  // Headline transforms: pure GPU translate3d + scale from stacked flush-left -> full-width header
  const wordScale = useTransform(
    progressSource,
    [0, 0.54],
    reducedMotion ? [metrics.settledScale, metrics.settledScale] : [1, metrics.settledScale],
    { ease: easeOutCubic }
  );

  const graphicY = useTransform(
    progressSource,
    [0, 0.54],
    reducedMotion ? [0, 0] : [metrics.heroStartY, 0],
    { ease: easeOutCubic }
  );

  const designerX = useTransform(
    progressSource,
    [0, 0.54],
    reducedMotion
      ? [metrics.designerSettledX, metrics.designerSettledX]
      : [0, metrics.designerSettledX],
    { ease: easeOutCubic }
  );

  const designerY = useTransform(
    progressSource,
    [0, 0.54],
    reducedMotion
      ? [metrics.designerSettledY, metrics.designerSettledY]
      : [metrics.heroStartY + metrics.designerHeroY, metrics.designerSettledY],
    { ease: easeOutCubic }
  );

  // Thin rule, subhead, balanced intro paragraph, and lower-right expertise reveal smoothly
  const headerRuleScaleX = useTransform(
    progressSource,
    [0.36, 0.58],
    reducedMotion ? [1, 1] : [0, 1],
    { ease: easeOutCubic }
  );
  const subheadOpacity = useTransform(
    progressSource,
    [0.38, 0.62],
    reducedMotion ? [1, 1] : [0, 1],
    { ease: easeOutCubic }
  );
  const subheadY = useTransform(
    progressSource,
    [0.38, 0.62],
    reducedMotion ? [0, 0] : [16, 0],
    { ease: easeOutCubic }
  );
  const paragraphOpacity = useTransform(
    progressSource,
    [0.42, 0.68],
    reducedMotion ? [1, 1] : [0, 1],
    { ease: easeOutCubic }
  );
  const paragraphY = useTransform(
    progressSource,
    [0.42, 0.68],
    reducedMotion ? [0, 0] : [28, 0],
    { ease: easeOutCubic }
  );
  const expertiseOpacity = useTransform(
    progressSource,
    [0.5, 0.76],
    reducedMotion ? [1, 1] : [0, 1],
    { ease: easeOutCubic }
  );
  const expertiseY = useTransform(
    progressSource,
    [0.5, 0.76],
    reducedMotion ? [0, 0] : [24, 0],
    { ease: easeOutCubic }
  );

  const expertisePairs: [string, string][] = [];
  for (let i = 0; i < config.expertise.length; i += 2) {
    expertisePairs.push([config.expertise[i] ?? '', config.expertise[i + 1] ?? '']);
  }

  const fontStyle: React.CSSProperties = {
    fontSize: metrics.measured
      ? `${metrics.heroFontSize}px`
      : 'clamp(44px, 18.5vw, 290px)',
    lineHeight: 0.8,
  };

  return (
    <section
      ref={sectionRef}
      id="profile"
      aria-label="Profile"
      style={{ touchAction: 'pan-y' }}
      className={`relative z-10 ${reducedMotion ? 'min-h-[100svh]' : 'min-h-[215vh]'}`}
    >
      {/* PART 2(a)&(c): No fixed height, no max-height, no overflow: hidden/clip; min-h-[100svh] with >=80px bottom padding */}
      <div
        data-testid="profile-sticky-stage"
        className={`${
          reducedMotion ? 'relative min-h-[100svh]' : 'sticky top-0 min-h-[100svh]'
        } flex flex-col justify-between pt-[76px] sm:pt-[90px] pb-[96px] sm:pb-[88px] lg:pb-[96px] px-5 sm:px-8 lg:px-12`}
      >
        <div
          ref={stageContainerRef}
          className="relative mx-auto flex flex-1 w-full max-w-[1680px] flex-col justify-between"
        >
          {/* Offscreen measurement spans in Areal 700, -0.03em tracking at exact 100px reference size */}
          <div
            aria-hidden="true"
            className="pointer-events-none invisible fixed -top-[9999px] left-0 whitespace-nowrap font-areal font-bold uppercase tracking-[-0.03em] leading-[0.8]"
            style={{ fontSize: `${REF_FONT_PX}px` }}
          >
            <span ref={graphicMeasureRef} className="inline-block">
              GRAPHIC
            </span>
            <span ref={designerMeasureRef} className="inline-block">
              DESIGNER
            </span>
          </div>

          {/* TOP STAGE: Giant flush-left GRAPHIC / DESIGNER -> settles into full-width GRAPHIC DESIGNER (Areal 700) */}
          <div ref={headlineWrapRef} className="relative w-full shrink-0">
            <h1
              aria-label="GRAPHIC DESIGNER"
              data-testid="hero-headline"
              data-font-measured={metrics.measured ? 'true' : 'false'}
              style={{ height: `${metrics.settledHeaderHeight}px` }}
              className={`relative w-full font-areal font-bold uppercase text-[var(--text-primary)] select-none theme-surface transition-opacity duration-200 ${
                metrics.measured ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <motion.span
                ref={graphicWordRef}
                data-testid="hero-word-graphic"
                style={{
                  ...fontStyle,
                  y: graphicY,
                  scale: wordScale,
                  transformOrigin: 'left top',
                }}
                className="absolute top-0 left-0 inline-block whitespace-nowrap tracking-[-0.03em]"
              >
                GRAPHIC
              </motion.span>
              <motion.span
                ref={designerWordRef}
                data-testid="hero-word-designer"
                style={{
                  ...fontStyle,
                  x: designerX,
                  y: designerY,
                  scale: wordScale,
                  transformOrigin: 'left top',
                }}
                className="absolute top-0 left-0 inline-block whitespace-nowrap tracking-[-0.03em]"
              >
                DESIGNER
              </motion.span>
            </h1>

            {/* Pooled interactive ASCII letter overlay (above headline, below fixed z-40 nav, aria-hidden) */}
            {!reducedMotion && (
              <div
                ref={overlayRef}
                aria-hidden="true"
                data-testid="hero-ascii-overlay"
                data-lit-count="0"
                className="pointer-events-none absolute top-0 left-0 z-10 select-none"
              >
                {OVERLAY_SLOT_INDICES.map((slotIdx) => (
                  <span
                    key={slotIdx}
                    ref={(node) => {
                      slotRefs.current[slotIdx] = node;
                    }}
                    style={{
                      opacity: 0,
                      color: HERO_ASCII.color,
                      willChange: 'transform, opacity',
                    }}
                    className="font-mono-ui absolute top-0 left-0 flex items-center justify-center font-bold leading-none"
                  />
                ))}
              </div>
            )}

            {/* Thin horizontal rule directly below settled header */}
            <motion.div
              style={{ scaleX: headerRuleScaleX, transformOrigin: 'left center' }}
              className="mt-3 sm:mt-4 h-px w-full bg-[var(--border-hairline)]"
            />

            {/* Right-aligned subhead flush with the right edge of the 12-column grid (monospace kept unchanged) */}
            <motion.div
              style={{ opacity: subheadOpacity, y: subheadY }}
              className="mt-3 sm:mt-4 flex justify-end"
            >
              <p
                data-testid="intro-subline"
                className="font-mono-ui text-right text-[10px] sm:text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]"
              >
                {config.introSubline}
              </p>
            </motion.div>
          </div>

          {/* PART 2 — STRICT 12-COLUMN INTRO GRID: Paragraph cols 2..9 (shifted left 1 col), Expertise cols 9..12 */}
          <div className="mt-auto grid grid-cols-1 lg:grid-cols-12 gap-x-6 lg:gap-x-8 gap-y-10 lg:gap-y-0 items-end pt-10 sm:pt-12">
            {/* Editorial balanced two-tone paragraph in Areal (400 muted / 700 primary, -0.02em, line-height 1.1) */}
            <div className="lg:col-start-2 lg:col-end-9">
              {/* Glyph-safe reveal wrapper: +0.06em top / +0.18em bottom compensated by equal negative margins */}
              <div className="overflow-hidden pt-[0.06em] pb-[0.18em] -mt-[0.06em] -mb-[0.18em]">
                <motion.p
                  style={{ opacity: paragraphOpacity, y: paragraphY }}
                  data-testid="intro-bio"
                  className="font-areal text-[clamp(28px,3.4vw,52px)] font-normal leading-[1.1] tracking-[-0.02em] text-[var(--text-soft)] text-editorial-balance theme-surface"
                >
                  <span className="font-bold text-[var(--text-primary)]">
                    Fadil Maulana Putra
                  </span>{' '}
                  is an{' '}
                  <span className="font-bold text-[var(--text-primary)]">
                    Indonesian graphic and motion designer
                  </span>{' '}
                  with a{' '}
                  <span className="font-bold text-[var(--text-primary)]">
                    Visual Communication Design
                  </span>{' '}
                  degree. Over{' '}
                  <span className="font-bold text-[var(--text-primary)]">
                    two years
                  </span>{' '}
                  of internship and freelance work for{' '}
                  <span className="font-bold text-[var(--text-primary)]">
                    corporate and startup brands
                  </span>
                  ,{' '}
                  <span className="font-bold text-[var(--text-primary)]">
                    B2B and B2C
                  </span>
                  .
                </motion.p>
              </div>
            </div>

            {/* Lower-right EXPERTISE block: columns 9..12, bottom edge aligned to paragraph's last baseline */}
            <motion.div
              style={{ opacity: expertiseOpacity, y: expertiseY }}
              data-testid="intro-expertise"
              className="lg:col-start-9 lg:col-end-13 lg:pt-28 lg:pb-[0.14em] w-full self-end"
            >
              <div className="border-t border-[var(--border-hairline)] pt-3 sm:pt-4">
                <h2 className="font-mono-ui mb-3 sm:mb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  EXPERTISE
                </h2>

                <div className="border-t border-[var(--border-hairline)]">
                  {expertisePairs.map(([left, right], rowIdx) => (
                    <div
                      key={rowIdx}
                      className="grid grid-cols-2 border-b border-[var(--border-hairline)]"
                    >
                      <div className="border-r border-[var(--border-hairline)] py-2.5 sm:py-3 pr-3 font-mono-ui text-[11px] sm:text-xs uppercase tracking-[0.1em] text-[var(--text-primary)]">
                        {left}
                      </div>
                      <div className="py-2.5 sm:py-3 pl-3 sm:pl-4 font-mono-ui text-[11px] sm:text-xs uppercase tracking-[0.1em] text-[var(--text-primary)]">
                        {right}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
