import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import type { ProjectItem } from '../config/portfolio';
import {
  distributeProjectsIntoColumns,
  getAspectClass,
  type IndexedProject,
  type QualityTier,
} from '../utils/portfolioLogic';
import { frameEngine } from '../utils/frameEngine';
import { StaggeredTitle } from './StaggeredTitle';

interface WorkGalleryProps {
  projects: readonly ProjectItem[];
  reducedMotion: boolean;
  skewY: MotionValue<number>;
  isDetailOpen: boolean;
  onSelectProject: (index: number) => void;
}

function useColumnCount(): 1 | 2 | 3 {
  const getCols = (): 1 | 2 | 3 => {
    if (typeof window === 'undefined') return 3;
    if (window.innerWidth < 640) return 1;
    if (window.innerWidth <= 1024) return 2;
    return 3;
  };

  const [cols, setCols] = useState<1 | 2 | 3>(getCols);

  useEffect(() => {
    const onResize = () => setCols(getCols());
    onResize();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return cols;
}

interface ProjectSlotCardProps {
  entry: IndexedProject;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
}

function ProjectSlotCard({
  entry,
  reducedMotion,
  onSelect,
}: ProjectSlotCardProps) {
  const { project, index } = entry;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleMouseEnter = () => {
    if (project.videoUrl && videoRef.current) {
      videoRef.current.play().catch(() => {
        // Ignore browser autoplay restrictions
      });
    }
  };

  const handleMouseLeave = () => {
    if (project.videoUrl && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const aspectClass = getAspectClass(project.aspectRatio);
  const hasImage = Boolean(project.imageUrl) && !imgFailed;
  const hasVideo = Boolean(project.videoUrl);

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="group flex flex-col gap-2.5"
      data-testid={`project-slot-${project.id}`}
    >
      {/* Top unboxed monospace metadata row: 01 ... [CATEGORY] */}
      <div className="flex items-center justify-between font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200">
          {project.id}
        </span>
        <span className="group-hover:text-[var(--accent)] transition-colors duration-200">
          [{project.category}]
        </span>
      </div>

      {/* Interactive Artwork Frame (opens via full-screen pixel canvas transition) */}
      <button
        type="button"
        onClick={() => onSelect(index)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-label={`Open project ${project.id}: ${project.title}, ${project.category}, ${project.year}`}
        className={`relative block w-full overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-left transition-colors duration-200 hover:border-[var(--accent)] focus-visible:border-[var(--accent)] cursor-pointer theme-surface ${aspectClass}`}
      >
        <div className="relative h-full w-full overflow-hidden">
          {hasImage ? (
            <img
              src={project.imageUrl}
              alt={project.alt}
              width={project.width}
              height={project.height}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center bg-[var(--bg-surface)] transition-colors duration-200 group-hover:bg-[var(--bg-surface-hover)] theme-surface">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-crosshair)]"
              />
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-crosshair)]"
              />
              <span className="relative z-10 bg-[var(--bg-surface)] group-hover:bg-[var(--bg-surface-hover)] transition-colors duration-200 px-3 py-1.5 font-mono-ui text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)] group-hover:text-[var(--accent)] theme-surface">
                DROP IMAGE HERE
              </span>
            </div>
          )}

          {/* Animated ASCII corner markers on hover */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-2.5 z-20 font-mono-ui text-xs leading-none text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-all duration-200 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5"
          >
            ┌
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 right-2.5 z-20 font-mono-ui text-xs leading-none text-[var(--accent)] opacity-0 -translate-y-1 translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0"
          >
            ┐
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 left-2.5 z-20 font-mono-ui text-xs leading-none text-[var(--accent)] opacity-0 translate-y-1 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0"
          >
            └
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2.5 z-20 font-mono-ui text-xs leading-none text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
          >
            ┘
          </span>

          {/* Compositor mask wipe reveal on scroll into view */}
          {!reducedMotion && (
            <motion.div
              aria-hidden="true"
              initial={{ y: '0%' }}
              whileInView={{ y: '-102%' }}
              viewport={{ once: true, amount: 0.14 }}
              transition={{ duration: 0.58, ease: [0.76, 0, 0.24, 1] }}
              className="pointer-events-none absolute inset-0 z-30 bg-[var(--bg-canvas)]"
            />
          )}

          {hasVideo && (
            <video
              ref={videoRef}
              src={project.videoUrl}
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none"
            />
          )}
        </div>
      </button>

      {/* Hover (desktop) / visible (mobile) project title + year caption */}
      <div className="flex items-baseline justify-between gap-4 min-h-[20px] font-mono-ui text-[11px] uppercase tracking-[0.14em] transition-opacity duration-200 opacity-90 sm:opacity-70 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <span className="truncate font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200">
          {project.title}
        </span>
        <span className="shrink-0 text-[var(--text-muted)]">{project.year}</span>
      </div>
    </motion.article>
  );
}

interface ParallaxColumnProps {
  items: readonly IndexedProject[];
  columnIndex: number;
  columnCount: 1 | 2 | 3;
  scrollProgress: MotionValue<number>;
  skewY: MotionValue<number>;
  reducedMotion: boolean;
  parallaxDisabled: boolean;
  onSelectProject: (index: number) => void;
}

function ParallaxColumn({
  items,
  columnIndex,
  columnCount,
  scrollProgress,
  skewY,
  reducedMotion,
  parallaxDisabled,
  onSelectProject,
}: ParallaxColumnProps) {
  // Subtle parallax capped strictly <= 40px per Part H.8
  const travelRange: [number, number] = useMemo(() => {
    if (reducedMotion || parallaxDisabled) return [0, 0];
    if (columnCount === 1) return [16, -16];
    if (columnCount === 2) {
      return columnIndex === 0 ? [28, -28] : [-36, 36];
    }
    if (columnIndex === 0) return [32, -32];
    if (columnIndex === 1) return [-40, 40];
    return [22, -22];
  }, [columnIndex, columnCount, reducedMotion, parallaxDisabled]);

  const y = useTransform(scrollProgress, [0, 1], travelRange);

  const staggerOffsetClass =
    columnCount === 1
      ? ''
      : columnCount === 2
      ? columnIndex === 1
        ? 'mt-16'
        : ''
      : columnIndex === 1
      ? 'mt-24'
      : columnIndex === 2
      ? 'mt-12'
      : '';

  return (
    <motion.div
      style={reducedMotion ? undefined : { y, skewY }}
      className={`flex flex-col gap-12 sm:gap-16 lg:gap-20 ${staggerOffsetClass}`}
    >
      {items.map((entry) => (
        <ProjectSlotCard
          key={entry.project.id}
          entry={entry}
          reducedMotion={reducedMotion}
          onSelect={onSelectProject}
        />
      ))}
    </motion.div>
  );
}

/**
 * Section 2 — SELECTED WORK (Staggered multi-column parallax gallery).
 * Optimized for Part H: offscreen `content-visibility: auto`, cached ResizeObserver
 * bounds, IntersectionObserver viewport gating, single shared frameEngine clock,
 * capped <=40px parallax & <=1.5deg skew, and silent adaptive quality step-down.
 */
export function WorkGallery({
  projects,
  reducedMotion,
  skewY,
  isDetailOpen,
  onSelectProject,
}: WorkGalleryProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const columnCount = useColumnCount();
  const columns = useMemo(
    () => distributeProjectsIntoColumns(projects, columnCount),
    [projects, columnCount]
  );

  const [qualityTier, setQualityTier] = useState<QualityTier>(() =>
    frameEngine.getQualityTier()
  );
  const nearViewportRef = useRef(true);
  const boundsRef = useRef({ top: 1400, height: 2400, viewportHeight: 900 });

  const rawProgress = useMotionValue(0.5);
  const smoothProgress = useSpring(rawProgress, {
    stiffness: 120,
    damping: 28,
    mass: 0.4,
  });

  useEffect(() => {
    return frameEngine.subscribeQuality(setQualityTier);
  }, []);

  // Cache layout geometry once on mount/resize (zero getBoundingClientRect on scroll)
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      boundsRef.current = {
        top: rect.top + window.scrollY,
        height: el.offsetHeight,
        viewportHeight: window.innerHeight,
      };
    };

    measure();
    const resizeObs = new ResizeObserver(measure);
    resizeObs.observe(el);

    const io = new IntersectionObserver(
      (entries) => {
        nearViewportRef.current = entries[0]?.isIntersecting ?? false;
      },
      { rootMargin: '320px 0px' }
    );
    io.observe(el);

    window.addEventListener('resize', measure, { passive: true });
    return () => {
      resizeObs.disconnect();
      io.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [columnCount]);

  // Update gallery parallax progress from shared frameEngine clock only when near viewport
  useEffect(() => {
    if (reducedMotion || qualityTier >= 3) {
      rawProgress.set(0.5);
      return;
    }

    let lastProgress = -1;
    const unsubscribe = frameEngine.subscribe((ctx) => {
      if (!nearViewportRef.current) return;
      const { top, height, viewportHeight } = boundsRef.current;
      const span = Math.max(1, height + viewportHeight);
      const next = Math.max(0, Math.min(1, (ctx.scrollY + viewportHeight - top) / span));
      if (Math.abs(next - lastProgress) > 0.0008) {
        lastProgress = next;
        rawProgress.set(next);
      }
    });

    return unsubscribe;
  }, [reducedMotion, qualityTier, rawProgress]);

  const gridClass =
    columnCount === 1
      ? 'grid-cols-1'
      : columnCount === 2
      ? 'grid-cols-2'
      : 'grid-cols-3';

  return (
    <section
      ref={sectionRef}
      id="work"
      aria-labelledby="work-heading"
      className={`cv-auto-work relative z-10 py-16 sm:py-24 lg:py-32 px-5 sm:px-8 lg:px-12 transition-opacity duration-200 ${
        isDetailOpen ? 'opacity-10' : 'opacity-100'
      }`}
    >
      <div className="mx-auto w-full max-w-[1680px]">
        <div className="mb-12 sm:mb-16 flex items-baseline justify-between border-b border-[var(--border-hairline)] pb-4">
          <StaggeredTitle
            id="work-heading"
            text="SELECTED WORK"
            reducedMotion={reducedMotion}
            className="font-mono-ui text-xs font-medium uppercase tracking-[0.22em] text-[var(--text-primary)]"
          />
          <span className="font-mono-ui text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
            01—{String(projects.length).padStart(2, '0')}
          </span>
        </div>

        <div
          data-testid="work-gallery-grid"
          data-columns={columnCount}
          className={`grid ${gridClass} gap-x-8 lg:gap-x-12 items-start pb-14 sm:pb-20`}
        >
          {columns.map((items, colIdx) => (
            <ParallaxColumn
              key={`col-${columnCount}-${colIdx}`}
              items={items}
              columnIndex={colIdx}
              columnCount={columnCount}
              scrollProgress={smoothProgress}
              skewY={skewY}
              reducedMotion={reducedMotion}
              parallaxDisabled={qualityTier >= 3}
              onSelectProject={onSelectProject}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
