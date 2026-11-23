import { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  buildPageHash,
  SCRAMBLE_GLYPHS,
  type RoutePage,
} from '../utils/portfolioLogic';

interface NavigationProps {
  activePage: RoutePage;
  brandFullName: string;
  copyrightYear: number;
  isDark: boolean;
  scrolled: boolean;
  reducedMotion: boolean;
  onToggleTheme: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onNavigate: (page: RoutePage) => void;
  onBrandClick: () => void;
}

const NAV_ITEMS: readonly { id: RoutePage; label: string }[] = [
  { id: 'work', label: 'WORK' },
  { id: 'profile', label: 'PROFILE' },
  { id: 'contact', label: 'CONTACT' },
];

const SUN_RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/**
 * Brief 3-frame ASCII flicker effect used on nav hover and active transitions.
 */
function useAsciiFlicker(text: string, triggerKey: number, reducedMotion: boolean): string {
  const [display, setDisplay] = useState(text);
  const initialMountRef = useRef(true);

  useEffect(() => {
    setDisplay(text);
  }, [text]);

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (reducedMotion || triggerKey === 0) {
      setDisplay(text);
      return;
    }

    let step = 0;
    const totalSteps = 3;
    const interval = window.setInterval(() => {
      step += 1;
      if (step >= totalSteps) {
        setDisplay(text);
        window.clearInterval(interval);
        return;
      }
      const flickered = Array.from(text)
        .map((ch, i) => {
          if (ch === ' ') return ' ';
          if ((i + step) % 3 === 0) {
            return SCRAMBLE_GLYPHS[(i * 7 + step * 5) % SCRAMBLE_GLYPHS.length];
          }
          return ch;
        })
        .join('');
      setDisplay(flickered);
    }, 45);

    return () => window.clearInterval(interval);
  }, [text, triggerKey, reducedMotion]);

  return display;
}

interface FlickerNavLinkProps {
  item: { id: RoutePage; label: string };
  isActive: boolean;
  reducedMotion: boolean;
  compact?: boolean;
  onSelect: (event: React.MouseEvent<HTMLAnchorElement>, page: RoutePage) => void;
}

function FlickerNavLink({
  item,
  isActive,
  reducedMotion,
  compact = false,
  onSelect,
}: FlickerNavLinkProps) {
  const [flickerTick, setFlickerTick] = useState(0);

  useEffect(() => {
    if (isActive) {
      setFlickerTick((t) => t + 1);
    }
  }, [isActive]);

  const label = useAsciiFlicker(item.label, flickerTick, reducedMotion);

  return (
    <a
      href={buildPageHash(item.id)}
      onClick={(e) => onSelect(e, item.id)}
      onMouseEnter={() => setFlickerTick((t) => t + 1)}
      aria-current={isActive ? 'page' : undefined}
      className={`inline-flex items-center justify-center gap-1 font-mono-ui font-medium uppercase transition-colors duration-300 whitespace-nowrap shrink-0 ${
        compact
          ? 'min-h-[44px] text-[11px] tracking-[0.14em]'
          : 'min-h-[40px] text-xs tracking-[0.16em]'
      } ${
        isActive
          ? 'text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:text-[var(--accent)]'
      }`}
    >
      <span>[{label}]</span>
      {isActive && (
        <span
          aria-hidden="true"
          className="inline-block w-[0.52em] h-[0.98em] bg-[var(--accent)] animate-ascii-blink align-middle"
        />
      )}
    </a>
  );
}

