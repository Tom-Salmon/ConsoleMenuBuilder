import * as THREE from 'three';
import './ui/styles.css';

import { detectClashes, type Clash } from './analysis/clashes';
import { Materials, PALETTE } from './core/materials';
import { Viewport } from './core/renderer';
import { SunRig } from './core/sun';
import { CameraController, type CameraMode } from './controls/modes';
import { CircuitTrace } from './interaction/circuitTrace';
import { MeasureTool } from './interaction/measure';
import { Highlighter, Picker } from './interaction/picker';
import { loadApartment, type ApartmentIndex } from './model/load';
import { buildOpenings } from './model/openings';
import { buildBaseSlab, buildSlabs } from './model/slabs';
import { buildWalls } from './model/walls';
import type { Device, LayerId, Opening, Room } from './model/types';
import { CircuitEngine } from './systems/circuits';
import { buildDevices, type DeviceNode } from './systems/devices';
import { buildDimensions } from './systems/dimensions';
import { buildFurniture } from './systems/furniture';
import { buildPiping } from './systems/piping';
import { ClashPanel } from './ui/clashPanel';
import { Hud } from './ui/hud';
import { ControlPanel, type LayerSpec } from './ui/panel';

const container = document.getElementById('app')!;

async function boot(): Promise<void> {
  let index: ApartmentIndex;
  try {
    index = await loadApartment();
  } catch (error) {
    container.innerHTML = `<div class="error-box">${(error as Error).message}</div>`;
    return;
  }

  const viewport = new Viewport(container);
  const materials = new Materials();
  const sun = new SunRig(viewport.scene, index);

  // ---- בניית הסצנה ---------------------------------------------------------
  const walls = buildWalls(index, materials);
  const slabs = buildSlabs(index, materials);
  const openings = buildOpenings(index, materials);
  const furniture = buildFurniture(index);
  const devices = buildDevices(index);
  const piping = buildPiping(index);
  const dimensions = buildDimensions(index);

  viewport.scene.add(
    buildBaseSlab(index, materials),
    slabs.floors,
    walls.group,
    slabs.ceilings,
    openings.group,
    furniture.group,
    devices.group,
    piping.group,
    dimensions.group,
  );

  const circuits = new CircuitEngine(index, devices.nodes);
  const trace = new CircuitTrace(viewport.scene, index, devices.nodes);
  const measure = new MeasureTool(viewport.scene);
  const highlighter = new Highlighter(viewport.scene);
  const picker = new Picker(viewport.camera, viewport.renderer.domElement);
  const controller = new CameraController(
    viewport.camera,
    viewport.renderer.domElement,
    index,
    openings.doors,
  );

  picker.setTargets([
    ...openings.interactive,
    ...devices.interactive,
    walls.group,
    slabs.floors,
    furniture.group,
  ]);

  // ---- מצב התחלתי ----------------------------------------------------------
  dimensions.group.visible = false;
  piping.bySystem.hot_cold.visible = false;
  piping.bySystem.drain.visible = false;
  piping.bySystem.refrigerant.visible = false;
  piping.drops.visible = false;
  devices.group.visible = true;

  placeCameraAtEntrance(viewport.camera, index);

  // ---- ממשק ---------------------------------------------------------------
  const hud = new Hud(container, () => controller.requestLock());
  const clashMarker = new THREE.Group();
  viewport.scene.add(clashMarker);

  const clashes = detectClashes(index);
  const clashPanel = new ClashPanel(
    (clash) => focusClash(clash),
    () => exportClashes(clashes),
  );
  clashPanel.render(clashes);

  const layerSpecs: LayerSpec[] = [
    { id: 'furniture', label: 'ריהוט וכלים סניטריים', defaultOn: true, count: index.data.furniture.length },
    { id: 'luminaires', label: 'גופי תאורה', defaultOn: true, count: countKind(index, 'luminaire') },
    {
      id: 'electrical',
      label: 'חשמל — שקעים ומתגים',
      colour: hex(PALETTE.electrical),
      defaultOn: true,
      count: index.data.devices.filter((d) => d.system === 'electrical').length,
    },
    {
      id: 'comms',
      label: 'תקשורת ובית חכם',
      colour: hex(PALETTE.comms),
      defaultOn: true,
      count: index.data.devices.filter((d) => d.system === 'comms').length,
    },
    {
      id: 'water',
      label: 'אינסטלציה — מים וגז',
      colour: hex(PALETTE.water),
      defaultOn: false,
      count: index.data.piping.filter((p) => p.system === 'hot_cold').length,
    },
    {
      id: 'drain',
      label: 'אינסטלציה — ניקוז 2"',
      colour: hex(PALETTE.drain),
      defaultOn: false,
      count: index.data.piping.filter((p) => p.system === 'drain').length,
    },
    {
      id: 'hvac',
      label: 'מיזוג אוויר',
      colour: hex(PALETTE.hvac),
      defaultOn: false,
      count: index.data.piping.filter((p) => p.system === 'refrigerant').length,
    },
    { id: 'dimensions', label: 'מידות', colour: hex(PALETTE.dimension), defaultOn: false, count: index.data.dimensions.length },
    { id: 'ceilings', label: 'תקרות', defaultOn: true },
    { id: 'wallsTransparent', label: 'קירות שקופים למחצה', defaultOn: false },
  ];

  let xrayAmount = 0;
  const setXray = (amount: number) => {
    xrayAmount = amount;
    materials.setXray(amount);
    const on = amount > 0.02;
    piping.drops.visible = on || layerState.electrical;
    if (on) {
      piping.bySystem.hot_cold.visible = true;
      piping.bySystem.drain.visible = true;
      piping.bySystem.refrigerant.visible = true;
      slabs.ceilings.visible = false;
    } else {
      piping.bySystem.hot_cold.visible = layerState.water;
      piping.bySystem.drain.visible = layerState.drain;
      piping.bySystem.refrigerant.visible = layerState.hvac;
      slabs.ceilings.visible = layerState.ceilings;
    }
  };

  const layerState: Record<LayerId, boolean> = {
    furniture: true,
    luminaires: true,
    electrical: true,
    comms: true,
    water: false,
    drain: false,
    hvac: false,
    dimensions: false,
    ceilings: true,
    wallsTransparent: false,
  };

  const applyLayer = (id: LayerId, visible: boolean) => {
    layerState[id] = visible;
    switch (id) {
      case 'furniture':
        furniture.group.visible = visible;
        break;
      case 'luminaires':
      case 'electrical':
      case 'comms':
        applyDeviceVisibility(devices.nodes, layerState);
        break;
      case 'water':
        piping.bySystem.hot_cold.visible = visible || xrayAmount > 0.02;
        break;
      case 'drain':
        piping.bySystem.drain.visible = visible || xrayAmount > 0.02;
        break;
      case 'hvac':
        piping.bySystem.refrigerant.visible = visible || xrayAmount > 0.02;
        break;
      case 'dimensions':
        dimensions.group.visible = visible;
        break;
      case 'ceilings':
        slabs.ceilings.visible = visible && xrayAmount <= 0.02;
        break;
      case 'wallsTransparent':
        materials.setXray(visible ? Math.max(xrayAmount, 0.45) : xrayAmount);
        break;
    }
  };

  const panel = new ControlPanel(index, layerSpecs, {
    onMode: (mode) => setMode(mode),
    onLayer: applyLayer,
    onXray: setXray,
    onSun: (patch) => {
      sun.update(patch);
      viewport.invalidateShadows();
      viewport.scene.background = sun.skyColour();
      if (viewport.scene.fog) (viewport.scene.fog as THREE.Fog).color.copy(sun.skyColour());
    },
    onLights: (on) => {
      circuits.setAll(on);
      viewport.invalidateShadows();
    },
    onMeasure: () => {
      const active = measure.toggle();
      panel.setMeasureActive(active);
      hud.setStatus(status());
    },
    onClashPanel: () => clashPanel.toggle(),
    onHelp: () => hud.showSplash(),
  });

  // ---- אינטראקציה ---------------------------------------------------------
  const setMode = (mode: CameraMode) => {
    controller.setMode(mode);
    panel.setMode(mode);
    picker.setRange(mode === 'dollhouse' ? 120 : 12);
    hud.setCrosshairVisible(mode !== 'dollhouse');
    slabs.ceilings.visible = mode === 'dollhouse' ? false : layerState.ceilings && xrayAmount <= 0.02;
    if (mode !== 'dollhouse') controller.requestLock();
    hud.setStatus(status());
  };

  /**
   * הכוונת נמצאת במרכז המסך רק כשנעילת העכבר פעילה. אם הדפדפן לא אישר נעילה,
   * הבחירה נופלת בחזרה למיקום הסמן, כך שהאינטראקציה עובדת גם אז.
   */
  const centredPick = () => controller.mode !== 'dollhouse' && controller.locked;

  viewport.renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (controller.mode !== 'dollhouse' && !controller.locked) controller.requestLock();
    const hit = picker.pick(centredPick());
    if (!hit) return;

    if (measure.active) {
      const text = measure.addPoint(hit.point);
      if (text) hud.setInfo({ title: `מדידה: ${text}`, meta: 'לחיצה נוספת מתחילה מדידה חדשה' });
      return;
    }

    if (hit.kind === 'door') {
      const door = openings.doors.get(hit.id);
      door?.toggle();
      return;
    }
    if (hit.kind === 'device') {
      const device = index.devices.get(hit.id);
      if (!device) return;
      if (device.kind === 'switch') {
        circuits.pressSwitch(device.id);
        viewport.invalidateShadows();
      } else if (device.kind === 'smart_panel') {
        // פאנל התרחישים מדליק את כל מעגלי התאורה או מכבה אותם
        const anyOn = index.data.circuits.some((c) => c.kind === 'lighting' && circuits.isOn(c.code));
        circuits.setAll(!anyOn);
        viewport.invalidateShadows();
      }
      return;
    }
    if (controller.mode === 'dollhouse' && (hit.kind === 'floor' || hit.kind === 'wall')) {
      const room = index.roomAt(hit.point.x, hit.point.z);
      if (room) {
        controller.flyTo(
          new THREE.Vector3(hit.point.x, room.y + 5.5, hit.point.z + 3.5),
          new THREE.Vector3(hit.point.x, room.y + 0.8, hit.point.z),
        );
      }
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    switch (event.code) {
      case 'Digit1':
        setMode('fly');
        break;
      case 'Digit2':
        setMode('walk');
        break;
      case 'Digit3':
        setMode('dollhouse');
        break;
      case 'KeyC': {
        const locked = trace.toggleLock();
        hud.setStatus(status());
        if (!locked) trace.forceClear();
        break;
      }
      case 'KeyX': {
        const next = xrayAmount > 0.02 ? 0 : 0.72;
        setXray(next);
        panel.setXray(next);
        break;
      }
      case 'KeyM': {
        const active = measure.toggle();
        panel.setMeasureActive(active);
        hud.setStatus(status());
        break;
      }
      case 'KeyL':
        circuits.setAll(!index.data.circuits.some((c) => c.kind === 'lighting' && circuits.isOn(c.code)));
        viewport.invalidateShadows();
        break;
      default:
        break;
    }
  });

  // ---- לולאת הרנדור --------------------------------------------------------
  viewport.onResize((w, h) => {
    dimensions.resize(w, h);
    trace.resize(w, h);
    measure.resize(w, h);
  });

  const clock = new THREE.Clock();
  let hovered: string | null = null;

  function frame(): void {
    const dt = Math.min(clock.getDelta(), 0.05);
    controller.update(dt);
    let moved = false;
    for (const door of openings.doors.values()) moved = door.update(dt) || moved;
    if (moved) viewport.invalidateShadows();

    const hit = picker.pick(centredPick());

    const interactive = hit && (hit.kind === 'door' || hit.kind === 'device' || hit.kind === 'furniture');
    hud.setCrosshairActive(Boolean(interactive));

    dimensions.updateFade(viewport.camera);

    if (hit?.id !== hovered) {
      hovered = hit?.id ?? null;
      highlighter.show(interactive ? hit!.object : null);
      updateInfo(hit);
    }

    viewport.render();
    requestAnimationFrame(frame);
  }

  function updateInfo(hit: ReturnType<Picker['pick']>): void {
    if (!hit) {
      trace.show(null);
      hud.setInfo(roomInfo());
      return;
    }
    if (hit.kind === 'device') {
      const device = index.devices.get(hit.id);
      if (!device) return;
      const info = trace.show(device.id);
      hud.setInfo({
        title: `${device.name_he}${device.inferred ? ' · השלמה' : ''}`,
        meta: describeDevice(device, index, circuits),
        note: info?.note,
      });
      return;
    }
    if (hit.kind === 'door') {
      trace.show(null);
      const opening = index.openings.get(hit.id);
      if (!opening) return;
      hud.setInfo({
        title: opening.name_he,
        meta: describeOpening(opening),
        note: 'לחיצה פותחת וסוגרת לפי כיוון הפתיחה שבתכנית',
      });
      return;
    }
    if (hit.kind === 'furniture') {
      trace.show(null);
      const item = index.data.furniture.find((f) => f.id === hit.id);
      if (!item) return;
      hud.setInfo({
        title: item.name_he,
        meta: `${item.size.map((v) => (v * 100).toFixed(0)).join(' × ')} ס"מ`,
        note: 'סימון הריהוט בתכנית הוא להמחשה בלבד',
      });
      return;
    }
    trace.show(null);
    hud.setInfo(roomInfo());
  }

  function roomInfo(): { title: string; meta: string } | null {
    const room = index.roomAt(viewport.camera.position.x, viewport.camera.position.z);
    if (!room) return null;
    return { title: room.name_he, meta: describeRoom(room) };
  }

  function status(): string[] {
    const parts = [`מצב: ${modeLabel(controller.mode)}`];
    if (measure.active) parts.push('כלי מדידה פעיל');
    if (trace.locked) parts.push('סימון מעגל נעול');
    if (xrayAmount > 0.02) parts.push('רנטגן');
    parts.push(`ממצאי בדיקה: ${clashes.length}`);
    return parts;
  }

  function focusClash(clash: Clash): void {
    clashMarker.clear();
    if (clash.box) {
      const size = clash.box.getSize(new THREE.Vector3());
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(size.x, 0.08), Math.max(size.y, 0.08), Math.max(size.z, 0.08)),
        new THREE.MeshBasicMaterial({
          color: PALETTE.clash,
          transparent: true,
          opacity: 0.35,
          depthTest: false,
        }),
      );
      box.position.copy(clash.box.getCenter(new THREE.Vector3()));
      box.renderOrder = 980;
      clashMarker.add(box);
    }
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12),
      new THREE.MeshBasicMaterial({ color: PALETTE.clash, depthTest: false }),
    );
    sphere.position.copy(clash.position);
    sphere.renderOrder = 981;
    clashMarker.add(sphere);

    setMode('fly');
    const offset = new THREE.Vector3(1.6, 1.2, 1.6);
    controller.flyTo(clash.position.clone().add(offset), clash.position.clone());
    hud.setInfo({ title: clash.title_he, meta: clash.detail_he, note: clash.involvesFurniture ? 'הממצא נשען על הריהוט, שהוא להמחשה בלבד' : undefined });
  }

  hud.setStatus(status());
  viewport.scene.background = sun.skyColour();
  frame();
}

