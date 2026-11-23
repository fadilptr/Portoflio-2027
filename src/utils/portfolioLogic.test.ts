import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageHash,
  buildWorkHash,
  computeBurstCountForSpeed,
  computeFitFontSize,
  computeMaxRevealRadius,
  computeVelocitySkew,
  createQualityMonitorState,
  distributeProjectsIntoColumns,
  formatAsciiProgress,
  getAdjacentProjectIndex,
  getPageDocumentTitle,
  groupDetailRows,
  makePlaceholderDetails,
  parseAppHash,
  parseWorkHash,
  resolveActiveSection,
  shouldSpawnCursorParticle,
  stepQualityMonitor,
  tokenizeStatement,
  trimParticles,
} from './portfolioLogic';
import {
  AVAILABILITY,
  EMAIL,
  HERO_ASCII,
  LINKEDIN_URL,
  PORTFOLIO_CONFIG,
  PROFILE_CONFIG,
  RESUME_URL,
} from '../config/portfolio';
import {
  buildEvenOddClipPath,
  hitTestLetterBoxes,
  pickDistinctCells,
  stepHeroAsciiState,
  triggerTouchLitLetter,
  type LetterBox,
  type LitLetterState,
} from './heroAsciiLogic';

test('resolveActiveSection selects profile, work, and contact accurately with scroll', () => {
  const sections = [
    { id: 'profile' as const, top: 0, height: 1800 },
    { id: 'work' as const, top: 1800, height: 2400 },
    { id: 'contact' as const, top: 4200, height: 700 },
  ];

  assert.equal(resolveActiveSection(sections, 0, 900, 4900), 'profile');
  assert.equal(resolveActiveSection(sections, 1600, 900, 4900), 'work');
  assert.equal(resolveActiveSection(sections, 4000, 900, 4900), 'contact');
});

test('formatAsciiProgress renders ASCII bar and respects 100% completion and reducedMotion', () => {
  const done = formatAsciiProgress(100, 14, 7, false);
  assert.equal(done.bar, '[##############]');
  assert.equal(done.digits, '100%');

  const midReduced = formatAsciiProgress(62, 14, 5, true);
  assert.equal(midReduced.digits, '062%');
});

test('parseWorkHash and buildWorkHash round-trip project routes cleanly', () => {
  assert.equal(parseWorkHash('#/work/01'), '01');
  assert.equal(parseWorkHash('#/work/12/'), '12');
  assert.equal(parseWorkHash('#work'), null);
  assert.equal(buildWorkHash('07'), '#/work/07');
});

test('parseAppHash, buildPageHash, and getPageDocumentTitle handle 3-page routing cleanly', () => {
  assert.deepEqual(parseAppHash(''), { page: 'work', projectId: null });
  assert.deepEqual(parseAppHash('#/work'), { page: 'work', projectId: null });
  assert.deepEqual(parseAppHash('#/work/04'), { page: 'work', projectId: '04' });
  assert.deepEqual(parseAppHash('#/profile'), { page: 'profile', projectId: null });
  assert.deepEqual(parseAppHash('#/contact/'), { page: 'contact', projectId: null });
  assert.deepEqual(parseAppHash('#/unknown'), { page: 'work', projectId: null });

  assert.equal(buildPageHash('work'), '#/work');
  assert.equal(buildPageHash('work', '03'), '#/work/03');
  assert.equal(buildPageHash('profile'), '#/profile');
  assert.equal(buildPageHash('contact'), '#/contact');

  assert.equal(getPageDocumentTitle('work'), 'Fadil Maulana Putra, Work');
  assert.equal(getPageDocumentTitle('profile'), 'Fadil Maulana Putra, Profile');
  assert.equal(getPageDocumentTitle('contact'), 'Fadil Maulana Putra, Contact');
});

test('tokenizeStatement tags bold phrases accurately while preserving punctuation', () => {
  const tokens = tokenizeStatement(
    PROFILE_CONFIG.statements[0].text,
    PROFILE_CONFIG.statements[0].boldPhrases
  );
  const boldWords = tokens.filter((t) => t.bold).map((t) => t.word);
  assert.ok(boldWords.includes('graphic'));
  assert.ok(boldWords.includes('motion'));
  assert.ok(boldWords.includes('designer'));
  assert.ok(boldWords.includes('Bekasi,'));
  assert.ok(boldWords.includes('B2B'));
  assert.ok(boldWords.includes('B2C.'));
  assert.equal(tokens.find((t) => t.word === "I'm")?.bold, false);
});

