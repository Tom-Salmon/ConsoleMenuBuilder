import * as THREE from 'three';
import type { ApartmentIndex } from '../model/load';
import type { Device, FurnitureItem, Opening, Wall } from '../model/types';
import { furnitureBox } from '../systems/furniture';

/**
 * בדיקת התנגשויות תכנוניות.
 *
 * עשרה כללים שרצים על המודל ומאתרים סתירות בין המערכות, האדריכלות והריהוט.
 *
 * הבחנה חשובה שמופיעה גם בממשק: הריהוט הוא **להמחשה בלבד** לפי הערת המתכנן,
 * ולכן ממצא שמערב רהיט הוא הצעה לבדיקה ולא ליקוי בתכנית. ממצא שמערב רק
 * אדריכלות ומערכות (כללים 5, 6, 9) הוא בעל משקל גבוה יותר, ומסומן ככזה.
 */

export type Severity = 'error' | 'warning' | 'note';

export interface Clash {
  id: string;
  rule: number;
  title_he: string;
  detail_he: string;
  severity: Severity;
  /** אמת כאשר הממצא נשען על הריהוט, שהוא להמחשה בלבד */
  involvesFurniture: boolean;
  position: THREE.Vector3;
  /** תיבת החפיפה להצגה בתלת-ממד, אם קיימת */
  box?: THREE.Box3;
  room: string | null;
}

const DEVICE_BOX = 0.08;

/** גובה ההנחה של כל מערכת, זהה לזה שמשמש לבניית הצנרת בתלת-ממד. */
const PIPE_HEIGHT: Record<string, number> = {
  hot_cold: 0.35,
  drain: -0.06,
  refrigerant: 2.35,
};

