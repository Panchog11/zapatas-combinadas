import { widthAt, type Shape } from './geometry';
import { qAt, type PressureField } from './pressure';

/**
 * Método de la viga invertida (eje longitudinal X).
 * Carga lineal ascendente w(x) = ∫ q_neta(x,y) dy ; cargas puntuales de columnas hacia abajo; pares My.
 * Convención: M > 0 tracciona la cara inferior; V(x) = Σ fuerzas verticales a la izquierda (↑ +).
 */
export interface PointLoad { id: string; x: number; P: number; C: number; ancho: number }
export interface BeamPoint { x: number; w: number; V: number; M: number }

export interface BeamResult {
  pts: BeamPoint[];
  Mpos: { M: number; x: number };
  Mneg: { M: number; x: number };
  Vmax: { V: number; x: number };
  ceroV: number[];
  ceroM: number[];
  equilibrio: { sumW: number; sumP: number; errV: number; errM: number };
  poly: [number, number, number] | null; // w(x) = c0 + c1·x + c2·x² si contacto total
}

export function wAt(s: Shape, pf: PressureField, x: number, ny = 40): number {
  const B = widthAt(s, x);
  const xr = x - s.xc;
  if (pf.contactoTotal) return (pf.q0 + pf.a * xr) * B; // el término en y se anula por simetría
  let w = 0;
  const dy = B / ny;
  for (let j = 0; j < ny; j++) w += qAt(pf, xr, -B / 2 + (j + 0.5) * dy) * dy;
  return w;
}

export function beamAnalysis(s: Shape, pf: PressureField, loads: PointLoad[], nPts = 400): BeamResult {
  const xs = new Set<number>();
  for (let i = 0; i <= nPts; i++) xs.add((s.L * i) / nPts);
  for (const l of loads) {
    xs.add(Math.min(Math.max(l.x, 0), s.L));
    for (const d of [-l.ancho / 2, l.ancho / 2]) {
      const v = l.x + d;
      if (v > 0 && v < s.L) xs.add(v);
    }
  }
  const X = [...xs].sort((a, b) => a - b);
  // Integración acumulada de w (trapecios): R(x) = ∫w, Q(x) = ∫∫w
  const W = X.map((x) => wAt(s, pf, x));
  const R = [0], Q = [0];
  for (let i = 1; i < X.length; i++) {
    const h = X[i] - X[i - 1];
    R.push(R[i - 1] + ((W[i] + W[i - 1]) / 2) * h);
    // ∫ R dx con corrección de Simpson para el término cuadrático
    Q.push(Q[i - 1] + ((R[i] + R[i - 1]) / 2) * h - ((W[i] - W[i - 1]) * h * h) / 12);
  }
  const pts: BeamPoint[] = X.map((x, i) => {
    let V = R[i], M = Q[i];
    for (const l of loads) {
      if (x > l.x + 1e-9) { V -= l.P; M += -l.P * (x - l.x) + l.C; }
    }
    return { x, w: W[i], V, M };
  });
  // En la abscisa exacta de la carga se reportan ambos lados: se agrega el punto "derecho"
  const out: BeamPoint[] = [];
  for (const p of pts) {
    out.push(p);
    const hit = loads.filter((l) => Math.abs(l.x - p.x) < 1e-9);
    if (hit.length) {
      const P = hit.reduce((a, l) => a + l.P, 0), C = hit.reduce((a, l) => a + l.C, 0);
      out.push({ x: p.x, w: p.w, V: p.V - P, M: p.M + C });
    }
  }
  let Mpos = { M: -Infinity, x: 0 }, Mneg = { M: Infinity, x: 0 }, Vmax = { V: 0, x: 0 };
  for (const p of out) {
    if (p.M > Mpos.M) Mpos = { M: p.M, x: p.x };
    if (p.M < Mneg.M) Mneg = { M: p.M, x: p.x };
    if (Math.abs(p.V) > Math.abs(Vmax.V)) Vmax = { V: p.V, x: p.x };
  }
  const zeros = (k: 'V' | 'M') => {
    const z: number[] = [];
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1][k], b = out[i][k];
      if (out[i].x === out[i - 1].x) continue;
      if ((a < 0 && b > 0) || (a > 0 && b < 0)) z.push(out[i - 1].x + ((out[i].x - out[i - 1].x) * a) / (a - b));
      else if (b === 0 && a !== 0 && i + 1 < out.length && Math.sign(out[i + 1][k]) === -Math.sign(a)) z.push(out[i].x);
    }
    return z.filter((x) => x > 1 && x < s.L - 1);
  };
  const last = out[out.length - 1];
  const sumP = loads.reduce((a, l) => a + l.P, 0);
  const k = (s.B2 - s.B1) / s.L;
  const poly: [number, number, number] | null = pf.contactoTotal
    ? [(pf.q0 - pf.a * s.xc) * s.B1, (pf.q0 - pf.a * s.xc) * k + pf.a * s.B1, pf.a * k]
    : null;
  return {
    pts: out, Mpos: Mpos.M > 0 ? Mpos : { M: 0, x: Mpos.x }, Mneg: Mneg.M < 0 ? Mneg : { M: 0, x: Mneg.x }, Vmax,
    ceroV: zeros('V'), ceroM: zeros('M'),
    equilibrio: { sumW: R[R.length - 1], sumP, errV: last.V, errM: last.M },
    poly,
  };
}

/** Interpolación lineal de V o M en x (toma el lado izquierdo en discontinuidades) */
export function interp(b: BeamResult, x: number, k: 'V' | 'M'): number {
  const p = b.pts;
  if (x <= p[0].x) return p[0][k];
  for (let i = 1; i < p.length; i++) {
    if (p[i].x >= x && p[i].x > p[i - 1].x) {
      const t = (x - p[i - 1].x) / (p[i].x - p[i - 1].x);
      return p[i - 1][k] + t * (p[i][k] - p[i - 1][k]);
    }
  }
  return p[p.length - 1][k];
}
