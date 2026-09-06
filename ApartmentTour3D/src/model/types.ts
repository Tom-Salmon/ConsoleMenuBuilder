/**
 * טיפוסי הנתונים של apartment.json.
 *
 * הקובץ נוצר ע"י tools/build_apartment_json.py מתוך תכנית ה-PDF. כל הקואורדינטות
 * במטרים, במערכת צירים שבה X ימינה ו-Z דרומה — בדיוק כמו במבט-על על התכנית —
 * ו-Y כלפי מעלה. ראשית הצירים היא פינת צפון-מערב של מעטפת הדירה.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 extends Vec2 {
  y: number;
}

export type WallType =
  | 'concrete_ext'
  | 'concrete_mamad'
  | 'block'
  | 'gypsum'
  | 'parapet'
  | 'louver_screen';

export interface Wall {
  id: string;
  name_he: string;
  type: WallType;
  axis: 'h' | 'v';
  start: Vec2;
  end: Vec2;
  thickness: number;
  length: number;
  height: number;
  openings: string[];
}

export type OpeningKind =
  | 'door'
  | 'window'
  | 'sliding'
  | 'blast_door'
  | 'blast_window'
  | 'passage';

export interface Opening {
  id: string;
  wall: string;
  kind: OpeningKind;
  name_he: string;
  /** מרחק מתחילת הקיר עד תחילת הפתח */
  offset: number;
  width: number;
  sill: number;
  height: number;
  hinge?: 'start' | 'end';
  /** לאיזה צד של הקיר נפתחת הכנף: 1+ או 1- בכיוון הניצב */
  toward?: number;
  max_deg?: number;
  leaves?: number;
  shutter?: boolean;
  glazing?: string;
  plan_note?: string;
}

export interface Room {
  id: string;
  name_he: string;
  name_en: string;
  level: string;
  y: number;
  plan_elevation: number;
  polygon: [number, number][];
  area_m2: number;
  ceiling: { type: 'structural' | 'dropped' | 'open'; height: number | null };
  outdoor: boolean;
  part_of: string | null;
  slope_percent: number | null;
}

export type DeviceKind =
  | 'switch'
  | 'socket'
  | 'luminaire_ceiling'
  | 'luminaire_wall'
  | 'appliance_point'
  | 'outlet_tv'
  | 'outlet_data'
  | 'comms_fiber'
  | 'smart_panel';

export interface Device {
  id: string;
  system: 'electrical' | 'comms';
  kind: DeviceKind;
  name_he: string;
  position: Vec3;
  wall: string | null;
  /** וקטור הפנייה על מישור הרצפה, [x, z] */
  facing: [number, number] | null;
  circuit: string | null;
  height_cm: number;
  tags: string[];
  room: string | null;
  /** אמת כאשר האביזר הושלם על ידינו ואינו מסומן בתכנית */
  inferred?: boolean;
}

export interface Circuit {
  code: string;
  kind: 'lighting' | 'power';
  mode: 'single' | 'two_way';
  switches: string[];
  loads: string[];
  sockets: string[];
  rooms: string[];
  default_on: boolean;
}

export type PipeSystem = 'hot_cold' | 'drain' | 'refrigerant';

export interface Pipe {
  id: string;
  system: PipeSystem;
  name_he: string;
  radius: number;
  points: Vec2[];
  length: number;
}

export interface FurnitureItem {
  id: string;
  kind: string;
  room: string;
  name_he: string;
  position: Vec2;
  size: [number, number, number];
  rotation: number;
  illustrative: true;
}

export interface Dimension {
  label_he: string;
  value_cm: number;
  axis: 'x' | 'z';
  from: number;
  to: number;
}

export interface Level {
  plan_elevation: number;
  y: number;
  label_he: string;
}

export interface Apartment {
  meta: {
    project_he: string;
    developer_he: string;
    apartment_type: string;
    floors: string;
    apartment_numbers: number[];
    revision: string;
    plan_date: string;
    scale: string;
    units: string;
    axes: string;
    origin_he: string;
    reference_level_m: number;
    extraction: {
      source_pdf: string;
      pt_to_cm: number;
      generated_at: string;
      generator: string;
    };
  };
  levels: Record<string, Level>;
  ceilings: { structural_m: number; dropped_m: number; parapet_m: number };
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  devices: Device[];
  circuits: Circuit[];
  piping: Pipe[];
  furniture: FurnitureItem[];
  dimensions: Dimension[];
  notes_he: string[];
}

/** שכבות שניתן להדליק ולכבות בממשק. */
export type LayerId =
  | 'furniture'
  | 'luminaires'
  | 'electrical'
  | 'water'
  | 'drain'
  | 'hvac'
  | 'comms'
  | 'dimensions'
  | 'ceilings'
  | 'wallsTransparent';
