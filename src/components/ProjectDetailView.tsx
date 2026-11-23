import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import type { ProjectDetailMedia, ProjectItem } from '../config/portfolio';
import {
  getAspectClass,
  groupDetailRows,
  type QualityTier,
} from '../utils/portfolioLogic';
import { frameEngine } from '../utils/frameEngine';

interface ProjectDetailViewProps {
  project: ProjectItem;
  nextProject: ProjectItem;
  totalProjects: number;
  isDark: boolean;
  reducedMotion: boolean;
  onBack: () => void;
  onSelectNext: (nextId: string) => void;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * PART E — Main detail artwork pixelation-to-sharp canvas resolver.
 * Resolves from heavily pixelated (48px block size) down to sharp (1px) over
 * ~700ms using the shared frameEngine, then removes itself so the crisp DOM
 * image or placeholder renders cleanly. Works for both real images and
 * placeholder plates. Skipped under prefers-reduced-motion.
 */
interface HeroPixelCanvasProps {
  project: ProjectItem;
  imageElement: HTMLImageElement | null;
  hasRealImage: boolean;
  isDark: boolean;
  reducedMotion: boolean;
}

function HeroPixelCanvas({
  project,
  imageElement,
  hasRealImage,
  isDark,
  reducedMotion,
}: HeroPixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [resolved, setResolved] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setResolved(true);
      return;
    }
    setResolved(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setResolved(true);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(120, Math.round(rect.width));
    const h = Math.max(90, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Prepare source buffer (real image or rendered placeholder plate)
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = w;
    sourceCanvas.height = h;
    const sctx = sourceCanvas.getContext('2d');
    if (!sctx) {
      setResolved(true);
      return;
    }

    const surfaceBg = isDark ? '#21211F' : '#DFDDD5';
    const crosshairColor = isDark ? 'rgba(237,236,230,0.26)' : 'rgba(22,22,22,0.26)';
    const textMuted = isDark ? '#9D9C94' : '#5C5B55';
    const accent = isDark ? '#FF550D' : '#D93B00';

    if (hasRealImage && imageElement && imageElement.complete && imageElement.naturalWidth > 0) {
      // Object-cover draw into sourceCanvas
      const imgRatio = imageElement.naturalWidth / imageElement.naturalHeight;
      const boxRatio = w / h;
      let sx = 0;
      let sy = 0;
      let sw = imageElement.naturalWidth;
      let sh = imageElement.naturalHeight;
      if (imgRatio > boxRatio) {
        sw = sh * boxRatio;
        sx = (imageElement.naturalWidth - sw) / 2;
      } else {
        sh = sw / boxRatio;
        sy = (imageElement.naturalHeight - sh) / 2;
      }
      sctx.drawImage(imageElement, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      // Synthesize a rich placeholder plate so pixel resolution is clearly visible
      sctx.fillStyle = surfaceBg;
      sctx.fillRect(0, 0, w, h);

      // Subtle architectural grid & crosshair
      sctx.strokeStyle = crosshairColor;
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(0, h / 2);
      sctx.lineTo(w, h / 2);
      sctx.moveTo(w / 2, 0);
      sctx.lineTo(w / 2, h);
      sctx.stroke();

      // Corner markers
      sctx.fillStyle = accent;
      sctx.fillRect(14, 14, 10, 2);
      sctx.fillRect(14, 14, 2, 10);
      sctx.fillRect(w - 24, h - 16, 10, 2);
      sctx.fillRect(w - 16, h - 24, 2, 10);

      // Center label block
      sctx.fillStyle = surfaceBg;
      sctx.fillRect(w / 2 - 110, h / 2 - 26, 220, 52);
      sctx.fillStyle = textMuted;
      sctx.font = '600 12px "JetBrains Mono", monospace';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText('DROP IMAGE HERE', w / 2, h / 2 - 7);
      sctx.font = '500 10px "JetBrains Mono", monospace';
      sctx.fillText(`${project.aspectRatio} · ${project.width}×${project.height}`, w / 2, h / 2 + 12);
    }

    const tinyCanvas = document.createElement('canvas');
    const tctx = tinyCanvas.getContext('2d');
    if (!tctx) {
      setResolved(true);
      return;
    }

    const DURATION_MS = 700;
    const startTime = performance.now();
    let done = false;

    const unsubscribe = frameEngine.subscribe((frame) => {
      if (done) return;
      const elapsed = Math.max(0, frame.now - startTime);
      const t = Math.min(1, elapsed / DURATION_MS);
      const eased = easeOutCubic(t);
      const blockSize = Math.max(1, Math.round(48 * (1 - eased) + 1));

      if (t >= 1 || blockSize <= 1) {
        done = true;
        setResolved(true);
        return;
      }

      const scaledW = Math.max(2, Math.ceil(w / blockSize));
      const scaledH = Math.max(2, Math.ceil(h / blockSize));
      if (tinyCanvas.width !== scaledW || tinyCanvas.height !== scaledH) {
        tinyCanvas.width = scaledW;
        tinyCanvas.height = scaledH;
      }

      tctx.imageSmoothingEnabled = true;
      tctx.clearRect(0, 0, scaledW, scaledH);
      tctx.drawImage(sourceCanvas, 0, 0, scaledW, scaledH);

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(tinyCanvas, 0, 0, scaledW, scaledH, 0, 0, w, h);
    });

    const safetyTimer = window.setTimeout(() => {
      done = true;
      setResolved(true);
    }, DURATION_MS + 140);

    return () => {
      unsubscribe();
      window.clearTimeout(safetyTimer);
    };
  }, [project.id, project.aspectRatio, project.width, project.height, hasRealImage, imageElement, isDark, reducedMotion]);

  if (resolved) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="hero-pixel-resolve-canvas"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    />
  );
}

