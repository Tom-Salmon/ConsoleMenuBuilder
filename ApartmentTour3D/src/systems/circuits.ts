import * as THREE from 'three';
import type { ApartmentIndex } from '../model/load';
import type { Circuit } from '../model/types';
import type { DeviceNode } from './devices';

/**
 * מנוע המעגלים — מה שהופך את המתגים בדירה לאמיתיים.
 *
 * הקישור בין מתג לגוף תאורה לא הומצא כאן: הוא מגיע מקוד המעגל שכתוב בתכנית ליד
 * כל אביזר (13/1, 17/1 וכן הלאה). מתג וגוף תאורה שנושאים את אותו קוד יושבים על
 * אותו מעגל. מעגל שיש לו יותר ממתג אחד הוא מפסק מחליף, וכל אחד מהמתגים שלו הופך
 * את מצבו.
 */

const ON_COLOUR = new THREE.Color(0xfff0cf);
const OFF_COLOUR = new THREE.Color(0x2a2f36);

export class CircuitEngine {
  private readonly state = new Map<string, boolean>();
  private readonly listeners = new Set<(code: string, on: boolean) => void>();
  /** תקציב מקורות אור מצלים — מגן על קצב הפריימים */
  private shadowBudget = 4;

  constructor(
    private readonly index: ApartmentIndex,
    private readonly nodes: Map<string, DeviceNode>,
  ) {
    for (const circuit of index.data.circuits) {
      this.state.set(circuit.code, circuit.default_on);
    }
    this.applyAll();
  }

  isOn(code: string): boolean {
    return this.state.get(code) ?? false;
  }

  /** המעגל שאליו שייך אביזר נתון. */
  circuitOfDevice(deviceId: string): Circuit | undefined {
    const code = this.index.circuitOf.get(deviceId);
    return code ? this.index.circuits.get(code) : undefined;
  }

  /** הפעלה מתוך לחיצה על מתג — בדיוק כמו בדירה. */
  pressSwitch(deviceId: string): Circuit | undefined {
    const circuit = this.circuitOfDevice(deviceId);
    if (!circuit || circuit.kind !== 'lighting') return undefined;
    this.setCircuit(circuit.code, !this.isOn(circuit.code));
    return circuit;
  }

  setCircuit(code: string, on: boolean): void {
    if (this.state.get(code) === on) return;
    this.state.set(code, on);
    this.applyCircuit(code);
    for (const listener of this.listeners) listener(code, on);
  }

  setAll(on: boolean): void {
    for (const circuit of this.index.data.circuits) {
      if (circuit.kind === 'lighting') this.setCircuit(circuit.code, on);
    }
  }

  onChange(listener: (code: string, on: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** תרחיש בית חכם — מדליק קבוצת מעגלים ומכבה את השאר. */
  applyScene(codes: string[]): void {
    for (const circuit of this.index.data.circuits) {
      if (circuit.kind !== 'lighting') continue;
      this.setCircuit(circuit.code, codes.includes(circuit.code));
    }
  }

  private applyAll(): void {
    for (const circuit of this.index.data.circuits) this.applyCircuit(circuit.code);
  }

  private applyCircuit(code: string): void {
    const circuit = this.index.circuits.get(code);
    if (!circuit) return;
    const on = this.isOn(code);
    for (const id of circuit.loads) {
      const node = this.nodes.get(id);
      if (!node?.emissive || !node.light) continue;
      node.emissive.emissive.copy(on ? ON_COLOUR : OFF_COLOUR);
      node.emissive.emissiveIntensity = on ? 2.4 : 1;
      node.light.intensity = on ? 9 : 0;
      node.light.visible = on;
      if (on && this.shadowBudget > 0 && !node.light.castShadow) {
        node.light.castShadow = true;
        node.light.shadow.mapSize.set(512, 512);
        node.light.shadow.bias = -0.002;
        this.shadowBudget -= 1;
      }
    }
    // שקעים אינם משנים מראה, אבל מעגל כוח כבוי מנתק גם אותם לוגית
    for (const id of circuit.switches) {
      const node = this.nodes.get(id);
      if (!node) continue;
      const rocker = node.root.children.find((c) => c instanceof THREE.Mesh && c.position.z > 0.014);
      if (rocker) rocker.rotation.x = on ? -0.16 : 0.16;
    }
  }

  /** סיכום קריא בעברית של מעגל, לכרטיסיית המידע. */
  describe(code: string): string {
    const circuit = this.index.circuits.get(code);
    if (!circuit) return '';
    const rooms = circuit.rooms
      .map((id) => this.index.rooms.get(id)?.name_he ?? id)
      .join(', ');
    const parts = [`מעגל ${circuit.code}`, circuit.kind === 'lighting' ? 'תאורה' : 'כוח'];
    if (circuit.mode === 'two_way') parts.push(`מפסק מחליף (${circuit.switches.length} מתגים)`);
    if (circuit.loads.length) parts.push(`${circuit.loads.length} גופי תאורה`);
    if (circuit.sockets.length) parts.push(`${circuit.sockets.length} שקעים`);
    if (rooms) parts.push(rooms);
    return parts.join(' · ');
  }
}
