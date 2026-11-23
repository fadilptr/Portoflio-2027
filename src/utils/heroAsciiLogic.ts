export interface HeroAsciiConfig {
  readonly charPool: string;
  readonly minChars: number;
  readonly maxChars: number;
  readonly tickMsMin: number;
  readonly tickMsMax: number;
  readonly decayMs: number;
  readonly touchLitMs: number;
  readonly maxLit: number;
  readonly hitInset: number;
  readonly enableScrollMax: number;
  readonly trailSpawnFactor: number;
  readonly color: string;
}

export interface LetterBox {
  /** Global index 0..14 across GRAPHIC (0..6) and DESIGNER (7..14) */
  index: number;
  /** 0 = GRAPHIC, 1 = DESIGNER */
  wordIndex: 0 | 1;
  /** Character index inside the word's text node */
  charIndex: number;
  char: string;
  /** Cap-height box coordinates relative to headline wrapper */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Hit-test bounds relative to headline wrapper (x inset by hitInset, cap-top to baseline) */
  hitLeft: number;
  hitRight: number;
  hitTop: number;
  hitBottom: number;
  /** Clip-path hole bounds relative to the letter's own word <span> */
  holeLeft: number;
  holeTop: number;
  holeRight: number;
  holeBottom: number;
}

export interface ClipHoleRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LitLetterRoll {
  count: number;
  chars: string[];
  /** Distinct cell indices in 0..8 (used when count >= 2) */
  cells: number[];
}

export interface LitLetterState {
  letterIndex: number;
  hovered: boolean;
  litAtMs: number;
  expiresAtMs: number;
  nextTickAtMs: number;
  roll: LitLetterRoll;
}

export interface HeroAsciiStepResult {
  clipChanged: boolean;
  rerolledLetters: number[];
  removedLetters: number[];
}

/**
 * Hit-tests a pointer position (relative to the headline wrapper) against cached
 * letter hit boxes. Returns the matching letter index or -1 if none matched.
 */
export function hitTestLetterBoxes(
  boxes: readonly LetterBox[],
  localX: number,
  localY: number
): number {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (
      localX >= b.hitLeft &&
      localX <= b.hitRight &&
      localY >= b.hitTop &&
      localY <= b.hitBottom
    ) {
      return b.index;
    }
  }
  return -1;
}

/**
 * Picks `count` distinct cell indices from a 3x3 grid (0..8) using partial Fisher-Yates.
 */