test('computeFitFontSize scales accurately to container width within bounds', () => {
  assert.equal(computeFitFontSize(1000, 500, 100, 20, 400), 200);
  assert.equal(computeFitFontSize(100, 500, 100, 32, 400), 32);
  assert.equal(computeFitFontSize(3000, 500, 100, 20, 360), 360);
});

test('computeVelocitySkew clamps within 1.5deg and disables on reducedMotion', () => {
  assert.equal(computeVelocitySkew(100, 1.5, false), 1.5);
  assert.equal(computeVelocitySkew(-100, 1.5, false), -1.5);
  assert.equal(computeVelocitySkew(20, 1.5, false), 0.8);
  assert.equal(computeVelocitySkew(100, 1.5, true), 0);
});

test('stepQualityMonitor steps down after 1.5s below 45fps and respects 10s cooldown', () => {
  let state = createQualityMonitorState();
  // Simulate 1.6s of 30fps (33.3ms frames) while scrolling
  let now = 0;
  for (let i = 0; i < 48; i++) {
    now += 34;
    state = stepQualityMonitor(state, 34, now, true);
  }
  assert.equal(state.tier, 1);

  // Another 2s of slow frames within the 10s cooldown must NOT step down again
  for (let i = 0; i < 60; i++) {
    now += 34;
    state = stepQualityMonitor(state, 34, now, true);
  }
  assert.equal(state.tier, 1);

  // Advance past 10s cooldown and sustain slow frames for 1.5s -> tier 2
  now += 10500;
  for (let i = 0; i < 48; i++) {
    now += 34;
    state = stepQualityMonitor(state, 34, now, true);
  }
  assert.equal(state.tier, 2);
});

test('cursor burst scaling, distance gate, and 250 cap', () => {
  assert.equal(computeBurstCountForSpeed(0.1), 3);
  assert.equal(computeBurstCountForSpeed(0.6), 4);
  assert.equal(computeBurstCountForSpeed(1.2), 5);
  assert.equal(computeBurstCountForSpeed(3.0), 6);
  assert.equal(shouldSpawnCursorParticle(0, 0, 10, 0, 18), false);
  assert.equal(shouldSpawnCursorParticle(0, 0, 20, 0, 18), true);
  assert.equal(trimParticles(Array.from({ length: 300 }, (_, i) => i), 250).length, 250);
  assert.equal(getAdjacentProjectIndex(11, 1, 12), 0);
  assert.equal(Math.round(computeMaxRevealRadius(0, 0, 300, 400)), 500);
});

test('all 12 projects and profile/contact constants are configured accurately', () => {
  assert.ok(PORTFOLIO_CONFIG.projects.length >= 12);
  assert.equal(distributeProjectsIntoColumns(PORTFOLIO_CONFIG.projects, 3).flat().length, 12);

  for (const project of PORTFOLIO_CONFIG.projects) {
    assert.ok(
      project.details.length >= 8 && project.details.length <= 10,
      `project ${project.id} should have 8-10 details, got ${project.details.length}`
    );
    const rows = groupDetailRows(project.details);
    const flattened = rows.flatMap((r) => r.items);
    assert.equal(flattened.length, project.details.length);
    assert.ok(rows.some((r) => r.kind === 'pair'), `project ${project.id} should have at least one paired row`);
  }

  const sample = makePlaceholderDetails('01', 9, 'Test');
  assert.equal(sample[0].code, 'A1');
  assert.equal(sample[8].code, 'A9');
  assert.equal(EMAIL, PORTFOLIO_CONFIG.contact.emailAddress);
  assert.equal(LINKEDIN_URL, 'https://www.linkedin.com/in/fadilmaulanaputra/');
  assert.equal(RESUME_URL, '');
  assert.equal(AVAILABILITY, 'STATUS: OPEN TO NEW OPPORTUNITIES');
  assert.equal(PROFILE_CONFIG.experience.length, 4);
  assert.equal(PROFILE_CONFIG.certifications.length, 2);
  assert.equal(PROFILE_CONFIG.statements.length, 2);
});

