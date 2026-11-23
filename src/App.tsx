/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ============================================================================
 * EDITABLE CONSTANTS — OPEN `src/config/portfolio.ts` TO EDIT:
 *   - `HERO_ASCII`             (Hero GRAPHIC / DESIGNER interactive ASCII tunables)
 *   - `EMAIL`                  (Shared by WORK footer & Contact page)
 *   - `LINKEDIN_URL`           (https://www.linkedin.com/in/fadilmaulanaputra/)
 *   - `RESUME_URL`             (Optional CV PDF URL; empty hides `> CV` row)
 *   - `AVAILABILITY`           (Contact page status line)
 *   - `LOGO_GLB_URL`           (Optional .glb path in `/public/models/` for 3D F)
 *   - `PROFILE_PHOTO_URL`      (Portrait photo URL 1200x1500 on Profile page)
 *   - `PROFILE_CONFIG`         (All Profile page statements, principles & table)
 *   - `PORTFOLIO_CONFIG.projects` (12+ projects, cover imageUrl, optional
 *       videoUrl, description, tools, role, and 8–10 `details` plates)
 *
 * SELF-HOSTED AREAL FONT FILES (`/public/fonts/`, declared in `src/index.css` & `index.html`):
 *   - `/public/fonts/Areal-Regular.woff2` (weight 400)
 *   - `/public/fonts/Areal-Medium.woff2`  (weight 500)
 *   - `/public/fonts/Areal-Bold.woff2`    (weight 700, preloaded for hero)
 * ============================================================================
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useMotionValue, useSpring } from 'motion/react';
import { PORTFOLIO_CONFIG } from './config/portfolio';
import { useReducedMotion } from './hooks/useReducedMotion';
import {
  buildPageHash,
  buildWorkHash,
  computeMaxRevealRadius,
  computeVelocitySkew,
  getAdjacentProjectIndex,
  getPageDocumentTitle,
  parseAppHash,
  type RoutePage,
} from './utils/portfolioLogic';
import { frameEngine } from './utils/frameEngine';
import { AsciiLoader } from './components/AsciiLoader';
import { DotGridBackground } from './components/DotGridBackground';
import { AsciiCursorOverlay } from './components/AsciiCursorOverlay';
import { Navigation } from './components/Navigation';
import { ProfileHero } from './components/ProfileHero';
import { WorkGallery } from './components/WorkGallery';
import { ProjectDetailView } from './components/ProjectDetailView';
import { ContactFooter } from './components/ContactFooter';
import {
  PixelTransitionOverlay,
  type PixelTransitionRequest,
} from './components/PixelTransitionOverlay';
import { ContactPage } from './pages/ContactPage';

// Lazy-loaded Profile page (Three.js is dynamically imported only inside ChromeLogoCanvas)
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

const THEME_STORAGE_KEY = 'fmp-portfolio-theme';

function resolveInitialRoute(): { page: RoutePage; projectId: string | null } {
  if (typeof window === 'undefined') {
    return { page: 'work', projectId: null };
  }
  const parsed = parseAppHash(window.location.hash);
  if (parsed.projectId) {
    const exists = PORTFOLIO_CONFIG.projects.some((p) => p.id === parsed.projectId);
    return { page: 'work', projectId: exists ? parsed.projectId : null };
  }
  return { page: parsed.page, projectId: null };
}

function focusMainHeading() {
  window.setTimeout(() => {
    const heading = document.querySelector<HTMLElement>('main h1');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) {
      heading.setAttribute('tabindex', '-1');
    }
    heading.focus({ preventScroll: true });
  }, 40);
}

