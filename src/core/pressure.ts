import { corners, widthAt, type Shape } from './geometry';

/**
 * Distribución de presiones de contacto (compresión +), coordenadas relativas al centroide.
 * Contacto total: q(x,y) = N/A + My·x/Iy − Mx·y/Ix  (convención vectorial de mano derecha, Z hacia arriba).
 * Si q mín < 0 se resuelve el área comprimida iterativamente (Newton): p = max(0, q0 + a·x + b·y),
 * con ∫p dA = N, ∫x·p dA = N·xR, ∫y·p dA = N·yR.
 */
export interface PressureField {
  q0: number;
  a: number;
  b: number;
  contactoTotal: boolean;
  convergio: boolean;
  qmax: number;
  qmin: number;
  qmed: number;
  areaComprimida: number; // fracción 0..1
  esquinas: { nombre: string; x: number; y: number; q: number }[];
  ex: number;
  ey: number;
  enNucleo: boolean;
  dentroDeBase: boolean;
  iter: number;
}

export const qAt = (pf: Pick<PressureField, 'q0' | 'a' | 'b' | 'contactoTotal'>, x: number, y: number) => {
  const q = pf.q0 + pf.a * x + pf.b * y;
  return pf.contactoTotal ? q : Math.max(0, q);
};

interface Cell { x: number; y: number; dA: number }

const gridCache = new Map<string, Cell[]>();
export function grid(s: Shape, nx = 120, ny = 48): Cell[] {
  const key = `${s.L}|${s.B1}|${s.B2}|${nx}|${ny}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const cells: Cell[] = [];
  const dx = s.L / nx;
  for (let i = 0; i < nx; i++) {
    const x = (i + 0.5) * dx;
    const B = widthAt(s, x);
    const dy = B / ny;
    for (let j = 0; j < ny; j++) cells.push({ x: x - s.xc, y: -B / 2 + (j + 0.5) * dy, dA: dx * dy });
  }
  if (gridCache.size > 200) gridCache.clear();
  gridCache.set(key, cells);
  return cells;
}

/** Núcleo central (verificación aproximada con rombo de Ix, Iy): |ex|/kx + |ey|/ky ≤ 1 */
function nucleo(s: Shape, ex: number, ey: number): boolean {
  const xmax = Math.max(s.xc, s.L - s.xc);
  const kx = s.Iy / (s.A * xmax);
  const ky = s.Ix / (s.A * (s.Bmax / 2));
  return Math.abs(ex) / kx + Math.abs(ey) / ky <= 1 + 1e-9;
}

export function solvePressure(s: Shape, N: number, Mx: number, My: number): PressureField {
  const ex = My / N;
  const ey = -Mx / N;
  const base: PressureField = {
    q0: N / s.A, a: My / s.Iy, b: -Mx / s.Ix, contactoTotal: true, convergio: true,
    qmax: NaN, qmin: NaN, qmed: N / s.A, areaComprimida: 1, esquinas: [], ex, ey,
    enNucleo: nucleo(s, ex, ey), dentroDeBase: true, iter: 0,
  };
  if (!(N > 0)) {
    return { ...base, convergio: false, dentroDeBase: false, qmax: NaN, qmin: NaN, areaComprimida: 0 };
  }
  const cs = corners(s);
  const lin = cs.map((c) => base.q0 + base.a * c.x + base.b * c.y);
  if (Math.min(...lin) >= -1e-12) {
    base.esquinas = cs.map((c, i) => ({ ...c, q: lin[i] }));
    base.qmax = Math.max(...lin);
    base.qmin = Math.min(...lin);
    return base;
  }
  // Resultante fuera de la base → no hay solución de equilibrio
  const xL = ex + s.xc;
  if (xL <= 0 || xL >= s.L || Math.abs(ey) >= widthAt(s, xL) / 2) {
    return { ...base, contactoTotal: false, convergio: false, dentroDeBase: false, qmax: Infinity, qmin: 0, areaComprimida: 0 };
  }
  const cells = grid(s);
  const evalR = (q0: number, a: number, b: number) => {
    let S0 = 0, Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, F0 = 0, Fx = 0, Fy = 0;
    for (const c of cells) {
      const q = q0 + a * c.x + b * c.y;
      if (q <= 0) continue;
      const d = c.dA;
      S0 += d; Sx += c.x * d; Sy += c.y * d;
      Sxx += c.x * c.x * d; Syy += c.y * c.y * d; Sxy += c.x * c.y * d;
      F0 += q * d; Fx += q * c.x * d; Fy += q * c.y * d;
    }
    const r = [(F0 - N) / N, (Fx - N * ex) / (N * s.L), (Fy - N * ey) / (N * s.Bmax)];
    return { r, J: [[S0, Sx, Sy], [Sx, Sxx, Sxy], [Sy, Sxy, Syy]], F: [F0 - N, Fx - N * ex, Fy - N * ey], nrm: Math.hypot(...r) };
  };
  let q0 = base.q0, a = base.a, b = base.b;
  let it = 0, ok = false;
  let cur = evalR(q0, a, b);
  for (; it < 100; it++) {
    if (cur.nrm < 1e-8) { ok = true; break; }
    const d = solve3(cur.J, cur.F.map((v) => -v));
    if (!d) break;
    // búsqueda lineal con retroceso
    let lam = 1, next = evalR(q0 + d[0], a + d[1], b + d[2]);
    while (next.nrm > cur.nrm && lam > 1 / 64) {
      lam /= 2;
      next = evalR(q0 + lam * d[0], a + lam * d[1], b + lam * d[2]);
    }
    q0 += lam * d[0]; a += lam * d[1]; b += lam * d[2];
    cur = next;
  }
  // Tolerancia práctica de la discretización
  if (!ok && cur.nrm < 1e-4) ok = true;
  const pf = { q0, a, b, contactoTotal: false };
  let Ac = 0;
  for (const c of cells) if (q0 + a * c.x + b * c.y > 0) Ac += c.dA;
  const qs = cs.map((c) => ({ ...c, q: qAt(pf, c.x, c.y) }));
  return {
    ...base, q0, a, b, contactoTotal: false, convergio: ok, iter: it,
    qmax: Math.max(...qs.map((c) => c.q)), qmin: 0, esquinas: qs, areaComprimida: Ac / s.A,
  };
}

export function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-30) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}
