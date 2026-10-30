import { colDims, type Shape } from './geometry';
import type { Column, Combo, Project } from './types';

/** Coordenadas locales (desde extremo izquierdo, eje longitudinal) de una columna */
export const localXY = (p: Project, c: Column) => ({ x: c.x - p.footing.x0, y: c.y - p.footing.y0 });

/** Brazo vertical desde el plano de contacto (base) hasta el punto de aplicación de cargas */
export const armZ = (p: Project, c: Column) => p.footing.h + c.zCarga;

export interface Transfer {
  col: string;
  r: [number, number, number];
  F: [number, number, number];
  M0: [number, number, number];
  rxF: [number, number, number];
  M: [number, number, number];
}

export const cross = (a: number[], b: number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Traslado al centroide del plano de contacto: M_final = M_inicial + r × F.
 * F = (Vx, Vy, −N) con N positivo de compresión; r = (x − xc, y, z_aplicación).
 */
export function transferColumn(p: Project, s: Shape, c: Column, combo: Combo): Transfer {
  const l = combo.cargas[c.id] ?? { N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 };
  const { x, y } = localXY(p, c);
  const r: [number, number, number] = [x - s.xc, y, armZ(p, c)];
  const F: [number, number, number] = [l.Vx, l.Vy, -l.N];
  const M0: [number, number, number] = [l.Mx, l.My, l.Mz];
  const rxF = cross(r, F);
  return { col: c.id, r, F, M0, rxF, M: [M0[0] + rxF[0], M0[1] + rxF[1], M0[2] + rxF[2]] };
}

export interface Weights {
  Wz: number; // zapata
  Ws: number; // suelo sobre la zapata
  Wp: number; // pedestales
  U: number; // subpresión
  hw: number; // altura de agua sobre la base
  Mx: number; // momentos de los pesos respecto del centroide (por huecos del suelo)
  My: number;
  detalle: string[];
}

export function weights(p: Project, s: Shape): Weights {
  const f = p.footing;
  const g = p.geo;
  const cr = p.crit;
  const gc = p.mat.hormigon.gammaC;
  const tSuelo = Math.max(0, f.Df - f.h);
  const hw = g.nf !== null ? Math.max(0, f.Df - g.nf) : 0;
  const Wz = cr.incluirPesoPropio ? gc * s.A * f.h : 0;
  let Wp = 0, Ws = 0, Mx = 0, My = 0;
  // peso unitario medio del relleno sobre la zapata considerando el nivel freático
  const hSat = Math.min(tSuelo, hw);
  const gRel = tSuelo > 0 ? (p.mat.gammaRelleno * (tSuelo - hSat) + g.gammaSat * hSat) / tSuelo : 0;
  const detalle: string[] = [];
  if (cr.incluirSuelo && tSuelo > 0) {
    let Ahueco = 0;
    for (const c of p.columns) {
      const d = c.ped.activo ? { area: c.ped.bx * c.ped.by } : colDims(c);
      const x = c.x - f.x0 - s.xc, y = c.y - f.y0;
      Ahueco += d.area;
      // el hueco quita peso en (x,y): momento r × (0,0,+γ·t·A)
      Mx += gRel * tSuelo * d.area * y;
      My += -gRel * tSuelo * d.area * x;
    }
    Ws = gRel * tSuelo * (s.A - Ahueco);
    detalle.push(`Ws = γ·t·(A − ΣA_huecos) = ${(gRel * 1e6).toFixed(2)} kN/m³ · ${(tSuelo / 1000).toFixed(3)} m · ${((s.A - Ahueco) / 1e6).toFixed(3)} m²`);
  }
  if (cr.incluirPedestales) {
    for (const c of p.columns) {
      if (!c.ped.activo || c.ped.h <= 0) continue;
      const w = gc * c.ped.bx * c.ped.by * c.ped.h;
      Wp += w;
      const x = c.x - f.x0 - s.xc, y = c.y - f.y0;
      Mx += -w * y; // F = (0,0,−w): r×F = (−y·w, x·w, 0)
      My += w * x;
    }
  }
  const U = cr.incluirSubpresion ? 9.81e-6 * hw * s.A : 0;
  detalle.unshift(`Wz = γc·A·h = ${(gc * 1e6).toFixed(2)} kN/m³ · ${(s.A / 1e6).toFixed(3)} m² · ${(f.h / 1000).toFixed(3)} m`);
  return { Wz, Ws, Wp, U, hw, Mx, My, detalle };
}

export interface ComboTotals {
  combo: Combo;
  transfers: Transfer[];
  Ncol: number;
  N: number; // vertical total en la base (compresión +)
  Mx: number; // respecto del centroide de la base
  My: number;
  Hx: number;
  Hy: number;
  Mz: number;
  xR: number; // posición de la resultante respecto del centroide
  yR: number;
}

/** Totales en la base. incluirPesos=false para la presión neta estructural (cargas mayoradas de columnas). */
export function comboTotals(p: Project, s: Shape, combo: Combo, w: Weights | null): ComboTotals {
  const transfers = p.columns.map((c) => transferColumn(p, s, c, combo));
  let Ncol = 0, Mx = 0, My = 0, Hx = 0, Hy = 0, Mz = 0;
  for (const t of transfers) {
    Ncol += -t.F[2];
    Hx += t.F[0];
    Hy += t.F[1];
    Mx += t.M[0];
    My += t.M[1];
    Mz += t.M[2];
  }
  let N = Ncol;
  if (w) {
    N += w.Wz + w.Ws + w.Wp - w.U;
    Mx += w.Mx;
    My += w.My;
  }
  // Resultante: equilibrio con la reacción del suelo → xR = My/N ; yR = −Mx/N
  const xR = N !== 0 ? My / N : NaN;
  const yR = N !== 0 ? -Mx / N : NaN;
  return { combo, transfers, Ncol, N, Mx, My, Hx, Hy, Mz, xR, yR };
}

/** Resultante de cargas de columnas en coordenadas globales (sin pesos, sin momentos de traslado por altura) */
export function resultantGlobal(p: Project, combo: Combo): { N: number; X: number; Y: number } {
  let N = 0, SX = 0, SY = 0;
  for (const c of p.columns) {
    const l = combo.cargas[c.id];
    if (!l) continue;
    N += l.N;
    // momento de columna desplaza la resultante: x = Σ(N·x + My)/N , y = Σ(N·y − Mx)/N (mismo criterio de signos)
    SX += l.N * c.x + l.My + l.Vx * (p.footing.h + c.zCarga);
    SY += l.N * c.y - l.Mx + l.Vy * (p.footing.h + c.zCarga);
  }
  return { N, X: N ? SX / N : NaN, Y: N ? SY / N : NaN };
}