export default function App() {
  const reducedMotion = useReducedMotion();

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const initialRoute = useMemo(() => resolveInitialRoute(), []);
  const [loaderDone, setLoaderDone] = useState<boolean>(false);
  const [scrolledPastNavThreshold, setScrolledPastNavThreshold] = useState<boolean>(false);
  const [activePage, setActivePage] = useState<RoutePage>(initialRoute.page);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    initialRoute.projectId
  );

  const [pixelTransition, setPixelTransition] = useState<PixelTransitionRequest | null>(null);

  const savedWorkScrollYRef = useRef<number>(0);
  const activePageRef = useRef<RoutePage>(activePage);
  activePageRef.current = activePage;
  const activeProjectIdRef = useRef<string | null>(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const transitionIdRef = useRef<number>(0);
  const transitionInFlightRef = useRef<boolean>(false);

  // Scroll-velocity gallery skew capped at +-1.5deg, spring-smoothed back to 0
  const rawSkewY = useMotionValue(0);
  const smoothSkewY = useSpring(rawSkewY, { stiffness: 120, damping: 28, mass: 0.4 });

  // Sync canonical hash on initial load if empty
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/work');
    }
  }, []);

  // Sync document.title with active page
  useEffect(() => {
    document.title = getPageDocumentTitle(activePage);
  }, [activePage]);

  // Sync Tailwind dark class + theme-color meta tag
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#161616' : '#EDECE6');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Storage unavailable
    }
  }, [isDark]);

  // Adaptive lite-mode class on <html> so top & bottom bars drop blur under heavy load
  useEffect(() => {
    return frameEngine.subscribeQuality((tier) => {
      document.documentElement.classList.toggle('lite-mode', tier >= 1);
    });
  }, []);

  // Initialize single shared animation clock + Lenis (autoRaf: false, lerp: 0.1, syncTouch: false)
  useEffect(() => {
    frameEngine.initLenis(reducedMotion);
    if (reducedMotion) {
      rawSkewY.set(0);
    }
    return () => {
      frameEngine.destroyLenis();
    };
  }, [reducedMotion, rawSkewY]);

  // Lock background scroll & pause Lenis whenever Project Detail View is open
  useEffect(() => {
    const isDetailOpen = activeProjectId !== null;
    if (isDetailOpen) {
      frameEngine.stopScroll();
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
        frameEngine.startScroll();
      };
    }
  }, [activeProjectId]);

  // Trigger pixelated full-screen canvas transition (project open/close or shorter route swap)
  const runPixelTransition = useCallback(
    (mode: 'open' | 'close' | 'route', onMidpoint: () => void) => {
      if (transitionInFlightRef.current) {
        onMidpoint();
        return;
      }
      transitionInFlightRef.current = true;
      transitionIdRef.current += 1;
      const reqId = transitionIdRef.current;

      setPixelTransition({
        id: reqId,
        mode,
        onMidpoint,
        onComplete: () => {
          transitionInFlightRef.current = false;
          setPixelTransition((current) => (current?.id === reqId ? null : current));
        },
      });
    },
    []
  );

  // Commit a route change (used by nav clicks, brand click, and hashchange)
  const commitRouteChange = useCallback(
    (
      nextPage: RoutePage,
      nextProjectId: string | null,
      updateHistory: boolean
    ) => {
      const prevPage = activePageRef.current;
      const prevProjectId = activeProjectIdRef.current;

      if (nextPage === prevPage && nextProjectId === prevProjectId) {
        return;
      }

      // Save WORK scroll position before navigating away from WORK (to Profile, Contact, or Detail)
      if (prevPage === 'work' && prevProjectId === null) {
        savedWorkScrollYRef.current = window.scrollY;
      }

      const mode: 'open' | 'close' | 'route' =
        nextProjectId !== null
          ? 'open'
          : prevProjectId !== null && nextPage === 'work'
          ? 'close'
          : 'route';

      const shouldRestoreWorkScroll =
        nextPage === 'work' &&
        nextProjectId === null &&
        (prevPage !== 'work' || prevProjectId !== null);
      const targetScrollY = shouldRestoreWorkScroll ? savedWorkScrollYRef.current : 0;

      runPixelTransition(mode, () => {
        setActivePage(nextPage);
        setActiveProjectId(nextProjectId);

        if (updateHistory) {
          const nextHash = buildPageHash(nextPage, nextProjectId);
          if (window.location.hash !== nextHash) {
            window.history.pushState(
              { page: nextPage, projectId: nextProjectId },
              '',
              nextHash
            );
          }
        }

        if (nextProjectId === null) {
          window.setTimeout(() => {
            frameEngine.scrollTo(targetScrollY, { immediate: true });
            focusMainHeading();
          }, 32);
        }
      });
    },
    [runPixelTransition]
  );

  // Listen to browser Back/Forward hash navigation across #/work, #/work/01, #/profile, #/contact
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseAppHash(window.location.hash);
      const validProjectId =
        parsed.projectId &&
        PORTFOLIO_CONFIG.projects.some((p) => p.id === parsed.projectId)
          ? parsed.projectId
          : null;

      commitRouteChange(parsed.page, validProjectId, false);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [commitRouteChange]);

  // Shared animation clock: glass-nav threshold + WORK gallery velocity skew (NO scroll-spy!)
  useEffect(() => {
    let lastScrolledPast = window.scrollY > 40;
    let lastSkew = 0;

    setScrolledPastNavThreshold(lastScrolledPast);

    const unsubscribe = frameEngine.subscribe((ctx) => {
      const isWorkGridActive =
        activePageRef.current === 'work' && activeProjectIdRef.current === null;

      const nextSkew =
        !isWorkGridActive || reducedMotion || ctx.qualityTier >= 1
          ? 0
          : computeVelocitySkew(ctx.scrollVelocity, 1.5, false);

      if (Math.abs(nextSkew - lastSkew) > 0.005) {
        lastSkew = nextSkew;
        rawSkewY.set(nextSkew);
      } else if (nextSkew === 0 && lastSkew !== 0) {
        lastSkew = 0;
        rawSkewY.set(0);
      }

      const scrolledPast = ctx.scrollY > 40;
      if (scrolledPast !== lastScrolledPast) {
        lastScrolledPast = scrolledPast;
        setScrolledPastNavThreshold(scrolledPast);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [reducedMotion, rawSkewY]);

  // Smooth ~1s Lenis scroll-to-top (instant under prefers-reduced-motion)
  const scrollSmoothToTop = useCallback(() => {
    frameEngine.scrollTo(0, {
      immediate: reducedMotion,
      duration: reducedMotion ? undefined : 1.0,
    });
  }, [reducedMotion]);

  // Clicking nav link: if already on that page (with no detail open), scroll smoothly to top;
  // otherwise navigate to that route via pixel transition.
  const handleNavigate = useCallback(
    (page: RoutePage) => {
      if (activePageRef.current === page && activeProjectIdRef.current === null) {
        scrollSmoothToTop();
        return;
      }
      commitRouteChange(page, null, true);
    },
    [commitRouteChange, scrollSmoothToTop]
  );

  // Clicking top-left site name: goes to #/work, or smoothly scrolls to top if already on #/work
  const handleBrandClick = useCallback(() => {
    if (activePageRef.current === 'work' && activeProjectIdRef.current === null) {
      scrollSmoothToTop();
      return;
    }
    commitRouteChange('work', null, true);
  }, [commitRouteChange, scrollSmoothToTop]);

  // Circular clip-path View Transitions API dark mode toggle originating from monochrome icon center
  const handleToggleTheme = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const nextIsDark = !isDark;

      if (reducedMotion || typeof document.startViewTransition !== 'function') {
        setIsDark(nextIsDark);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      const maxRadius = computeMaxRevealRadius(
        originX,
        originY,
        window.innerWidth,
        window.innerHeight
      );

      document.documentElement.classList.add('is-view-transitioning');

      const transition = document.startViewTransition(() => {
        flushSync(() => {
          document.documentElement.classList.toggle('dark', nextIsDark);
          setIsDark(nextIsDark);
        });
      });

      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${originX}px ${originY}px)`,
                `circle(${maxRadius}px at ${originX}px ${originY}px)`,
              ],
            },
            {
              duration: 700,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          );
        })
        .catch(() => {
          // Graceful fallback if animation is interrupted
        });

      transition.finished.finally(() => {
        document.documentElement.classList.remove('is-view-transitioning');
      });
    },
    [isDark, reducedMotion]
  );

  // Open project detail view through pixelated full-screen transition
  const handleOpenProject = useCallback(
    (index: number) => {
      const project = PORTFOLIO_CONFIG.projects[index];
      if (!project) return;
      commitRouteChange('work', project.id, true);
    },
    [commitRouteChange]
  );

  // Return to WORK grid through shorter pixel transition & restore exact previous scroll position
  const handleCloseProject = useCallback(() => {
    commitRouteChange('work', null, true);
  }, [commitRouteChange]);

  const handleSelectNextProject = useCallback(
    (nextId: string) => {
      runPixelTransition('open', () => {
        setActiveProjectId(nextId);
        window.history.replaceState(
          { page: 'work', projectId: nextId },
          '',
          buildWorkHash(nextId)
        );
      });
    },
    [runPixelTransition]
  );

  const activeProjectData = useMemo(() => {
    if (!activeProjectId) return null;
    const idx = PORTFOLIO_CONFIG.projects.findIndex((p) => p.id === activeProjectId);
    if (idx === -1) return null;
    const nextIdx = getAdjacentProjectIndex(idx, 1, PORTFOLIO_CONFIG.projects.length);
    return {
      project: PORTFOLIO_CONFIG.projects[idx],
      nextProject: PORTFOLIO_CONFIG.projects[nextIdx],
    };
  }, [activeProjectId]);

  const handleLoaderComplete = useCallback(() => {
    setLoaderDone(true);
  }, []);

  return (
    <div
      data-loader-done={loaderDone ? 'true' : 'false'}
      data-active-page={activePage}
      className="relative min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-x-clip theme-surface"
    >
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          focusMainHeading();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[90] bg-[var(--accent)] px-4 py-2 font-mono-ui text-xs font-medium uppercase tracking-[0.16em] text-[#EDECE6]"
      >
        Skip to content
      </a>

      {/* Once-per-session ASCII progress loader */}
      <AsciiLoader
        reducedMotion={reducedMotion}
        onComplete={handleLoaderComplete}
      />

      {/* Fine 28px dot grid + 120px cursor-proximal accent tint */}
      <DotGridBackground reducedMotion={reducedMotion} />

      {/* High-density ASCII cursor trail + click/copy ASCII bursts */}
      <AsciiCursorOverlay reducedMotion={reducedMotion} isDark={isDark} />

      {/* Route-based top navigation ([WORK] [PROFILE] [CONTACT]) + always-visible fixed bottom bar */}
      <Navigation
        activePage={activePage}
        brandFullName={PORTFOLIO_CONFIG.name}
        copyrightYear={PORTFOLIO_CONFIG.copyrightYear}
        isDark={isDark}
        scrolled={scrolledPastNavThreshold}
        reducedMotion={reducedMotion}
        onToggleTheme={handleToggleTheme}
        onNavigate={handleNavigate}
        onBrandClick={handleBrandClick}
      />

      {/* Active route view — previous page unmounts at pixel transition midpoint */}
      <div id="main-content">
        {activePage === 'work' && (
          <>
            <main data-testid="work-page">
              <ProfileHero
                config={PORTFOLIO_CONFIG}
                reducedMotion={reducedMotion}
                asciiEnabled={
                  loaderDone &&
                  activePage === 'work' &&
                  activeProjectData === null &&
                  pixelTransition === null
                }
              />

              <WorkGallery
                projects={PORTFOLIO_CONFIG.projects}
                reducedMotion={reducedMotion}
                skewY={smoothSkewY}
                isDetailOpen={activeProjectData !== null}
                onSelectProject={handleOpenProject}
              />
            </main>

            <ContactFooter
              config={PORTFOLIO_CONFIG}
              reducedMotion={reducedMotion}
            />
          </>
        )}

        {activePage === 'profile' && (
          <Suspense
            fallback={
              <main
                data-testid="profile-loading"
                className="flex min-h-[100svh] items-center justify-center font-mono-ui text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]"
              >
                LOADING PROFILE...
              </main>
            }
          >
            <ProfilePage isDark={isDark} reducedMotion={reducedMotion} />
          </Suspense>
        )}

        {activePage === 'contact' && (
          <ContactPage reducedMotion={reducedMotion} />
        )}
      </div>

      {/* Project Detail View (#/work/01) */}
      {activeProjectData && (
        <ProjectDetailView
          key={activeProjectData.project.id}
          project={activeProjectData.project}
          nextProject={activeProjectData.nextProject}
          totalProjects={PORTFOLIO_CONFIG.projects.length}
          isDark={isDark}
          reducedMotion={reducedMotion}
          onBack={handleCloseProject}
          onSelectNext={handleSelectNextProject}
        />
      )}

      {/* Single-canvas pixelated page & project transition overlay */}
      <PixelTransitionOverlay
        request={pixelTransition}
        isDark={isDark}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
