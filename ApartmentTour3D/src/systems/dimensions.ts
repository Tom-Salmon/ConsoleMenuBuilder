import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { PALETTE } from '../core/materials';
import type { ApartmentIndex } from '../model/load';

/**
 * שכבת המידות.
 *
 * הקווים מצוירים ב-Line2 (קו בעל עובי אמיתי בפיקסלים) והתוויות ב-CSS2D, כך
 * שהמספרים נשארים חדים בכל מרחק ובכל זום — בניגוד לטקסט שמרונדר כטקסטורה.
 * הערכים הם המידות הכתובות בתכנית עצמה, ולא מדידה מחדש של המודל.
 */

export interface DimensionLayer {
  group: THREE.Group;
  labels: CSS2DObject[];
  resize(width: number, height: number): void;
  /** מעמעם תוויות רחוקות כדי שהתצוגה לא תתמלא בטקסט חופף */
  updateFade(camera: THREE.Camera): void;
}

/** מעבר לזה תווית נעלמת לגמרי; לפני זה היא דוהה בהדרגה. */
const FADE_NEAR = 9;
const FADE_FAR = 26;

export function makeLabel(text: string, className = 'dim-label'): CSS2DObject {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

export function fatLine(points: THREE.Vector3[], colour: number, width = 2.5): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
  const material = new LineMaterial({
    color: colour,
    linewidth: width,
    dashed: false,
    transparent: true,
    opacity: 0.95,
  });
  material.resolution.set(window.innerWidth, window.innerHeight);
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  return line;
}

export function dashedLine(points: THREE.Vector3[], colour: number, width = 3): Line2 {
  const line = fatLine(points, colour, width);
  const material = line.material as LineMaterial;
  material.dashed = true;
  material.dashSize = 0.14;
  material.gapSize = 0.09;
  material.defines.USE_DASH = '';
  material.needsUpdate = true;
  line.computeLineDistances();
  return line;
}

export function buildDimensions(index: ApartmentIndex): DimensionLayer {
  const group = new THREE.Group();
  group.name = 'dimensions';
  const labels: CSS2DObject[] = [];
  const materials: LineMaterial[] = [];
  const { minX, minZ, maxZ } = index.bounds();

  // שרשראות המידות הכתובות בתכנית
  index.data.dimensions.forEach((dim, i) => {
    const lane = 0.28 * (i % 4);
    const y = 0.02;
    let a: THREE.Vector3;
    let b: THREE.Vector3;
    if (dim.axis === 'x') {
      const z = maxZ + 0.45 + lane;
      a = new THREE.Vector3(dim.from, y, z);
      b = new THREE.Vector3(dim.to, y, z);
    } else {
      const x = minX - 0.45 - lane;
      a = new THREE.Vector3(x, y, dim.from);
      b = new THREE.Vector3(x, y, dim.to);
    }
    const line = fatLine([a, b], PALETTE.dimension, 2);
    materials.push(line.material as LineMaterial);
    group.add(line);
    for (const end of [a, b]) {
      const tick = fatLine(
        [
          new THREE.Vector3(end.x - (dim.axis === 'x' ? 0 : 0.09), y, end.z - (dim.axis === 'x' ? 0.09 : 0)),
          new THREE.Vector3(end.x + (dim.axis === 'x' ? 0 : 0.09), y, end.z + (dim.axis === 'x' ? 0.09 : 0)),
        ],
        PALETTE.dimension,
        2,
      );
      materials.push(tick.material as LineMaterial);
      group.add(tick);
    }
    const label = makeLabel(`${dim.value_cm}`);
    label.element.title = dim.label_he;
    label.position.copy(a.clone().lerp(b, 0.5).setY(y + 0.02));
    labels.push(label);
    group.add(label);
  });

  // כרטיס לכל חדר: שם, שטח, גובה תקרה ומפלס
  for (const room of index.data.rooms) {
    const cx = room.polygon.reduce((s, p) => s + p[0], 0) / room.polygon.length;
    const cz = room.polygon.reduce((s, p) => s + p[1], 0) / room.polygon.length;
    const ceiling = room.ceiling.height ? `תקרה ${(room.ceiling.height * 100).toFixed(0)} ס"מ` : 'ללא תקרה';
    const label = makeLabel(
      `${room.name_he}\n${room.area_m2.toFixed(2)} מ"ר · ${ceiling} · מפלס ${room.plan_elevation.toFixed(2)}`,
      'room-label',
    );
    label.position.set(cx, room.y + 1.5, cz);
    labels.push(label);
    group.add(label);
  }

  // מידות הפתחים, על גבי הפתח עצמו
  for (const opening of index.data.openings) {
    const wall = index.walls.get(opening.wall);
    if (!wall) continue;
    const dir = new THREE.Vector2(wall.end.x - wall.start.x, wall.end.z - wall.start.z).normalize();
    const along = opening.offset + opening.width / 2;
    const pos = new THREE.Vector3(
      wall.start.x + dir.x * along,
      opening.sill + opening.height / 2,
      wall.start.z + dir.y * along,
    );
    const label = makeLabel(
      `${(opening.width * 100).toFixed(0)}/${(opening.height * 100).toFixed(0)}`,
      'opening-label',
    );
    label.element.title = `${opening.name_he}${opening.plan_note ? ` · בתכנית: ${opening.plan_note}` : ''}`;
    label.position.copy(pos);
    labels.push(label);
    group.add(label);
  }

  void minZ;

  const worldPos = new THREE.Vector3();
  return {
    group,
    labels,
    resize(width, height) {
      for (const m of materials) m.resolution.set(width, height);
    },
    updateFade(camera) {
      if (!group.visible) return;
      for (const label of labels) {
        label.getWorldPosition(worldPos);
        const distance = worldPos.distanceTo(camera.position);
        const fade = 1 - THREE.MathUtils.clamp((distance - FADE_NEAR) / (FADE_FAR - FADE_NEAR), 0, 1);
        label.element.style.opacity = fade.toFixed(2);
        label.visible = fade > 0.05;
      }
    },
  };
}
