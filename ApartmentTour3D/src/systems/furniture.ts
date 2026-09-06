import * as THREE from 'three';
import { PALETTE } from '../core/materials';
import type { ApartmentIndex } from '../model/load';
import type { FurnitureItem } from '../model/types';

/**
 * ריהוט וכלים סניטריים — נבנים פרוצדורלית בקוד, בלי נכסים חיצוניים.
 *
 * הערת המתכנן בתכנית: "סימון אביזרי ריהוט, כלים סניטרים וכדומה הינו להמחשה
 * בלבד." לכן הריהוט כאן נועד להמחשה של הנפחים ולא כמידה מחייבת, וניתן לכבות
 * אותו לגמרי מהממשק כדי לראות את הדירה כפי שהיא נמסרת.
 */

const mat = (color: number, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const M = {
  wood: mat(PALETTE.woodLight, 0.65),
  woodDark: mat(PALETTE.woodDark, 0.6),
  fabric: mat(PALETTE.fabric, 0.95),
  metal: mat(PALETTE.metal, 0.35, 0.8),
  porcelain: mat(PALETTE.porcelain, 0.15),
  counter: mat(0x3f4550, 0.4),
  appliance: mat(0xdfe3e8, 0.35, 0.5),
  glassTop: new THREE.MeshPhysicalMaterial({
    color: 0xe4edf3,
    roughness: 0.07,
    clearcoat: 1,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  }),
  mattress: mat(0xf2efe9, 0.9),
  water: mat(0x6fb7d8, 0.1, 0.2),
};

function box(w: number, h: number, d: number, material: THREE.Material, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.y = y + h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(r: number, h: number, material: THREE.Material, y = 0, segments = 20): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  mesh.position.y = y + h / 2;
  mesh.castShadow = true;
  return mesh;
}

type Builder = (size: [number, number, number]) => THREE.Group;

const builders: Record<string, Builder> = {
  bathtub: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.porcelain));
    const inner = box(w - 0.14, 0.06, d - 0.16, M.water, h - 0.14);
    g.add(inner);
    return g;
  },
  toilet: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.12, d * 0.75, M.porcelain, h - 0.12));
    g.add(cylinder(w * 0.42, h - 0.12, M.porcelain, 0));
    g.add(box(w * 0.9, 0.5, 0.16, M.porcelain, h));
    return g;
  },
  vanity: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h - 0.08, d, M.woodDark));
    g.add(box(w + 0.04, 0.05, d + 0.03, M.porcelain, h - 0.08));
    const basin = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.porcelain);
    basin.rotation.x = Math.PI;
    basin.position.y = h - 0.02;
    g.add(basin);
    g.add(cylinder(0.014, 0.2, M.metal, h - 0.03));
    return g;
  },
  washing_machine: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.appliance));
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(w * 0.32, 24), M.glassTop);
    hatch.position.set(0, h * 0.55, d / 2 + 0.005);
    g.add(hatch);
    return g;
  },
  boiler: ([w, , d]) => {
    const g = new THREE.Group();
    const tank = cylinder(w / 2, d, M.metal, 0.1, 24);
    g.add(tank);
    g.add(box(w * 0.9, 0.06, w * 0.9, M.metal, 0));
    return g;
  },
  condenser: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.appliance, 0.35));
    const fan = new THREE.Mesh(new THREE.TorusGeometry(h * 0.3, 0.02, 8, 24), M.metal);
    fan.position.set(0, 0.35 + h / 2, d / 2 + 0.01);
    g.add(fan);
    for (let i = 0; i < 2; i++) {
      g.add(box(0.05, 0.35, 0.05, M.metal, 0).translateX((i ? 1 : -1) * (w / 2 - 0.06)));
    }
    return g;
  },
  drying_rack: ([w, , d]) => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const bar = box(w, 0.015, 0.015, M.metal, 1.5);
      bar.position.z = -d / 2 + (i * d) / 4;
      g.add(bar);
    }
    return g;
  },
  bed_double: ([w, h, d]) => bedBuilder(w, h, d),
  bed_single: ([w, h, d]) => bedBuilder(w, h, d),
  nightstand: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.wood));
    g.add(box(w * 0.6, 0.02, 0.02, M.metal, h * 0.55).translateZ(d / 2));
    return g;
  },
  wardrobe: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.wood));
    const seam = box(0.015, h - 0.1, 0.01, M.woodDark, 0.05);
    seam.position.z = d / 2 + 0.005;
    g.add(seam);
    return g;
  },
  desk: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.04, d, M.wood, h - 0.04));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = box(0.05, h - 0.04, 0.05, M.metal);
        leg.position.set(sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05));
        g.add(leg);
      }
    }
    return g;
  },
  sofa: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.42, d, M.fabric));
    g.add(box(0.2, h - 0.1, d, M.fabric).translateX(-(w / 2 - 0.1)));
    for (const s of [-1, 1]) {
      g.add(box(w, 0.5, 0.18, M.fabric, 0.42).translateZ(s * (d / 2 - 0.09)));
    }
    return g;
  },
  coffee_table: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.04, d, M.glassTop, h - 0.04));
    g.add(box(w * 0.7, h - 0.06, d * 0.7, M.woodDark));
    return g;
  },
  dining_table: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.05, d, M.wood, h - 0.05));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = box(0.06, h - 0.05, 0.06, M.woodDark);
        leg.position.set(sx * (w / 2 - 0.09), (h - 0.05) / 2, sz * (d / 2 - 0.09));
        g.add(leg);
      }
    }
    for (const sz of [-1, 1]) {
      for (const i of [-1, 1]) {
        const chair = new THREE.Group();
        chair.add(box(0.44, 0.05, 0.44, M.wood, 0.44));
        chair.add(box(0.44, 0.45, 0.05, M.wood, 0.49).translateZ(sz * -0.2));
        chair.position.set(i * 0.42, 0, sz * (d / 2 + 0.32));
        g.add(chair);
      }
    }
    return g;
  },
  tv_unit: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.45, d, M.woodDark));
    g.add(box(0.05, Math.max(0.5, h - 0.45), d * 0.95, mat(0x14171c, 0.25), 0.72));
    return g;
  },
  kitchen_counter: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h - 0.04, d, M.wood));
    g.add(box(w + 0.02, 0.04, d + 0.02, M.counter, h - 0.04));
    g.add(box(w, 0.1, d * 0.9, M.woodDark, 0));
    return g;
  },
  kitchen_upper: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.wood, 1.45));
    return g;
  },
  cooktop: ([w, , d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.02, d, mat(0x1a1c20, 0.2), 0.9));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const burner = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 20), M.metal);
        burner.rotation.x = Math.PI / 2;
        burner.position.set(sx * w * 0.22, 0.925, sz * d * 0.22);
        g.add(burner);
      }
    }
    return g;
  },
  kitchen_sink: ([w, , d]) => {
    const g = new THREE.Group();
    g.add(box(w, 0.16, d, M.metal, 0.74));
    g.add(box(w - 0.06, 0.02, d - 0.06, M.water, 0.8));
    const tap = cylinder(0.016, 0.28, M.metal, 0.9);
    tap.position.z = -d / 2 - 0.03;
    g.add(tap);
    return g;
  },
  fridge: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.appliance));
    const seam = box(w - 0.02, 0.012, 0.01, mat(0x9aa0a6), h * 0.62);
    seam.position.z = d / 2 + 0.005;
    g.add(seam);
    return g;
  },
  dishwasher: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, M.appliance));
    return g;
  },
  cabinet_panel: ([w, h, d]) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, mat(0xd7dbe0, 0.5)));
    return g;
  },
};

