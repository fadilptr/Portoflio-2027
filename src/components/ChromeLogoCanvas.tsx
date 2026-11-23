import { useEffect, useRef, useState } from 'react';
import { LOGO_GLB_URL, PROFILE_CONFIG } from '../config/portfolio';
import { frameEngine } from '../utils/frameEngine';
import { formatAsciiProgress } from '../utils/portfolioLogic';

interface ChromeLogoCanvasProps {
  isDark: boolean;
  reducedMotion: boolean;
}

const ASCII_F_FALLBACK = [
  '########################',
  '########################',
  '########################',
  '######..................',
  '######..................',
  '##################......',
  '##################......',
  '######..................',
  '######..................',
  '######..................',
  '######..................',
  '######..................',
].join('\n');

const AUTO_ROTATE_SPEED = 0.5; // rad/s around Y axis
const TARGET_MODEL_HEIGHT = 2.15;

/**
 * PART D1 — Interactive 3D Chrome "F" Logo Mark on a transparent WebGL canvas.
 * - Dynamically imports `three` (and `RoomEnvironment` / `GLTFLoader` when needed)
 *   only when the Profile page mounts — never part of the initial bundle.
 * - Procedural beveled extruded "F" with black-and-silver studio chrome PMREM
 *   environment (or loads `LOGO_GLB_URL` via GLTFLoader with ASCII progress bar).
 * - Horizontal-only 360deg pointer drag with throw inertia easing back to 0.5 rad/s
 *   over ~2s. Never captures wheel events; sets `touch-action: pan-y` on canvas.
 * - Shares the single `frameEngine` clock (no second requestAnimationFrame loop),
 *   pauses rendering when scrolled out of view or tab hidden, adapts to software
 *   WebGL, and disposes all GPU resources cleanly on unmount.
 */
