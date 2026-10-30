// Unidades internas: N, mm, MPa. Conversiones a unidades de visualización.
export type Qty = 'length' | 'force' | 'moment' | 'stress' | 'soilStress' | 'unitWeight' | 'lineLoad' | 'area' | 'none';

export interface UnitPrefs {
  length: 'm' | 'cm' | 'mm';
  force: 'kN' | 'N';
  moment: 'kNm' | 'Nmm';
  soilStress: 'kPa' | 'MPa';
}

export const UNIT_DEFAULT: UnitPrefs = { length: 'm', force: 'kN', moment: 'kNm', soilStress: 'kPa' };

const FACT: Record<string, number> = {
  m: 1000, cm: 10, mm: 1,
  kN: 1000, N: 1,
  kNm: 1e6, Nmm: 1,
  kPa: 1e-3, MPa: 1,
  'kN/m³': 1e-6,
  'kN/m': 1,
  'm²': 1e6,
  '': 1, '%': 1, '°': 1, 'kg/m': 1,
};

/** Factor: valor_interno = valor_display × factor */
export function factor(unit: string): number {
  const f = FACT[unit];
  if (f === undefined) throw new Error(`Unidad desconocida: ${unit}`);
  return f;
}

export function unitOf(q: Qty, p: UnitPrefs): string {
  switch (q) {
    case 'length': return p.length;
    case 'force': return p.force;
    case 'moment': return p.moment;
    case 'stress': return 'MPa';
    case 'soilStress': return p.soilStress;
    case 'unitWeight': return 'kN/m³';
    case 'lineLoad': return 'kN/m';
    case 'area': return 'm²';
    default: return '';
  }
}

export const toInternal = (v: number, unit: string) => v * factor(unit);
export const fromInternal = (v: number, unit: string) => v / factor(unit);

export function fmt(v: number, dec = 2): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
  return v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Formatea un valor interno en la unidad dada */
export const fu = (v: number, unit: string, dec = 2) => `${fmt(fromInternal(v, unit), dec)} ${unit}`;
// Atajos usados en memoria y resultados
export const kN = (v: number, d = 2) => fu(v, 'kN', d);
export const kNm = (v: number, d = 2) => fu(v, 'kNm', d);
export const kPa = (v: number, d = 2) => fu(v, 'kPa', d);
export const m = (v: number, d = 2) => fu(v, 'm', d);
export const mm = (v: number, d = 0) => fu(v, 'mm', d);
export const mm2 = (v: number, d = 0) => `${fmt(v, d)} mm²`;
export const MPa = (v: number, d = 2) => fu(v, 'MPa', d);
