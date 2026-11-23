import type {
  DetailAlign,
  DetailSize,
  ProjectAspectRatio,
  ProjectDetailMedia,
  ProjectItem,
} from '../config/portfolio';

export type NavSectionId = 'profile' | 'work' | 'contact';

export const SCRAMBLE_GLYPHS = '#?01/\\+*%@<>{}[]=-_:';
export const CURSOR_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?#@%&*+/<>01';

/**
 * Adaptive performance tier (PART H.7):
 * 0 = full quality
 * 1 = disable velocity skew & cursor dot-grid highlight
 * 2 = also throttle cursor particles to minimum
 * 3 = also disable parallax on small detail/gallery items
 */
export type QualityTier = 0 | 1 | 2 | 3;

export interface QualityMonitorState {
  tier: QualityTier;
  lowFpsAccumMs: number;
  lastChangeAtMs: number;
}

const LOW_FPS_THRESHOLD_MS = 1000 / 45; // ~22.22ms per frame (<45fps)
const LOW_FPS_TRIGGER_DURATION_MS = 1500;
const QUALITY_COOLDOWN_MS = 10000;

export function createQualityMonitorState(): QualityMonitorState {
  return {
    tier: 0,
    lowFpsAccumMs: 0,
    lastChangeAtMs: -QUALITY_COOLDOWN_MS,
  };
}

/**
 * Pure adaptive-quality step function evaluated during active scrolling.
 * Steps down one tier if frames stay below 45fps for 1.5s, with a strict 10s
 * cooldown so quality never oscillates rapidly.
 */
export function stepQualityMonitor(
  state: QualityMonitorState,
  deltaMs: number,
  nowMs: number,
  isScrolling: boolean
): QualityMonitorState {
  if (!isScrolling || deltaMs <= 0 || deltaMs > 250) {
    return state.lowFpsAccumMs === 0 ? state : { ...state, lowFpsAccumMs: 0 };
  }

  if (deltaMs > LOW_FPS_THRESHOLD_MS) {
    const nextAccum = state.lowFpsAccumMs + deltaMs;
    if (
      nextAccum >= LOW_FPS_TRIGGER_DURATION_MS &&
      nowMs - state.lastChangeAtMs >= QUALITY_COOLDOWN_MS &&
      state.tier < 3
    ) {
      return {
        tier: (state.tier + 1) as QualityTier,
        lowFpsAccumMs: 0,
        lastChangeAtMs: nowMs,
      };
    }
    return { ...state, lowFpsAccumMs: nextAccum };
  }

  // Smoothly decay accumulated slow time on healthy frames
  const decayed = Math.max(0, state.lowFpsAccumMs - deltaMs * 0.5);
  return { ...state, lowFpsAccumMs: decayed };
}

export interface SectionBounds {
  id: NavSectionId;
  top: number;
  height: number;
}

/**
 * Determines which navigation section should be highlighted for a given scroll position.
 */
export function resolveActiveSection(
  sections: readonly SectionBounds[],
  scrollY: number,
  viewportHeight: number,
  documentHeight: number
): NavSectionId {
  if (sections.length === 0) return 'profile';

  if (documentHeight > 0 && scrollY + viewportHeight >= documentHeight - 48) {
    return sections[sections.length - 1].id;
  }

  const probeY = scrollY + viewportHeight * 0.35;
  let active: NavSectionId = sections[0].id;

  for (const section of sections) {
    if (probeY >= section.top) {
      active = section.id;
    }
  }

  return active;
}

/**
 * Formats an ASCII progress readout like `[########......] 062%`.
 */
export function formatAsciiProgress(
  percent: number,
  barWidth: number,
  scrambleSeed: number,
  reducedMotion: boolean
): { bar: string; digits: string } {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * barWidth);
  const empty = Math.max(0, barWidth - filled);
  const bar = `[${'#'.repeat(filled)}${'.'.repeat(empty)}]`;

  const exactDigits = String(clamped).padStart(3, '0');
  if (reducedMotion || clamped >= 100 || clamped <= 0) {
    return { bar, digits: `${exactDigits}%` };
  }

  const noisyOnes = Math.abs((clamped + scrambleSeed * 3) % 10);
  const digits = `${exactDigits.slice(0, 2)}${noisyOnes}%`;
  return { bar, digits };
}

/**
 * Parses hash routes of the form `#/work/01` and returns the project id or null.
 */
export function parseWorkHash(hash: string): string | null {
  const match = /^#\/work\/([a-zA-Z0-9_-]+)\/?$/.exec(hash.trim());
  return match ? match[1] : null;
}

/**
 * Builds canonical hash route for a project detail view.
 */
export function buildWorkHash(projectId: string): string {
  return `#/work/${projectId}`;
}

export type RoutePage = 'work' | 'profile' | 'contact';

export interface ParsedRoute {
  page: RoutePage;
  projectId: string | null;
}

/**
 * Parses top-level hash routes (`#/work`, `#/work/01`, `#/profile`, `#/contact`).
 * Defaults to `{ page: 'work', projectId: null }` for empty or unknown hashes.
 */
