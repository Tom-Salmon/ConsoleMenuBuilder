import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * ליבת התצוגה: רנדרר, שכבת תוויות ה-HTML, ושרשרת הפוסט-פרוססינג.
 *
 * שני יעדים שנקבעו מראש מתקיימים כאן יחד: תאורה ריאליסטית (PBR + סביבת IBL +
 * ‎ACES tone mapping‎ + צללים רכים) לצד חדות מרבית של קווים וטקסט (‎SMAA‎ ותוויות
 * CSS2D שמרונדרות כ-HTML אמיתי מעל הקנבס).
 */

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;
  private readonly resizeHandlers: ((w: number, h: number) => void)[] = [];

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // מפת הצללים מחושבת מחדש רק כשמשהו בסצנה באמת זז — השמש, דלת או גוף תאורה.
    // בלי זה כל פריים מרנדר את כל הסצנה פעם נוספת לתוך מפת הצללים.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.classList.add('viewport-canvas');
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 220);
    this.camera.position.set(9, 1.65, 8);

    this.scene.background = new THREE.Color(0x9fb6cc);
    this.scene.fog = new THREE.Fog(0x9fb6cc, 45, 160);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new SMAAPass(1, 1));
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  onResize(handler: (w: number, h: number) => void): void {
    this.resizeHandlers.push(handler);
    handler(this.container.clientWidth, this.container.clientHeight);
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    for (const handler of this.resizeHandlers) handler(w, h);
  }

  /** מבקש חישוב מחדש של הצללים בפריים הבא. */
  invalidateShadows(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  render(): void {
    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
    this.renderer.shadowMap.needsUpdate = false;
  }
}
