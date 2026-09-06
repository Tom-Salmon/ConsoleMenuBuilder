import * as THREE from 'three';
import type { Materials } from '../core/materials';
import type { ApartmentIndex } from './load';
import type { Opening, Wall } from './types';
import { buildOpeningFrame, wallAxes, wallPoint } from './walls';

/**
 * דלתות וחלונות.
 *
 * דלת רגילה נבנית כקבוצת ציר (pivot) שממוקמת על עמוד הצירים האמיתי מהתכנית,
 * והכנף תלויה בה — כך שסיבוב הקבוצה מסובב את הדלת סביב הציר הנכון, ולא סביב
 * מרכזה. כיוון הפתיחה (hinge + toward) נלקח מהתכנית, וכך הדלת נעה בדיוק כפי
 * שקשת הפתיחה מסמנת.
 *
 * דלת הזזה נעה לינארית לאורך הקיר במקום להסתובב.
 */

export type DoorState = 'closed' | 'opening' | 'open' | 'closing';

export class Door {
  /** 0 = סגורה, 1 = פתוחה לגמרי */
  progress = 0;
  target = 0;
  readonly pivot = new THREE.Group();
  readonly leaves: THREE.Object3D[] = [];

  constructor(
    readonly opening: Opening,
    readonly wall: Wall,
    readonly maxAngle: number,
    readonly slide: boolean,
    readonly slideDistance = 0,
  ) {}

  get isOpen(): boolean {
    return this.progress > 0.5;
  }

  toggle(): void {
    this.target = this.target > 0.5 ? 0 : 1;
  }

  update(dt: number): boolean {
    if (Math.abs(this.target - this.progress) < 0.0005) {
      if (this.progress !== this.target) {
        this.progress = this.target;
        this.apply();
        return true;
      }
      return false;
    }
    const speed = 1 / 0.65; // כ-0.65 שניות לפתיחה מלאה
    const dir = Math.sign(this.target - this.progress);
    this.progress = THREE.MathUtils.clamp(this.progress + dir * speed * dt, 0, 1);
    this.apply();
    return true;
  }

  private apply(): void {
    const t = easeInOutCubic(this.progress);
    if (this.slide) {
      for (let i = 0; i < this.leaves.length; i++) {
        const leaf = this.leaves[i];
        const local = leaf.userData.closedX as number;
        const shift = this.slideDistance * t * (i === 0 ? 1 : -1);
        leaf.position.x = local + shift;
      }
    } else {
      this.pivot.rotation.y = this.maxAngle * t;
    }
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const LEAF_THICKNESS = 0.042;
const BLAST_LEAF_THICKNESS = 0.11;

export function buildOpenings(index: ApartmentIndex, materials: Materials): {
  group: THREE.Group;
  doors: Map<string, Door>;
  interactive: THREE.Object3D[];
} {
  const group = new THREE.Group();
  group.name = 'openings';
  const doors = new Map<string, Door>();
  const interactive: THREE.Object3D[] = [];

  for (const opening of index.data.openings) {
    const wall = index.walls.get(opening.wall);
    if (!wall) continue;
    const base = floorYFor(index, wall);

    const frame = buildOpeningFrame(wall, opening, materials);
    frame.position.y += base;
    group.add(frame);

    if (opening.kind === 'window' || opening.kind === 'blast_window') {
      group.add(buildWindow(wall, opening, materials, base));
      continue;
    }
    if (opening.kind === 'sliding') {
      const door = buildSlidingDoor(wall, opening, materials, base);
      doors.set(opening.id, door);
      group.add(door.pivot);
      interactive.push(...door.leaves);
      continue;
    }
    const door = buildSwingDoor(wall, opening, materials, base);
    doors.set(opening.id, door);
    group.add(door.pivot);
    interactive.push(...door.leaves);
  }

  return { group, doors, interactive };
}

function floorYFor(index: ApartmentIndex, wall: Wall): number {
  const { normal } = wallAxes(wall);
  const mid = new THREE.Vector2((wall.start.x + wall.end.x) / 2, (wall.start.z + wall.end.z) / 2);
  for (const sign of [1, -1]) {
    const p = mid.clone().add(normal.clone().multiplyScalar(sign * (wall.thickness / 2 + 0.3)));
    const room = index.roomAt(p.x, p.y);
    if (room) return room.y;
  }
  return 0;
}

function buildWindow(wall: Wall, opening: Opening, materials: Materials, base: number): THREE.Group {
  const group = new THREE.Group();
  const { dir } = wallAxes(wall);
  const angle = -Math.atan2(dir.y, dir.x);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(opening.width - 0.08, opening.height - 0.08, 0.02),
    materials.glass,
  );
  glass.position.copy(
    wallPoint(wall, opening.offset + opening.width / 2, base + opening.sill + opening.height / 2),
  );
  glass.rotation.y = angle;
  glass.userData = { kind: 'window', id: opening.id, opening };
  group.add(glass);

  // חלוקת החלון לכנפיים — קו אנכי דק באמצע, כפי שמצויר בתכנית
  const mullion = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, opening.height - 0.08, wall.thickness + 0.012),
    materials.frame,
  );
  mullion.position.copy(
    wallPoint(wall, opening.offset + opening.width / 2, base + opening.sill + opening.height / 2),
  );
  mullion.rotation.y = angle;
  group.add(mullion);

  if (opening.shutter) {
    // ארגז תריס מעל הפתח
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(opening.width + 0.06, 0.2, wall.thickness * 0.7),
      materials.frame,
    );
    box.position.copy(
      wallPoint(wall, opening.offset + opening.width / 2, base + opening.sill + opening.height + 0.1),
    );
    box.rotation.y = angle;
    group.add(box);
  }
  return group;
}

