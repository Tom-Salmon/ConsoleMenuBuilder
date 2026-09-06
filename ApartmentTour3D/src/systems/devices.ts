import * as THREE from 'three';
import { PALETTE } from '../core/materials';
import type { ApartmentIndex } from '../model/load';
import type { Device } from '../model/types';

/**
 * אביזרי החשמל והתקשורת, וגופי התאורה שהם מפעילים.
 *
 * לכל נקודת מאור נוצר גם ‎PointLight‎ אמיתי, כך שלחיצה על מתג באמת משנה את
 * התאורה בחדר ולא רק את מראה הגוף. מספר מקורות האור המצלים מוגבל כדי לשמור על
 * קצב פריימים גם במחשב חלש.
 */

export interface DeviceNode {
  device: Device;
  root: THREE.Group;
  /** החלק שמשנה צבע כשהמעגל נדלק — קיים רק לגופי תאורה */
  emissive?: THREE.MeshStandardMaterial;
  light?: THREE.PointLight;
}

const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf3f1ee, roughness: 0.5 });
const plateMat = new THREE.MeshStandardMaterial({ color: 0xe6e3de, roughness: 0.45 });
const accentMat: Record<string, THREE.MeshStandardMaterial> = {
  switch: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
  socket: new THREE.MeshStandardMaterial({ color: 0xd8d4cd, roughness: 0.5 }),
  outlet_tv: new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5 }),
  outlet_data: new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.5 }),
  comms_fiber: new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.5 }),
  smart_panel: new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.25 }),
  appliance_point: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 }),
};

const FIXTURE_OFF = 0x2a2f36;

function orientToWall(node: THREE.Object3D, device: Device): void {
  const facing = device.facing ?? [0, 1];
  node.rotation.y = Math.atan2(facing[0], facing[1]);
}

function buildWallDevice(device: Device): { root: THREE.Group } {
  const root = new THREE.Group();
  const isPanel = device.kind === 'smart_panel';
  const w = isPanel ? 0.16 : 0.086;
  const h = isPanel ? 0.11 : 0.086;

  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), plateMat);
  plate.position.z = 0.006;
  root.add(plate);

  const accent = accentMat[device.kind] ?? accentMat.socket;
  if (device.kind === 'switch') {
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.6, 0.008), accent);
    rocker.position.z = 0.015;
    root.add(rocker);
  } else if (isPanel) {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.78, 0.006), accent);
    screen.position.z = 0.015;
    root.add(screen);
  } else {
    const face = new THREE.Mesh(new THREE.CircleGeometry(w * 0.3, 18), accent);
    face.position.z = 0.014;
    root.add(face);
    for (const sx of [-1, 1]) {
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.004), accentMat.smart_panel);
      pin.position.set(sx * 0.014, 0, 0.017);
      root.add(pin);
    }
  }

  const backBox = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, h * 0.8, 0.05), bodyMat);
  backBox.position.z = -0.02;
  backBox.visible = false; // נחשף רק במצב רנטגן
  backBox.name = 'back_box';
  root.add(backBox);

  orientToWall(root, device);
  root.position.set(device.position.x, device.position.y, device.position.z);
  // הרחקה קלה מפני הקיר כדי למנוע z-fighting
  const facing = device.facing ?? [0, 1];
  root.position.x += facing[0] * 0.012;
  root.position.z += facing[1] * 0.012;
  return { root };
}

function buildLuminaire(device: Device): { root: THREE.Group; emissive: THREE.MeshStandardMaterial; light: THREE.PointLight } {
  const root = new THREE.Group();
  const emissive = new THREE.MeshStandardMaterial({
    color: 0xf5f3ee,
    emissive: new THREE.Color(FIXTURE_OFF),
    emissiveIntensity: 1,
    roughness: 0.35,
  });

  if (device.kind === 'luminaire_wall') {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 16, 1, true), emissive);
    shade.rotation.x = Math.PI / 2;
    root.add(shade);
    orientToWall(root, device);
  } else {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.045, 20), emissive);
    root.add(housing);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.008, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xbfc4ca, roughness: 0.4, metalness: 0.5 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.02;
    root.add(ring);
  }

  const light = new THREE.PointLight(0xfff1d8, 0, 7, 1.6);
  light.position.y = -0.08;
  root.add(light);

  root.position.set(device.position.x, device.position.y, device.position.z);
  return { root, emissive, light };
}

export function buildDevices(index: ApartmentIndex): {
  group: THREE.Group;
  nodes: Map<string, DeviceNode>;
  interactive: THREE.Object3D[];
} {
  const group = new THREE.Group();
  group.name = 'devices';
  const nodes = new Map<string, DeviceNode>();
  const interactive: THREE.Object3D[] = [];

  for (const device of index.data.devices) {
    const isLuminaire = device.kind.startsWith('luminaire');
    const node: DeviceNode = isLuminaire
      ? (() => {
          const built = buildLuminaire(device);
          return { device, root: built.root, emissive: built.emissive, light: built.light };
        })()
      : { device, root: buildWallDevice(device).root };
    node.root.name = device.id;
    node.root.traverse((child) => {
      child.userData = { kind: 'device', id: device.id, device };
    });
    group.add(node.root);
    nodes.set(device.id, node);
    interactive.push(node.root);
  }
  return { group, nodes, interactive };
}

/** צבע הסימון של כל מערכת, לשימוש בשכבות ובסימון המעגלים. */
export const SYSTEM_COLOUR: Record<string, number> = {
  electrical: PALETTE.electrical,
  comms: PALETTE.comms,
  hot_cold: PALETTE.water,
  drain: PALETTE.drain,
  refrigerant: PALETTE.hvac,
};
