import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { PortfolioConfig } from '../config/portfolio';
import { computeFitFontSize } from '../utils/portfolioLogic';
import { waitForArealFont } from '../utils/arealFontLoader';

interface ContactFooterProps {
  config: PortfolioConfig;
  reducedMotion: boolean;
}

const REF_FONT_PX = 100;

/**
 * WORK Page Footer:
 * 1. Thin top horizontal rule
 * 2. Single row of terminal-style links: LINKEDIN.COM/IN/FADILMAULANAPUTRA ↗ left,
 *    EMAIL, LET'S WORK TOGETHER + email link right
 * 3. Giant ResizeObserver-fitted name "FADIL MAULANA PUTRA" in Areal Bold (700),
 *    -0.03em tracking, line-height 0.80 — the very last element of the WORK page
 *    with clearance above the fixed bottom bar (zero trailing rule/links/copyright).
 */
export function ContactFooter({
  config,
  reducedMotion,
}: ContactFooterProps) {
  const { contact, name } = config;
  const fullNameUpper = name.toUpperCase();
  const mobileLines = fullNameUpper.split(' ');

  const nameContainerRef = useRef<HTMLDivElement | null>(null);
  const desktopMirrorRef = useRef<HTMLSpanElement | null>(null);
  const mobileMirrorRef = useRef<HTMLSpanElement | null>(null);

  const longestWord = mobileLines.reduce(
    (longest, word) => (word.length > longest.length ? word : longest),
    mobileLines[0] ?? fullNameUpper
  );

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [nameFontSize, setNameFontSize] = useState<number | null>(null);
  const [nameInView, setNameInView] = useState<boolean>(reducedMotion);

  // Wait for Areal (or 3s timeout) before first fit-to-width measurement,
  // then re-measure on every resize and whenever any font finishes loading.
  useLayoutEffect(() => {
    const container = nameContainerRef.current;
    if (!container) return;

    let cancelled = false;
    let fontGatePassed = false;

    const recompute = () => {
      if (cancelled || !fontGatePassed) return;

      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);

      const contentWidth = container.clientWidth;
      const measureEl = mobile
        ? mobileMirrorRef.current
        : desktopMirrorRef.current;
      const measuredW = measureEl?.getBoundingClientRect().width ?? 0;

      if (contentWidth <= 0 || measuredW <= 0) return;

      const fitted = computeFitFontSize(
        contentWidth * 0.994,
        measuredW,
        REF_FONT_PX,
        mobile ? 40 : 32,
        mobile ? 180 : 280
      );
      setNameFontSize(fitted);
    };

    waitForArealFont(3000).then(() => {
      if (cancelled) return;
      fontGatePassed = true;
      recompute();
    });

    const ro = new ResizeObserver(recompute);
    ro.observe(container);

    const handleFontsLoaded = () => {
      if (fontGatePassed) recompute();
    };
    document.fonts?.addEventListener?.('loadingdone', handleFontsLoaded);
    window.addEventListener('resize', recompute, { passive: true });

    return () => {
      cancelled = true;
      ro.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', handleFontsLoaded);
      window.removeEventListener('resize', recompute);
    };
  }, []);

  // Reversible scroll entrance/exit for giant character rise animation
  useEffect(() => {
    if (reducedMotion) {
      setNameInView(true);
      return;
    }

    const el = nameContainerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setNameInView(entry.isIntersecting);
      },
      { threshold: 0.14 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const linesToRender = isMobile ? mobileLines : [fullNameUpper];
  const isMeasured = nameFontSize !== null;
  let runningCharIndex = 0;

  return (
    <footer
      id="work-footer"
      aria-label="Contact"
      className="cv-auto-footer page-bottom-clearance relative z-10 border-t border-[var(--border-hairline)] pt-6 sm:pt-8 px-5 sm:px-8 lg:px-12"
    >
      <div className="mx-auto flex w-full max-w-[1680px] flex-col">
        {/* Top terminal-style row: LINKEDIN.COM/IN/FADILMAULANAPUTRA ↗ left, EMAIL + label right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-6 font-mono-ui text-xs uppercase tracking-[0.16em]">
          <a
            href={contact.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-linkedin-link"
            className="group inline-flex min-h-[44px] items-center gap-2 font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors duration-200 break-all sm:break-normal"
          >
            <span
              aria-hidden="true"
              className="text-[var(--text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
            >
              &gt;
            </span>
            <span>{contact.linkedinHandle}</span>
            <span
              aria-hidden="true"
              className="text-[var(--text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--accent)]"
            >
              ↗
            </span>
          </a>

          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 sm:text-right">
            <span className="text-[10px] sm:text-[11px] tracking-[0.18em] text-[var(--text-muted)]">
              {contact.emailLabel}
            </span>
            <a
              href={`mailto:${contact.emailAddress}?subject=${encodeURIComponent(
                `Project Inquiry — ${name}`
              )}`}
              data-testid="footer-email-link"
              className="group inline-flex min-h-[44px] items-center gap-2 font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors duration-200 break-all sm:break-normal"
            >
              <span className="underline decoration-[var(--border-hairline)] underline-offset-4 group-hover:decoration-[var(--accent)]">
                {contact.emailAddress}
              </span>
              <span
                aria-hidden="true"
                className="text-[var(--accent)] transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </a>
          </div>
        </div>

        {/* Giant edge-to-edge ResizeObserver-fitted name in Areal Bold (700) with reversible 25ms character rise */}
        <div
          ref={nameContainerRef}
          data-testid="footer-giant-name"
          data-font-measured={isMeasured ? 'true' : 'false'}
          className="relative pt-10 pb-2 sm:pt-14 sm:pb-2 lg:pt-16 lg:pb-2 select-none"
        >
          {/* Offscreen per-character mirrors at exact 100px reference size in Areal 700, -0.03em */}
          <div
            aria-hidden="true"
            className="pointer-events-none invisible fixed -top-[9999px] left-0 whitespace-nowrap font-areal font-bold uppercase tracking-[-0.03em] leading-[0.8]"
            style={{ fontSize: `${REF_FONT_PX}px` }}
          >
            <span ref={desktopMirrorRef} className="inline-block whitespace-nowrap">
              {Array.from(fullNameUpper).map((char, idx) =>
                char === ' ' ? (
                  <span key={idx} className="inline-block w-[0.22em]">
                    &nbsp;
                  </span>
                ) : (
                  <span key={idx} className="inline-block">
                    {char}
                  </span>
                )
              )}
            </span>
            <span ref={mobileMirrorRef} className="inline-block whitespace-nowrap">
              {Array.from(longestWord).map((char, idx) => (
                <span key={idx} className="inline-block">
                  {char}
                </span>
              ))}
            </span>
          </div>

          <h2
            aria-label={fullNameUpper}
            style={{
              fontSize:
                nameFontSize !== null
                  ? `${nameFontSize}px`
                  : isMobile
                  ? 'clamp(44px, 18vw, 110px)'
                  : 'clamp(42px, 8.2vw, 152px)',
              lineHeight: 0.8,
            }}
            className={`w-full font-areal font-bold uppercase tracking-[-0.03em] text-[var(--text-primary)] theme-surface transition-opacity duration-200 ${
              isMeasured ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {linesToRender.map((line, lineIdx) => (
              <span
                key={lineIdx}
                aria-hidden="true"
                className="block whitespace-nowrap"
              >
                {Array.from(line).map((char, charIdx) => {
                  const globalIdx = runningCharIndex++;
                  if (char === ' ') {
                    return (
                      <span
                        key={`${lineIdx}-${charIdx}`}
                        className="inline-block w-[0.22em]"
                      >
                        &nbsp;
                      </span>
                    );
                  }
                  return (
                    <span
                      key={`${lineIdx}-${charIdx}`}
                      className="inline-block overflow-hidden align-top pt-[0.06em] pb-[0.12em] -mt-[0.06em] -mb-[0.12em]"
                    >
                      <motion.span
                        className="inline-block"
                        initial={false}
                        animate={
                          reducedMotion || nameInView
                            ? { y: '0%', opacity: 1 }
                            : { y: '110%', opacity: 0.25 }
                        }
                        transition={
                          reducedMotion
                            ? { duration: 0.01 }
                            : {
                                duration: 0.52,
                                delay: nameInView ? globalIdx * 0.025 : 0,
                                ease: [0.16, 1, 0.3, 1],
                              }
                        }
                      >
                        {char}
                      </motion.span>
                    </span>
                  );
                })}
              </span>
            ))}
          </h2>
        </div>
      </div>
    </footer>
  );
}
