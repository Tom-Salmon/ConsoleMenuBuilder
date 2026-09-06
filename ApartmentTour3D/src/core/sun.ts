import * as THREE from 'three';
import type { ApartmentIndex } from '../model/load';

/**
 * שמש, שמיים ותאורת סביבה.
 *
 * כיוון הצפון אינו מופיע בגיליונות שקיבלנו, ולכן במקום לנחש אותו הוא נחשף
 * כסרגל שליטה: המשתמש מסובב את הצפון ובוחר שעה ביום, והשמש והצללים מתעדכנים
 * בהתאם. ברירת המחדל מציבה את המרפסת בפנייה לדרום-מערב.
 */

export interface SunSettings {
  /** סיבוב הצפון במעלות ביחס לציר ‎-Z‎ של המודל */
  northDeg: number;
  /** שעה ביום, 5..20 */
  hour: number;
  night: boolean;
}

export class SunRig {
  readonly light = new THREE.DirectionalLight(0xfff3e0, 2.6);
  readonly hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8b8175, 0.55);
  readonly settings: SunSettings = { northDeg: 205, hour: 14, night: false };
  private readonly radius: number;
  private readonly centre = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    index: ApartmentIndex,
  ) {
    const { minX, maxX, minZ, maxZ } = index.bounds();
    this.centre.set((minX + maxX) / 2, 1.2, (minZ + maxZ) / 2);
    this.radius = Math.max(maxX - minX, maxZ - minZ) * 1.15;

    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1536, 1536);
    this.light.shadow.bias = -0.0006;
    this.light.shadow.normalBias = 0.02;
    const cam = this.light.shadow.camera;
    cam.near = 0.5;
    cam.far = this.radius * 4;
    cam.left = -this.radius;
    cam.right = this.radius;
    cam.top = this.radius;
    cam.bottom = -this.radius;
    this.light.target.position.copy(this.centre);

    scene.add(this.light, this.light.target, this.hemi);
    this.apply();
  }

  update(patch: Partial<SunSettings>): void {
    Object.assign(this.settings, patch);
    this.apply();
  }

  private apply(): void {
    const { hour, northDeg, night } = this.settings;
    // מסלול פשוט: השמש עולה במזרח ושוקעת במערב, בגובה מרבי בצהריים
    const dayFraction = THREE.MathUtils.clamp((hour - 5) / 15, 0, 1);
    const azimuth = THREE.MathUtils.degToRad(northDeg + 90 + dayFraction * 180);
    const altitude = Math.sin(dayFraction * Math.PI) * THREE.MathUtils.degToRad(72) + 0.05;

    const y = Math.sin(altitude) * this.radius * 2.2;
    const horizontal = Math.cos(altitude) * this.radius * 2.2;
    this.light.position.set(
      this.centre.x + Math.cos(azimuth) * horizontal,
      this.centre.y + y,
      this.centre.z + Math.sin(azimuth) * horizontal,
    );

    const dusk = Math.min(1, Math.max(0, Math.sin(dayFraction * Math.PI)));
    if (night) {
      this.light.intensity = 0.08;
      this.light.color.setHex(0x9bb6e0);
      this.hemi.intensity = 0.06;
      this.hemi.color.setHex(0x2c3c5a);
      this.hemi.groundColor.setHex(0x0d1016);
    } else {
      this.light.intensity = 0.5 + dusk * 2.6;
      this.light.color.setHSL(0.09 - dusk * 0.02, 0.45 - dusk * 0.25, 0.62 + dusk * 0.18);
      this.hemi.intensity = 0.25 + dusk * 0.5;
      this.hemi.color.setHex(0xcfe3ff);
      this.hemi.groundColor.setHex(0x8b8175);
    }

    // סביבת ה-IBL מאירה את כל החומרים ללא תלות בשמש. בלי להנמיך אותה גם מצב
    // הלילה נשאר בהיר, וגופי התאורה שנדלקים לא היו משנים כלום בתמונה.
    this.scene.environmentIntensity = night ? 0.06 : 0.35 + dusk * 0.45;
  }

  /** צבע הרקע שמתאים למצב התאורה הנוכחי. */
  skyColour(): THREE.Color {
    const { hour, night } = this.settings;
    if (night) return new THREE.Color(0x0d1420);
    const dusk = Math.sin(THREE.MathUtils.clamp((hour - 5) / 15, 0, 1) * Math.PI);
    return new THREE.Color().setHSL(0.58, 0.35 + dusk * 0.15, 0.35 + dusk * 0.35);
  }
}
