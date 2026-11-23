import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AVAILABILITY,
  EMAIL,
  LINKEDIN_URL,
  PORTFOLIO_CONFIG,
  RESUME_URL,
} from '../config/portfolio';
import { computeFitFontSize } from '../utils/portfolioLogic';
import { waitForArealFont } from '../utils/arealFontLoader';

interface ContactPageProps {
  reducedMotion: boolean;
}

const REF_FONT_PX = 100;
const DESKTOP_HEADLINE = "LET'S WORK TOGETHER.";
const MOBILE_HEADLINE_LINES = ["LET'S WORK", 'TOGETHER.'] as const;

function formatJakartaTime(): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return '--:--:--';
  }
}

/**
 * Copies text via modern Clipboard API with a hidden <textarea> + execCommand('copy') fallback.
 */
async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/**
 * PART E — Contact Page (`#/contact`).
 * One clean terminal-style screen with NO footer content (fixed bottom bar sits below):
 *   1. Availability status line + blinking block cursor
 *   2. ResizeObserver-fitted Areal Bold "LET'S WORK TOGETHER." with per-character rise
 *   3. Interactive hairline terminal rows: > EMAIL ([COPY] + [OPEN MAIL]), > LINKEDIN,
 *      and conditional > CV (only if RESUME_URL is non-empty)
 *   4. Live Bekasi GMT+7 clock updated directly on ref.textContent (zero re-renders)
 *      and paused when document tab is hidden.
 */
