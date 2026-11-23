/**
 * ============================================================================
 * EDITABLE CONSTANTS — EDIT THIS FILE TO CUSTOMIZE YOUR PORTFOLIO
 * ============================================================================
 * 1. `HERO_ASCII`         -> Hero GRAPHIC / DESIGNER interactive ASCII tunables
 * 2. `EMAIL`              -> Your email address (WORK footer & Contact page)
 * 3. `LINKEDIN_URL`       -> Your LinkedIn profile URL
 * 4. `RESUME_URL`         -> Optional CV PDF path (empty = hides > CV row)
 * 5. `AVAILABILITY`       -> Contact page status line
 * 6. `LOGO_GLB_URL`       -> Optional 3D .glb logo path in /public/models/
 * 7. `PROFILE_PHOTO_URL`  -> Portrait photo URL (1200x1500) on Profile page
 * 8. `PROFILE_CONFIG`     -> All Profile page copy, statements, and spec table
 * 9. `PORTFOLIO_CONFIG.projects` -> Your 12+ projects & 8–10 detail plates
 * 10. Areal font files in `/public/fonts/` (declared in `src/index.css` & `index.html`):
 *      - `/public/fonts/Areal-Regular.woff2` (400)
 *      - `/public/fonts/Areal-Medium.woff2`  (500)
 *      - `/public/fonts/Areal-Bold.woff2`    (700, preloaded for hero headline)
 * ============================================================================
 */

import { makePlaceholderDetails } from '../utils/portfolioLogic';

/** Tunables for the interactive ASCII letter hover/tap effect on the WORK hero headline */
export const HERO_ASCII = {
  charPool: '#?@%&*+/\\<>{}[]= ~^!;0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.replace(
    ' ',
    ''
  ),
  minChars: 1,
  maxChars: 5,
  tickMsMin: 70,
  tickMsMax: 120,
  decayMs: 350,
  touchLitMs: 500,
  maxLit: 3,
  hitInset: 0.06,
  enableScrollMax: 16,
  trailSpawnFactor: 0.4,
  color: 'var(--accent)',
} as const;

/** REPLACE with my real email (shared by WORK footer and Contact page) */
export const EMAIL = 'hello@fadilmaulanaputra.com';

/** LinkedIn profile URL */
export const LINKEDIN_URL = 'https://www.linkedin.com/in/fadilmaulanaputra/';

/** Optional PDF download URL for Contact page `> CV` row (empty hides row) */
export const RESUME_URL = '';

/** Contact page availability status line */
export const AVAILABILITY = 'STATUS: OPEN TO NEW OPPORTUNITIES';

/** put my .glb in /public/models/logo.glb and set this to /models/logo.glb */
export const LOGO_GLB_URL = '';

/** Portrait photo URL for Profile page (1200x1500); empty shows "DROP IMAGE HERE" */
export const PROFILE_PHOTO_URL = '';

export type ProjectCategory =
  | 'MOTION'
  | 'SOCIAL'
  | 'BRANDING'
  | 'LAYOUT'
  | 'PACKAGING'
  | 'ILLUSTRATION';

export type ProjectAspectRatio = '1/1' | '4/5' | '16/9' | '3/4' | '16/10' | '21/9';
export type DetailSize = 'large' | 'medium' | 'small';
export type DetailAlign = 'left' | 'center' | 'right';

export interface ProjectDetailMedia {
  /** Detail frame index, e.g. "A1", "A2", ... "A10" */
  code: string;
  /** Paste detail image URL here, or leave "" for neutral crosshair placeholder */
  imageUrl: string;
  /** Natural aspect ratio of the detail asset */
  aspectRatio: ProjectAspectRatio;
  /** Intrinsic pixel width & height to prevent layout shift */
  width: number;
  height: number;
  /** Editorial width weight on desktop: large (~100%), medium (~58%), small (~33%) */
  size: DetailSize;
  /** Horizontal placement on desktop: left, center, or right */
  align: DetailAlign;
  /** Accessible alt text */
  alt: string;
  /** Optional video URL for motion breakdowns */
  videoUrl?: string;
  /** Optional short caption below the detail image */
  caption?: string;
}

export interface ProjectItem {
  /** Two-digit display index, e.g. "01" */
  id: string;
  /** Project title shown on hover, detail page, and next-project link */
  title: string;
  /** Monospace category tag, rendered as [CATEGORY] */
  category: ProjectCategory;
  /** Completion year */
  year: string;
  /** Visual frame proportion */
  aspectRatio: ProjectAspectRatio;
  /** Intrinsic width & height (prevents layout shift when real images load) */
  width: number;
  height: number;
  /** Accessible alt text describing the artwork */
  alt: string;
  /**
   * >>> PASTE PROJECT COVER IMAGE URL HERE <<<
   * Leave as "" to display the neutral gray crosshair placeholder.
   */
  imageUrl: string;
  /** Optional muted hover-preview video URL for [MOTION] projects */
  videoUrl?: string;
  /** Short project overview displayed on the project detail view */
  description: string;
  /** Software and tools used (e.g. ['Photoshop', 'After Effects']) */
  tools: readonly string[];
  /** Your role on the project */
  role: string;
  /** 8–10 editorial detail images (A1..A10) on the project detail view */
  details: readonly ProjectDetailMedia[];
}