function bedBuilder(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, h - 0.18, d, M.woodDark, 0.06));
  g.add(box(w - 0.06, 0.18, d - 0.06, M.mattress, h - 0.18 + 0.06));
  g.add(box(w, 0.55, 0.06, M.woodDark, 0.06).translateZ(-(d / 2 - 0.03)));
  const pillow = box(w * 0.42, 0.1, 0.32, M.fabric, h - 0.06);
  pillow.position.z = -(d / 2 - 0.3);
  g.add(pillow);
  return g;
}

export function buildFurniture(index: ApartmentIndex): {
  group: THREE.Group;
  items: Map<string, THREE.Group>;
} {
  const group = new THREE.Group();
  group.name = 'furniture';
  const items = new Map<string, THREE.Group>();

  for (const item of index.data.furniture) {
    const build = builders[item.kind];
    if (!build) continue;
    const node = build(item.size);
    node.name = item.id;
    const room = index.roomAt(item.position.x, item.position.z) ?? index.rooms.get(item.room);
    node.position.set(item.position.x, room?.y ?? 0, item.position.z);
    node.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    tagTree(node, item);
    group.add(node);
    items.set(item.id, node);
  }
  return { group, items };
}

function tagTree(node: THREE.Object3D, item: FurnitureItem): void {
  node.traverse((child) => {
    child.userData = { kind: 'furniture', id: item.id, item };
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/** תיבה תוחמת של פריט ריהוט, לשימוש בבדיקת ההתנגשויות ובהתנגשות המצלמה. */
export function furnitureBox(item: FurnitureItem, y: number): THREE.Box3 {
  const [w, h, d] = item.size;
  const rad = THREE.MathUtils.degToRad(item.rotation);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfX = (w * cos + d * sin) / 2;
  const halfZ = (w * sin + d * cos) / 2;
  return new THREE.Box3(
    new THREE.Vector3(item.position.x - halfX, y, item.position.z - halfZ),
    new THREE.Vector3(item.position.x + halfX, y + h, item.position.z + halfZ),
  );
}