function buildSwingDoor(wall: Wall, opening: Opening, materials: Materials, base: number): Door {
  const blast = opening.kind === 'blast_door';
  const thickness = blast ? BLAST_LEAF_THICKNESS : LEAF_THICKNESS;
  const material = blast ? materials.doorBlast : materials.doorLeaf;
  const hingeAtStart = (opening.hinge ?? 'start') === 'start';
  const toward = opening.toward ?? 1;
  const maxDeg = opening.max_deg ?? 90;

  const { dir } = wallAxes(wall);
  const wallAngle = -Math.atan2(dir.y, dir.x);
  const hingeAlong = hingeAtStart ? opening.offset : opening.offset + opening.width;

  const pivot = new THREE.Group();
  pivot.position.copy(wallPoint(wall, hingeAlong, base));
  pivot.rotation.y = wallAngle;

  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(opening.width, opening.height, thickness),
    material,
  );
  // הכנף נתלית מצדו של הציר: מרכזה מוזז בחצי רוחב לכיוון הפתח
  leaf.position.set((hingeAtStart ? 1 : -1) * (opening.width / 2), opening.height / 2, 0);
  leaf.castShadow = true;
  leaf.userData = { kind: 'door', id: opening.id, opening };
  pivot.add(leaf);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.11, 10),
    materials.frame,
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(
    (hingeAtStart ? 1 : -1) * (opening.width - 0.08),
    1.05,
    thickness / 2 + 0.03,
  );
  handle.userData = { kind: 'door', id: opening.id, opening };
  pivot.add(handle);

  // הכיוון שאליו נפתחת הכנף נקבע לפי הצד שהתכנית מסמנת, בשילוב צד הצירים
  const sign = (hingeAtStart ? 1 : -1) * toward;
  const door = new Door(opening, wall, THREE.MathUtils.degToRad(maxDeg) * sign, false);
  door.pivot.add(pivot);
  door.leaves.push(leaf, handle);
  return door;
}

function buildSlidingDoor(wall: Wall, opening: Opening, materials: Materials, base: number): Door {
  const leafCount = opening.leaves ?? 2;
  const leafWidth = opening.width / leafCount;
  const { dir } = wallAxes(wall);
  const wallAngle = -Math.atan2(dir.y, dir.x);

  const holder = new THREE.Group();
  holder.position.copy(wallPoint(wall, opening.offset, base));
  holder.rotation.y = wallAngle;

  const door = new Door(opening, wall, 0, true, leafWidth * 0.94);

  for (let i = 0; i < leafCount; i++) {
    const leafGroup = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth - 0.06, opening.height - 0.1, 0.02),
      materials.glass,
    );
    glass.position.y = opening.height / 2;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth, opening.height, 0.05),
      materials.frame,
    );
    frame.position.y = opening.height / 2;
    frame.material = materials.frame;
    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(leafWidth - 0.1, opening.height - 0.16, 0.055),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    wire.position.y = opening.height / 2;

    leafGroup.add(frame, glass, wire);
    leafGroup.position.set(leafWidth * (i + 0.5), 0, i === 0 ? 0.035 : -0.035);
    leafGroup.userData = { kind: 'door', id: opening.id, opening, closedX: leafGroup.position.x };
    glass.userData = leafGroup.userData;
    frame.userData = leafGroup.userData;
    holder.add(leafGroup);
    door.leaves.push(leafGroup);
    // המיקום הסגור נשמר כדי שההזזה תהיה יחסית אליו
    leafGroup.userData.closedX = leafGroup.position.x;
  }

  door.pivot.add(holder);
  return door;
}
