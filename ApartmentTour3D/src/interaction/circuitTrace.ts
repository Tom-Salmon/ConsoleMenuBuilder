import * as THREE from 'three';
import { PALETTE } from '../core/materials';
import type { ApartmentIndex } from '../model/load';
import type { Circuit, Device } from '../model/types';
import type { DeviceNode } from '../systems/devices';
import { dashedLine, makeLabel } from '../systems/dimensions';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * סימון "מה מוזן ממה".
 *
 * כשמכוונים על מתג, כל האביזרים שעל אותו מעגל נצבעים ומקבלים טבעת סימון על
 * הרצפה, וכל שאר האביזרים מעומעמים כדי שהקבוצה תבלוט. הסימון עובד גם בכיוון
 * ההפוך — הכוונה על גוף תאורה מדגישה את המתגים ששולטים בו.
 *
 * הקו המקווקו שמחבר בין המתג לצרכנים הוא **קישור לוגי ולא תוואי חיווט**: תוואי
 * הכבלים אינו מופיע בתכנית, ולכן אין לו על מה להתבסס. הממשק אומר זאת במפורש.
 */

export interface TraceInfo {
  circuit: Circuit;
  devices: Device[];
  note: string;
}

const RING_COLOUR = new THREE.Color(PALETTE.trace);

export class CircuitTrace {
  private readonly group = new THREE.Group();
  private readonly lineMaterials: LineMaterial[] = [];
  private readonly labels: CSS2DObject[] = [];
  private active: string | null = null;
  locked = false;

  constructor(
    scene: THREE.Scene,
    private readonly index: ApartmentIndex,
    private readonly nodes: Map<string, DeviceNode>,
  ) {
    this.group.name = 'circuit_trace';
    this.group.visible = false;
    scene.add(this.group);
  }

  get activeCode(): string | null {
    return this.active;
  }

  /** מציג את המעגל של האביזר הנתון. מחזיר את פרטי המעגל לכרטיסיית המידע. */
  show(deviceId: string | null): TraceInfo | null {
    if (this.locked && deviceId !== null) return this.current();
    const code = deviceId ? this.index.circuitOf.get(deviceId) : null;
    if (!code) {
      this.clear();
      return null;
    }
    if (code === this.active) return this.current();
    this.active = code;
    this.rebuild(code);
    return this.current();
  }

  toggleLock(): boolean {
    if (!this.active) return false;
    this.locked = !this.locked;
    return this.locked;
  }

  clear(): void {
    if (this.locked) return;
    this.active = null;
    this.disposeGroup();
    this.group.visible = false;
    this.setDim(false);
  }

  forceClear(): void {
    this.locked = false;
    this.clear();
  }

  resize(width: number, height: number): void {
    for (const m of this.lineMaterials) m.resolution.set(width, height);
  }

  private current(): TraceInfo | null {
    if (!this.active) return null;
    const circuit = this.index.circuits.get(this.active);
    if (!circuit) return null;
    return {
      circuit,
      devices: this.index.circuitPeers(circuit.switches[0] ?? circuit.loads[0] ?? ''),
      note: 'הקו המקווקו הוא קישור לוגי בין המתג לצרכנים — לא תוואי חיווט. התכנית אינה מסמנת תוואי כבלים.',
    };
  }

  private rebuild(code: string): void {
    this.disposeGroup();
    const circuit = this.index.circuits.get(code);
    if (!circuit) return;

    const members = [...circuit.switches, ...circuit.loads, ...circuit.sockets]
      .map((id) => this.index.devices.get(id))
      .filter((d): d is Device => Boolean(d));

    for (const device of members) {
      this.group.add(this.ring(device));
      const node = this.nodes.get(device.id);
      if (node) node.root.visible = true;
    }

    // קישור לוגי: מכל מתג אל כל צרכן, בגובה התקרה
    const switches = circuit.switches.map((id) => this.index.devices.get(id)).filter(Boolean) as Device[];
    const loads = [...circuit.loads, ...circuit.sockets]
      .map((id) => this.index.devices.get(id))
      .filter(Boolean) as Device[];

    for (const sw of switches) {
      for (const load of loads) {
        const room = this.index.rooms.get(sw.room ?? '');
        const y = (room?.y ?? 0) + (room?.ceiling.height ?? 2.55) - 0.12;
        const line = dashedLine(
          [
            new THREE.Vector3(sw.position.x, sw.position.y, sw.position.z),
            new THREE.Vector3(sw.position.x, y, sw.position.z),
            new THREE.Vector3(load.position.x, y, load.position.z),
            new THREE.Vector3(load.position.x, load.position.y, load.position.z),
          ],
          PALETTE.trace,
          2.6,
        );
        const material = line.material as LineMaterial;
        material.depthTest = false;
        material.needsUpdate = true;
        line.renderOrder = 900;
        this.lineMaterials.push(material);
        this.group.add(line);
      }
    }

    const anchor = members[0];
    if (anchor) {
      const label = makeLabel(`מעגל ${circuit.code}`, 'trace-label');
      label.position.set(anchor.position.x, anchor.position.y + 0.28, anchor.position.z);
      this.labels.push(label);
      this.group.add(label);
    }

    this.group.visible = true;
    this.setDim(true, new Set(members.map((d) => d.id)));
  }

  private ring(device: Device): THREE.Mesh {
    const room = this.index.rooms.get(device.room ?? '');
    const geometry = new THREE.RingGeometry(0.16, 0.22, 24);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: RING_COLOUR,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(device.position.x, (room?.y ?? 0) + 0.012, device.position.z);
    mesh.renderOrder = 901;
    return mesh;
  }

  /** מעמעם את כל האביזרים שאינם על המעגל המסומן. */
  private setDim(on: boolean, keep?: Set<string>): void {
    for (const [id, node] of this.nodes) {
      const dim = on && !(keep?.has(id) ?? false);
      node.root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const material = child.material as THREE.Material & { opacity: number; transparent: boolean };
        material.transparent = dim || material.transparent;
        material.opacity = dim ? 0.18 : 1;
        material.needsUpdate = true;
      });
    }
  }

  private disposeGroup(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    this.lineMaterials.length = 0;
    this.labels.length = 0;
  }
}
