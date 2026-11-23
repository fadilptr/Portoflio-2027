/**
 * Areal (Dinamo) font file list in `/public/fonts/`.
 * Option A (static per-weight woff2 files — active):
 *   - /public/fonts/Areal-Regular.woff2 (weight 400)
 *   - /public/fonts/Areal-Medium.woff2  (weight 500)
 *   - /public/fonts/Areal-Bold.woff2    (weight 700)
 */
export const AREAL_FONT_FILES = {
  regular: '/fonts/Areal-Regular.woff2',
  medium: '/fonts/Areal-Medium.woff2',
  bold: '/fonts/Areal-Bold.woff2',
} as const;

let cachedArealReadyPromise: Promise<boolean> | null = null;

/**
 * Waits for Areal (`700 100px "Areal"`, `400 100px "Areal"`, and `document.fonts.ready`)
 * with a strict timeout (default 3000ms). If Areal fails to load or times out,
 * resolves gracefully so fit-to-width continues with the fallback stack and can
 * still re-measure if a font finishes loading later.
 */
export function waitForArealFont(timeoutMs = 3000): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return Promise.resolve(false);
  }

  if (cachedArealReadyPromise) {
    return cachedArealReadyPromise;
  }

  cachedArealReadyPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (loadedAreal: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(loadedAreal);
    };

    const timer = window.setTimeout(() => {
      finish(false);
    }, timeoutMs);

    const loads = Promise.allSettled([
      document.fonts.load('700 100px "Areal"'),
      document.fonts.load('400 100px "Areal"'),
      document.fonts.ready,
    ]);

    loads
      .then((results) => {
        const boldResult = results[0];
        const loadedBold =
          boldResult.status === 'fulfilled' && boldResult.value.length > 0;
        finish(loadedBold);
      })
      .catch(() => {
        finish(false);
      });
  });

  return cachedArealReadyPromise;
}
