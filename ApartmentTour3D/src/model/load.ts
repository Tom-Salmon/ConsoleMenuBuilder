import type { Apartment, Circuit, Device, Opening, Room, Wall } from './types';

/**
 * טעינת המודל ואינדוקס שלו.
 *
 * ה-Index הוא מבנה העזר שכל שאר האפליקציה עובדת מולו: חיפוש מהיר של קיר, פתח,
 * חדר או אביזר לפי מזהה, והמיפוי הדו-כיווני בין מעגלי החשמל לאביזרים שלהם —
 * שהוא הבסיס גם להפעלת המתגים וגם לסימון "מה מוזן ממה".
 */
export class ApartmentIndex {
  readonly walls = new Map<string, Wall>();
  readonly openings = new Map<string, Opening>();
  readonly rooms = new Map<string, Room>();
  readonly devices = new Map<string, Device>();
  readonly circuits = new Map<string, Circuit>();
  /** מזהה אביזר -> קוד המעגל שאליו הוא שייך */
  readonly circuitOf = new Map<string, string>();
  readonly openingsOfWall = new Map<string, Opening[]>();
  readonly devicesOfRoom = new Map<string, Device[]>();

  constructor(readonly data: Apartment) {
    for (const w of data.walls) {
      this.walls.set(w.id, w);
      this.openingsOfWall.set(w.id, []);
    }
    for (const o of data.openings) {
      this.openings.set(o.id, o);
      this.openingsOfWall.get(o.wall)?.push(o);
    }
    for (const r of data.rooms) {
      this.rooms.set(r.id, r);
      this.devicesOfRoom.set(r.id, []);
    }
    for (const d of data.devices) {
      this.devices.set(d.id, d);
      if (d.room) this.devicesOfRoom.get(d.room)?.push(d);
    }
    for (const c of data.circuits) {
      this.circuits.set(c.code, c);
      for (const id of [...c.switches, ...c.loads, ...c.sockets]) {
        this.circuitOf.set(id, c.code);
      }
    }
  }

  /** גבולות התכנית במישור הרצפה. */
  bounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of this.data.rooms) {
      for (const [x, z] of r.polygon) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    return { minX, maxX, minZ, maxZ };
  }

  /** כל האביזרים שיושבים על אותו מעגל כמו האביזר הנתון. */
  circuitPeers(deviceId: string): Device[] {
    const code = this.circuitOf.get(deviceId);
    if (!code) return [];
    const circuit = this.circuits.get(code);
    if (!circuit) return [];
    return [...circuit.switches, ...circuit.loads, ...circuit.sockets]
      .map((id) => this.devices.get(id))
      .filter((d): d is Device => Boolean(d));
  }

  roomAt(x: number, z: number): Room | null {
    let match: Room | null = null;
    for (const room of this.data.rooms) {
      if (!pointInPolygon(x, z, room.polygon)) continue;
      // חדר-משנה (מטבח בתוך חדר הדיור) גובר על החדר שהוא חלק ממנו
      if (!match || room.part_of) match = room;
    }
    return match;
  }
}

export function pointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export async function loadApartment(url = './data/apartment.json'): Promise<ApartmentIndex> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`טעינת המודל נכשלה (${response.status}). הרץ: npm run data`);
  }
  return new ApartmentIndex((await response.json()) as Apartment);
}