// ---------------------------------------------------------------------------
// עזרים
// ---------------------------------------------------------------------------

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function countKind(index: ApartmentIndex, prefix: string): number {
  return index.data.devices.filter((d) => d.kind.startsWith(prefix)).length;
}

function applyDeviceVisibility(
  nodes: Map<string, DeviceNode>,
  state: Record<LayerId, boolean>,
): void {
  for (const node of nodes.values()) {
    const { kind, system } = node.device;
    const visible = kind.startsWith('luminaire')
      ? state.luminaires
      : system === 'comms'
        ? state.comms
        : state.electrical;
    node.root.visible = visible;
  }
}

function placeCameraAtEntrance(camera: THREE.PerspectiveCamera, index: ApartmentIndex): void {
  const entry = index.openings.get('door_entry');
  const wall = entry ? index.walls.get(entry.wall) : undefined;
  if (entry && wall) {
    const dir = new THREE.Vector2(wall.end.x - wall.start.x, wall.end.z - wall.start.z).normalize();
    const along = entry.offset + entry.width / 2;
    camera.position.set(wall.start.x + dir.x * along, 1.65, wall.start.z + dir.y * along - 1.4);
    camera.lookAt(camera.position.x - 2.5, 1.5, camera.position.z - 3.5);
    return;
  }
  const { minX, maxX, maxZ } = index.bounds();
  camera.position.set((minX + maxX) / 2, 1.65, maxZ - 1.5);
}

