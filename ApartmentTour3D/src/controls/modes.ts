import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { ApartmentIndex } from '../model/load';
import type { Door } from '../model/openings';
import { furnitureBox } from '../systems/furniture';

/**
 * שלושה מצבי מצלמה.
 *
 *  ‎fly‎        — גוף ראשון מרחף: WASD לתנועה, Q/E מעלה ומטה, בלי כבידה ובלי
 *                התנגשות. מצב ההתמצאות והצילום.
 *  ‎walk‎       — הליכה ריאליסטית: גובה עיניים 1.65 מ', כבידה, הצמדה למפלס החדר,
 *                והתנגשות בקירות, בריהוט ובדלתות סגורות. מעבר דרך פתח אפשרי רק
 *                אם הדלת פתוחה — בדיוק כמו בדירה.
 *  ‎dollhouse‎  — מבט-על מסתובב על כל הדירה, בלי תקרות.
 *
 * המעבר בין המצבים מונפש (מיקום וכיוון), ולא קופץ.
 */

export type CameraMode = 'fly' | 'walk' | 'dollhouse';

const EYE_HEIGHT = 1.65;
const BODY_RADIUS = 0.28;
const STEP_HEIGHT = 0.35;
const GRAVITY = 14;

interface Blocker {
  box: THREE.Box3;
  /** מזהה הפתח כשהחוסם הוא דלת — כדי לאפשר מעבר כשהיא פתוחה */
  openingId?: string;
}

