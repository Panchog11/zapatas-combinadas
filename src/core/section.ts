import { beta1, diamDoblado, type NormConfig } from '../norm/config';

export const barArea = (db: number) => (Math.PI * db * db) / 4;

/**
 * Armadura exacta a flexión, sección rectangular simplemente armada:
 * Mu/φ = As·fy·(d − a/2), a = As·fy/(0,85·f'c·b)
 * ⇒ As = (0,85·f'c·b·d/fy)·[1 − √(1 − 2·Mn/(0,85·f'c·b·d²))]
 */
export function asRequired(Mu: number, b: number, d: number, fc: number, fy: number, phi: number): { As: number; ok: boolean; disc: number } {
  if (Mu <= 0) return { As: 0, ok: true, disc: 1 };
  const Mn = Mu / phi;
  const k = 0.85 * fc * b;
  const disc = 1 - (2 * Mn) / (k * d * d);
  if (disc < 0) return { As: NaN, ok: false, disc };
  return { As: ((k * d) / fy) * (1 - Math.sqrt(disc)), ok: true, disc };
}

export function phiMn(As: number, b: number, d: number, fc: number, fy: number, phi: number) {
  const a = (As * fy) / (0.85 * fc * b);
  return { a, Mn: As * fy * (d - a / 2), phiMn: phi * As * fy * (d - a / 2) };
}

/** Deformación del acero traccionado para la armadura dada (control por tracción εt ≥ 0,005) */
export function epsT(As: number, b: number, d: number, fc: number, fy: number, n: NormConfig) {
  const a = (As * fy) / (0.85 * fc * b);
  const c = a / beta1(fc, n);
  return { c, eps: (0.003 * (d - c)) / c };
}

export interface BarSet { db: number; n: number; s: number; As: number; libre: number }

/** Selección de barras para un ancho b: minimiza As provista, luego menor cantidad de barras. */
export function selectBars(
  AsReq: number, b: number, recLat: number, diams: number[], sLibreMin: number, sMax: number, sMinConstr = 0,
): BarSet | null {
  let best: BarSet | null = null;
  for (const db of diams) {
    const Ab = barArea(db);
    const ancho = b - 2 * recLat - db;
    if (ancho <= 0) continue;
    let n = Math.max(2, Math.ceil(AsReq / Ab - 1e-9));
    n = Math.max(n, Math.ceil(ancho / sMax) + 1);
    const s = ancho / (n - 1);
    if (s - db < sLibreMin || s < sMinConstr) continue;
    const cand = { db, n, s, As: n * Ab, libre: s - db };
    if (!best || cand.As < best.As - 1e-6 || (Math.abs(cand.As - best.As) < 1e-6 && cand.n < best.n)) best = cand;
  }
  return best;
}

/** Selección por metro: separación múltiplo de 25 mm */
export function selectBarsPerM(AsReqM: number, diams: number[], sLibreMin: number, sMax: number, sMinConstr: number): BarSet | null {
  let best: BarSet | null = null;
  for (const db of diams) {
    const Ab = barArea(db);
    const sReq = AsReqM > 0 ? (Ab * 1000) / AsReqM : Infinity;
    const s = Math.floor(Math.min(sReq, sMax) / 25) * 25;
    if (s < Math.max(sMinConstr, db + sLibreMin)) continue;
    const cand = { db, n: 0, s, As: (Ab * 1000) / s, libre: s - db };
    if (!best || cand.As < best.As - 1e-6 || (Math.abs(cand.As - best.As) < 1e-6 && cand.s > best.s)) best = cand;
  }
  return best;
}

/** Longitud de desarrollo en tracción (barras rectas), expresión simplificada */
export function ld(db: number, fc: number, fy: number, n: NormConfig, superior = false): number {
  const c = db <= n.ld.dbLimite ? n.ld.coefMenor : n.ld.coefMayor;
  const psiT = superior ? n.ld.psiTSup : 1;
  return Math.max(n.ld.minimo, ((c * fy * psiT * n.ld.psiE * n.lambda) / Math.sqrt(Math.min(fc, 70))) * db);
}

/** Longitud de desarrollo con gancho normal */
export function ldh(db: number, fc: number, fy: number, n: NormConfig): number {
  return Math.max(n.ldh.minDb * db, n.ldh.minAbs, ((n.ldh.coef * n.ld.psiE * n.lambda * fy) / Math.sqrt(fc)) * db);
}

/** Longitud de desarrollo en compresión */
export function ldc(db: number, fc: number, fy: number, n: NormConfig): number {
  return Math.max(n.ldc.minAbs, ((n.ldc.coef * fy) / (n.lambda * Math.sqrt(fc))) * db, n.ldc.coef2 * fy * db);
}

export const ganchoExt = (db: number, tipo: '90' | '180', n: NormConfig) =>
  tipo === '90' ? n.ganchos.ext90Db * db : Math.max(n.ganchos.ext180Db * db, n.ganchos.ext180Min);

export const radioDoblado = (db: number, n: NormConfig) => diamDoblado(db, n) / 2;

/** Longitud de gancho a 90° medida como desarrollo vertical exterior: radio + db + extensión */
export const longGancho90 = (db: number, n: NormConfig) => radioDoblado(db, n) + db + ganchoExt(db, '90', n);
