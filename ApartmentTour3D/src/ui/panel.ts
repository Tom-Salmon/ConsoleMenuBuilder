import type { ApartmentIndex } from '../model/load';
import type { LayerId } from '../model/types';

/**
 * לוח השליטה בעברית (RTL).
 *
 * הלוח מוגדר כאן דקלרטיבית ומדווח החוצה דרך callbacks, כך שכל הלוגיקה של הסצנה
 * נשארת ב-main ולא מתערבבת עם ה-DOM.
 */

export interface LayerSpec {
  id: LayerId;
  label: string;
  colour?: string;
  count?: number;
  defaultOn: boolean;
}

export interface PanelCallbacks {
  onMode(mode: 'fly' | 'walk' | 'dollhouse'): void;
  onLayer(id: LayerId, visible: boolean): void;
  onXray(amount: number): void;
  onSun(patch: { northDeg?: number; hour?: number; night?: boolean }): void;
  onLights(on: boolean): void;
  onMeasure(): void;
  onClashPanel(): void;
  onHelp(): void;
}

export class ControlPanel {
  readonly root = document.createElement('aside');
  private readonly modeButtons = new Map<string, HTMLButtonElement>();
  private measureButton!: HTMLButtonElement;
  private xraySlider!: HTMLInputElement;
  private xrayReadout!: HTMLElement;

  constructor(
    index: ApartmentIndex,
    layers: LayerSpec[],
    private readonly cb: PanelCallbacks,
  ) {
    this.root.className = 'panel';
    const meta = index.data.meta;

    this.root.innerHTML = `
      <header>
        <h1>${meta.project_he} · דירת ${meta.apartment_type}</h1>
        <div class="sub">
          קומות ${meta.floors} · קנ"מ ${meta.scale} · מהדורה ${meta.revision} · ${meta.plan_date}<br>
          ${index.data.rooms.length} חללים · ${index.data.devices.length} אביזרי חשמל · ${index.data.circuits.length} מעגלים
        </div>
      </header>`;

    this.addModes();
    this.addLayers(layers);
    this.addLighting(index);
    this.addTools();
    document.getElementById('app')!.appendChild(this.root);
  }

  private section(title: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'section';
    el.innerHTML = `<h2>${title}</h2>`;
    this.root.appendChild(el);
    return el;
  }

  private addModes(): void {
    const section = this.section('מצב תצוגה');
    const row = document.createElement('div');
    row.className = 'row';
    const modes: [('fly' | 'walk' | 'dollhouse'), string][] = [
      ['fly', 'גוף ראשון מרחף'],
      ['walk', 'הליכה'],
      ['dollhouse', 'בית בובות'],
    ];
    for (const [id, label] of modes) {
      const button = document.createElement('button');
      button.textContent = label;
      button.onclick = () => {
        this.setMode(id);
        this.cb.onMode(id);
      };
      row.appendChild(button);
      this.modeButtons.set(id, button);
    }
    section.appendChild(row);
    this.setMode('fly');
  }

  setMode(mode: string): void {
    for (const [id, button] of this.modeButtons) button.classList.toggle('active', id === mode);
  }

  private addLayers(layers: LayerSpec[]): void {
    const section = this.section('שכבות');
    for (const layer of layers) {
      const label = document.createElement('label');
      label.className = 'toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = layer.defaultOn;
      input.onchange = () => this.cb.onLayer(layer.id, input.checked);
      label.appendChild(input);
      if (layer.colour) {
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = layer.colour;
        label.appendChild(swatch);
      }
      label.appendChild(document.createTextNode(layer.label));
      if (layer.count !== undefined) {
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = String(layer.count);
        label.appendChild(count);
      }
      section.appendChild(label);
    }

    const xray = this.slider('מצב רנטגן — שקיפות קירות', 0, 100, 0, (v) => this.cb.onXray(v / 100), '%');
    this.xraySlider = xray.querySelector('input')!;
    this.xrayReadout = xray.querySelector('b')!;
    section.appendChild(xray);
  }

  private addLighting(index: ApartmentIndex): void {
    const section = this.section('תאורה ושמש');
    section.appendChild(
      this.slider('סיבוב צפון', 0, 359, 205, (v) => this.cb.onSun({ northDeg: v }), '°'),
    );
    section.appendChild(
      this.slider('שעה ביום', 5, 20, 14, (v) => this.cb.onSun({ hour: v }), ':00'),
    );

    const row = document.createElement('div');
    row.className = 'row';

    const night = document.createElement('button');
    night.textContent = 'מצב לילה';
    night.onclick = () => {
      const on = night.classList.toggle('active');
      this.cb.onSun({ night: on });
    };

    const allOn = document.createElement('button');
    allOn.textContent = 'הדלק הכל';
    allOn.onclick = () => this.cb.onLights(true);

    const allOff = document.createElement('button');
    allOff.textContent = 'כבה הכל';
    allOff.onclick = () => this.cb.onLights(false);

    row.append(night, allOn, allOff);
    section.appendChild(row);

    const note = document.createElement('div');
    note.className = 'sub';
    note.style.marginTop = '8px';
    note.textContent =
      `כיוון הצפון אינו מופיע בגיליונות התכנית, ולכן הוא נתון לשליטתך. ` +
      `${index.data.circuits.filter((c) => c.kind === 'lighting').length} מעגלי תאורה פעילים במודל.`;
    section.appendChild(note);
  }

  private addTools(): void {
    const section = this.section('כלים');
    const row = document.createElement('div');
    row.className = 'row';

    this.measureButton = document.createElement('button');
    this.measureButton.textContent = 'כלי מדידה';
    this.measureButton.onclick = () => this.cb.onMeasure();

    const clash = document.createElement('button');
    clash.textContent = 'בדיקת תכנון';
    clash.onclick = () => this.cb.onClashPanel();

    const help = document.createElement('button');
    help.textContent = 'מקרא מקשים';
    help.onclick = () => this.cb.onHelp();

    row.append(this.measureButton, clash, help);
    section.appendChild(row);
  }

  setMeasureActive(active: boolean): void {
    this.measureButton.classList.toggle('active', active);
  }

  /** מסנכרן את הסרגל כשמצב הרנטגן הופעל ממקש הקיצור ולא מהלוח. */
  setXray(amount: number): void {
    const percent = Math.round(amount * 100);
    this.xraySlider.value = String(percent);
    this.xrayReadout.textContent = `${percent}%`;
  }

  private slider(
    label: string,
    min: number,
    max: number,
    value: number,
    onInput: (value: number) => void,
    suffix = '',
  ): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'slider';
    const head = document.createElement('span');
    const name = document.createElement('em');
    name.style.fontStyle = 'normal';
    name.textContent = label;
    const readout = document.createElement('b');
    readout.style.fontWeight = '600';
    readout.textContent = `${value}${suffix}`;
    head.append(name, readout);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.oninput = () => {
      const v = Number(input.value);
      readout.textContent = `${v}${suffix}`;
      onInput(v);
    };

    wrap.append(head, input);
    return wrap;
  }
}