export function ChromeLogoCanvas({ isDark, reducedMotion }: ChromeLogoCanvasProps) {
  const stageRef = useRef<HTMLElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const [hasDragged, setHasDragged] = useState(false);
  const [webglState, setWebglState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [glbProgress, setGlbProgress] = useState<number | null>(
    LOGO_GLB_URL.trim().length > 0 ? 0 : null
  );

  useEffect(() => {
    const host = canvasHostRef.current;
    const stageEl = stageRef.current;
    if (!host || !stageEl) return;

    let disposed = false;
    let unsubscribeFrame: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let cleanupListeners: (() => void) | null = null;
    let cleanupThree: (() => void) | null = null;

    const isInViewRef = { current: true };

    const initScene = async () => {
      try {
        const THREE = await import('three');
        if (disposed) return;

        // Probe software WebGL (SwiftShader / llvmpipe) to adapt antialias & pixelRatio
        let isSoftwareGl = false;
        try {
          const probeCanvas = document.createElement('canvas');
          const gl =
            probeCanvas.getContext('webgl2') ||
            probeCanvas.getContext('webgl');
          if (!gl) {
            setWebglState('fallback');
            return;
          }
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          const rendererName = dbg
            ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
            : '';
          isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererName);
        } catch {
          setWebglState('fallback');
          return;
        }

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
        });

        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = isDarkRef.current ? 1.18 : 0.98;
        renderer.setClearColor(0x000000, 0);

        const canvas = renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.touchAction = 'pan-y';
        canvas.style.cursor = 'grab';
        canvas.setAttribute('aria-label', 'Interactive 3D chrome F logo mark. Drag horizontally to rotate.');
        canvas.setAttribute('data-testid', 'chrome-logo-canvas');

        host.innerHTML = '';
        host.appendChild(canvas);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
        camera.position.set(0, 0, 5.2);

        // Build high-contrast black-and-silver studio chrome equirectangular reflection map
        // with bright white softboxes, smooth silver gradients, and deep obsidian contrast bands
        // so BOTH the flat front/back faces and the rounded bevels show rich chrome reflections.
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();

        let envRenderTarget: import('three').WebGLRenderTarget | null = null;
        try {
          const envCanvas = document.createElement('canvas');
          envCanvas.width = 1024;
          envCanvas.height = 512;
          const ectx = envCanvas.getContext('2d');
          if (!ectx) {
            throw new Error('2D canvas context unavailable for studio environment');
          }

          // Vertical studio gradient: bright ceiling -> deep obsidian horizon -> cool silver bounce
          const bgGrad = ectx.createLinearGradient(0, 0, 0, 512);
          bgGrad.addColorStop(0.0, '#ffffff');
          bgGrad.addColorStop(0.14, '#c8ccd4');
          bgGrad.addColorStop(0.28, '#141518');
          bgGrad.addColorStop(0.46, '#050506');
          bgGrad.addColorStop(0.51, '#e6e8ec'); // crisp silver horizon band
          bgGrad.addColorStop(0.58, '#2b2d33');
          bgGrad.addColorStop(0.74, '#08090b');
          bgGrad.addColorStop(0.88, '#9fa4ae');
          bgGrad.addColorStop(1.0, '#18191d');
          ectx.fillStyle = bgGrad;
          ectx.fillRect(0, 0, 1024, 512);

          // Studio rectangular & diagonal softbox light panels around all 360 degrees
          // (including front-facing hemisphere so flat faces catch dramatic silver/black sweeps)
          const drawSoftbox = (
            x: number,
            y: number,
            w: number,
            h: number,
            angleRad: number,
            peakAlpha: number
          ) => {
            ectx.save();
            ectx.translate(x, y);
            ectx.rotate(angleRad);
            const grad = ectx.createLinearGradient(-w / 2, 0, w / 2, 0);
            grad.addColorStop(0.0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.14, `rgba(255,255,255,${peakAlpha})`);
            grad.addColorStop(0.5, `rgba(255,255,255,${Math.min(1, peakAlpha * 1.15)})`);
            grad.addColorStop(0.86, `rgba(255,255,255,${peakAlpha})`);
            grad.addColorStop(1.0, 'rgba(255,255,255,0)');
            ectx.fillStyle = grad;
            ectx.fillRect(-w / 2, -h / 2, w, h);
            ectx.restore();
          };

          // Softbox 1: front-upper-left diagonal key ribbon
          drawSoftbox(230, 190, 175, 290, -0.24, 0.96);
          // Softbox 2: front-center-right vertical architectural strip
          drawSoftbox(520, 240, 145, 320, 0.16, 0.94);
          // Softbox 3: rear-right rim kicker
          drawSoftbox(790, 210, 165, 300, -0.18, 0.95);
          // Softbox 4: wrap-around left rim strip
          drawSoftbox(45, 270, 110, 260, 0.12, 0.88);
          drawSoftbox(990, 270, 110, 260, 0.12, 0.88);

          // Deep obsidian negative-fill strips between softboxes for liquid chrome contrast
          ectx.fillStyle = 'rgba(4, 4, 6, 0.92)';
          ectx.fillRect(350, 90, 82, 340);
          ectx.fillRect(635, 110, 74, 320);

          const envTexture = new THREE.CanvasTexture(envCanvas);
          envTexture.mapping = THREE.EquirectangularReflectionMapping;
          envTexture.colorSpace = THREE.SRGBColorSpace;
          envTexture.needsUpdate = true;

          envRenderTarget = pmrem.fromEquirectangular(envTexture);
          envTexture.dispose();
        } catch {
          // Fallback to Three.js RoomEnvironment if custom studio map fails
          const { RoomEnvironment } = await import(
            'three/examples/jsm/environments/RoomEnvironment.js'
          );
          if (disposed) {
            pmrem.dispose();
            renderer.dispose();
            return;
          }
          const roomEnv = new RoomEnvironment();
          envRenderTarget = pmrem.fromScene(roomEnv, 0.04);
          roomEnv.dispose();
        }
        pmrem.dispose();

        if (envRenderTarget) {
          scene.environment = envRenderTarget.texture;
        }

        // Subtle studio directional fill so bevel edges catch crisp rim highlights
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
        keyLight.position.set(4, 6, 5);
        scene.add(keyLight);

        const rimLight = new THREE.DirectionalLight(0xe4e6eb, 0.6);
        rimLight.position.set(-5, -3, -4);
        scene.add(rimLight);

        const pivot = new THREE.Group();
        // Fixed subtle vertical pitch; horizontal rotation only by default.
        // To unlock vertical tilt: update `pivot.rotation.x` from pointer `dy * 0.008`
        // clamped to `[-0.45, 0.45]` inside `handlePointerMove`.
        pivot.rotation.x = 0.08;
        pivot.rotation.y = -0.34;
        scene.add(pivot);

        const ownedGeometries: import('three').BufferGeometry[] = [];
        const ownedMaterials: import('three').Material[] = [];
        const ownedTextures: import('three').Texture[] = [];

        const buildProceduralF = () => {
          const shape = new THREE.Shape();
          shape.moveTo(0, 0);
          shape.lineTo(28, 0);
          shape.lineTo(28, 52);
          shape.lineTo(72, 52);
          shape.lineTo(72, 76);
          shape.lineTo(28, 76);
          shape.lineTo(28, 116);
          shape.lineTo(100, 116);
          shape.lineTo(100, 140);
          shape.lineTo(0, 140);
          shape.closePath();

          const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 28,
            bevelEnabled: true,
            bevelSize: 4,
            bevelThickness: 4,
            bevelSegments: 8,
            curveSegments: 12,
          });
          geometry.center();
          geometry.computeVertexNormals();

          const box = new THREE.Box3().setFromBufferAttribute(
            geometry.attributes.position as import('three').BufferAttribute
          );
          const size = new THREE.Vector3();
          box.getSize(size);
          const scale = size.y > 0 ? TARGET_MODEL_HEIGHT / size.y : 0.014;
          geometry.scale(scale, scale, scale);

          const material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(0xf2f3f5),
            metalness: 1.0,
            roughness: 0.12,
            clearcoat: 0.6,
            clearcoatRoughness: 0.08,
            envMapIntensity: 1.45,
          });

          const mesh = new THREE.Mesh(geometry, material);
          ownedGeometries.push(geometry);
          ownedMaterials.push(material);
          pivot.add(mesh);
        };

        const glbUrl = LOGO_GLB_URL.trim();
        if (glbUrl.length > 0) {
          try {
            const { GLTFLoader } = await import(
              'three/examples/jsm/loaders/GLTFLoader.js'
            );
            if (disposed) {
              envRenderTarget?.dispose();
              renderer.dispose();
              return;
            }
            const loader = new GLTFLoader();
            const gltf = await new Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>(
              (resolve, reject) => {
                loader.load(
                  glbUrl,
                  (result) => resolve(result),
                  (progress) => {
                    if (disposed) return;
                    if (progress.total > 0) {
                      setGlbProgress(Math.round((progress.loaded / progress.total) * 100));
                    }
                  },
                  (err) => reject(err)
                );
              }
            );

            if (disposed) {
              envRenderTarget?.dispose();
              renderer.dispose();
              return;
            }

            const model = gltf.scene;
            const bbox = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            bbox.getSize(size);
            bbox.getCenter(center);

            const maxDim = Math.max(size.x, size.y, size.z, 0.001);
            const scale = TARGET_MODEL_HEIGHT / maxDim;
            model.position.sub(center).multiplyScalar(scale);
            model.scale.setScalar(scale);

            model.traverse((obj) => {
              const mesh = obj as import('three').Mesh;
              if (mesh.isMesh) {
                if (mesh.geometry) ownedGeometries.push(mesh.geometry);
                const mats = Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material];
                for (const m of mats) {
                  if (!m) continue;
                  ownedMaterials.push(m);
                  const stdMat = m as import('three').MeshStandardMaterial;
                  if (envRenderTarget && 'envMap' in stdMat) {
                    stdMat.envMap = envRenderTarget.texture;
                    stdMat.needsUpdate = true;
                  }
                  if ('map' in stdMat && stdMat.map) ownedTextures.push(stdMat.map);
                  if ('normalMap' in stdMat && stdMat.normalMap) ownedTextures.push(stdMat.normalMap);
                  if ('roughnessMap' in stdMat && stdMat.roughnessMap) ownedTextures.push(stdMat.roughnessMap);
                  if ('metalnessMap' in stdMat && stdMat.metalnessMap) ownedTextures.push(stdMat.metalnessMap);
                }
              }
            });

            pivot.add(model);
            setGlbProgress(null);
          } catch {
            if (!disposed) {
              setGlbProgress(null);
              buildProceduralF();
            }
          }
        } else {
          buildProceduralF();
        }

        if (disposed) {
          envRenderTarget?.dispose();
          renderer.dispose();
          return;
        }

        // Responsive sizing matched to host container
        const updateSize = () => {
          const rect = host.getBoundingClientRect();
          const w = Math.max(1, Math.floor(rect.width));
          const h = Math.max(1, Math.floor(rect.height));
          const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
          renderer.setPixelRatio(dpr);
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          // Fit nicely on narrow portrait viewports by pulling camera back slightly
          camera.position.z = w / h < 0.78 ? 6.1 : 5.2;
          camera.updateProjectionMatrix();
        };

        updateSize();
        resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(host);

        // Pause rendering when hero logo is scrolled out of the viewport
        intersectionObserver = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (entry) {
              isInViewRef.current = entry.isIntersecting;
            }
          },
          { threshold: 0.02 }
        );
        intersectionObserver.observe(stageEl);

        // Horizontal-only drag with inertia easing back to AUTO_ROTATE_SPEED over ~2s
        let isDragging = false;
        let activePointerId: number | null = null;
        let lastClientX = 0;
        let lastPointerTime = performance.now();
        let angularVelocity = reducedMotionRef.current ? 0 : AUTO_ROTATE_SPEED;
        let notifiedDrag = false;
        let renderedInitialFrame = false;
        let lastSoftwareRenderMs = 0;

        const handlePointerDown = (event: PointerEvent) => {
          if (event.button !== 0 && event.pointerType === 'mouse') return;
          isDragging = true;
          activePointerId = event.pointerId;
          lastClientX = event.clientX;
          lastPointerTime = performance.now();
          angularVelocity = 0;
          canvas.style.cursor = 'grabbing';
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {
            // Ignore capture failure on synthetic events
          }
        };

        const handlePointerMove = (event: PointerEvent) => {
          if (!isDragging || event.pointerId !== activePointerId) return;
          const now = performance.now();
          const dx = event.clientX - lastClientX;
          const dtSec = Math.max(0.004, (now - lastPointerTime) / 1000);
          lastClientX = event.clientX;
          lastPointerTime = now;

          const deltaAngle = dx * 0.011;
          pivot.rotation.y += deltaAngle;

          // Smooth throw angular velocity (clamped to keep inertia crisp and controllable)
          const instantVel = Math.max(-10, Math.min(10, deltaAngle / dtSec));
          angularVelocity = angularVelocity * 0.45 + instantVel * 0.55;

          if (!notifiedDrag && Math.abs(dx) > 2) {
            notifiedDrag = true;
            setHasDragged(true);
          }
        };

        const endDrag = (event: PointerEvent) => {
          if (!isDragging || event.pointerId !== activePointerId) return;
          isDragging = false;
          activePointerId = null;
          canvas.style.cursor = 'grab';
          try {
            canvas.releasePointerCapture(event.pointerId);
          } catch {
            // Ignore if already released
          }
        };

        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);

        cleanupListeners = () => {
          canvas.removeEventListener('pointerdown', handlePointerDown);
          canvas.removeEventListener('pointermove', handlePointerMove);
          canvas.removeEventListener('pointerup', endDrag);
          canvas.removeEventListener('pointercancel', endDrag);
        };

        cleanupThree = () => {
          for (const g of ownedGeometries) g.dispose();
          for (const m of ownedMaterials) m.dispose();
          for (const t of ownedTextures) t.dispose();
          envRenderTarget?.dispose();
          renderer.dispose();
          if (canvas.parentElement === host) {
            host.removeChild(canvas);
          }
        };

        // Render initial frame immediately, then drive continuously via shared frameEngine
        renderer.render(scene, camera);
        renderedInitialFrame = true;
        setWebglState('ready');

        unsubscribeFrame = frameEngine.subscribe((frame) => {
          if (disposed) return;
          if (!isInViewRef.current && renderedInitialFrame) return;

          const dtSec = Math.min(0.05, frame.deltaMs / 1000);

          // Ease exposure slightly when switching between light and dark theme
          const targetExposure = isDarkRef.current ? 1.18 : 0.98;
          renderer.toneMappingExposure +=
            (targetExposure - renderer.toneMappingExposure) * Math.min(1, dtSec * 4.5);

          if (!isDragging) {
            const targetSpeed = reducedMotionRef.current ? 0 : AUTO_ROTATE_SPEED;
            // Exponential return to targetSpeed over ~2 seconds
            const blend = 1 - Math.exp(-dtSec * 1.85);
            angularVelocity += (targetSpeed - angularVelocity) * blend;
            pivot.rotation.y += angularVelocity * dtSec;
          }

          // Pace software WebGL frames so headless verification stays responsive
          if (isSoftwareGl && renderedInitialFrame && frame.now - lastSoftwareRenderMs < 80) {
            return;
          }
          lastSoftwareRenderMs = frame.now;
          renderer.render(scene, camera);
        });
      } catch {
        if (!disposed) {
          setWebglState('fallback');
        }
      }
    };

    void initScene();

    return () => {
      disposed = true;
      unsubscribeFrame?.();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      cleanupListeners?.();
      cleanupThree?.();
    };
  }, []);

  const progressReadout =
    glbProgress !== null
      ? formatAsciiProgress(glbProgress, 14, glbProgress, reducedMotion)
      : null;

  return (
    <section
      ref={stageRef}
      data-testid="chrome-logo-stage"
      data-webgl-state={webglState}
      data-dragged={hasDragged ? 'true' : 'false'}
      aria-label="Profile Logo Mark"
      className="relative flex min-h-[100svh] w-full flex-col justify-between pt-[76px] sm:pt-[90px] pb-[106px] sm:pb-[88px] px-5 sm:px-8 lg:px-12 select-none"
    >
      {/* Accessible page main heading for route focus transfer */}
      <h1
        tabIndex={-1}
        data-testid="profile-main-heading"
        className="sr-only focus:outline-none"
      >
        Profile — Fadil Maulana Putra
      </h1>

      <div className="relative mx-auto flex flex-1 w-full max-w-[1680px] flex-col justify-between">
        {/* Top corner labels: [F] LOGO MARK left, DRAG TO ROTATE right (fades out after first drag) */}
        <div className="relative z-10 flex items-center justify-between gap-4 font-mono-ui text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          <span data-testid="profile-logo-label">{PROFILE_CONFIG.logoMarkLabel}</span>
          <span
            data-testid="profile-drag-cue"
            aria-hidden={hasDragged}
            className={`transition-opacity duration-500 ease-out ${
              hasDragged ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {PROFILE_CONFIG.dragCueLabel}
          </span>
        </div>

        {/* Centered 3D WebGL stage (~65vh tall) on transparent canvas so dot grid shows through */}
        <div className="relative flex flex-1 items-center justify-center py-4">
          <div
            ref={canvasHostRef}
            className="relative h-[58svh] sm:h-[66svh] max-h-[680px] min-h-[320px] w-full max-w-[780px]"
          />

          {/* Optional GLB ASCII progress indicator */}
          {progressReadout && webglState === 'loading' && (
            <div
              data-testid="glb-loader-readout"
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono-ui text-xs uppercase tracking-[0.16em] text-[var(--text-primary)]"
            >
              <span>
                {progressReadout.bar} {progressReadout.digits}
              </span>
            </div>
          )}

          {/* Fallback large ASCII-art F made of # if WebGL or Three.js fails */}
          {webglState === 'fallback' && (
            <pre
              data-testid="ascii-f-fallback"
              aria-label="ASCII F logo mark"
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono-ui text-[10px] sm:text-sm md:text-base leading-[1.15] tracking-[0.08em] text-[var(--text-primary)]"
            >
              {ASCII_F_FALLBACK}
            </pre>
          )}
        </div>

        {/* Bottom center SCROLL cue with animated ASCII arrow */}
        <div className="relative z-10 flex items-center justify-center font-mono-ui text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-2">
            <span>{PROFILE_CONFIG.scrollCueLabel}</span>
            <span
              aria-hidden="true"
              className={`inline-block text-[var(--accent)] ${
                reducedMotion ? '' : 'animate-bounce'
              }`}
              style={reducedMotion ? undefined : { animationDuration: '1.8s' }}
            >
              ↓
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