export function ContactPage({ reducedMotion }: ContactPageProps) {
  const headlineContainerRef = useRef<HTMLDivElement | null>(null);
  const desktopMirrorRef = useRef<HTMLSpanElement | null>(null);
  const mobileMirrorRef = useRef<HTMLSpanElement | null>(null);
  const copyButtonRef = useRef<HTMLButtonElement | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [headlineFontSize, setHeadlineFontSize] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Fit-to-width measurement gated on Areal font load (or 3s timeout)
  useLayoutEffect(() => {
    const container = headlineContainerRef.current;
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
        mobile ? 38 : 36,
        mobile ? 130 : 220
      );
      setHeadlineFontSize(fitted);
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

  // Live Bekasi GMT+7 clock writing directly to DOM ref (zero React re-renders)
  // and pausing automatically when tab is hidden.
  useEffect(() => {
    const updateClock = () => {
      if (clockRef.current) {
        clockRef.current.textContent = formatJakartaTime();
      }
    };

    updateClock();
    let intervalId: number | null = null;

    const startClock = () => {
      if (intervalId !== null) return;
      updateClock();
      intervalId = window.setInterval(updateClock, 1000);
    };

    const stopClock = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopClock();
      } else {
        startClock();
      }
    };

    if (document.visibilityState !== 'hidden') {
      startClock();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopClock();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleCopyEmail = useCallback(
    async (originEl?: HTMLElement | null) => {
      await copyTextWithFallback(EMAIL);

      setCopied(true);
      setLiveAnnouncement('Email copied');

      // Fire 12–16 character ASCII burst from [COPY] button coordinates
      if (!reducedMotion) {
        const anchor = originEl ?? copyButtonRef.current;
        if (anchor) {
          const rect = anchor.getBoundingClientRect();
          window.dispatchEvent(
            new CustomEvent('fmp:ascii-burst', {
              detail: {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                count: 14,
              },
            })
          );
        }
      }

      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        setLiveAnnouncement('');
      }, 2000);
    },
    [reducedMotion]
  );

  const linesToRender = isMobile ? MOBILE_HEADLINE_LINES : [DESKTOP_HEADLINE];
  const isMeasured = headlineFontSize !== null;
  const hasResume = RESUME_URL.trim().length > 0;
  let runningCharIndex = 0;

  return (
    <main
      data-testid="contact-page"
      className="page-bottom-clearance relative z-10 flex min-h-[100svh] flex-col justify-between pt-[84px] sm:pt-[104px] px-5 sm:px-8 lg:px-12"
    >
      <div className="mx-auto flex flex-1 w-full max-w-[1680px] flex-col justify-between gap-10 sm:gap-12">
        {/* Top: Availability status line flush-left with blinking terminal block cursor */}
        <div
          data-testid="contact-availability"
          className="flex items-center gap-2 font-mono-ui text-[11px] sm:text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]"
        >
          <span>{AVAILABILITY}</span>
          <span
            aria-hidden="true"
            className="inline-block h-[0.95em] w-[0.54em] bg-[var(--accent)] animate-ascii-blink shrink-0"
          />
        </div>

        {/* Center: Edge-to-edge Areal Bold headline + hairline interactive terminal rows */}
        <div className="flex flex-col gap-10 sm:gap-14 my-auto">
          <div
            ref={headlineContainerRef}
            data-testid="contact-headline-container"
            data-font-measured={isMeasured ? 'true' : 'false'}
            className="relative w-full select-none"
          >
            {/* Offscreen exact per-character mirrors in Areal Bold 700, -0.03em */}
            <div
              aria-hidden="true"
              className="pointer-events-none invisible fixed -top-[9999px] left-0 whitespace-nowrap font-areal font-bold uppercase tracking-[-0.03em] leading-[0.82]"
              style={{ fontSize: `${REF_FONT_PX}px` }}
            >
              <span ref={desktopMirrorRef} className="inline-block whitespace-nowrap">
                {Array.from(DESKTOP_HEADLINE).map((char, idx) =>
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
                {Array.from(MOBILE_HEADLINE_LINES[0]).map((char, idx) =>
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
            </div>

            <h1
              tabIndex={-1}
              aria-label={DESKTOP_HEADLINE}
              data-testid="contact-main-heading"
              style={{
                fontSize:
                  headlineFontSize !== null
                    ? `${headlineFontSize}px`
                    : isMobile
                    ? 'clamp(42px, 14vw, 88px)'
                    : 'clamp(42px, 7.6vw, 144px)',
                lineHeight: 0.82,
              }}
              className={`w-full font-areal font-bold uppercase tracking-[-0.03em] text-[var(--text-primary)] theme-surface transition-opacity duration-200 focus:outline-none ${
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
                          initial={reducedMotion ? false : { y: '108%', opacity: 0.25 }}
                          animate={{ y: '0%', opacity: 1 }}
                          transition={
                            reducedMotion
                              ? { duration: 0.01 }
                              : {
                                  duration: 0.52,
                                  delay: globalIdx * 0.022,
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
            </h1>
          </div>

          {/* Interactive terminal rows separated by hairline rules */}
          <div className="flex flex-col border-t border-b border-[var(--border-hairline)] divide-y divide-[var(--border-hairline)] font-mono-ui text-xs uppercase tracking-[0.16em]">
            {/* > EMAIL row: click row or [COPY] to copy; [OPEN MAIL] opens mailto */}
            <div
              data-testid="contact-email-row"
              onClick={() => void handleCopyEmail(copyButtonRef.current)}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-5 sm:py-6 cursor-pointer"
            >
              <div className="inline-flex items-center gap-2.5 text-[var(--text-primary)] transition-all duration-200 ease-out group-hover:translate-x-[6px] group-hover:text-[var(--accent)]">
                <span aria-hidden="true" className="text-[var(--accent)]">
                  &gt;
                </span>
                <span className="font-medium">EMAIL</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                <span className="text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200 break-all sm:break-normal">
                  {EMAIL}
                </span>

                <div className="flex items-center gap-3">
                  <button
                    ref={copyButtonRef}
                    type="button"
                    data-testid="contact-copy-email-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyEmail(e.currentTarget);
                    }}
                    className={`inline-flex min-h-[44px] items-center px-1 font-mono-ui text-xs font-medium uppercase tracking-[0.16em] transition-colors duration-200 cursor-pointer ${
                      copied
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--accent)]'
                    }`}
                  >
                    {copied ? '[COPIED]' : '[COPY]'}
                  </button>

                  <a
                    href={`mailto:${EMAIL}?subject=${encodeURIComponent(
                      `Project Inquiry — ${PORTFOLIO_CONFIG.name}`
                    )}`}
                    data-testid="contact-open-mail-link"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex min-h-[44px] items-center px-1 font-mono-ui text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors duration-200 whitespace-nowrap"
                  >
                    [OPEN MAIL]
                  </a>
                </div>
              </div>
            </div>

            {/* > LINKEDIN row */}
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="contact-linkedin-row"
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-5 sm:py-6"
            >
              <span className="inline-flex items-center gap-2.5 text-[var(--text-primary)] transition-all duration-200 ease-out group-hover:translate-x-[6px] group-hover:text-[var(--accent)]">
                <span aria-hidden="true" className="text-[var(--accent)]">
                  &gt;
                </span>
                <span className="font-medium">LINKEDIN</span>
              </span>

              <span className="inline-flex items-center gap-2 text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200 break-all sm:break-normal">
                <span>{PORTFOLIO_CONFIG.contact.linkedinHandle}</span>
                <span
                  aria-hidden="true"
                  className="text-[var(--text-muted)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--accent)]"
                >
                  ↗
                </span>
              </span>
            </a>

            {/* > CV row — rendered ONLY when RESUME_URL is non-empty */}
            {hasResume && (
              <a
                href={RESUME_URL}
                download
                target="_blank"
                rel="noopener noreferrer"
                data-testid="contact-cv-row"
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-5 sm:py-6"
              >
                <span className="inline-flex items-center gap-2.5 text-[var(--text-primary)] transition-all duration-200 ease-out group-hover:translate-x-[6px] group-hover:text-[var(--accent)]">
                  <span aria-hidden="true" className="text-[var(--accent)]">
                    &gt;
                  </span>
                  <span className="font-medium">CV</span>
                </span>

                <span className="inline-flex items-center gap-2 text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors duration-200">
                  <span>DOWNLOAD PDF</span>
                  <span
                    aria-hidden="true"
                    className="text-[var(--text-muted)] transition-transform duration-200 group-hover:translate-y-0.5 group-hover:text-[var(--accent)]"
                  >
                    ↓
                  </span>
                </span>
              </a>
            )}
          </div>
        </div>

        {/* Bottom HUD line: live Bekasi GMT+7 clock */}
        <div
          data-testid="contact-live-clock"
          className="flex items-center gap-4 pt-4 font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]"
        >
          <span>BEKASI, ID</span>
          <span>GMT+7</span>
          <span
            ref={clockRef}
            data-testid="contact-clock-time"
            className="text-[var(--text-primary)] tabular-nums"
          >
            {formatJakartaTime()}
          </span>
        </div>

        {/* Screen-reader confirmation for clipboard copy */}
        <span
          role="status"
          aria-live="polite"
          data-testid="contact-copy-live-region"
          className="sr-only"
        >
          {liveAnnouncement}
        </span>
      </div>
    </main>
  );
}