export function detectClashes(index: ApartmentIndex): Clash[] {
  const out: Clash[] = [];
  const push = (c: Omit<Clash, 'id'>) => out.push({ ...c, id: `clash_${out.length + 1}` });

  const rooms = index.data.rooms;
  const furniture = index.data.furniture;
  const devices = index.data.devices;

  const boxOf = (item: FurnitureItem) => furnitureBox(item, index.rooms.get(item.room)?.y ?? 0);
  const furnitureBoxes = furniture.map((item) => ({ item, box: boxOf(item) }));

  const deviceBox = (d: Device) =>
    new THREE.Box3(
      new THREE.Vector3(d.position.x - DEVICE_BOX / 2, d.position.y - DEVICE_BOX / 2, d.position.z - DEVICE_BOX / 2),
      new THREE.Vector3(d.position.x + DEVICE_BOX / 2, d.position.y + DEVICE_BOX / 2, d.position.z + DEVICE_BOX / 2),
    );

  // --- 1 + 2: אביזר חשמל נחסם על ידי רהיט / ארון מטבח -----------------------
  for (const device of devices) {
    if (device.kind.startsWith('luminaire')) continue;
    const box = deviceBox(device);
    for (const { item, box: fbox } of furnitureBoxes) {
      if (!fbox.intersectsBox(box)) continue;
      const kitchenCabinet = item.kind.startsWith('kitchen_');
      const expected = kitchenCabinet && (device.kind === 'appliance_point' || device.height_cm <= 60);
      if (expected) continue; // שקע לתנור/מדיח מאחורי ארון הוא תכנון נכון
      push({
        rule: kitchenCabinet ? 2 : 1,
        title_he: kitchenCabinet ? 'אביזר חשמל מאחורי ארון מטבח' : 'אביזר חשמל נחסם על ידי ריהוט',
        detail_he: `${device.name_he} (${device.circuit ?? 'ללא מעגל'}, H=${device.height_cm}) נמצא בתוך הנפח של ${item.name_he}.`,
        severity: kitchenCabinet ? 'warning' : 'note',
        involvesFurniture: true,
        position: new THREE.Vector3(device.position.x, device.position.y, device.position.z),
        box: box.clone().intersect(fbox),
        room: device.room,
      });
    }
  }

  // --- 3 + 4: מתג ביחס לדלת -------------------------------------------------
  for (const device of devices) {
    if (device.kind !== 'switch') continue;
    for (const opening of index.data.openings) {
      if (!opening.kind.includes('door')) continue;
      const wall = index.walls.get(opening.wall);
      if (!wall) continue;
      const geo = openingGeometry(wall, opening);

      const toSwitch = new THREE.Vector2(
        device.position.x - geo.hinge.x,
        device.position.z - geo.hinge.y,
      );
      const radius = toSwitch.length();
      if (radius <= opening.width + 0.12 && radius > 0.05) {
        const inSweep = isInSweep(toSwitch, geo);
        if (inSweep) {
          push({
            rule: 3,
            title_he: 'מתג בגזרת סחיפת הדלת',
            detail_he: `${device.name_he} נמצא בטווח שהכנף של "${opening.name_he}" עוברת בו כשהיא נפתחת.`,
            severity: 'warning',
            involvesFurniture: false,
            position: new THREE.Vector3(device.position.x, device.position.y, device.position.z),
            room: device.room,
          });
        }
      }

      // מתג בצד הצירים במקום בצד הידית
      const distToJamb = Math.min(
        distance2(device.position, geo.jambStart),
        distance2(device.position, geo.jambEnd),
      );
      if (distToJamb < 0.6) {
        const nearHinge = distance2(device.position, geo.hinge) < distToJamb + 0.02;
        if (nearHinge) {
          push({
            rule: 4,
            title_he: 'מתג בצד הצירים של הדלת',
            detail_he: `${device.name_he} ממוקם בצד הצירים של "${opening.name_he}" ולא בצד הידית — נגישות פחות נוחה.`,
            severity: 'note',
            involvesFurniture: false,
            position: new THREE.Vector3(device.position.x, device.position.y, device.position.z),
            room: device.room,
          });
        }
      }
    }
  }

  // --- 5: גוף תאורה מעל גובה התקרה המונמכת ---------------------------------
  for (const device of devices) {
    if (device.kind !== 'luminaire_ceiling') continue;
    const room = rooms.find((r) => r.id === device.room);
    if (!room || room.ceiling.height === null) continue;
    const ceiling = room.y + room.ceiling.height;
    if (device.position.y > ceiling + 0.005) {
      push({
        rule: 5,
        title_he: 'גוף תאורה מעל גובה התקרה',
        detail_he: `${device.name_he} בגובה ${(device.position.y * 100).toFixed(0)} ס"מ, בעוד שתקרת ${room.name_he} בגובה ${(room.ceiling.height * 100).toFixed(0)} ס"מ.`,
        severity: 'error',
        involvesFurniture: false,
        position: new THREE.Vector3(device.position.x, device.position.y, device.position.z),
        room: room.id,
      });
    }
  }

  // --- 6: קו מערכת חוצה פתח בתוך גוף הקיר ----------------------------------
  // הבדיקה נעשית בשלושה ממדים: הקו חייב להיות בתוך עובי הקיר, בתוך רוחב הפתח,
  // וגם בטווח הגובה של הפתח. בלי בדיקת הגובה כל קו ניקוז שרץ ברצפה מתחת לסף
  // הדלת היה נספר כהתנגשות, בעוד שזה בדיוק המקום הנכון עבורו.
  for (const pipe of index.data.piping) {
    const pipeY = PIPE_HEIGHT[pipe.system];
    for (const opening of index.data.openings) {
      const wall = index.walls.get(opening.wall);
      if (!wall) continue;
      if (pipeY < opening.sill + 0.03 || pipeY > opening.sill + opening.height - 0.03) continue;
      const dir = new THREE.Vector2(wall.end.x - wall.start.x, wall.end.z - wall.start.z).normalize();
      const normal = new THREE.Vector2(-dir.y, dir.x);
      const hit = pipe.points.find((p) => {
        const rel = new THREE.Vector2(p.x - wall.start.x, p.z - wall.start.z);
        const along = rel.dot(dir);
        const across = Math.abs(rel.dot(normal));
        return (
          across <= wall.thickness / 2 + 0.02 &&
          along >= opening.offset - 0.02 &&
          along <= opening.offset + opening.width + 0.02
        );
      });
      if (!hit) continue;
      push({
        rule: 6,
        title_he: 'קו מערכת חוצה פתח',
        detail_he: `${pipe.name_he} (${pipe.id}) עובר בגוף הקיר בתוך הפתח "${opening.name_he}", בגובה ${(pipeY * 100).toFixed(0)} ס"מ.`,
        severity: 'warning',
        involvesFurniture: false,
        position: new THREE.Vector3(hit.x, pipeY, hit.z),
        room: null,
      });
      break;
    }
  }

  // --- 7: נקודת מים/ניקוז רחוקה מהכלי הסניטרי ------------------------------
  const fixtures = furniture.filter((f) =>
    ['bathtub', 'toilet', 'vanity', 'kitchen_sink', 'washing_machine', 'dishwasher'].includes(f.kind),
  );
  for (const pipe of index.data.piping) {
    if (pipe.system !== 'drain') continue;
    const end = pipe.points[pipe.points.length - 1];
    const nearest = fixtures
      .map((f) => ({ f, d: Math.hypot(f.position.x - end.x, f.position.z - end.z) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d > 0.4 && nearest.d < 1.6) {
      push({
        rule: 7,
        title_he: 'נקודת ניקוז רחוקה מהכלי',
        detail_he: `קצה ${pipe.name_he} במרחק ${(nearest.d * 100).toFixed(0)} ס"מ מ-${nearest.f.name_he}.`,
        severity: 'note',
        involvesFurniture: true,
        position: new THREE.Vector3(end.x, 0.05, end.z),
        room: nearest.f.room,
      });
    }
  }

  // --- 8: מעבר צר בין ריהוט לקיר -------------------------------------------
  for (const { item, box } of furnitureBoxes) {
    const room = index.rooms.get(item.room);
    if (!room || room.outdoor) continue;
    const gap = clearanceToRoomEdge(box, room.polygon);
    if (gap !== null && gap < 0.7 && gap > 0.02) {
      push({
        rule: 8,
        title_he: 'מעבר צר',
        detail_he: `הרווח בין ${item.name_he} לקיר הקרוב הוא ${(gap * 100).toFixed(0)} ס"מ — פחות מ-70 ס"מ המקובלים למעבר.`,
        severity: 'note',
        involvesFurniture: true,
        position: box.getCenter(new THREE.Vector3()),
        room: item.room,
      });
    }
  }

  // --- 9: דלת שאין לה מקום להיפתח ------------------------------------------
  for (const opening of index.data.openings) {
    if (!opening.kind.includes('door') || opening.kind === 'sliding') continue;
    const wall = index.walls.get(opening.wall);
    if (!wall) continue;
    const geo = openingGeometry(wall, opening);
    for (const { item, box } of furnitureBoxes) {
      const centre = box.getCenter(new THREE.Vector3());
      const v = new THREE.Vector2(centre.x - geo.hinge.x, centre.z - geo.hinge.y);
      if (v.length() > opening.width + 0.1) continue;
      if (!isInSweep(v, geo)) continue;
      push({
        rule: 9,
        title_he: 'לדלת אין מקום להיפתח',
        detail_he: `כנף "${opening.name_he}" סוחפת דרך ${item.name_he}.`,
        severity: 'warning',
        involvesFurniture: true,
        position: centre,
        box,
        room: item.room,
      });
    }
  }

  // --- 10: קיר ארוך בחדר מגורים בלי שקע ------------------------------------
  for (const wall of index.data.walls) {
    if (wall.length < 3 || wall.type === 'parapet' || wall.type === 'louver_screen') continue;
    const near = devices.filter(
      (d) => d.kind === 'socket' && d.wall === wall.id,
    );
    if (near.length > 0) continue;
    const mid = new THREE.Vector3(
      (wall.start.x + wall.end.x) / 2,
      1.0,
      (wall.start.z + wall.end.z) / 2,
    );
    const room = index.roomAt(mid.x, mid.z);
    if (room?.outdoor) continue;
    push({
      rule: 10,
      title_he: 'קיר ארוך ללא שקע',
      detail_he: `${wall.name_he} באורך ${(wall.length * 100).toFixed(0)} ס"מ, ולא נמצא עליו בית תקע בתכנית.`,
      severity: 'note',
      involvesFurniture: false,
      position: mid,
      room: room?.id ?? null,
    });
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, note: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.rule - b.rule);
}

// ---------------------------------------------------------------------------
// עזרים גאומטריים
// ---------------------------------------------------------------------------

interface OpeningGeometry {
  hinge: THREE.Vector2;
  jambStart: THREE.Vector2;
  jambEnd: THREE.Vector2;
  dir: THREE.Vector2;
  normal: THREE.Vector2;
  hingeAtStart: boolean;
  toward: number;
}

function openingGeometry(wall: Wall, opening: Opening): OpeningGeometry {
  const dir = new THREE.Vector2(wall.end.x - wall.start.x, wall.end.z - wall.start.z).normalize();
  const normal = new THREE.Vector2(-dir.y, dir.x);
  const at = (along: number) =>
    new THREE.Vector2(wall.start.x + dir.x * along, wall.start.z + dir.y * along);
  const jambStart = at(opening.offset);
  const jambEnd = at(opening.offset + opening.width);
  const hingeAtStart = (opening.hinge ?? 'start') === 'start';
  return {
    hinge: hingeAtStart ? jambStart : jambEnd,
    jambStart,
    jambEnd,
    dir,
    normal,
    hingeAtStart,
    toward: opening.toward ?? 1,
  };
}

/** האם הווקטור מהציר נמצא ברביע שהכנף סוחפת. */
function isInSweep(v: THREE.Vector2, geo: OpeningGeometry): boolean {
  const alongComponent = v.dot(geo.dir) * (geo.hingeAtStart ? 1 : -1);
  const normalComponent = v.dot(geo.normal) * geo.toward;
  return alongComponent > -0.05 && normalComponent > -0.05;
}

function distance2(a: { x: number; z: number }, b: THREE.Vector2): number {
  return Math.hypot(a.x - b.x, a.z - b.y);
}

/** המרווח הקטן ביותר בין תיבת רהיט לבין דופן החדר, בלי לספור מגע ישיר בקיר. */
function clearanceToRoomEdge(box: THREE.Box3, polygon: [number, number][]): number | null {
  const centre = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    const horizontal = Math.abs(az - bz) < 1e-6;
    const gap = horizontal
      ? Math.abs(centre.z - az) - half.z
      : Math.abs(centre.x - ax) - half.x;
    const withinSpan = horizontal
      ? centre.x > Math.min(ax, bx) - 0.2 && centre.x < Math.max(ax, bx) + 0.2
      : centre.z > Math.min(az, bz) - 0.2 && centre.z < Math.max(az, bz) + 0.2;
    if (!withinSpan) continue;
    if (best === null || gap < best) best = gap;
  }
  return best;
}
