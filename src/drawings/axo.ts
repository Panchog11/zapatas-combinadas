import { colDims, widthAt } from '../core/geometry';
import { localXY } from '../core/loads';
import type { Results } from '../core/analysis';
import type { Project } from '../core/types';

/** Modelo 3D simple (mm) en coordenadas locales: x a lo largo de L, y transversal, z desde la base de la zapata. */
export type V3 = [number, number, number];
export type Kind = 'zapata' | 'limpieza' | 'columna' | 'pedestal';
export interface Face { pts: V3[]; n: V3; kind: Kind }
export interface Line3 { a: V3; b: V3; kind: 'inf' | 'sup' | 'espera' | 'eje' }
export interface Model3D { faces: Face[]; lines: Line3[]; h: number }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Prisma vertical a partir de un polígono en planta antihorario (visto desde arriba) */
function prism(poly: [number, number][], z0: number, z1: number, kind: Kind): Face[] {
  const F: Face[] = [];
  const top = poly.map(([x, y]) => [x, y, z1] as V3);
  const bot = [...poly].reverse().map(([x, y]) => [x, y, z0] as V3);
  F.push({ pts: top, n: [0, 0, 1], kind }, { pts: bot, n: [0, 0, -1], kind });
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const pts: V3[] = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]];
    F.push({ pts, n: norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))), kind });
  }
  return F;
}
const rect = (cx: number, cy: number, bx: number, by: number): [number, number][] =>
  [[cx - bx / 2, cy - by / 2], [cx + bx / 2, cy - by / 2], [cx + bx / 2, cy + by / 2], [cx - bx / 2, cy + by / 2]];

export function build3D(p: Project, r: Results, rebar: boolean): Model3D {
  const f = p.footing, s = r.shape;
  const faces: Face[] = [];
  const lines: Line3[] = [];
  const outline: [number, number][] = [[0, -s.B1 / 2], [s.L, -s.B2 / 2], [s.L, s.B2 / 2], [0, s.B1 / 2]];
  const e = 100;
  faces.push(...prism([[-e, -s.B1 / 2 - e], [s.L + e, -s.B2 / 2 - e], [s.L + e, s.B2 / 2 + e], [-e, s.B1 / 2 + e]], -f.limpieza, 0, 'limpieza'));
  faces.push(...prism(outline, 0, f.h, 'zapata'));
  const stub = Math.max(600, 0.15 * s.L);
  for (const c of p.columns) {
    const { x, y } = localXY(p, c);
    const hp = c.ped.activo ? c.ped.h : 0;
    if (hp > 0) faces.push(...prism(rect(x, y, c.ped.bx, c.ped.by), f.h, f.h + hp, 'pedestal'));
    const d = colDims(c);
    faces.push(...prism(rect(x, y, d.bx, d.by), f.h + hp, f.h + hp + stub, 'columna'));
  }
  if (rebar) {
    const rl = f.recLat;
    const L = r.long, T = r.trans;
    const ext = p.crit.capaInferiorExterna === 'long';
    const Bmin = Math.min(s.B1, s.B2);
    const zLI = f.recInf + (ext ? 0 : (T.inf.sel?.db ?? 0)) + (L.inf.total?.db ?? 0) / 2;
    const zTI = f.recInf + (ext ? (L.inf.total?.db ?? 0) : 0) + (T.inf.sel?.db ?? 0) / 2;
    const zLS = f.h - f.recSup - (ext ? 0 : (T.sup.sel?.db ?? 0)) - (L.sup.total?.db ?? 0) / 2;
    const zTS = f.h - f.recSup - (ext ? (L.sup.total?.db ?? 0) : 0) - (T.sup.sel?.db ?? 0) / 2;
    const longBars = (F: typeof L.inf, z: number, kind: 'inf' | 'sup', hook: number) => {
      if (!F.total) return;
      const a = Bmin - 2 * rl - F.total.db;
      for (let i = 0; i < F.total.n; i++) {
        const y = -a / 2 + (F.total.n > 1 ? (i * a) / (F.total.n - 1) : a / 2);
        lines.push({ a: [rl, y, z], b: [s.L - rl, y, z], kind });
        lines.push({ a: [rl, y, z], b: [rl, y, z + hook], kind }, { a: [s.L - rl, y, z], b: [s.L - rl, y, z + hook], kind });
      }
    };
    const hk = (f.h - f.recInf - f.recSup) * 0.6;
    longBars(L.inf, zLI, 'inf', hk);
    longBars(L.sup, zLS, 'sup', -hk);
    const transBars = (F: typeof T.inf, z: number, kind: 'inf' | 'sup', hook: number) => {
      if (!F.sel) return;
      for (let x = rl; x <= s.L - rl + 1; x += F.sel.s) {
        const B = widthAt(s, x) / 2 - rl;
        lines.push({ a: [x, -B, z], b: [x, B, z], kind }, { a: [x, -B, z], b: [x, -B, z + hook], kind }, { a: [x, B, z], b: [x, B, z + hook], kind });
      }
    };
    transBars(T.inf, zTI, 'inf', hk);
    transBars(T.sup, zTS, 'sup', -hk);
    for (const c of p.columns) {
      const m = r.schedule.marcas.find((q) => q.grupo === 'espera' && q.col === c.id);
      if (!m) continue;
      const { x, y } = localXY(p, c);
      const d = colDims(c);
      const cov = c.rec + c.dbEstribo;
      const z0 = f.recInf + (L.inf.total?.db ?? 16) + (T.inf.sel?.db ?? 12);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const bx = x + sx * (d.bx / 2 - cov), by = y + sy * (d.by / 2 - cov);
        lines.push({ a: [bx, by, z0], b: [bx, by, z0 + m.A], kind: 'espera' }, { a: [bx, by, z0], b: [bx + sx * m.B, by, z0], kind: 'espera' });
      }
    }
  }
  return { faces, lines, h: f.h };
}