export class CameraController {
  mode: CameraMode = 'fly';
  private readonly pointer: PointerLockControls;
  private readonly orbit: OrbitControls;
  private readonly keys = new Set<string>();
  private readonly velocity = new THREE.Vector3();
  private verticalSpeed = 0;
  private grounded = false;
  private blockers: Blocker[] = [];
  private transition: { from: THREE.Vector3; to: THREE.Vector3; t: number; look: THREE.Vector3 } | null = null;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private readonly index: ApartmentIndex,
    private readonly doors: Map<string, Door>,
  ) {
    this.pointer = new PointerLockControls(camera, dom);
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.orbit.enabled = false;

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.buildBlockers();
  }

  get locked(): boolean {
    return this.pointer.isLocked;
  }

  requestLock(): void {
    if (this.mode !== 'dollhouse') this.pointer.lock();
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.velocity.set(0, 0, 0);
    this.verticalSpeed = 0;

    if (mode === 'dollhouse') {
      this.pointer.unlock();
      this.orbit.enabled = true;
      const { minX, maxX, minZ, maxZ } = this.index.bounds();
      // ההזזה שמאלה מפצה על לוח השליטה שיושב בצד ימין של המסך
      const target = new THREE.Vector3((minX + maxX) / 2 - 1.6, 0.8, (minZ + maxZ) / 2);
      const span = Math.max(maxX - minX, maxZ - minZ);
      this.orbit.target.copy(target);
      this.flyTo(new THREE.Vector3(target.x, span * 1.15, target.z + span * 0.55), target);
    } else {
      this.orbit.enabled = false;
      if (mode === 'walk') {
        const room = this.index.roomAt(this.camera.position.x, this.camera.position.z);
        const y = (room?.y ?? 0) + EYE_HEIGHT;
        this.flyTo(new THREE.Vector3(this.camera.position.x, y, this.camera.position.z), null);
      }
    }
  }

  /** מנפיש מעבר חלק אל מיקום חדש. */
  flyTo(position: THREE.Vector3, look: THREE.Vector3 | null): void {
    const target = look ?? this.camera.position.clone().add(this.forward().multiplyScalar(3));
    this.transition = { from: this.camera.position.clone(), to: position.clone(), t: 0, look: target };
  }

  private forward(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    return dir.normalize();
  }

  update(dt: number): void {
    if (this.transition) {
      this.transition.t = Math.min(1, this.transition.t + dt * 1.6);
      const t = easeInOutCubic(this.transition.t);
      this.camera.position.lerpVectors(this.transition.from, this.transition.to, t);
      if (this.mode === 'dollhouse') this.orbit.update();
      else this.camera.lookAt(this.transition.look);
      if (this.transition.t >= 1) this.transition = null;
      return;
    }

    if (this.mode === 'dollhouse') {
      this.orbit.update();
      return;
    }
    if (!this.pointer.isLocked) return;

    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 2.4 : 1;
    const precise = this.keys.has('ControlLeft') || this.keys.has('ControlRight') ? 0.35 : 1;
    const speed = (this.mode === 'walk' ? 2.6 : 4.2) * boost * precise;

    const input = new THREE.Vector3(
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      0,
      (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0),
    );
    if (input.lengthSq() > 0) input.normalize();

    const forward = this.forward();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const move = new THREE.Vector3()
      .addScaledVector(forward, -input.z)
      .addScaledVector(right, -input.x)
      .multiplyScalar(speed * dt);

    if (this.mode === 'fly') {
      const lift = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
      this.camera.position.add(move);
      this.camera.position.y += lift * speed * dt;
      return;
    }

    this.moveWithCollision(move);

    const room = this.index.roomAt(this.camera.position.x, this.camera.position.z);
    const floorY = room?.y ?? 0;
    const standY = floorY + EYE_HEIGHT;

    if (this.keys.has('Space') && this.grounded) this.verticalSpeed = 4.2;
    this.verticalSpeed -= GRAVITY * dt;
    this.camera.position.y += this.verticalSpeed * dt;

    if (this.camera.position.y <= standY) {
      this.camera.position.y = standY;
      this.verticalSpeed = 0;
      this.grounded = true;
    } else if (this.camera.position.y - standY < STEP_HEIGHT && this.verticalSpeed <= 0) {
      // מדרגה קטנה בין מפלסים — עולים עליה בלי קפיצה
      this.camera.position.y = standY;
      this.verticalSpeed = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  /** תנועה עם החלקה לאורך מכשולים, כדי שההליכה לא "תיתקע" בקיר. */
  private moveWithCollision(move: THREE.Vector3): void {
    const attempt = (dx: number, dz: number): boolean => {
      const next = new THREE.Vector3(this.camera.position.x + dx, this.camera.position.y, this.camera.position.z + dz);
      if (this.collides(next)) return false;
      this.camera.position.x = next.x;
      this.camera.position.z = next.z;
      return true;
    };
    if (!attempt(move.x, move.z)) {
      attempt(move.x, 0);
      attempt(0, move.z);
    }
  }

  private collides(position: THREE.Vector3): boolean {
    const body = new THREE.Box3(
      new THREE.Vector3(position.x - BODY_RADIUS, position.y - EYE_HEIGHT + 0.05, position.z - BODY_RADIUS),
      new THREE.Vector3(position.x + BODY_RADIUS, position.y + 0.1, position.z + BODY_RADIUS),
    );
    for (const blocker of this.blockers) {
      if (blocker.openingId) {
        const door = this.doors.get(blocker.openingId);
        if (door?.isOpen) continue; // דלת פתוחה — אפשר לעבור
      }
      if (blocker.box.intersectsBox(body)) return true;
    }
    return false;
  }

  /**
   * בונה את מפת המכשולים: כל קיר מפורק לקטעים שבין הפתחים שלו, כך שפתח נשאר
   * חופשי, ובכל פתח שיש בו דלת מוצב חוסם נפרד שנעלם כשהדלת נפתחת.
   */
  private buildBlockers(): void {
    const blockers: Blocker[] = [];

    for (const wall of this.index.data.walls) {
      const dir = new THREE.Vector2(wall.end.x - wall.start.x, wall.end.z - wall.start.z).normalize();
      const normal = new THREE.Vector2(-dir.y, dir.x);
      const openings = (this.index.openingsOfWall.get(wall.id) ?? [])
        .slice()
        .sort((a, b) => a.offset - b.offset);

      const spans: [number, number][] = [];
      let cursor = 0;
      for (const o of openings) {
        if (o.offset > cursor) spans.push([cursor, o.offset]);
        cursor = Math.max(cursor, o.offset + o.width);
      }
      if (cursor < wall.length) spans.push([cursor, wall.length]);

      for (const [from, to] of spans) {
        blockers.push({ box: segmentBox(wall.start, dir, normal, from, to, wall.thickness) });
      }
      for (const o of openings) {
        if (o.kind === 'window' || o.kind === 'blast_window') {
          // חלון עם סף — חוסם מעבר
          blockers.push({
            box: segmentBox(wall.start, dir, normal, o.offset, o.offset + o.width, wall.thickness),
          });
        } else if (o.kind !== 'passage') {
          blockers.push({
            box: segmentBox(wall.start, dir, normal, o.offset, o.offset + o.width, wall.thickness),
            openingId: o.id,
          });
        }
      }
    }

    for (const item of this.index.data.furniture) {
      const room = this.index.rooms.get(item.room);
      blockers.push({ box: furnitureBox(item, room?.y ?? 0) });
    }

    this.blockers = blockers;
  }
}

function segmentBox(
  start: { x: number; z: number },
  dir: THREE.Vector2,
  normal: THREE.Vector2,
  from: number,
  to: number,
  thickness: number,
): THREE.Box3 {
  const half = thickness / 2;
  const corners: THREE.Vector3[] = [];
  for (const along of [from, to]) {
    for (const side of [-half, half]) {
      corners.push(
        new THREE.Vector3(
          start.x + dir.x * along + normal.x * side,
          -1,
          start.z + dir.y * along + normal.y * side,
        ),
      );
    }
  }
  const box = new THREE.Box3().setFromPoints(corners);
  box.min.y = -1;
  box.max.y = 3.2;
  return box;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
