import * as THREE from 'three';
import type { Materials } from '../core/materials';
import type { ApartmentIndex } from './load';
import type { Room } from './types';

/**
 * רצפות ותקרות.
 *
 * לכל חדר נבנה מצולע רצפה מהפוליגון שבמודל, במפלס של אותו חדר — כך שההפרש של
 * שני סנטימטרים בין הממ"ד לדירה, והירידה של 60 ס"מ אל המסתור, נראים בפועל.
 * התקרה נבנית באותו מצולע בגובה התקרה של החדר: 2.80 קונסטרוקטיבי, או 2.55
 * במקומות שבהם התכנית מסמנת ‎H=255‎ (הנמכה).
 */

function roomShape(room: Room): THREE.Shape {
  const shape = new THREE.Shape();
  room.polygon.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

function flatMesh(room: Room, material: THREE.Material, y: number): THREE.Mesh {
  const geometry = new THREE.ShapeGeometry(roomShape(room));
  // הצורה נבנתה במישור XY כשה-Y שלה מייצג את Z של העולם; מסובבים למישור הרצפה.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildSlabs(index: ApartmentIndex, materials: Materials): {
  floors: THREE.Group;
  ceilings: THREE.Group;
} {
  const floors = new THREE.Group();
  floors.name = 'floors';
  const ceilings = new THREE.Group();
  ceilings.name = 'ceilings';

  for (const room of index.data.rooms) {
    if (room.part_of) continue; // המטבח חולק רצפה עם חדר הדיור

    const material = room.outdoor
      ? materials.floorOutdoor
      : room.level === 'wet'
        ? materials.floorWet
        : materials.floor;

    const floor = flatMesh(room, material, room.y);
    floor.name = `floor_${room.id}`;
    floor.userData = { kind: 'floor', id: room.id, room };
    floors.add(floor);

    if (room.ceiling.height !== null) {
      const ceiling = flatMesh(room, materials.ceiling, room.y + room.ceiling.height);
      ceiling.name = `ceiling_${room.id}`;
      ceiling.userData = { kind: 'ceiling', id: room.id, room };
      ceilings.add(ceiling);
    }
  }

  // תקרה מונמכת נפרדת למטבח, שמסומן בתכנית ב-H=255 בתוך חדר הדיור
  for (const room of index.data.rooms) {
    if (!room.part_of || room.ceiling.height === null) continue;
    const ceiling = flatMesh(room, materials.ceiling, room.y + room.ceiling.height);
    ceiling.name = `ceiling_${room.id}`;
    ceiling.userData = { kind: 'ceiling', id: room.id, room };
    ceilings.add(ceiling);
  }

  for (const soffit of buildSoffits(index, materials)) ceilings.add(soffit);

  return { floors, ceilings };
}

/**
 * הבולען האנכי בין תקרה מונמכת לתקרה קונסטרוקטיבית.
 *
 * במקום שבו חדר בתקרה 255 נפתח אל חדר בתקרה 280 — למשל המסדרון אל חדר הדיור —
 * נשאר בלי זה חור פתוח אל החלל שמעל התקרה. הפס נבנה סביב כל היקף החדר המונמך;
 * לאורך קטעים שגובלים בקיר הוא נבלע בתוכו ואינו נראה, ובקטעים הפתוחים הוא יוצר
 * את הבולען האמיתי.
 */
function buildSoffits(index: ApartmentIndex, materials: Materials): THREE.Mesh[] {
  const structural = index.data.ceilings.structural_m;
  const out: THREE.Mesh[] = [];

  for (const room of index.data.rooms) {
    if (room.ceiling.type !== 'dropped' || room.ceiling.height === null) continue;
    const bottom = room.y + room.ceiling.height;
    const top = room.y + structural;
    if (top - bottom < 0.02) continue;

    const poly = room.polygon;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % poly.length];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.05) continue;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(length, top - bottom),
        materials.ceiling,
      );
      mesh.position.set((ax + bx) / 2, (bottom + top) / 2, (az + bz) / 2);
      mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
      mesh.name = `soffit_${room.id}_${i}`;
      mesh.userData = { kind: 'ceiling', id: room.id, room };
      out.push(mesh);
    }
  }
  return out;
}

/**
 * לוח הרצפה החיצוני שמתחת לכל הדירה — נותן לגוף הבניין מסה נראית מבחוץ במצב
 * "בית בובות", ומונע מבט אל תוך הריק מתחת לרצפות.
 */
export function buildBaseSlab(index: ApartmentIndex, materials: Materials): THREE.Mesh {
  const { minX, maxX, minZ, maxZ } = index.bounds();
  const geometry = new THREE.BoxGeometry(maxX - minX + 0.4, 0.3, maxZ - minZ + 0.4);
  const mesh = new THREE.Mesh(geometry, materials.floorOutdoor);
  mesh.position.set((minX + maxX) / 2, -0.75, (minZ + maxZ) / 2);
  mesh.receiveShadow = true;
  mesh.name = 'base_slab';
  return mesh;
}