export interface Proj { x: number; y: number; d: number }
/** Proyección ortogonal: giro az alrededor de Z y elevación el (grados). y de pantalla hacia arriba. */
export function projector(az: number, el: number) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
  const P = ([x, y, z]: V3): Proj => {
    const x1 = x * ca - y * sa, y1 = x * sa + y * ca;
    return { x: x1, y: z * ce + y1 * se, d: y1 * ce - z * se };
  };
  const visible = (n: V3) => -(n[0] * sa + n[1] * ca) * ce + n[2] * se > 1e-9;
  return { P, visible };
}

const BASE: Record<Kind, [number, number, number]> = {
  zapata: [176, 190, 200], limpieza: [214, 205, 190], columna: [120, 132, 146], pedestal: [150, 165, 178],
};
const LUZ = norm([-0.45, -0.75, 0.9]);
export function shade(f: Face, alpha = 1): string {
  const k = 0.62 + 0.38 * Math.max(0, f.n[0] * LUZ[0] + f.n[1] * LUZ[1] + f.n[2] * LUZ[2]);
  const [r, g, b] = BASE[f.kind].map((v) => Math.round(Math.min(255, v * k)));
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

const ORDEN: Record<Kind, number> = { limpieza: 0, zapata: 1, pedestal: 2, columna: 3 };

/** Caras visibles proyectadas y ordenadas de atrás hacia adelante */
export function projectFaces(m: Model3D, az: number, el: number) {
  const { P, visible } = projector(az, el);
  return m.faces
    .filter((f) => visible(f.n))
    .map((f) => { const q = f.pts.map(P); return { f, q, d: q.reduce((s, v) => s + v.d, 0) / q.length }; })
    // vista desde arriba: lo que está apoyado encima nunca queda tapado por lo de abajo
    .sort((a, b) => ORDEN[a.f.kind] - ORDEN[b.f.kind] || b.d - a.d);
}
