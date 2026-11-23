import { useEffect, useMemo, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { PROFILE_CONFIG, type ProfileStatement } from '../config/portfolio';
import { frameEngine } from '../utils/frameEngine';
import { tokenizeStatement } from '../utils/portfolioLogic';
import { ChromeLogoCanvas } from '../components/ChromeLogoCanvas';

interface ProfilePageProps {
  isDark: boolean;
  reducedMotion: boolean;
}

interface ParallaxStatementBlockProps {
  statement: ProfileStatement;
  reducedMotion: boolean;
  index: number;
}

/**
 * PART D2 — Editorial Statement Block set in Areal (400 / 700 bold phrases) with
 * scroll-linked progressive word reveal (muted -> full primary ink) and gentle
 * vertical parallax (max 40px), driven from cached ResizeObserver bounds inside
 * the shared frameEngine loop (zero per-frame React re-renders).
 */
function ParallaxStatementBlock({
  statement,
  reducedMotion,
  index,
}: ParallaxStatementBlockProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const boundsRef = useRef({ top: 0, height: 420, viewportH: 900 });

  const rawParallaxY = useMotionValue(0);
  const smoothParallaxY = useSpring(rawParallaxY, {
    stiffness: 120,
    damping: 28,
    mass: 0.4,
  });

  const tokens = useMemo(
    () => tokenizeStatement(statement.text, statement.boldPhrases),
    [statement.text, statement.boldPhrases]
  );

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    if (reducedMotion) {
      rawParallaxY.set(0);
      wordRefs.current.forEach((span) => {
        if (span) span.style.opacity = '1';
      });
      return;
    }

    const measure = () => {
      const rect = el.getBoundingClientRect();
      boundsRef.current = {
        top: rect.top + window.scrollY,
        height: Math.max(1, el.offsetHeight),
        viewportH: window.innerHeight,
      };
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure, { passive: true });

    let lastProgress = -1;
    let lastY = 999;

    const unsubscribe = frameEngine.subscribe((ctx) => {
      const { top, height, viewportH } = boundsRef.current;
      const startY = top - viewportH * 0.88;
      const endY = top + height * 0.25 - viewportH * 0.28;
      const spanDist = Math.max(1, endY - startY);
      const progress = Math.max(0, Math.min(1, (ctx.scrollY - startY) / spanDist));

      if (Math.abs(progress - lastProgress) > 0.002) {
        lastProgress = progress;
        const count = tokens.length;
        for (let i = 0; i < count; i++) {
          const span = wordRefs.current[i];
          if (!span) continue;
          const wordStart = (i / Math.max(1, count)) * 0.72;
          const wordEnd = wordStart + 0.28;
          const t = Math.max(0, Math.min(1, (progress - wordStart) / (wordEnd - wordStart)));
          const opacity = 0.24 + t * 0.76;
          span.style.opacity = opacity.toFixed(3);
        }
      }

      // Gentle vertical parallax capped strictly at +-20px (40px total range)
      const viewportCenter = ctx.scrollY + viewportH * 0.5;
      const elemCenter = top + height * 0.5;
      const norm = Math.max(-1, Math.min(1, (elemCenter - viewportCenter) / viewportH));
      const targetY = ctx.qualityTier >= 3 ? 0 : norm * (index % 2 === 0 ? 20 : -20);

      if (Math.abs(targetY - lastY) > 0.15) {
        lastY = targetY;
        rawParallaxY.set(targetY);
      }
    });

    return () => {
      unsubscribe();
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [reducedMotion, rawParallaxY, tokens.length, index]);

  const gridColumnClass =
    statement.align === 'left'
      ? 'lg:col-start-1 lg:col-end-10'
      : 'lg:col-start-4 lg:col-end-13';

  return (
    <div
      ref={wrapperRef}
      data-testid={`profile-statement-${index + 1}`}
      className="mx-auto grid w-full max-w-[1680px] grid-cols-1 lg:grid-cols-12"
    >
      <motion.div
        style={reducedMotion ? undefined : { y: smoothParallaxY }}
        className={`${gridColumnClass} flex flex-col gap-5 sm:gap-6`}
      >
        <p className="font-mono-ui text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {statement.code}
        </p>

        {/* Glyph-safe padding so descenders (g, p, y, commas) never clip */}
        <p
          style={{
            fontSize: 'clamp(32px, 4.8vw, 80px)',
            lineHeight: 1.05,
          }}
          className="font-areal font-normal tracking-[-0.025em] text-[var(--text-primary)] text-editorial-balance pt-[0.06em] pb-[0.18em] -mt-[0.06em] -mb-[0.18em]"
        >
          {tokens.map((token, tokenIdx) => (
            <span
              key={tokenIdx}
              ref={(node) => {
                wordRefs.current[tokenIdx] = node;
              }}
              style={{ opacity: reducedMotion ? 1 : 0.24 }}
              className={token.bold ? 'font-bold text-[var(--text-primary)]' : 'font-normal'}
            >
              {token.word}
              {tokenIdx < tokens.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </motion.div>
    </div>
  );
}

/**
 * PART D — Profile Page (`#/profile`).
 * Lazy-loaded via React.lazy. Contains:
 *   D1. Full-screen 3D Chrome "F" Logo Mark (transparent WebGL canvas)
 *   D2. Two large parallax editorial statements ([01] WHO, [02] WHY) in Areal
 *   D3. 12-col split: 4:5 portrait photo left + two Areal Bold principles right
 *   D4. Monospace spec-sheet info table (EXPERIENCE, EDUCATION, CERTIFICATION,
 *       3-column DESIGN SKILLS | TOOLS | AI TOOLS)
 * Ends cleanly with bottom clearance above the fixed bottom bar — NO footer content.
 */
export default function ProfilePage({ isDark, reducedMotion }: ProfilePageProps) {
  const splitSectionRef = useRef<HTMLElement | null>(null);
  const splitBoundsRef = useRef({ top: 0, height: 600, viewportH: 900 });
  const rawPhotoY = useMotionValue(0);
  const smoothPhotoY = useSpring(rawPhotoY, { stiffness: 120, damping: 28, mass: 0.4 });
  const rawPrinciplesY = useMotionValue(0);
  const smoothPrinciplesY = useSpring(rawPrinciplesY, { stiffness: 120, damping: 28, mass: 0.4 });

  // Gentle counter-parallax between photo and principles (<= 60px total relative drift)
  useEffect(() => {
    const section = splitSectionRef.current;
    if (!section || reducedMotion) {
      rawPhotoY.set(0);
      rawPrinciplesY.set(0);
      return;
    }

    const measure = () => {
      const rect = section.getBoundingClientRect();
      splitBoundsRef.current = {
        top: rect.top + window.scrollY,
        height: Math.max(1, section.offsetHeight),
        viewportH: window.innerHeight,
      };
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(section);
    window.addEventListener('resize', measure, { passive: true });

    let lastPhoto = 999;
    const unsubscribe = frameEngine.subscribe((ctx) => {
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop || ctx.qualityTier >= 3) {
        if (lastPhoto !== 0) {
          lastPhoto = 0;
          rawPhotoY.set(0);
          rawPrinciplesY.set(0);
        }
        return;
      }

      const { top, height, viewportH } = splitBoundsRef.current;
      const viewportCenter = ctx.scrollY + viewportH * 0.5;
      const sectionCenter = top + height * 0.5;
      const norm = Math.max(-1, Math.min(1, (sectionCenter - viewportCenter) / viewportH));

      // Photo moves +-26px, principles +-14px opposite -> max 40..52px relative (< 60px cap)
      const targetPhoto = norm * -26;
      const targetPrinciples = norm * 14;
      if (Math.abs(targetPhoto - lastPhoto) > 0.15) {
        lastPhoto = targetPhoto;
        rawPhotoY.set(targetPhoto);
        rawPrinciplesY.set(targetPrinciples);
      }
    });

    return () => {
      unsubscribe();
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [reducedMotion, rawPhotoY, rawPrinciplesY]);

  const revealEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

  return (
    <main data-testid="profile-page" className="relative z-10">
      {/* D1: Full-screen interactive 3D chrome F logo */}
      <ChromeLogoCanvas isDark={isDark} reducedMotion={reducedMotion} />

      {/* D2: Two large scroll-linked parallax statements ([01] WHO & [02] WHY) */}
      <section
        aria-label="Profile Statements"
        className="flex flex-col gap-28 sm:gap-36 lg:gap-44 py-20 sm:py-28 lg:py-36 px-5 sm:px-8 lg:px-12"
      >
        {PROFILE_CONFIG.statements.map((statement, idx) => (
          <ParallaxStatementBlock
            key={statement.code}
            statement={statement}
            reducedMotion={reducedMotion}
            index={idx}
          />
        ))}
      </section>

      {/* D3: Photo left (cols 1..5), Principles right (cols 7..12) */}
      <section
        ref={splitSectionRef}
        data-testid="profile-photo-principles"
        aria-label="Portrait and Design Principles"
        className="py-20 sm:py-28 lg:py-36 px-5 sm:px-8 lg:px-12"
      >
        <div className="mx-auto grid w-full max-w-[1680px] grid-cols-1 lg:grid-cols-12 lg:items-center gap-10 sm:gap-12 lg:gap-10">
          {/* Portrait container: 4:5 aspect ratio */}
          <motion.div
            style={reducedMotion ? undefined : { y: smoothPhotoY }}
            className="lg:col-start-1 lg:col-end-6"
          >
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, clipPath: 'inset(12% 0% 0% 0%)' }}
              whileInView={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.7, ease: revealEase }}
              className="relative aspect-[4/5] w-full overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-surface)] theme-surface"
            >
              {PROFILE_CONFIG.photo.url.trim().length > 0 ? (
                <img
                  src={PROFILE_CONFIG.photo.url}
                  alt={PROFILE_CONFIG.photo.alt}
                  width={1200}
                  height={1500}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  data-testid="profile-photo-placeholder"
                  className="relative flex h-full w-full flex-col items-center justify-center p-6"
                >
                  {/* Subtle centered crosshair */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[var(--border-crosshair)] opacity-55"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[var(--border-crosshair)] opacity-55"
                  />
                  {/* Corner registration ticks */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-3 left-3 h-3 w-3 border-t border-l border-[var(--border-crosshair)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-3 right-3 h-3 w-3 border-t border-r border-[var(--border-crosshair)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l border-[var(--border-crosshair)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-b border-r border-[var(--border-crosshair)]"
                  />

                  <div className="relative z-10 flex flex-col items-center gap-2 bg-[var(--bg-surface)] px-3 py-2 text-center font-mono-ui uppercase theme-surface">
                    <span className="text-[11px] font-medium tracking-[0.18em] text-[var(--text-primary)]">
                      DROP IMAGE HERE
                    </span>
                    <span className="text-[10px] tracking-[0.16em] text-[var(--text-muted)]">
                      {PROFILE_CONFIG.photo.dimensionsLabel}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>

          {/* Principles right: vertically centered to photo */}
          <motion.div
            style={reducedMotion ? undefined : { y: smoothPrinciplesY }}
            className="lg:col-start-7 lg:col-end-13 flex flex-col justify-center gap-8 sm:gap-10"
          >
            <div className="flex flex-col gap-6 sm:gap-8">
              {PROFILE_CONFIG.principles.map((principle, idx) => (
                <motion.h2
                  key={principle}
                  initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{
                    duration: reducedMotion ? 0.01 : 0.55,
                    delay: reducedMotion ? 0 : idx * 0.08,
                    ease: revealEase,
                  }}
                  style={{
                    fontSize: 'clamp(28px, 2.75vw, 40px)',
                    lineHeight: 1.08,
                  }}
                  className="font-areal font-bold uppercase tracking-[-0.02em] text-[var(--text-primary)]"
                >
                  {principle}
                </motion.h2>
              ))}
            </div>

            <motion.p
              initial={reducedMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{
                duration: reducedMotion ? 0.01 : 0.5,
                delay: reducedMotion ? 0 : 0.16,
                ease: revealEase,
              }}
              className="max-w-xl font-mono-ui text-xs uppercase leading-relaxed tracking-[0.16em] text-[var(--text-muted)]"
            >
              {PROFILE_CONFIG.principlesSubline}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* D4: Monospace spec-sheet Info Table — ends the Profile page (no footer content) */}
      <section
        data-testid="profile-info-table"
        aria-label="Experience, Education, Certification, and Skills"
        className="page-bottom-clearance pt-12 sm:pt-20 px-5 sm:px-8 lg:px-12"
      >
        <div className="mx-auto flex w-full max-w-[1680px] flex-col font-mono-ui uppercase">
          {/* EXPERIENCE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 border-t border-[var(--border-hairline)] py-10 sm:py-12">
            <h2 className="lg:col-span-3 text-[11px] font-medium tracking-[0.18em] text-[var(--text-muted)]">
              EXPERIENCE
            </h2>
            <div className="lg:col-span-9 flex flex-col divide-y divide-[var(--border-hairline)]">
              {PROFILE_CONFIG.experience.map((row, idx) => (
                <motion.div
                  key={`${row.period}-${row.company}`}
                  data-testid={`experience-row-${idx + 1}`}
                  initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: reducedMotion ? 0.01 : 0.45,
                    delay: reducedMotion ? 0 : idx * 0.05,
                    ease: revealEase,
                  }}
                  className="group py-4 first:pt-0 last:pb-0 transition-transform duration-200 ease-out hover:translate-x-1"
                >
                  {/* Desktop 4-col row */}
                  <div className="hidden sm:grid sm:grid-cols-[minmax(170px,1.1fr)_minmax(180px,1.25fr)_minmax(180px,1.35fr)_auto] items-baseline gap-4 text-xs tracking-[0.14em]">
                    <span className="text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors duration-200">
                      {row.period}
                    </span>
                    <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200">
                      {row.company}
                    </span>
                    <span className="text-[var(--text-primary)]">{row.role}</span>
                    <span className="text-right text-[11px] text-[var(--text-muted)]">
                      {row.type}
                    </span>
                  </div>

                  {/* Mobile 2-line collapsed row: Line 1 = period + type, Line 2 = company + role */}
                  <div className="flex flex-col gap-1.5 sm:hidden text-[11px] tracking-[0.12em]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[var(--text-muted)]">{row.period}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{row.type}</span>
                    </div>
                    <div className="text-[var(--text-primary)]">
                      <span className="font-medium">{row.company}</span>
                      <span className="text-[var(--text-muted)]"> / </span>
                      <span>{row.role}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* EDUCATION */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 border-t border-[var(--border-hairline)] py-10 sm:py-12">
            <h2 className="lg:col-span-3 text-[11px] font-medium tracking-[0.18em] text-[var(--text-muted)]">
              EDUCATION
            </h2>
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.45, ease: revealEase }}
              className="group lg:col-span-9 transition-transform duration-200 ease-out hover:translate-x-1"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(170px,1.1fr)_minmax(180px,1.25fr)_1fr] items-baseline gap-1.5 sm:gap-4 text-xs tracking-[0.14em]">
                <span className="text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors duration-200">
                  {PROFILE_CONFIG.education.period}
                </span>
                <span className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200">
                  {PROFILE_CONFIG.education.institution}
                </span>
                <span className="text-[var(--text-primary)]">
                  {PROFILE_CONFIG.education.degree}
                </span>
              </div>
            </motion.div>
          </div>

          {/* CERTIFICATION */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 border-t border-[var(--border-hairline)] py-10 sm:py-12">
            <h2 className="lg:col-span-3 text-[11px] font-medium tracking-[0.18em] text-[var(--text-muted)]">
              CERTIFICATION
            </h2>
            <div className="lg:col-span-9 flex flex-col divide-y divide-[var(--border-hairline)]">
              {PROFILE_CONFIG.certifications.map((cert, idx) => (
                <motion.div
                  key={cert}
                  initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: reducedMotion ? 0.01 : 0.45,
                    delay: reducedMotion ? 0 : idx * 0.05,
                    ease: revealEase,
                  }}
                  className="group py-3.5 first:pt-0 last:pb-0 text-xs tracking-[0.14em] text-[var(--text-primary)] transition-transform duration-200 ease-out hover:translate-x-1 hover:text-[var(--accent)]"
                >
                  {cert}
                </motion.div>
              ))}
            </div>
          </div>

          {/* DESIGN SKILLS | TOOLS | AI TOOLS — 3 side-by-side columns on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 border-t border-[var(--border-hairline)] pt-10 sm:pt-12 pb-6">
            {(
              [
                { title: 'DESIGN SKILLS', items: PROFILE_CONFIG.designSkills },
                { title: 'TOOLS', items: PROFILE_CONFIG.tools },
                { title: 'AI TOOLS', items: PROFILE_CONFIG.aiTools },
              ] as const
            ).map((col, colIdx) => (
              <motion.div
                key={col.title}
                initial={reducedMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{
                  duration: reducedMotion ? 0.01 : 0.45,
                  delay: reducedMotion ? 0 : colIdx * 0.06,
                  ease: revealEase,
                }}
                className="flex flex-col gap-4"
              >
                <h2 className="text-[11px] font-medium tracking-[0.18em] text-[var(--text-muted)]">
                  {col.title}
                </h2>
                <ul className="flex flex-col divide-y divide-[var(--border-hairline)] border-t border-[var(--border-hairline)]">
                  {col.items.map((item) => (
                    <li
                      key={item}
                      className="py-2.5 text-xs tracking-[0.14em] text-[var(--text-primary)] transition-all duration-200 ease-out hover:translate-x-1 hover:text-[var(--accent)]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
