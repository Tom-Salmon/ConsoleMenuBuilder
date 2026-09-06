import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

/**
 * בחירה והדגשה.
 *
 * במצב גוף ראשון הכוונת נמצאת במרכז המסך, ובמצב "בית בובות" נבחר מה שתחת סמן
 * העכבר. הרייקאסט מואץ ב-BVH כדי שהבדיקה תרוץ כל פריים בלי לפגוע בביצועים.
 */

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export interface PickResult {
  object: THREE.Object3D;
  kind: string;
  id: string;
  point: THREE.Vector3;
  data: Record<string, unknown>;
}

export class Picker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(0, 0);
  private targets: THREE.Object3D[] = [];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    // בגוף ראשון מגבילים את טווח הבחירה לזרוע יד מורחבת בערך, כדי שלא נפעיל
    // מתג מהצד השני של הדירה. במצב "בית בובות" המצלמה נמצאת מחוץ לדירה ולכן
    // הטווח חייב להיות גדול בהרבה, אחרת שום דבר אינו ניתן ללחיצה.
    this.raycaster.far = 12;
    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    });
  }

  /** טווח הבחירה במטרים. */
  setRange(far: number): void {
    this.raycaster.far = far;
  }

  setTargets(objects: THREE.Object3D[]): void {
    this.targets = objects;
    for (const object of objects) {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && !child.geometry.boundsTree) {
          child.geometry.computeBoundsTree();
        }
      });
    }
  }

  /** @param centred אמת במצב גוף ראשון — הכוונת במרכז המסך. */
  pick(centred: boolean): PickResult | null {
    this.raycaster.setFromCamera(centred ? new THREE.Vector2(0, 0) : this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.targets, true);
    for (const hit of hits) {
      const owner = findOwner(hit.object);
      if (!owner) continue;
      const data = owner.userData as { kind: string; id: string };
      return { object: owner, kind: data.kind, id: data.id, point: hit.point, data: owner.userData };
    }
    return null;
  }
}

function findOwner(object: THREE.Object3D): THREE.Object3D | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (typeof node.userData?.kind === 'string' && typeof node.userData?.id === 'string') return node;
    node = node.parent;
  }
  return null;
}

/**
 * הדגשת האובייקט שתחת הכוונת. במקום להחליף חומרים (שמאבד את המצב הקודם) מוסיפים
 * שכבת מתאר דקה מעל האובייקט, כך שהחומר המקורי נשאר בדיוק כפי שהוא.
 */
export class Highlighter {
  private outline: THREE.Object3D | null = null;
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0xffc400,
    transparent: true,
    opacity: 0.28,
    depthTest: false,
    side: THREE.BackSide,
  });

  constructor(private readonly scene: THREE.Scene) {}

  show(object: THREE.Object3D | null): void {
    if (this.outline) {
      this.scene.remove(this.outline);
      this.outline = null;
    }
    if (!object) return;

    const clone = new THREE.Group();
    object.traverseVisible((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const shell = new THREE.Mesh(child.geometry, this.material);
      child.updateWorldMatrix(true, false);
      shell.matrixAutoUpdate = false;
      shell.matrix.copy(child.matrixWorld).scale(new THREE.Vector3(1.06, 1.06, 1.06));
      shell.renderOrder = 999;
      clone.add(shell);
    });
    if (clone.children.length === 0) return;
    this.outline = clone;
    this.scene.add(clone);
  }
}