interface DetailImageBlockProps {
  item: ProjectDetailMedia;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  parallaxDisabled: boolean;
  mobileSmallAlignRight: boolean;
  isInPairRow: boolean;
}

/**
 * PART F — Editorial detail media plate (A1..A10).
 * Supports `large` (~100%), `medium` (~58%), and `small` (~33%) desktop widths
 * with left/center/right alignment, mobile 1-column with 70% alternating `small`
 * items, gentle parallax (<=40px large, <=90px small) driven by frameEngine from
 * cached offsets, and neutral crosshair placeholders.
 */
function DetailImageBlock({
  item,
  scrollContainerRef,
  reducedMotion,
  parallaxDisabled,
  mobileSmallAlignRight,
  isInPairRow,
}: DetailImageBlockProps) {
  const frameRef = useRef<HTMLElement | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const boundsRef = useRef({ top: 0, height: 400, containerH: 900 });
  const nearViewportRef = useRef(false);

  const rawProgress = useMotionValue(0.5);
  const smoothProgress = useSpring(rawProgress, {
    stiffness: 120,
    damping: 28,
    mass: 0.4,
  });

  // Parallax amplitude strictly bounded per Part F & H.8 (<=40px large, <=90px small)
  const travel = useMemo<[number, number]>(() => {
    if (reducedMotion || parallaxDisabled) return [0, 0];
    if (item.size === 'large') return [18, -18]; // 36px total (<=40px)
    if (item.size === 'medium') return [28, -28]; // 56px total
    return [42, -42]; // 84px total (<=90px)
  }, [item.size, reducedMotion, parallaxDisabled]);

  const y = useTransform(smoothProgress, [0, 1], travel);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const el = frameRef.current;
    if (!container || !el) return;

    const measure = () => {
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      boundsRef.current = {
        top: eRect.top - cRect.top + container.scrollTop,
        height: el.offsetHeight,
        containerH: container.clientHeight,
      };
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(container);

    const io = new IntersectionObserver(
      (entries) => {
        nearViewportRef.current = entries[0]?.isIntersecting ?? false;
      },
      { root: container, rootMargin: '220px 0px' }
    );
    io.observe(el);

    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    if (reducedMotion || parallaxDisabled) {
      rawProgress.set(0.5);
      return;
    }

    let last = -1;
    const unsubscribe = frameEngine.subscribe(() => {
      if (!nearViewportRef.current) return;
      const container = scrollContainerRef.current;
      if (!container) return;
      const { top, height, containerH } = boundsRef.current;
      const span = Math.max(1, height + containerH);
      const next = Math.max(0, Math.min(1, (container.scrollTop + containerH - top) / span));
      if (Math.abs(next - last) > 0.001) {
        last = next;
        rawProgress.set(next);
      }
    });

    return unsubscribe;
  }, [reducedMotion, parallaxDisabled, rawProgress, scrollContainerRef]);

  const hasImage = Boolean(item.imageUrl) && !imgFailed;

  // Width & alignment classes (desktop editorial rhythm + mobile 70% alternating small)
  const mobileSmallPos = mobileSmallAlignRight ? 'ml-auto mr-0' : 'mr-auto ml-0';

  let layoutClass = 'w-full';
  if (isInPairRow) {
    if (item.size === 'medium') {
      layoutClass = 'w-full md:w-[58%]';
    } else {
      layoutClass = `w-[70%] ${mobileSmallPos} md:w-[33%] md:mx-0`;
    }
  } else if (item.size === 'large') {
    layoutClass = 'w-full';
  } else if (item.size === 'medium') {
    const desktopAlign =
      item.align === 'center'
        ? 'md:mx-auto'
        : item.align === 'right'
        ? 'md:ml-auto md:mr-0'
        : 'md:mr-auto md:ml-0';
    layoutClass = `w-full md:w-[58%] ${desktopAlign}`;
  } else {
    const desktopAlign =
      item.align === 'center'
        ? 'md:mx-auto'
        : item.align === 'right'
        ? 'md:ml-auto md:mr-0'
        : 'md:mr-auto md:ml-0';
    layoutClass = `w-[70%] ${mobileSmallPos} md:w-[33%] ${desktopAlign}`;
  }

  return (
    <motion.figure
      ref={frameRef}
      style={reducedMotion || parallaxDisabled ? undefined : { y }}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col gap-2.5 ${layoutClass}`}
      data-testid={`detail-media-${item.code}`}
      data-size={item.size}
    >
      <div className="flex items-center justify-between gap-2 font-mono-ui text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-primary)]">{item.code}</span>
        <span className="truncate">
          {item.aspectRatio} · {item.width}×{item.height}
        </span>
      </div>

      <div
        className={`relative w-full overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-surface)] theme-surface ${getAspectClass(
          item.aspectRatio
        )}`}
      >
        {item.videoUrl ? (
          <video
            src={item.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            controls
            className="h-full w-full object-cover"
          />
        ) : hasImage ? (
          <img
            src={item.imageUrl}
            alt={item.alt}
            width={item.width}
            height={item.height}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-[var(--bg-surface)] theme-surface">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-crosshair)]"
            />
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-crosshair)]"
            />
            <span
              aria-hidden="true"
              className="absolute top-2.5 left-3 font-mono-ui text-[10px] text-[var(--text-muted)]"
            >
              +
            </span>
            <span
              aria-hidden="true"
              className="absolute bottom-2.5 right-3 font-mono-ui text-[10px] text-[var(--text-muted)]"
            >
              +
            </span>
            <div className="relative z-10 bg-[var(--bg-surface)] px-3 py-1.5 text-center theme-surface">
              <span className="block font-mono-ui text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                DROP IMAGE HERE
              </span>
              <span className="mt-1 block font-mono-ui text-[9px] sm:text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {item.code} · {item.aspectRatio} · {item.width}×{item.height}
              </span>
            </div>
          </div>
        )}

        {/* Compositor mask wipe reveal */}
        {!reducedMotion && (
          <motion.div
            aria-hidden="true"
            initial={{ y: '0%' }}
            whileInView={{ y: '-102%' }}
            viewport={{ once: true, amount: 0.14 }}
            transition={{ duration: 0.58, ease: [0.76, 0, 0.24, 1] }}
            className="pointer-events-none absolute inset-0 z-20 bg-[var(--bg-canvas)]"
          />
        )}
      </div>

      {item.caption && (
        <figcaption className="font-mono-ui text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {item.caption}
        </figcaption>
      )}
    </motion.figure>
  );
}

/**
 * PARTS E, F, G & H — Full-page Project Detail View inside the SPA.
 * - Opens behind the pixelated canvas transition; main artwork resolves from
 *   48px pixel blocks down to sharp 1px over ~700ms.
 * - Renders 8–10 varied detail plates via `groupDetailRows` (`large` 100%,
 *   `medium` ~58%, `small` ~33%, side-by-side paired rows, irregular vertical
 *   spacing, mobile 70% alternating `small` items).
 * - Focuses the dialog container (`tabIndex={-1}`, `outline-none`) rather than
 *   the BACK button so mouse clicks NEVER show a focus box (Part G), while
 *   keyboard Tab / Escape work seamlessly.
 */
export function ProjectDetailView({
  project,
  nextProject,
  totalProjects,
  isDark,
  reducedMotion,
  onBack,
  onSelectNext,
}: ProjectDetailViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const heroImgRef = useRef<HTMLImageElement | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [heroImgLoaded, setHeroImgLoaded] = useState(false);
  const [qualityTier, setQualityTier] = useState<QualityTier>(() =>
    frameEngine.getQualityTier()
  );

  useEffect(() => {
    return frameEngine.subscribeQuality(setQualityTier);
  }, []);

  useEffect(() => {
    setHeroImgFailed(false);
    setHeroImgLoaded(false);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    // Focus dialog root (non-visible) instead of BACK button so no focus ring appears on mouse open
    scrollContainerRef.current?.focus({ preventScroll: true });
  }, [project.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onBack]);

  const hasHeroImage = Boolean(project.imageUrl) && !heroImgFailed;
  const details = project.details ?? [];
  const rows = useMemo(() => groupDetailRows(details), [details]);

  // Precompute alternating left/right flag for mobile `small` detail plates
  const smallAlternatingMap = useMemo(() => {
    const map = new Map<string, boolean>();
    let smallCounter = 0;
    for (const item of details) {
      if (item.size === 'small') {
        map.set(item.code, smallCounter % 2 === 1);
        smallCounter += 1;
      }
    }
    return map;
  }, [details]);

  return (
    <div
      ref={scrollContainerRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Project ${project.id}: ${project.title}`}
      data-testid="project-detail-view"
      data-lenis-prevent
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg-canvas)] text-[var(--text-primary)] theme-surface focus:outline-none focus-visible:outline-none"
    >
      {/* Subtle static dot grid inside detail page */}
      <div
        aria-hidden="true"
        className="dot-grid-base pointer-events-none fixed inset-0 z-0 opacity-85"
      />

      {/* Sticky borderless frosted top bar (blur capped at 12px) */}
      <div className="sticky top-0 z-30">
        <div
          aria-hidden="true"
          className="nav-glass-top pointer-events-none absolute inset-x-0 top-0 h-[84px]"
        />
        <div className="relative mx-auto flex max-w-[1680px] items-center justify-between px-5 py-4 sm:px-8 sm:py-5 lg:px-12">
          <button
            type="button"
            data-testid="detail-back-btn"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-2 font-mono-ui text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors duration-200 cursor-pointer whitespace-nowrap"
          >
            <span>[← BACK]</span>
          </button>

          <div className="flex items-center gap-4 font-mono-ui text-xs uppercase tracking-[0.18em]">
            <span className="font-medium text-[var(--text-primary)]">
              {project.id} / {String(totalProjects).padStart(2, '0')}
            </span>
            <span className="text-[var(--text-muted)]">[{project.category}]</span>
          </div>
        </div>
      </div>

      {/* Main detail content */}
      <div className="relative z-10 mx-auto w-full max-w-[1680px] px-5 pt-4 pb-20 sm:px-8 sm:pt-8 sm:pb-24 lg:px-12">
        {/* Top split: Desktop large main artwork LEFT, staggered description RIGHT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-7">
            <div
              className={`relative w-full overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-surface)] theme-surface ${getAspectClass(
                project.aspectRatio
              )}`}
            >
              {project.videoUrl ? (
                <video
                  src={project.videoUrl}
                  autoPlay
                  muted
                  loop
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : hasHeroImage ? (
                <img
                  ref={heroImgRef}
                  src={project.imageUrl}
                  alt={project.alt}
                  width={project.width}
                  height={project.height}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onLoad={() => setHeroImgLoaded(true)}
                  onError={() => setHeroImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="relative flex h-full w-full items-center justify-center bg-[var(--bg-surface)] p-6 theme-surface">
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-crosshair)]"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-1/2 w-px bg-[var(--border-crosshair)]"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-3 left-3 font-mono-ui text-[10px] text-[var(--text-muted)]"
                  >
                    ┌
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute bottom-3 right-3 font-mono-ui text-[10px] text-[var(--text-muted)]"
                  >
                    ┘
                  </span>
                  <div className="relative z-10 bg-[var(--bg-surface)] px-4 py-2 text-center theme-surface">
                    <span className="block font-mono-ui text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      DROP IMAGE HERE
                    </span>
                    <span className="mt-1 block font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      {project.aspectRatio} · {project.width}×{project.height}
                    </span>
                  </div>
                </div>
              )}

              {/* PART E: Pixelated-to-sharp 48px -> 1px canvas resolver (~700ms) */}
              {!project.videoUrl && (!hasHeroImage || heroImgLoaded) && (
                <HeroPixelCanvas
                  project={project}
                  imageElement={heroImgRef.current}
                  hasRealImage={hasHeroImage}
                  isDark={isDark}
                  reducedMotion={reducedMotion}
                />
              )}
            </div>
          </div>

          {/* Right: Project title, description & metadata */}
          <motion.aside
            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 lg:sticky lg:top-24 flex flex-col gap-6 sm:gap-8"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 font-mono-ui text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                <span className="font-medium text-[var(--accent)]">{project.id}</span>
                <span aria-hidden="true">/</span>
                <span>[{project.category}]</span>
                <span aria-hidden="true">/</span>
                <span>{project.year}</span>
              </div>

              <h1 className="font-display text-[clamp(2rem,4vw,3.5rem)] font-bold uppercase leading-[0.98] tracking-[-0.03em] text-[var(--text-primary)]">
                {project.title}
              </h1>
            </div>

            <p className="font-display text-base sm:text-lg leading-[1.55] text-[var(--text-muted)]">
              {project.description}
            </p>

            <dl className="border-t border-[var(--border-hairline)] font-mono-ui text-xs uppercase tracking-[0.14em]">
              <div className="grid grid-cols-12 gap-4 border-b border-[var(--border-hairline)] py-3.5">
                <dt className="col-span-4 text-[var(--text-muted)]">TOOLS</dt>
                <dd className="col-span-8 text-[var(--text-primary)]">
                  {project.tools.join(' · ')}
                </dd>
              </div>
              <div className="grid grid-cols-12 gap-4 border-b border-[var(--border-hairline)] py-3.5">
                <dt className="col-span-4 text-[var(--text-muted)]">ROLE</dt>
                <dd className="col-span-8 text-[var(--text-primary)]">{project.role}</dd>
              </div>
              <div className="grid grid-cols-12 gap-4 border-b border-[var(--border-hairline)] py-3.5">
                <dt className="col-span-4 text-[var(--text-muted)]">YEAR</dt>
                <dd className="col-span-8 text-[var(--text-primary)]">{project.year}</dd>
              </div>
            </dl>
          </motion.aside>
        </div>

        {/* PART F: 8–10 varied editorial detail plates (large 100%, medium ~58%, small ~33%, paired rows) */}
        {rows.length > 0 && (
          <div
            data-testid="detail-media-stream"
            className="mt-16 sm:mt-24 lg:mt-28 mx-auto w-full max-w-[1440px]"
          >
            {rows.map((row, rowIdx) => (
              <div
                key={`${project.id}-row-${rowIdx}`}
                data-row-kind={row.kind}
                className={`${row.topSpacingClass} ${
                  row.kind === 'pair'
                    ? 'flex flex-col md:flex-row md:items-end md:justify-between gap-10 md:gap-12'
                    : 'flex flex-col'
                }`}
              >
                {row.items.map((item) => (
                  <DetailImageBlock
                    key={`${project.id}-${item.code}`}
                    item={item}
                    scrollContainerRef={scrollContainerRef}
                    reducedMotion={reducedMotion}
                    parallaxDisabled={qualityTier >= 3}
                    mobileSmallAlignRight={smallAlternatingMap.get(item.code) ?? false}
                    isInPairRow={row.kind === 'pair'}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Bottom bar: BACK + NEXT PROJECT */}
        <div className="mt-20 sm:mt-28 border-t border-[var(--border-hairline)] pt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-2 font-mono-ui text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors duration-200 cursor-pointer"
          >
            <span>[← BACK TO WORK]</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectNext(nextProject.id)}
            className="group flex min-h-[44px] flex-col items-start sm:items-end gap-1 text-left sm:text-right cursor-pointer"
          >
            <span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors duration-200">
              NEXT PROJECT →
            </span>
            <span className="font-display text-lg sm:text-2xl font-bold uppercase tracking-[-0.02em] text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200">
              {nextProject.id} — {nextProject.title}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