export interface PortfolioConfig {
  name: string;
  shortName: string;
  location: string;
  copyrightYear: number;
  introSubline: string;
  expertise: readonly string[];
  contact: {
    /** >>> EDIT YOUR EMAIL ADDRESS HERE <<< */
    emailAddress: string;
    emailLabel: string;
    /** >>> EDIT YOUR LINKEDIN URL HERE <<< */
    linkedinUrl: string;
    linkedinHandle: string;
  };
  projects: readonly ProjectItem[];
}

export const PORTFOLIO_CONFIG: PortfolioConfig = {
  name: 'Fadil Maulana Putra',
  shortName: 'FADIL M. PUTRA',
  location: 'Bekasi, Indonesia',
  copyrightYear: 2027,

  introSubline: 'AND MOTION DESIGNER, STATIC AND MOVING IMAGE',

  expertise: [
    'Brand Content',
    'Social Media Design',
    'Motion Graphics',
    'Packaging',
    'Illustration',
    'Branding',
  ],

  contact: {
    // >>> EDIT `EMAIL` ABOVE <<<
    emailAddress: EMAIL,
    emailLabel: "EMAIL, LET'S WORK TOGETHER",
    // >>> EDIT `LINKEDIN_URL` ABOVE <<<
    linkedinUrl: LINKEDIN_URL,
    linkedinHandle: 'LINKEDIN.COM/IN/FADILMAULANAPUTRA',
  },

  /**
   * ==========================================================================
   * SELECTED WORK — 12 PROJECT SLOTS WITH 8–10 VARIED DETAIL IMAGES EACH
   * ==========================================================================
   */
  projects: [
    {
      id: '01',
      title: 'KINETIC TYPE REEL',
      category: 'MOTION',
      year: '2027',
      aspectRatio: '16/9',
      width: 1600,
      height: 900,
      alt: 'Kinetic Type Reel 2027 motion design showcase frame',
      imageUrl: '',
      videoUrl: '',
      description:
        'A rhythm-driven kinetic typography reel exploring modular grids, optical velocity, and sharp typographic cuts built for digital campaigns and broadcast stings.',
      tools: ['After Effects', 'Illustrator', 'Premiere Pro'],
      role: 'Motion Designer & Art Direction',
      details: makePlaceholderDetails('01', 9, 'Kinetic Type Reel'),
    },
    {
      id: '02',
      title: 'KALA ROASTERY IDENTITY',
      category: 'BRANDING',
      year: '2027',
      aspectRatio: '16/10',
      width: 1600,
      height: 1000,
      alt: 'Kala Roastery brand identity system overview',
      imageUrl: '',
      description:
        'Complete visual identity for an independent Jakarta-Bekasi specialty coffee roaster, anchored by utilitarian stencil typography and tactile uncoated print collateral.',
      tools: ['Illustrator', 'Photoshop', 'InDesign'],
      role: 'Brand Designer',
      details: makePlaceholderDetails('02', 10, 'Kala Roastery Identity'),
    },
    {
      id: '03',
      title: 'BEKASI ZINE ISSUE 04',
      category: 'LAYOUT',
      year: '2026',
      aspectRatio: '3/4',
      width: 1200,
      height: 1600,
      alt: 'Bekasi Zine Issue 04 editorial book cover layout',
      imageUrl: '',
      description:
        'Independent 84-page cultural publication documenting commuter architecture and night markets across eastern Greater Jakarta using a strict Swiss 6-column baseline grid.',
      tools: ['InDesign', 'Photoshop', 'Lightroom'],
      role: 'Editorial & Layout Designer',
      details: makePlaceholderDetails('03', 8, 'Bekasi Zine Issue 04'),
    },
    {
      id: '04',
      title: 'NOCTURNE AUDIO CAMPAIGN',
      category: 'SOCIAL',
      year: '2027',
      aspectRatio: '4/5',
      width: 1080,
      height: 1350,
      alt: 'Nocturne Audio social campaign feed series',
      imageUrl: '',
      description:
        'Modular social media launch suite for a boutique audio hardware startup, balancing crisp macro product framing with bold technical callouts across feed and story formats.',
      tools: ['Photoshop', 'After Effects', 'Figma'],
      role: 'Social & Motion Designer',
      details: makePlaceholderDetails('04', 9, 'Nocturne Audio Campaign'),
    },
    {
      id: '05',
      title: 'MONOLITH ARCHIVE SERIES',
      category: 'ILLUSTRATION',
      year: '2026',
      aspectRatio: '1/1',
      width: 1200,
      height: 1200,
      alt: 'Monolith Archive square geometric illustration set',
      imageUrl: '',
      description:
        'A 12-piece geometric vector illustration series translating brutalist concrete forms into stark halftone compositions for digital editorial features and limited screenprints.',
      tools: ['Illustrator', 'Photoshop'],
      role: 'Illustrator',
      details: makePlaceholderDetails('05', 8, 'Monolith Archive Series'),
    },
    {
      id: '06',
      title: 'TERRAIN BOTANICAL TIN',
      category: 'PACKAGING',
      year: '2026',
      aspectRatio: '4/5',
      width: 1080,
      height: 1350,
      alt: 'Terrain Botanical minimalist packaging design',
      imageUrl: '',
      description:
        'Refillable aluminum canister and outer carton system for a small-batch herbal tea brand, designed with color-coded botanical indices and tactile blind debossing.',
      tools: ['Illustrator', 'Photoshop', 'Dimension'],
      role: 'Packaging Designer',
      details: makePlaceholderDetails('06', 9, 'Terrain Botanical Tin'),
    },
    {
      id: '07',
      title: 'SIGNAL FESTIVAL TITLES',
      category: 'MOTION',
      year: '2026',
      aspectRatio: '16/9',
      width: 1600,
      height: 900,
      alt: 'Signal Festival opening title motion graphics sequence',
      imageUrl: '',
      videoUrl: '',
      description:
        '45-second stage opening titles and LED backdrop loops for an annual design & sound festival, combining crisp scanline transitions with oversized variable typography.',
      tools: ['After Effects', 'Cinema 4D', 'Illustrator'],
      role: 'Lead Motion Designer',
      details: makePlaceholderDetails('07', 10, 'Signal Festival Titles'),
    },
    {
      id: '08',
      title: 'SOLA ARCHITECTURE MONOGRAPH',
      category: 'LAYOUT',
      year: '2026',
      aspectRatio: '3/4',
      width: 1200,
      height: 1600,
      alt: 'Sola Architecture printed monograph spread and cover',
      imageUrl: '',
      description:
        'Hardcover retrospective monograph for an architectural studio, pairing architectural blueprints and daylight photography with disciplined typographic pacing.',
      tools: ['InDesign', 'Photoshop', 'Illustrator'],
      role: 'Publication Designer',
      details: makePlaceholderDetails('08', 8, 'Sola Architecture Monograph'),
    },
    {
      id: '09',
      title: 'FORMA STUDIO SYSTEM',
      category: 'BRANDING',
      year: '2025',
      aspectRatio: '16/10',
      width: 1600,
      height: 1000,
      alt: 'Forma Studio visual identity and grid guidelines',
      imageUrl: '',
      description:
        'B2B brand refresh and modular design guidelines for a digital product engineering studio, built to scale effortlessly across pitch decks, web UI, and print.',
      tools: ['Figma', 'Illustrator', 'InDesign'],
      role: 'Visual Identity Designer',
      details: makePlaceholderDetails('09', 9, 'Forma Studio System'),
    },
    {
      id: '10',
      title: 'PULSE DROP CAROUSEL',
      category: 'SOCIAL',
      year: '2026',
      aspectRatio: '1/1',
      width: 1200,
      height: 1200,
      alt: 'Pulse Drop social media typography carousel',
      imageUrl: '',
      description:
        'High-conversion B2C social content system for a streetwear capsule release, designed around seamless panoramic carousel swipes and kinetic type teasers.',
      tools: ['Photoshop', 'Illustrator', 'After Effects'],
      role: 'Graphic & Social Designer',
      details: makePlaceholderDetails('10', 8, 'Pulse Drop Carousel'),
    },
    {
      id: '11',
      title: 'SORA MATCHA CANISTER',
      category: 'PACKAGING',
      year: '2025',
      aspectRatio: '4/5',
      width: 1080,
      height: 1350,
      alt: 'Sora Matcha cylindrical tin packaging artwork',
      imageUrl: '',
      description:
        'Minimalist cylindrical tin and tasting card system for ceremonial-grade matcha, emphasizing quiet off-white paper stocks and crisp origin typography.',
      tools: ['Illustrator', 'Photoshop'],
      role: 'Packaging & Print Designer',
      details: makePlaceholderDetails('11', 9, 'Sora Matcha Canister'),
    },
    {
      id: '12',
      title: 'SYNTHESIS BROADCAST ID',
      category: 'MOTION',
      year: '2025',
      aspectRatio: '16/9',
      width: 1600,
      height: 900,
      alt: 'Synthesis Broadcast animated channel identity loop',
      imageUrl: '',
      videoUrl: '',
      description:
        'Broadcast bumper package and modular on-air graphic toolkit for an independent digital radio channel, pairing monospace telemetry cues with crisp frame-rate contrasts.',
      tools: ['After Effects', 'Premiere Pro', 'Illustrator'],
      role: 'Motion Graphics Designer',
      details: makePlaceholderDetails('12', 10, 'Synthesis Broadcast ID'),
    },
  ],
};

