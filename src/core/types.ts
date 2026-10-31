import type { NormConfig } from '../norm/config';
import type { UnitPrefs } from './units';

// Todas las magnitudes en unidades internas: N, mm, MPa (N/mm²), N·mm, N/mm³.

export interface Meta {
  obra: string;
  ubicacion: string;
  profesional: string;
  fecha: string;
  codigo: string;
  descripcion: string;
  observaciones: string;
  modo: 'verificacion' | 'dimensionamiento';
  direccionLongitudinal: 'X';
  tolerancia: number;
  criterioPresion: 'bruta' | 'neta';
  criterioCombinaciones: string;
}

export interface Limites {
  xMin: number | null; // medianera o límite izquierdo (coordenada global X)
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
}

export interface Footing {
  forma: 'rectangular' | 'trapezoidal';
  L: number;
  B1: number; // ancho en el extremo izquierdo (x = x0)
  B2: number; // ancho en el extremo derecho (solo trapezoidal)
  h: number;
  x0: number; // X global del extremo izquierdo
  y0: number; // Y global del eje longitudinal
  cotaTerreno: number; // cota del terreno natural (mm)
  Df: number; // profundidad de desplante: terreno → base de zapata
  recInf: number;
  recSup: number;
  recLat: number;
  limpieza: number;
  limites: Limites;
  Lmax: number;
  Bmax: number;
  hMin: number;
  hMax: number;
  vigasFundacion: string;
}

/** Armado del pedestal: nx barras por cara paralela a X (incluye esquinas), ny por cara paralela a Y */
export interface PedArmado { auto: boolean; nx: number; ny: number; db: number; dbE: number; sE: number }

/** Pedestal o columna corta entre la zapata y el elemento apoyado */
export interface Pedestal { activo: boolean; h: number; bx: number; by: number; rec: number; arm: PedArmado }

/** Elemento que se apoya sobre la zapata o el pedestal */
export type Apoyo = 'hormigon' | 'metalica' | 'equipo';

export interface Column {
  id: string;
  nombre: string;
  x: number;
  y: number;
  forma: 'rect' | 'circ';
  bx: number;
  by: number;
  D: number;
  angulo: number;
  apoyo: Apoyo;
  zCarga: number; // altura adicional sobre el tope del pedestal (o de la zapata) donde se aplican las cargas
  condicion: 'auto' | 'interior' | 'borde' | 'esquina';
  material: string;
  rec: number;
  nBarras: number;
  dbBarras: number;
  distribucion: string;
  dbEstribo: number;
  sEstribo: number;
  lEspera: number | null; // null = automática
  lAnclaje: number | null;
  gancho: 'recto' | '90' | '180';
  ped: Pedestal;
}

export interface Loads { N: number; Vx: number; Vy: number; Mx: number; My: number; Mz: number }

export type Origen = 'Permanente' | 'Variable' | 'Viento' | 'Sismo' | 'Otros' | 'Combinada';

export interface Combo {
  id: string;
  nombre: string;
  tipo: 'servicio' | 'ultima';
  transitoria: boolean;
  origen: Origen;
  activa: boolean;
  cargas: Record<string, Loads>;
  /** Combinación generada desde casos: factores por caso (texto de la expresión) */
  generada?: { plantilla: string; factores: Record<string, number> };
}

export type TipoCaso = 'D' | 'L' | 'Lr' | 'W' | 'E' | 'S' | 'H' | 'T' | 'O';

export interface LoadCase {
  id: string;
  nombre: string;
  tipo: TipoCaso;
  cargas: Record<string, Loads>;
}

export interface CombTemplate {
  id: string;
  nombre: string;
  tipo: 'servicio' | 'ultima';
  transitoria: boolean;
  activa: boolean;
  alternar: boolean; // genera variantes ± para casos W y E
  factores: Record<string, number>; // por tipo de caso (D, L, W…)
}

export interface Estrato { espesor: number; descripcion: string; gamma: number; c: number; phi: number; E: number }

export interface Geo {
  qadm: number;
  qadmTipo: 'bruta' | 'neta';
  qadmPerm: number | null;
  qadmTrans: number | null;
  qult: number | null;
  gamma: number;
  gammaSat: number;
  gammaSum: number | null;
  nf: number | null; // profundidad del nivel freático desde el terreno (mm); null = no detectado
  c: number;
  phi: number;
  mu: number;
  adhesion: number;
  ks: number | null;
  Es: number | null;
  nu: number | null;
  sAdm: number | null;
  sDifAdm: number | null;
  DfMin: number | null;
  estratos: Estrato[];
  fsDesl: number;
  fsVuelco: number;
  perdidaMax: number; // % de área sin contacto admitida (combinaciones transitorias)
  agresividad: string;
  obs: string;
}

export interface Material { nombre: string; fc: number; gammaC: number; Ec: number | null }
export interface Steel { nombre: string; fy: number; Es: number }

export interface Materials {
  hormigon: Material;
  acero: Steel;
  diametros: number[];
  sMin: number;
  sMax: number;
  agregado: number;
  exposicion: string;
  gammaRelleno: number;
  bibliotecaH: Material[];
  bibliotecaA: Steel[];
}

export interface RebarOverride { db: number; s: number }

export interface Criteria {
  permitirPerdidaContacto: boolean;
  incPlanta: number;
  incEspesor: number;
  ratioMax: number;
  lockL: boolean;
  lockB: boolean;
  lockH: boolean;
  probarTrapezoidal: boolean;
  capaInferiorExterna: 'long' | 'trans';
  incluirPesoPropio: boolean;
  incluirSuelo: boolean;
  incluirPedestales: boolean;
  incluirSubpresion: boolean;
  nPuntos: number;
  desperdicio: number; // %
  barraComercial: number;
  sobreancho: number;
  dbMontaje: number;
  caballetesPorM2: number;
  manual: Partial<Record<'longInf' | 'longSup' | 'transInf' | 'transSup', RebarOverride>>;
}

export interface Project {
  version: number;
  meta: Meta;
  units: UnitPrefs;
  norm: NormConfig;
  footing: Footing;
  columns: Column[];
  combos: Combo[];
  casos: LoadCase[];
  plantillas: CombTemplate[];
  geo: Geo;
  mat: Materials;
  crit: Criteria;
  pesosLineales: Record<number, number>; // kg/m por diámetro (mm)
}

export type Estado = 'ok' | 'warn' | 'fail' | 'nc';

export interface Check {
  id: string;
  grupo: 'geo' | 'est';
  titulo: string;
  formula: string;
  variables: string;
  sustitucion: string;
  demanda: number;
  capacidad: number;
  unidad: string;
  ratio: number;
  combo: string;
  estado: Estado;
  ref: string;
  nota?: string;
}

export interface Issue { nivel: 'error' | 'warn' | 'info'; msg: string }
