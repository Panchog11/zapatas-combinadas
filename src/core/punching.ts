import type { NormConfig } from '../norm/config';

/** Rectángulo en coordenadas locales (x desde extremo izquierdo, y desde eje) */
export interface Rect { x1: number; x2: number; y1: number; y2: number }

export interface Segment { orient: 'h' | 'v'; pos: number; a: number; b: number }

export interface CriticalPerimeter {
  rect: Rect;
  segs: Segment[];
  b0: number;
  area: number;
  lados: number;
  tipo: 'interior' | 'borde' | 'esquina' | 'franja';
  xg: number;
  yg: number;
}

/**
 * Perímetro crítico a d/2 de las caras. Si el borde de la zapata está a menos de d/2 de la cara,
 * el perímetro se interrumpe en el borde y ese lado no se cuenta.
 */
export function criticalPerimeter(face: Rect, d: number, L: number, yMin: number, yMax: number): CriticalPerimeter {
  const r = { x1: face.x1 - d / 2, x2: face.x2 + d / 2, y1: face.y1 - d / 2, y2: face.y2 + d / 2 };
  const cut = { x1: r.x1 <= 0, x2: r.x2 >= L, y1: r.y1 <= yMin, y2: r.y2 >= yMax };
  const rect = { x1: Math.max(0, r.x1), x2: Math.min(L, r.x2), y1: Math.max(yMin, r.y1), y2: Math.min(yMax, r.y2) };
  const segs: Segment[] = [];
  if (!cut.x1) segs.push({ orient: 'v', pos: rect.x1, a: rect.y1, b: rect.y2 });
  if (!cut.x2) segs.push({ orient: 'v', pos: rect.x2, a: rect.y1, b: rect.y2 });
  if (!cut.y1) segs.push({ orient: 'h', pos: rect.y1, a: rect.x1, b: rect.x2 });
  if (!cut.y2) segs.push({ orient: 'h', pos: rect.y2, a: rect.x1, b: rect.x2 });
  const b0 = segs.reduce((s, g) => s + (g.b - g.a), 0);
  let xg = 0, yg = 0;
  for (const g of segs) {
    const l = g.b - g.a, mid = (g.a + g.b) / 2;
    if (g.orient === 'v') { xg += g.pos * l; yg += mid * l; } else { xg += mid * l; yg += g.pos * l; }
  }
  xg = b0 > 0 ? xg / b0 : (rect.x1 + rect.x2) / 2;
  yg = b0 > 0 ? yg / b0 : (rect.y1 + rect.y2) / 2;
  const opuestos = (cut.x1 && cut.x2) || (cut.y1 && cut.y2);
  const lados = segs.length;
  const tipo = opuestos || lados < 2 ? 'franja' : lados === 4 ? 'interior' : lados === 3 ? 'borde' : 'esquina';
  return { rect, segs, b0, area: (rect.x2 - rect.x1) * (rect.y2 - rect.y1), lados, tipo, xg, yg };
}

/** Momento polar Jc del perímetro respecto del eje baricéntrico, para gradiente en dirección 'x' o 'y' */
export function polarJ(cp: CriticalPerimeter, d: number, dir: 'x' | 'y'): { J: number; c: number } {
  let J = 0, c = 0;
  const g = dir === 'x' ? cp.xg : cp.yg;
  const paralelo = dir === 'x' ? 'h' : 'v';
  for (const s of cp.segs) {
    const l = s.b - s.a;
    if (s.orient === paralelo) {
      const mid = (s.a + s.b) / 2;
      J += d * (l ** 3 / 12 + l * (mid - g) ** 2) + (l * d ** 3) / 12;
      c = Math.max(c, Math.abs(s.a - g), Math.abs(s.b - g));
    } else {
      J += l * d * (s.pos - g) ** 2;
      c = Math.max(c, Math.abs(s.pos - g));
    }
  }
  return { J, c };
}

export interface PunchInput {
  Vu: number; // esfuerzo de punzonamiento neto (N)
  Mux: number; // momento a transferir respecto del eje X (gradiente en y)
  Muy: number; // momento respecto del eje Y (gradiente en x)
  cp: CriticalPerimeter;
  d: number;
  beta: number;
  fc: number;
}

export function punchingCheck(inp: PunchInput, n: NormConfig) {
  const { cp, d, fc, beta } = inp;
  const alpha = cp.tipo === 'interior' ? n.punz.alphaInterior : cp.tipo === 'borde' ? n.punz.alphaBorde : n.punz.alphaEsquina;
  const sq = n.lambda * Math.sqrt(fc);
  const vcA = n.punz.a * (1 + 2 / beta) * sq;
  const vcB = n.punz.b * ((alpha * d) / cp.b0 + 2) * sq;
  const vcC = n.punz.c * sq;
  const vc = Math.min(vcA, vcB, vcC);
  const b1x = cp.rect.x2 - cp.rect.x1, b1y = cp.rect.y2 - cp.rect.y1;
  const gvy = 1 - 1 / (1 + (2 / 3) * Math.sqrt(b1x / b1y)); // momento Muy, gradiente en x
  const gvx = 1 - 1 / (1 + (2 / 3) * Math.sqrt(b1y / b1x));
  const jx = polarJ(cp, d, 'x');
  const jy = polarJ(cp, d, 'y');
  const v1 = inp.Vu / (cp.b0 * d);
  const v2 = jx.J > 0 ? (gvy * Math.abs(inp.Muy) * jx.c) / jx.J : 0;
  const v3 = jy.J > 0 ? (gvx * Math.abs(inp.Mux) * jy.c) / jy.J : 0;
  const vu = v1 + v2 + v3;
  const phivc = n.phiCorte * vc;
  return { alpha, vcA, vcB, vcC, vc, phivc, gvx, gvy, Jx: jx.J, Jy: jy.J, cx: jx.c, cy: jy.c, v1, v2, v3, vu, ratio: vu / phivc };
}

export const overlaps = (a: Rect, b: Rect) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