export interface ProfileStatement {
  code: string;
  label: string;
  text: string;
  boldPhrases: readonly string[];
  align: 'left' | 'offset';
}

export interface ProfileExperienceRow {
  period: string;
  company: string;
  role: string;
  type: string;
}

export interface ProfileConfig {
  logoMarkLabel: string;
  dragCueLabel: string;
  scrollCueLabel: string;
  statements: readonly ProfileStatement[];
  photo: {
    url: string;
    alt: string;
    dimensionsLabel: string;
  };
  principles: readonly string[];
  principlesSubline: string;
  experience: readonly ProfileExperienceRow[];
  education: {
    period: string;
    institution: string;
    degree: string;
  };
  certifications: readonly string[];
  designSkills: readonly string[];
  tools: readonly string[];
  aiTools: readonly string[];
}

export const PROFILE_CONFIG: ProfileConfig = {
  logoMarkLabel: '[F] LOGO MARK',
  dragCueLabel: 'DRAG TO ROTATE',
  scrollCueLabel: 'SCROLL',

  statements: [
    {
      code: '[01] WHO',
      label: 'WHO',
      text: "I'm Fadil, a graphic and motion designer from Bekasi, Indonesia. Two years of internships and freelance work for corporate and startup brands, B2B and B2C.",
      boldPhrases: ['graphic and motion designer', 'Bekasi', 'B2B and B2C'],
      align: 'left',
    },
    {
      code: '[02] WHY',
      label: 'WHY',
      // DRAFT — replace with my real story
      text: 'Visual Communication Design gave me the craft. Motion infographics, like my final project on Museum Trinil and the early humans of Java, showed me what I enjoy most: making a complex story clear in a few seconds.',
      boldPhrases: [
        'Visual Communication Design',
        'Museum Trinil',
        'clear in a few seconds',
      ],
      align: 'offset',
    },
  ],

  photo: {
    url: PROFILE_PHOTO_URL,
    alt: 'Portrait of Fadil Maulana Putra, graphic and motion designer from Bekasi, Indonesia',
    dimensionsLabel: '1200×1500',
  },

  principles: [
    '[01] ALIGN ON REFERENCES BEFORE DESIGNING.',
    '[02] BUILD REUSABLE TEMPLATES, KEEP REVISIONS LOW.',
  ],
  principlesSubline:
    'ADOBE CREATIVE SUITE AND FIGMA, WITH AI TOOLS TO SPEED UP PRODUCTION.',

  experience: [
    {
      period: 'SEPT 2026 - PRESENT',
      company: 'HIMALAYA WELLNESS INDONESIA',
      role: 'E-COMMERCE GRAPHIC DESIGNER',
      type: 'INTERNSHIP',
    },
    {
      period: 'FEB - MAY 2026',
      company: 'DIBIMBING',
      role: 'GRAPHIC DESIGNER',
      type: 'INTERNSHIP',
    },
    {
      period: 'JUL - DEC 2025',
      company: 'SUMMARECON AGUNG',
      role: 'GRAPHIC DESIGNER',
      type: 'INTERNSHIP',
    },
    {
      period: 'JUL 2023 - SEPT 2024',
      company: 'TAKO.ID',
      role: 'GRAPHIC DESIGNER',
      type: 'FREELANCE',
    },
  ],

  education: {
    period: 'SEPT 2022 - SEPT 2026',
    institution: 'UNIVERSITAS INDRAPRASTA PGRI',
    degree: 'VISUAL COMMUNICATION DESIGN',
  },

  certifications: [
    'ADOBE GRAPHIC DESIGNER: DESIGN THAT DEMANDS ATTENTION',
    'GOOGLE UX DESIGN',
  ],

  designSkills: [
    'BRAND CONTENT',
    'SOCIAL MEDIA DESIGN',
    'MOTION GRAPHICS',
    'VIDEO AND PHOTOGRAPHY',
    'PACKAGING',
    'ILLUSTRATION',
    'BRANDING',
  ],

  tools: [
    'PHOTOSHOP',
    'ILLUSTRATOR',
    'AFTER EFFECTS',
    'PREMIERE PRO',
    'INDESIGN',
    'SUBSTANCE',
    'FIGMA',
    'CANVA',
  ],

  aiTools: ['CHATGPT', 'CLAUDE', 'GEMINI', 'HIGHSFIELD', 'MAGNIFIC'],
};