function modeLabel(mode: CameraMode): string {
  return mode === 'fly' ? 'גוף ראשון מרחף' : mode === 'walk' ? 'הליכה' : 'בית בובות';
}

function describeDevice(device: Device, index: ApartmentIndex, circuits: CircuitEngine): string {
  const parts: string[] = [];
  if (device.circuit) parts.push(circuits.describe(device.circuit));
  parts.push(`גובה התקנה ${device.height_cm} ס"מ`);
  const room = index.rooms.get(device.room ?? '');
  if (room) parts.push(room.name_he);
  if (device.tags.length) parts.push(device.tags.join(', '));
  if (device.kind === 'switch' && device.circuit) {
    parts.push(circuits.isOn(device.circuit) ? 'המעגל דלוק' : 'המעגל כבוי');
  }
  if (device.inferred) parts.push('מיקום משוער — האביזר אינו מסומן בתכנית');
  return parts.join(' · ');
}

function describeOpening(opening: Opening): string {
  const parts = [
    `${(opening.width * 100).toFixed(0)} × ${(opening.height * 100).toFixed(0)} ס"מ`,
  ];
  if (opening.sill > 0) parts.push(`סף ${(opening.sill * 100).toFixed(0)} ס"מ`);
  if (opening.plan_note) parts.push(`בתכנית: ${opening.plan_note}`);
  return parts.join(' · ');
}

function describeRoom(room: Room): string {
  const ceiling = room.ceiling.height
    ? `תקרה ${(room.ceiling.height * 100).toFixed(0)} ס"מ${room.ceiling.type === 'dropped' ? ' (הנמכה)' : ''}`
    : 'ללא תקרה';
  return `${room.area_m2.toFixed(2)} מ"ר · ${ceiling} · מפלס ${room.plan_elevation.toFixed(2)}`;
}

function exportClashes(clashes: Clash[]): void {
  const payload = clashes.map((c) => ({
    id: c.id,
    rule: c.rule,
    severity: c.severity,
    title_he: c.title_he,
    detail_he: c.detail_he,
    involves_furniture: c.involvesFurniture,
    room: c.room,
    position: { x: +c.position.x.toFixed(3), y: +c.position.y.toFixed(3), z: +c.position.z.toFixed(3) },
  }));
  const blob = new Blob([JSON.stringify({ generated_at: new Date().toISOString(), clashes: payload }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clash-report.json';
  a.click();
  URL.revokeObjectURL(url);
}

void boot();