export function pickDistinctCells(
  count: number,
  totalCells = 9,
  rng: () => number = Math.random
): number[] {
  const safeTotal = Math.max(1, totalCells);
  const safeCount = Math.max(0, Math.min(safeTotal, count));
  const pool = Array.from({ length: safeTotal }, (_, i) => i);
  for (let i = 0; i < safeCount; i++) {
    const j = i + Math.floor(rng() * (safeTotal - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, safeCount);
}

/**
 * Rolls a fresh ASCII glyph layout (1..5 chars + distinct 3x3 cell indices) for one letter.
 */
export function rollLetterAscii(
  config: Pick<HeroAsciiConfig, 'charPool' | 'minChars' | 'maxChars'>,
  rng: () => number = Math.random
): LitLetterRoll {
  const min = Math.max(1, config.minChars);
  const max = Math.max(min, config.maxChars);
  const count = min + Math.floor(rng() * (max - min + 1));
  const pool = config.charPool.length > 0 ? config.charPool : '#?@%&*+';
  const chars: string[] = [];
  for (let i = 0; i < count; i++) {
    chars.push(pool[Math.floor(rng() * pool.length)]);
  }
  const cells = count === 1 ? [4] : pickDistinctCells(count, 9, rng);
  return { count, chars, cells };
}

function nextTickInterval(
  config: Pick<HeroAsciiConfig, 'tickMsMin' | 'tickMsMax'>,
  rng: () => number
): number {
  const min = Math.max(16, config.tickMsMin);
  const max = Math.max(min, config.tickMsMax);
  return min + rng() * (max - min);
}

/**
 * Builds a CSS `clip-path: polygon(evenodd, ...)` string for a word span.
 * Uses a generous outer bleed rectangle so tight line-height glyph overhangs are
 * never clipped, and punches one rectangular hole per lit letter in that word.
 * Returns `''` when `holes` is empty so the headline renders with zero clip-path.
 */
export function buildEvenOddClipPath(
  spanWidth: number,
  spanHeight: number,
  holes: readonly ClipHoleRect[]
): string {
  if (holes.length === 0) return '';

  const bleedX = 48;
  const bleedY = 96;
  const ox0 = -bleedX;
  const oy0 = -bleedY;
  const ox1 = Math.ceil(spanWidth + bleedX);
  const oy1 = Math.ceil(spanHeight + bleedY);

  // Outer clockwise rectangle + bridge back to origin before each hole subpath
  const pts: string[] = [
    `${ox0}px ${oy0}px`,
    `${ox1}px ${oy0}px`,
    `${ox1}px ${oy1}px`,
    `${ox0}px ${oy1}px`,
    `${ox0}px ${oy0}px`,
  ];

  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    const x0 = h.left.toFixed(1);
    const y0 = h.top.toFixed(1);
    const x1 = h.right.toFixed(1);
    const y1 = h.bottom.toFixed(1);
    // Walk to hole corner, trace hole rectangle, return to outer origin so evenodd
    // carves a clean zero-width-bridge cutout for each independent letter.
    pts.push(
      `${x0}px ${y0}px`,
      `${x0}px ${y1}px`,
      `${x1}px ${y1}px`,
      `${x1}px ${y0}px`,
      `${x0}px ${y0}px`,
      `${ox0}px ${oy0}px`
    );
  }

  return `polygon(evenodd, ${pts.join(', ')})`;
}

/**
 * Enforces the `maxLit` cap by dropping the oldest lit letter(s) first.
 */
function enforceMaxLit(
  litMap: Map<number, LitLetterState>,
  maxLit: number,
  removedLetters: number[]
): boolean {
  let dropped = false;
  while (litMap.size > maxLit) {
    let oldestKey: number | null = null;
    let oldestTime = Infinity;
    for (const [key, state] of litMap.entries()) {
      if (state.litAtMs < oldestTime) {
        oldestTime = state.litAtMs;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    litMap.delete(oldestKey);
    removedLetters.push(oldestKey);
    dropped = true;
  }
  return dropped;
}

/**
 * Lights a letter from a touch tap for `config.touchLitMs` (~500ms).
 */
export function triggerTouchLitLetter(
  litMap: Map<number, LitLetterState>,
  letterIndex: number,
  nowMs: number,
  config: HeroAsciiConfig,
  rng: () => number = Math.random
): HeroAsciiStepResult {
  const removedLetters: number[] = [];
  const rerolledLetters: number[] = [];
  let clipChanged = false;

  const existing = litMap.get(letterIndex);
  if (existing) {
    existing.hovered = false;
    existing.litAtMs = nowMs;
    existing.expiresAtMs = nowMs + config.touchLitMs;
    existing.roll = rollLetterAscii(config, rng);
    existing.nextTickAtMs = nowMs + nextTickInterval(config, rng);
    rerolledLetters.push(letterIndex);
  } else {
    litMap.set(letterIndex, {
      letterIndex,
      hovered: false,
      litAtMs: nowMs,
      expiresAtMs: nowMs + config.touchLitMs,
      nextTickAtMs: nowMs + nextTickInterval(config, rng),
      roll: rollLetterAscii(config, rng),
    });
    clipChanged = true;
    rerolledLetters.push(letterIndex);
    if (enforceMaxLit(litMap, config.maxLit, removedLetters)) {
      clipChanged = true;
    }
  }

  return { clipChanged, rerolledLetters, removedLetters };
}

/**
 * Advances the independent per-letter hover, wake decay, maxLit cap, and random
 * flicker ticks inside the single shared animation loop.
 */
export function stepHeroAsciiState(
  litMap: Map<number, LitLetterState>,
  hoveredIndex: number,
  nowMs: number,
  config: HeroAsciiConfig,
  rng: () => number = Math.random
): HeroAsciiStepResult {
  const removedLetters: number[] = [];
  const rerolledLetters: number[] = [];
  let clipChanged = false;

  // 1. Any previously hovered letter that is no longer under the pointer enters decay
  for (const state of litMap.values()) {
    if (state.hovered && state.letterIndex !== hoveredIndex) {
      state.hovered = false;
      state.expiresAtMs = nowMs + config.decayMs;
    }
  }

  // 2. Activate or sustain the currently hovered letter
  if (hoveredIndex >= 0) {
    const existing = litMap.get(hoveredIndex);
    if (existing) {
      existing.hovered = true;
      existing.expiresAtMs = Infinity;
    } else {
      litMap.set(hoveredIndex, {
        letterIndex: hoveredIndex,
        hovered: true,
        litAtMs: nowMs,
        expiresAtMs: Infinity,
        nextTickAtMs: nowMs + nextTickInterval(config, rng),
        roll: rollLetterAscii(config, rng),
      });
      clipChanged = true;
      rerolledLetters.push(hoveredIndex);
      if (enforceMaxLit(litMap, config.maxLit, removedLetters)) {
        clipChanged = true;
      }
    }
  }

  // 3. Expire decayed letters
  for (const [key, state] of litMap.entries()) {
    if (!state.hovered && nowMs >= state.expiresAtMs) {
      litMap.delete(key);
      removedLetters.push(key);
      clipChanged = true;
    }
  }

  // 4. Re-roll ASCII glyphs only for lit letters whose independent tick interval elapsed
  for (const [key, state] of litMap.entries()) {
    if (nowMs >= state.nextTickAtMs) {
      state.roll = rollLetterAscii(config, rng);
      state.nextTickAtMs = nowMs + nextTickInterval(config, rng);
      if (!rerolledLetters.includes(key)) {
        rerolledLetters.push(key);
      }
    }
  }

  return { clipChanged, rerolledLetters, removedLetters };
}
