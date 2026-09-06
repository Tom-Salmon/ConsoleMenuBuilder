import * as THREE from 'three';
import type { WallType } from '../model/types';

/**
 * מאגר החומרים של הסצנה.
 *
 * כל החומרים נוצרים פעם אחת ומשותפים, כך שמצב הרנטגן יכול לשנות שקיפות במקום
 * אחד ולהשפיע על כל הקירות בבת אחת, בלי לעבור על עשרות רשתות.
 */

export const PALETTE = {
  wallConcrete: 0xe8e4dd,
  wallMamad: 0xd8dbe2,
  wallBlock: 0xe4dcd2,
  wallGypsum: 0xf0ece6,
  parapet: 0xdcd8d0,
  floorMain: 0xd9cfc2,
  floorWet: 0xcfd4d6,
  floorOutdoor: 0xbdb6ab,
  ceiling: 0xf6f4f1,
  woodLight: 0xc19a6b,
  woodDark: 0x6b4f34,
  fabric: 0x8d99ae,
  metal: 0xb9bec5,
  porcelain: 0xf7f9fa,
  glass: 0x9fc6d8,
  // מערכות — לפי מוסכמת הצבעים של התכנית המקורית
  electrical: 0xd83a2c,
  water: 0xe08a1e,
  drain: 0x2fa84f,
  hvac: 0x3ba7d8,
  comms: 0x8b5cf6,
  dimension: 0x3f57ff,
  highlight: 0xffc400,
  trace: 0x00e5ff,
  clash: 0xff2d55,
} as const;

const wallColour: Record<WallType, number> = {
  concrete_ext: PALETTE.wallConcrete,
  concrete_mamad: PALETTE.wallMamad,
  block: PALETTE.wallBlock,
  gypsum: PALETTE.wallGypsum,
  parapet: PALETTE.parapet,
  louver_screen: PALETTE.metal,
};

export class Materials {
  readonly walls = new Map<WallType, THREE.MeshStandardMaterial>();
  readonly floor: THREE.MeshStandardMaterial;
  readonly floorWet: THREE.MeshStandardMaterial;
  readonly floorOutdoor: THREE.MeshStandardMaterial;
  readonly ceiling: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly frame: THREE.MeshStandardMaterial;
  readonly doorLeaf: THREE.MeshStandardMaterial;
  readonly doorBlast: THREE.MeshStandardMaterial;

  private xrayAmount = 0;

  constructor() {
    for (const [type, colour] of Object.entries(wallColour) as [WallType, number][]) {
      this.walls.set(
        type,
        new THREE.MeshStandardMaterial({
          color: colour,
          roughness: 0.92,
          metalness: 0.0,
          side: THREE.DoubleSide,
        }),
      );
    }
    this.floor = new THREE.MeshStandardMaterial({ color: PALETTE.floorMain, roughness: 0.65 });
    this.floorWet = new THREE.MeshStandardMaterial({ color: PALETTE.floorWet, roughness: 0.4 });
    this.floorOutdoor = new THREE.MeshStandardMaterial({ color: PALETTE.floorOutdoor, roughness: 0.9 });
    this.ceiling = new THREE.MeshStandardMaterial({
      color: PALETTE.ceiling,
      roughness: 0.98,
      side: THREE.DoubleSide,
    });
    // זכוכית: שקיפות רגילה ולא ‎transmission‎. ‎transmission‎ מכריח את three
    // לרנדר את כל הסצנה פעם נוספת לתוך buffer בכל פריים — מחיר גבוה מאוד עבור
    // הבדל ויזואלי קטן בחלונות שטוחים. הברק מגיע מ-‎clearcoat‎ ומהסביבה.
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0xdfeaf2,
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      ior: 1.5,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.frame = new THREE.MeshStandardMaterial({ color: 0x8f959c, roughness: 0.5, metalness: 0.55 });
    this.doorLeaf = new THREE.MeshStandardMaterial({ color: PALETTE.woodLight, roughness: 0.6 });
    this.doorBlast = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.55, metalness: 0.7 });
  }

  /**
   * מצב רנטגן: הקירות, הרצפות והתקרות הופכים שקופים למחצה כדי לחשוף את הצנרת
   * והחיווט שבתוכם. ‎depthWrite‎ מכובה כדי שמה שמאחורי הקיר לא ייחתך.
   */
  setXray(amount: number): void {
    this.xrayAmount = THREE.MathUtils.clamp(amount, 0, 1);
    const opacity = 1 - this.xrayAmount * 0.86;
    const transparent = this.xrayAmount > 0.001;
    const apply = (m: THREE.Material & { opacity: number; transparent: boolean; depthWrite: boolean }) => {
      m.opacity = opacity;
      m.transparent = transparent;
      m.depthWrite = !transparent;
      m.needsUpdate = true;
    };
    for (const m of this.walls.values()) apply(m);
    apply(this.floor);
    apply(this.floorWet);
    apply(this.ceiling);
  }

  get xray(): number {
    return this.xrayAmount;
  }
}
