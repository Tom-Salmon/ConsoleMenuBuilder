import * as THREE from 'three';
import { PALETTE } from '../core/materials';
import type { ApartmentIndex } from '../model/load';
import type { Device, PipeSystem } from '../model/types';

/**
 * צנרת ומערכות: מים חמים/קרים וגז, ניקוז 2", וקווי גז המיזוג.
 *
 * הקווים נבנים כצינורות אמיתיים ולא כקווים שטוחים, בקטרים לפי סוג המערכת — כך
 * שבמצב הרנטגן רואים צנרת בעלת נפח בתוך הקירות והרצפה, כמו במציאות. לכל אביזר
 * חשמל נוספת "ירידה בקיר": קטע אנכי מגובה ההתקנה שלו אל גובה ההזנה.
 */

const SYSTEM_STYLE: Record<PipeSystem, { colour: number; y: number; label: string }> = {
  hot_cold: { colour: PALETTE.water, y: 0.35, label: 'מים חמים/קרים וגז' },
  drain: { colour: PALETTE.drain, y: -0.06, label: 'ניקוז 2"' },
  refrigerant: { colour: PALETTE.hvac, y: 2.35, label: 'צנרת גז מיזוג' },
};

function tubeFrom(points: THREE.Vector3[], radius: number): THREE.BufferGeometry {
  if (points.length < 2) return new THREE.BufferGeometry();
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.0);
  const segments = Math.min(220, Math.max(8, points.length * 6));
  return new THREE.TubeGeometry(curve, segments, radius, 8, false);
}

export interface PipingLayers {
  group: THREE.Group;
  bySystem: Record<PipeSystem, THREE.Group>;
  drops: THREE.Group;
}

export function buildPiping(index: ApartmentIndex): PipingLayers {
  const group = new THREE.Group();
  group.name = 'piping';

  const bySystem = {
    hot_cold: new THREE.Group(),
    drain: new THREE.Group(),
    refrigerant: new THREE.Group(),
  } as Record<PipeSystem, THREE.Group>;

  const materials: Record<PipeSystem, THREE.MeshStandardMaterial> = {
    hot_cold: pipeMaterial(SYSTEM_STYLE.hot_cold.colour),
    drain: pipeMaterial(SYSTEM_STYLE.drain.colour),
    refrigerant: pipeMaterial(SYSTEM_STYLE.refrigerant.colour),
  };

  for (const pipe of index.data.piping) {
    const style = SYSTEM_STYLE[pipe.system];
    const room = index.roomAt(pipe.points[0].x, pipe.points[0].z);
    const baseY = (room?.y ?? 0) + style.y;
    const points = pipe.points.map((p) => new THREE.Vector3(p.x, baseY, p.z));
    const geometry = tubeFrom(points, pipe.radius);
    if (!geometry.attributes.position) continue;
    const mesh = new THREE.Mesh(geometry, materials[pipe.system]);
    mesh.name = pipe.id;
    mesh.userData = { kind: 'pipe', id: pipe.id, pipe };
    bySystem[pipe.system].add(mesh);
  }

  for (const [system, node] of Object.entries(bySystem) as [PipeSystem, THREE.Group][]) {
    node.name = `pipes_${system}`;
    group.add(node);
  }

  const drops = buildWallDrops(index);
  group.add(drops);

  return { group, bySystem, drops };
}

function pipeMaterial(colour: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.45,
    metalness: 0.15,
    emissive: new THREE.Color(colour).multiplyScalar(0.12),
  });
}

/**
 * הירידות בקיר: קטע צינור אנכי מכל אביזר חשמל אל גובה ההזנה שלו. זה מה שהופך
 * את מצב הרנטגן למובן — רואים איך כל שקע ומתג מתחברים כלפי מעלה או מטה.
 */
function buildWallDrops(index: ApartmentIndex): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wall_drops';
  const material = pipeMaterial(PALETTE.electrical);
  const geometryCache = new Map<number, THREE.CylinderGeometry>();

  for (const device of index.data.devices) {
    if (device.kind.startsWith('luminaire')) continue;
    const room = index.rooms.get(device.room ?? '');
    const roomY = room?.y ?? 0;
    const ceiling = roomY + (room?.ceiling.height ?? 2.55);
    const from = device.position.y;
    const height = Math.max(0.05, ceiling - 0.05 - from);
    const key = Math.round(height * 100);
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.CylinderGeometry(0.009, 0.009, height, 6);
      geometryCache.set(key, geometry);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(device.position.x, from + height / 2, device.position.z);
    nudgeIntoWall(mesh, device);
    mesh.userData = { kind: 'wiring', id: `${device.id}_drop`, device };
    group.add(mesh);
  }
  return group;
}

function nudgeIntoWall(mesh: THREE.Object3D, device: Device): void {
  const facing = device.facing;
  if (!facing) return;
  mesh.position.x -= facing[0] * 0.035;
  mesh.position.z -= facing[1] * 0.035;
}

export function pipeSystemLabel(system: PipeSystem): string {
  return SYSTEM_STYLE[system].label;
}

/** גובה ההנחה של כל מערכת ביחס למפלס החדר. */
export function pipeSystemHeight(system: PipeSystem): number {
  return SYSTEM_STYLE[system].y;
}
