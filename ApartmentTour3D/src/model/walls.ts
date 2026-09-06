import * as THREE from 'three';
import type { Materials } from '../core/materials';
import type { ApartmentIndex } from './load';
import type { Opening, Wall } from './types';

/**
 * בניית הקירות עם הפתחים שבהם.
 *
 * כל קיר נבנה כצורה דו-ממדית במרחב המקומי שלו (אורך × גובה), ובתוכה מנוקבים
 * חורים מלבניים לכל פתח. הצורה עוברת ‎ExtrudeGeometry‎ לעובי הקיר, ואז מסובבת
 * למקומה. זה נותן קירות מחוררים נכון בלי תלות בספריית CSG ובלי בעיות של
 * גאומטריה לא-סגורה.
 */

export interface WallMesh {
  wall: Wall;
  mesh: THREE.Mesh;
}

/** כיוון הקיר במישור הרצפה ווקטור הניצב לו. */
export function wallAxes(wall: Wall): { dir: THREE.Vector2; normal: THREE.Vector2; origin: THREE.Vector2 } {
  const start = new THREE.Vector2(wall.start.x, wall.start.z);
  const end = new THREE.Vector2(wall.end.x, wall.end.z);
  const dir = end.clone().sub(start).normalize();
  const normal = new THREE.Vector2(-dir.y, dir.x);
  return { dir, normal, origin: start };
}

/** נקודה במרחב העולם לפי מרחק לאורך הקיר, גובה, והיסט מציר הקיר. */
export function wallPoint(wall: Wall, along: number, y: number, offset = 0): THREE.Vector3 {
  const { dir, normal, origin } = wallAxes(wall);
  const x = origin.x + dir.x * along + normal.x * offset;
  const z = origin.y + dir.y * along + normal.y * offset;
  return new THREE.Vector3(x, y, z);
}

function buildWallGeometry(wall: Wall, openings: Opening[]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(wall.length, 0);
  shape.lineTo(wall.length, wall.height);
  shape.lineTo(0, wall.height);
  shape.closePath();

  for (const o of openings) {
    const top = Math.min(o.sill + o.height, wall.height - 0.01);
    if (top <= o.sill) continue;
    const hole = new THREE.Path();
    hole.moveTo(o.offset, o.sill);
    hole.lineTo(o.offset + o.width, o.sill);
    hole.lineTo(o.offset + o.width, top);
    hole.lineTo(o.offset, top);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: wall.thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  // הצורה נבנתה במישור XY עם עומק לאורך Z; מעבירים אותה למרחב הקיר כך שהעומק
  // יהיה לרוחב הקיר והציר האנכי יהיה Y.
  geometry.translate(0, 0, -wall.thickness / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildWalls(index: ApartmentIndex, materials: Materials): {
  group: THREE.Group;
  meshes: WallMesh[];
} {
  const group = new THREE.Group();
  group.name = 'walls';
  const meshes: WallMesh[] = [];

  for (const wall of index.data.walls) {
    const openings = index.openingsOfWall.get(wall.id) ?? [];
    const geometry = buildWallGeometry(wall, openings);
    const material = materials.walls.get(wall.type)!;
    const mesh = new THREE.Mesh(geometry, material);

    const { dir, origin } = wallAxes(wall);
    const angle = Math.atan2(dir.y, dir.x);
    mesh.position.set(origin.x, baseY(index, wall), origin.y);
    mesh.rotation.y = -angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = wall.id;
    mesh.userData = { kind: 'wall', id: wall.id, wall };

    group.add(mesh);
    meshes.push({ wall, mesh });
  }
  return { group, meshes };
}

/** מפלס תחתית הקיר — נגזר מהחדר הנמוך ביותר שהקיר גובל בו. */
function baseY(index: ApartmentIndex, wall: Wall): number {
  const mid = new THREE.Vector2(
    (wall.start.x + wall.end.x) / 2,
    (wall.start.z + wall.end.z) / 2,
  );
  const { normal } = wallAxes(wall);
  const probes = [
    mid.clone().add(normal.clone().multiplyScalar(wall.thickness / 2 + 0.25)),
    mid.clone().add(normal.clone().multiplyScalar(-(wall.thickness / 2 + 0.25))),
  ];
  let y = 0;
  let found = false;
  for (const p of probes) {
    const room = index.roomAt(p.x, p.y);
    if (!room) continue;
    y = found ? Math.min(y, room.y) : room.y;
    found = true;
  }
  return found ? y : 0;
}

/**
 * מסגרת הפתח: קופה דקה סביב החור, שנותנת לפתח עובי נראה לעין במקום קצה חד.
 */
export function buildOpeningFrame(wall: Wall, opening: Opening, materials: Materials): THREE.Group {
  const group = new THREE.Group();
  const t = wall.thickness + 0.01;
  const jamb = 0.04;
  const top = opening.sill + opening.height;

  const add = (w: number, h: number, along: number, y: number) => {
    const geo = new THREE.BoxGeometry(w, h, t);
    const mesh = new THREE.Mesh(geo, materials.frame);
    mesh.position.copy(wallPoint(wall, along, y));
    const { dir } = wallAxes(wall);
    mesh.rotation.y = -Math.atan2(dir.y, dir.x);
    group.add(mesh);
  };

  add(jamb, opening.height, opening.offset + jamb / 2, opening.sill + opening.height / 2);
  add(jamb, opening.height, opening.offset + opening.width - jamb / 2, opening.sill + opening.height / 2);
  add(opening.width, jamb, opening.offset + opening.width / 2, top - jamb / 2);
  if (opening.sill > 0.02) {
    add(opening.width, jamb, opening.offset + opening.width / 2, opening.sill + jamb / 2);
  }
  return group;
}
