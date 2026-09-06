import * as THREE from 'three';
import { PALETTE } from '../core/materials';
import { fatLine, makeLabel } from '../systems/dimensions';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * כלי מדידה: לחיצה על שתי נקודות בסצנה מציגה את המרחק ביניהן בסנטימטרים.
 * שימושי גם כבדיקה — מדידה על קיר ידוע חייבת להחזיר את המידה שכתובה בתכנית.
 */
export class MeasureTool {
  private readonly group = new THREE.Group();
  private readonly points: THREE.Vector3[] = [];
  private readonly materials: LineMaterial[] = [];
  active = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'measure';
    scene.add(this.group);
  }

  toggle(): boolean {
    this.active = !this.active;
    if (!this.active) this.reset();
    return this.active;
  }

  reset(): void {
    for (const child of [...this.group.children]) this.group.remove(child);
    this.points.length = 0;
    this.materials.length = 0;
  }

  /** @returns הטקסט להצגה בממשק, או null אם זו רק הנקודה הראשונה. */
  addPoint(point: THREE.Vector3): string | null {
    if (this.points.length === 2) this.reset();
    this.points.push(point.clone());
    this.group.add(marker(point));

    if (this.points.length < 2) return null;
    const [a, b] = this.points;
    const line = fatLine([a, b], PALETTE.highlight, 3);
    const material = line.material as LineMaterial;
    material.depthTest = false;
    line.renderOrder = 950;
    this.materials.push(material);
    this.group.add(line);

    const distance = a.distanceTo(b);
    const text = `${(distance * 100).toFixed(1)} ס"מ`;
    const label = makeLabel(text, 'measure-label');
    label.position.copy(a.clone().lerp(b, 0.5));
    this.group.add(label);
    return text;
  }

  resize(width: number, height: number): void {
    for (const m of this.materials) m.resolution.set(width, height);
  }
}

function marker(point: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.highlight, depthTest: false }),
  );
  mesh.position.copy(point);
  mesh.renderOrder = 951;
  return mesh;
}