interface ThemeIconToggleProps {
  isDark: boolean;
  reducedMotion: boolean;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Borderless monochrome theme icon toggle (no box, no border, no fill).
 * Icon is sized to 1em of the nav text (15px), strokeWidth 1.5px, monochrome currentColor,
 * vertically aligned on the same baseline as [WORK] [PROFILE] [CONTACT].
 * Wrapped in a transparent 44x44px hit button with negative margin so layout isn't pushed
 * and the icon's right edge aligns flush with the page grid margin.
 */
function ThemeIconToggle({ isDark, reducedMotion, onToggle }: ThemeIconToggleProps) {
  const maskId = useId();
  const morphDuration = reducedMotion ? 0.01 : 0.5;
  const morphEase: [number, number, number, number] = [0.22, 1, 0.36, 1];

  return (
    <button
      type="button"
      data-testid="theme-toggle-btn"
      data-theme={isDark ? 'dark' : 'light'}
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="group relative inline-flex h-11 w-11 -mr-[14.5px] -my-1 items-center justify-center border-0 rounded-none bg-transparent text-[var(--text-primary)] hover:scale-[1.08] active:scale-95 cursor-pointer shrink-0 select-none"
      style={{
        transitionProperty: 'transform, color',
        transitionDuration: '200ms, 700ms',
        transitionTimingFunction: 'ease-out, cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <svg
        data-testid="theme-toggle-icon"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="h-[15px] w-[15px] overflow-visible transition-transform duration-300 ease-out group-hover:rotate-[10deg]"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="24" height="24" fill="white" />
            <motion.circle
              initial={false}
              animate={
                isDark
                  ? { cx: 16.5, cy: 8.5, r: 7.2 }
                  : { cx: 25, cy: 2, r: 0.1 }
              }
              transition={{ duration: morphDuration, ease: morphEase }}
              fill="black"
            />
          </mask>
        </defs>

        {/* Sun core -> expands smoothly into crescent Moon via sliding cutout mask */}
        <motion.g
          initial={false}
          animate={{ rotate: isDark ? -18 : 0 }}
          transition={{ duration: morphDuration, ease: morphEase }}
          style={{ transformOrigin: '12px 12px' }}
        >
          <motion.circle
            cx="12"
            cy="12"
            initial={false}
            animate={{ r: isDark ? 8.4 : 4.8 }}
            transition={{ duration: morphDuration, ease: morphEase }}
            fill="currentColor"
            mask={`url(#${maskId})`}
          />
        </motion.g>

        {/* 8 short Sun rays (1.5px optical stroke): scale to 0 & rotate 90deg smoothly */}
        <motion.g
          initial={false}
          animate={{
            scale: isDark ? 0 : 1,
            rotate: isDark ? 90 : 0,
            opacity: isDark ? 0 : 1,
          }}
          transition={{
            duration: morphDuration,
            ease: morphEase,
          }}
          style={{ transformOrigin: '12px 12px' }}
          stroke="currentColor"
          strokeWidth="2.4"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        >
          {SUN_RAY_ANGLES.map((angle) => (
            <line
              key={angle}
              x1="12"
              y1="1.8"
              x2="12"
              y2="4.4"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              transform={`rotate(${angle} 12 12)`}
            />
          ))}
        </motion.g>
      </svg>
    </button>
  );
}

/**
 * PARTS B & C — Route-Based Navigation + Always-Visible Fixed Bottom Bar.
 * - Desktop (>=640px):
 *   - Top bar: 3-zone grid with brand name left, `[WORK] [PROFILE] [CONTACT]` dead-center,
 *     borderless monochrome Sun/Moon icon toggle right.
 *   - Fixed bottom bar: mirrors top bar's frosted glass, height, width, padding;
 *     shows ONLY `© 2027` on the left, nothing on the right.
 * - Mobile (<640px):
 *   - Top bar: brand name left, monochrome icon toggle right.
 *   - Merged fixed bottom container: Row 1 = `[WORK] [PROFILE] [CONTACT]` centered (>=44px targets),
 *     Row 2 = ONLY `© 2027` at the left, with env(safe-area-inset-bottom) padding.
 */
export function Navigation({
  activePage,
  brandFullName,
  copyrightYear,
  isDark,
  scrolled,
  reducedMotion,
  onToggleTheme,
  onNavigate,
  onBrandClick,
}: NavigationProps) {
  const handleLinkClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    page: RoutePage
  ) => {
    event.preventDefault();
    onNavigate(page);
  };

  const handleBrandLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onBrandClick();
  };

  return (
    <>
      <header
        data-testid="site-header"
        data-scrolled={scrolled ? 'true' : 'false'}
        className="fixed top-0 inset-x-0 z-40 pointer-events-none"
      >
        {/* Borderless frosted glass layer (max 12px blur) fading in smoothly after 40px */}
        <div
          aria-hidden="true"
          className={`nav-glass-top absolute inset-x-0 top-0 h-[72px] sm:h-[86px] pointer-events-none transition-opacity duration-300 ease-out ${
            scrolled ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* 3-zone grid on desktop; 2-zone top bar on mobile */}
        <div className="relative mx-auto grid max-w-[1680px] grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_1fr] items-center px-5 py-3 sm:px-8 sm:py-4 lg:px-12">
          {/* Left zone: Site name (goes to #/work, or scrolls smoothly to top if already on #/work) */}
          <div className="pointer-events-auto justify-self-start">
            <a
              href="#/work"
              data-testid="brand-home-link"
              onClick={handleBrandLinkClick}
              className="inline-flex min-h-[44px] sm:min-h-[40px] items-center font-mono-ui text-[11px] sm:text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors duration-300 whitespace-nowrap"
            >
              {brandFullName}
            </a>
          </div>

          {/* Center zone (desktop only): [WORK] [PROFILE] [CONTACT] centered on viewport */}
          <nav
            aria-label="Primary"
            data-testid="desktop-nav-links"
            className="pointer-events-auto hidden sm:flex items-center justify-center gap-6 md:gap-8 justify-self-center"
          >
            {NAV_ITEMS.map((item) => (
              <FlickerNavLink
                key={item.id}
                item={item}
                isActive={activePage === item.id}
                reducedMotion={reducedMotion}
                onSelect={handleLinkClick}
              />
            ))}
          </nav>

          {/* Right zone: Borderless monochrome Sun/Moon morphing icon button */}
          <div className="pointer-events-auto justify-self-end">
            <ThemeIconToggle
              isDark={isDark}
              reducedMotion={reducedMotion}
              onToggle={onToggleTheme}
            />
          </div>
        </div>
      </header>

      {/* Desktop fixed bottom bar (>=640px): mirrors top nav frosted glass, ONLY "© 2027" left */}
      <div
        data-testid="fixed-bottom-bar"
        className="hidden sm:block fixed bottom-0 inset-x-0 z-40 pointer-events-none"
      >
        <div
          aria-hidden="true"
          className="nav-glass-bottom absolute inset-x-0 bottom-0 h-[72px] sm:h-[86px] pointer-events-none"
        />
        <div
          className="relative mx-auto flex h-[72px] max-w-[1680px] items-center justify-start px-5 sm:px-8 lg:px-12"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <p
            data-testid="bottom-bar-copyright"
            className="pointer-events-auto font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)] select-none"
          >
            © {copyrightYear}
          </p>
        </div>
      </div>

      {/* Mobile merged bottom bar (<640px): Row 1 = nav links centered, Row 2 = ONLY "© 2027" left */}
      <div
        data-testid="mobile-nav-bar"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 pointer-events-none"
      >
        <div
          aria-hidden="true"
          className="nav-glass-bottom absolute inset-x-0 bottom-0 top-[-18px] pointer-events-none"
        />
        <div
          className="relative pointer-events-auto flex flex-col px-5 pt-1"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
        >
          <nav
            aria-label="Mobile primary"
            className="flex items-center justify-center gap-5"
          >
            {NAV_ITEMS.map((item) => (
              <FlickerNavLink
                key={item.id}
                item={item}
                isActive={activePage === item.id}
                reducedMotion={reducedMotion}
                compact
                onSelect={handleLinkClick}
              />
            ))}
          </nav>
          <div className="flex items-center justify-start pt-0.5">
            <p
              data-testid="mobile-bottom-copyright"
              className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)] select-none"
            >
              © {copyrightYear}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
