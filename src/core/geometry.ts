import type { Footing } from './types';

/**
 * Geometría en planta en coordenadas locales: x ∈ [0, L] desde el extremo izquierdo,
 * y simétrico respecto del eje longitudinal (y = 0). Ancho lineal B(x) = B1 + (B2 − B1)·x/L.
 */
export interface Shape {
  L: number;
  B1: number;
  B2: number;
  A: number;
  xc: number; // centroide medido desde x = 0
  Ix: number; // ∫ y² dA (respecto del eje longitudinal baricéntrico)
  Iy: number; // ∫ (x − xc)² dA
  Bmax: number;
}

export function shapeOf(f: Pick<Footing, 'forma' | 'L' | 'B1' | 'B2'>): Shape {
  const L = f.L;
  const B1 = f.B1;
  const B2 = f.forma === 'trapezoidal' ? f.B2 : f.B1;
  const A = (L * (B1 + B2)) / 2;
  const xc = (L * (B1 + 2 * B2)) / (3 * (B1 + B2));
  const I0 = (L ** 3 * (B1 + 3 * B2)) / 12;
  const Iy = I0 - A * xc * xc;
  const Ix = (L * (B1 + B2) * (B1 * B1 + B2 * B2)) / 48;
  return { L, B1, B2, A, xc, Ix, Iy, Bmax: Math.max(B1, B2) };
}

export const widthAt = (s: Shape, x: number) => s.B1 + ((s.B2 - s.B1) * x) / s.L;

export function inside(s: Shape, x: number, y: number, tol = 1e-6): boolean {
  return x >= -tol && x <= s.L + tol && Math.abs(y) <= widthAt(s, Math.min(Math.max(x, 0), s.L)) / 2 + tol;
}

/** Esquinas en coordenadas relativas al centroide (x − xc, y) */
export function corners(s: Shape): { nombre: string; x: number; y: number }[] {
  return [
    { nombre: 'Izq. inferior', x: -s.xc, y: -s.B1 / 2 },
    { nombre: 'Izq. superior', x: -s.xc, y: s.B1 / 2 },
    { nombre: 'Der. superior', x: s.L - s.xc, y: s.B2 / 2 },
    { nombre: 'Der. inferior', x: s.L - s.xc, y: -s.B2 / 2 },
  ];
}

/** Dimensiones equivalentes en planta de una columna o pedestal (circular → cuadrado de igual área) */
export function colDims(c: { forma: 'rect' | 'circ'; bx: number; by: number; D: number }): { bx: number; by: number; area: number } {
  if (c.forma === 'circ') {
    const a = Math.sqrt(Math.PI / 4) * c.D;
    return { bx: a, by: a, area: (Math.PI * c.D * c.D) / 4 };
  }
  return { bx: c.bx, by: c.by, area: c.bx * c.by };
}