test('HERO_ASCII config, hit-testing, evenodd clip-path, 3x3 cells, decay wake, maxLit=3, and touch 500ms', () => {
  assert.equal(HERO_ASCII.minChars, 1);
  assert.equal(HERO_ASCII.maxChars, 5);
  assert.equal(HERO_ASCII.tickMsMin, 70);
  assert.equal(HERO_ASCII.tickMsMax, 120);
  assert.equal(HERO_ASCII.decayMs, 350);
  assert.equal(HERO_ASCII.maxLit, 3);
  assert.equal(HERO_ASCII.hitInset, 0.06);
  assert.equal(HERO_ASCII.enableScrollMax, 16);
  assert.equal(HERO_ASCII.trailSpawnFactor, 0.4);
  assert.equal(HERO_ASCII.color, 'var(--accent)');

  const sampleBoxes: LetterBox[] = [
    {
      index: 0,
      wordIndex: 0,
      charIndex: 0,
      char: 'G',
      left: 0,
      top: 100,
      width: 100,
      height: 140,
      hitLeft: 6,
      hitRight: 94,
      hitTop: 100,
      hitBottom: 240,
      holeLeft: 4,
      holeTop: 0,
      holeRight: 96,
      holeBottom: 140,
    },
    {
      index: 1,
      wordIndex: 0,
      charIndex: 1,
      char: 'R',
      left: 100,
      top: 100,
      width: 100,
      height: 140,
      hitLeft: 106,
      hitRight: 194,
      hitTop: 100,
      hitBottom: 240,
      holeLeft: 104,
      holeTop: 0,
      holeRight: 196,
      holeBottom: 140,
    },
  ];

  // Inset boundary check: 3px inside letter 0 is outside 6% hitInset
  assert.equal(hitTestLetterBoxes(sampleBoxes, 3, 150), -1);
  assert.equal(hitTestLetterBoxes(sampleBoxes, 50, 150), 0);
  assert.equal(hitTestLetterBoxes(sampleBoxes, 150, 150), 1);

  // Evenodd clip-path returns '' when empty, valid polygon(evenodd, ...) when lit
  assert.equal(buildEvenOddClipPath(600, 180, []), '');
  const clip = buildEvenOddClipPath(600, 180, [
    { left: 4, top: 0, right: 96, bottom: 140 },
  ]);
  assert.ok(clip.startsWith('polygon(evenodd,'));

  // 3x3 cell picker produces unique indices in 0..8
  const cells = pickDistinctCells(5, 9);
  assert.equal(cells.length, 5);
  assert.equal(new Set(cells).size, 5);
  assert.ok(cells.every((c) => c >= 0 && c < 9));

  // Fast movement wake caps strictly at maxLit = 3 (dropping oldest) and decays after 350ms
  const litMap = new Map<number, LitLetterState>();
  const fixedRng = () => 0.5;
  stepHeroAsciiState(litMap, 0, 1000, HERO_ASCII, fixedRng);
  stepHeroAsciiState(litMap, 1, 1050, HERO_ASCII, fixedRng);
  stepHeroAsciiState(litMap, 2, 1100, HERO_ASCII, fixedRng);
  assert.equal(litMap.size, 3);
  const res4 = stepHeroAsciiState(litMap, 3, 1150, HERO_ASCII, fixedRng);
  assert.equal(litMap.size, 3);
  assert.deepEqual(res4.removedLetters, [0]); // oldest dropped
  assert.equal(litMap.has(0), false);
  assert.equal(litMap.has(3), true);

  // Pointer leaves at t=1200 -> letter 3 decays at t=1550
  stepHeroAsciiState(litMap, -1, 1200, HERO_ASCII, fixedRng);
  stepHeroAsciiState(litMap, -1, 1549, HERO_ASCII, fixedRng);
  assert.equal(litMap.has(3), true);
  stepHeroAsciiState(litMap, -1, 1551, HERO_ASCII, fixedRng);
  assert.equal(litMap.size, 0);

  // Touch tap lights a letter for 500ms
  triggerTouchLitLetter(litMap, 7, 2000, HERO_ASCII, fixedRng);
  assert.equal(litMap.has(7), true);
  stepHeroAsciiState(litMap, -1, 2499, HERO_ASCII, fixedRng);
  assert.equal(litMap.has(7), true);
  stepHeroAsciiState(litMap, -1, 2501, HERO_ASCII, fixedRng);
  assert.equal(litMap.has(7), false);
});