export function parseAppHash(hash: string): ParsedRoute {
  const cleaned = hash.trim().toLowerCase();
  const projectId = parseWorkHash(hash);
  if (projectId) {
    return { page: 'work', projectId };
  }
  if (cleaned === '#/profile' || cleaned === '#/profile/' || cleaned === '#profile') {
    return { page: 'profile', projectId: null };
  }
  if (cleaned === '#/contact' || cleaned === '#/contact/' || cleaned === '#contact') {
    return { page: 'contact', projectId: null };
  }
  return { page: 'work', projectId: null };
}

/**
 * Builds canonical hash string for any page or project route.
 */
export function buildPageHash(page: RoutePage, projectId?: string | null): string {
  if (page === 'work' && projectId) {
    return buildWorkHash(projectId);
  }
  return `#/${page}`;
}

/**
 * Returns the exact document.title string for each route.
 */
export function getPageDocumentTitle(page: RoutePage): string {
  switch (page) {
    case 'profile':
      return 'Fadil Maulana Putra, Profile';
    case 'contact':
      return 'Fadil Maulana Putra, Contact';
    case 'work':
    default:
      return 'Fadil Maulana Putra, Work';
  }
}

export interface StatementWordToken {
  word: string;
  bold: boolean;
}

/**
 * Tokenizes an editorial statement into individual words tagged with whether they
 * belong to one of the highlighted bold phrases (preserving punctuation and zero
 * manual line breaks for scroll-linked word reveals).
 */
export function tokenizeStatement(
  text: string,
  boldPhrases: readonly string[]
): StatementWordToken[] {
  const ranges: Array<[number, number]> = [];
  for (const phrase of boldPhrases) {
    if (!phrase) continue;
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(phrase, searchFrom);
      if (idx === -1) break;
      ranges.push([idx, idx + phrase.length]);
      searchFrom = idx + phrase.length;
    }
  }

  const tokens: StatementWordToken[] = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    // Strip trailing punctuation when testing bold range overlap
    const coreEnd = start + match[0].replace(/[.,:;!?]+$/, '').length;
    const isBold = ranges.some(
      ([rStart, rEnd]) => start >= rStart && coreEnd <= rEnd && coreEnd > start
    );
    tokens.push({ word: match[0], bold: isBold });
  }

  return tokens;
}

/**
 * Cyclic next/previous index navigation across the projects list.
 */
export function getAdjacentProjectIndex(
  currentIndex: number,
  delta: number,
  total: number
): number {
  if (total <= 0) return -1;
  return ((currentIndex + delta) % total + total) % total;
}

/**
 * Scales cursor particle spawn count (3..6) with pointer velocity (px/ms).
 */
export function computeBurstCountForSpeed(speedPxPerMs: number): number {
  if (!Number.isFinite(speedPxPerMs) || speedPxPerMs <= 0.35) return 3;
  if (speedPxPerMs <= 0.85) return 4;
  if (speedPxPerMs <= 1.5) return 5;
  return 6;
}

/**
 * Clamps scroll-velocity gallery skew strictly within [-maxDeg, +maxDeg] (max 1.5deg per Part H.8).
 */
export function computeVelocitySkew(
  velocityPxPerFrame: number,
  maxDeg: number,
  reducedMotion: boolean
): number {
  if (reducedMotion || !Number.isFinite(velocityPxPerFrame)) return 0;
  const raw = velocityPxPerFrame * 0.04;
  const clamped = Math.max(-maxDeg, Math.min(maxDeg, raw));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Computes exact fit-to-width font size given measured text width at a known reference size.
 */
export function computeFitFontSize(
  containerWidth: number,
  measuredWidthAtRef: number,
  refFontSize: number,
  minPx: number,
  maxPx: number
): number {
  if (containerWidth <= 0 || measuredWidthAtRef <= 0 || refFontSize <= 0) {
    return minPx;
  }
  const exact = (containerWidth / measuredWidthAtRef) * refFontSize;
  return Math.round(Math.max(minPx, Math.min(maxPx, exact)) * 100) / 100;
}

/**
 * Distance-gated spawning check for the desktop ASCII cursor trail.
 */
export function shouldSpawnCursorParticle(
  lastX: number,
  lastY: number,
  nextX: number,
  nextY: number,
  minDistancePx: number
): boolean {
  const dx = nextX - lastX;
  const dy = nextY - lastY;
  return Math.hypot(dx, dy) >= minDistancePx;
}

/**
 * Caps live cursor particle list to `maxCount` by retaining the newest particles.
 */
export function trimParticles<T>(particles: readonly T[], maxCount: number): T[] {
  if (maxCount <= 0) return [];
  if (particles.length <= maxCount) return [...particles];
  return particles.slice(particles.length - maxCount);
}

/**
 * Distributes projects round-robin into N columns for staggered multi-column parallax.
 */
export interface IndexedProject {
  project: ProjectItem;
  index: number;
}

export function distributeProjectsIntoColumns(
  projects: readonly ProjectItem[],
  columnCount: number
): IndexedProject[][] {
  const safeCols = Math.max(1, Math.floor(columnCount));
  const columns: IndexedProject[][] = Array.from({ length: safeCols }, () => []);
  projects.forEach((project, index) => {
    columns[index % safeCols].push({ project, index });
  });
  return columns;
}

/**
 * Maps typed ProjectAspectRatio (including 21/9) to Tailwind aspect-ratio utility class.
 */
export function getAspectClass(ratio: ProjectAspectRatio): string {
  switch (ratio) {
    case '1/1':
      return 'aspect-square';
    case '4/5':
      return 'aspect-[4/5]';
    case '16/9':
      return 'aspect-video';
    case '3/4':
      return 'aspect-[3/4]';
    case '16/10':
      return 'aspect-[16/10]';
    case '21/9':
      return 'aspect-[21/9]';
  }
}

export interface DetailRow {
  kind: 'single' | 'pair';
  items: ProjectDetailMedia[];
  topSpacingClass: string;
}

/**
 * Groups detail media items into editorial rows on desktop:
 * - `large` always renders as a full-width solo row
 * - Adjacent `medium` + `small`, `small` + `medium`, or `small` + `small` can pair side by side
 * - Preserves irregular spacing rhythm across rows
 */
export function groupDetailRows(details: readonly ProjectDetailMedia[]): DetailRow[] {
  const rows: DetailRow[] = [];
  const spacingCycle = [
    'mt-10 sm:mt-16',
    'mt-14 sm:mt-24',
    'mt-8 sm:mt-14',
    'mt-16 sm:mt-28',
  ];

  let i = 0;
  let rowIdx = 0;
  while (i < details.length) {
    const current = details[i];
    const next = details[i + 1];

    const canPair =
      next !== undefined &&
      current.size !== 'large' &&
      next.size !== 'large' &&
      !(current.size === 'medium' && next.size === 'medium') &&
      current.align !== 'center' &&
      next.align !== 'center';

    const topSpacingClass = rowIdx === 0 ? 'mt-0' : spacingCycle[rowIdx % spacingCycle.length];

    if (canPair && next) {
      rows.push({
        kind: 'pair',
        items: [current, next],
        topSpacingClass,
      });
      i += 2;
    } else {
      rows.push({
        kind: 'single',
        items: [current],
        topSpacingClass,
      });
      i += 1;
    }
    rowIdx += 1;
  }

  return rows;
}

/**
 * Computes maximum circular reveal radius from toggle coordinates to farthest viewport corner.
 */
export function computeMaxRevealRadius(
  originX: number,
  originY: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  const dx = Math.max(originX, viewportWidth - originX);
  const dy = Math.max(originY, viewportHeight - originY);
  return Math.hypot(dx, dy);
}

/**
 * Helper to generate deterministic, editorially varied placeholder detail images
 * (8–10 per project) so real URLs, captions, or videos can be swapped via data only.
 */
export function makePlaceholderDetails(
  projectId: string,
  count: number,
  titlePrefix: string
): ProjectDetailMedia[] {
  const blueprints: readonly {
    aspectRatio: ProjectAspectRatio;
    width: number;
    height: number;
    size: DetailSize;
    align: DetailAlign;
  }[] = [
    { aspectRatio: '16/9', width: 1600, height: 900, size: 'large', align: 'center' },
    { aspectRatio: '4/5', width: 1080, height: 1350, size: 'medium', align: 'left' },
    { aspectRatio: '1/1', width: 1200, height: 1200, size: 'small', align: 'right' },
    { aspectRatio: '21/9', width: 2100, height: 900, size: 'large', align: 'center' },
    { aspectRatio: '3/4', width: 1200, height: 1600, size: 'small', align: 'left' },
    { aspectRatio: '16/9', width: 1600, height: 900, size: 'medium', align: 'right' },
    { aspectRatio: '4/5', width: 1080, height: 1350, size: 'medium', align: 'center' },
    { aspectRatio: '1/1', width: 1200, height: 1200, size: 'small', align: 'left' },
    { aspectRatio: '3/4', width: 1200, height: 1600, size: 'small', align: 'right' },
    { aspectRatio: '21/9', width: 2100, height: 900, size: 'large', align: 'center' },
  ];

  const numericSeed = Math.max(0, parseInt(projectId, 10) || 0);
  const safeCount = Math.max(1, Math.min(12, Math.floor(count)));
  const results: ProjectDetailMedia[] = [];

  for (let i = 0; i < safeCount; i++) {
    // Rotate blueprint offset per project so every detail page has a distinct editorial rhythm
    const bp = blueprints[(i + numericSeed) % blueprints.length];
    const code = `A${i + 1}`;
    results.push({
      code,
      imageUrl: '',
      aspectRatio: bp.aspectRatio,
      width: bp.width,
      height: bp.height,
      size: bp.size,
      align: bp.align,
      alt: `${titlePrefix} detail plate ${code}`,
    });
  }

  return results;
}
