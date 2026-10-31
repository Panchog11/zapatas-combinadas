import { colDims, widthAt } from '../core/geometry';
import { localXY } from '../core/loads';
import type { Results } from '../core/analysis';
import type { Project } from '../core/types';
import { fmt } from '../core/units';

/** Primitivas en coordenadas de modelo (mm, Y hacia arriba). Tamaño de texto en mm de papel. */
export type Layer = 'contorno' | 'ejes' | 'columnas' | 'cotas' | 'armInf' | 'armSup' | 'refuerzos' | 'esperas' | 'textos' | 'terreno' | 'notas';
export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; layer: Layer; w?: number; dash?: 'axis' | 'hidden' }
  | { t: 'poly'; pts: [number, number][]; closed?: boolean; layer: Layer; w?: number; fill?: string; dash?: 'axis' | 'hidden' }
  | { t: 'circle'; x: number; y: number; r: number; layer: Layer; fill?: string; w?: number; rPaper?: boolean }
  | { t: 'text'; x: number; y: number; s: string; h: number; layer: Layer; anchor?: 'start' | 'middle' | 'end'; rot?: number; bold?: boolean; box?: boolean }
  | { t: 'dim'; x1: number; y1: number; x2: number; y2: number; off: number; layer: Layer; s?: string };

export interface Drawing { id: string; title: string; prims: Prim[]; bbox: [number, number, number, number] }

export const LAYERS: { id: Layer; nombre: string; color: string }[] = [
  { id: 'contorno', nombre: 'Contorno', color: '#0f1d2b' },
  { id: 'ejes', nombre: 'Ejes', color: '#64748b' },
  { id: 'columnas', nombre: 'Columnas / pedestales', color: '#334155' },
  { id: 'cotas', nombre: 'Cotas', color: '#0e5a8a' },
  { id: 'armInf', nombre: 'Armadura inferior', color: '#c2410c' },
  { id: 'armSup', nombre: 'Armadura superior', color: '#7c3aed' },
  { id: 'refuerzos', nombre: 'Refuerzos', color: '#db2777' },
  { id: 'esperas', nombre: 'Esperas / estribos', color: '#15803d' },
  { id: 'textos', nombre: 'Marcas y textos', color: '#0f1d2b' },
  { id: 'terreno', nombre: 'Terreno / limpieza', color: '#92400e' },
  { id: 'notas', nombre: 'Cuadros y notas', color: '#0f1d2b' },
];

function bboxOf(prims: Prim[], k: number): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of prims) {
    if (p.t === 'line' || p.t === 'dim') { add(p.x1, p.y1); add(p.x2, p.y2); }
    else if (p.t === 'poly') p.pts.forEach(([x, y]) => add(x, y));
    else if (p.t === 'circle') { add(p.x - p.r, p.y - p.r); add(p.x + p.r, p.y + p.r); }
    else { const w = p.s.length * p.h * k * 0.6; add(p.x - (p.anchor === 'end' ? w : p.anchor === 'middle' ? w / 2 : 0), p.y); add(p.x + w, p.y + p.h * k); }
  }
  const m = 4 * k;
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}

const mm = (v: number) => fmt(v / 1000, 2);

/** k = factor de escala (1:k): convierte mm de papel a mm de modelo */
export function planDrawing(p: Project, r: Results, k: number, modo: 'encofrado' | 'armadura' = 'armadura'): Drawing {
  const f = p.footing, s = r.shape;
  const P: Prim[] = [];
  const X = (x: number) => f.x0 + x;
  const Y = (y: number) => f.y0 + y;
  const outline: [number, number][] = [[X(0), Y(-s.B1 / 2)], [X(s.L), Y(-s.B2 / 2)], [X(s.L), Y(s.B2 / 2)], [X(0), Y(s.B1 / 2)]];
  P.push({ t: 'poly', pts: outline, closed: true, layer: 'contorno', w: 0.5 });
  // recubrimiento lateral (línea oculta)
  const rl = f.recLat;
  P.push({ t: 'poly', pts: [[X(rl), Y(-widthAt(s, rl) / 2 + rl)], [X(s.L - rl), Y(-widthAt(s, s.L - rl) / 2 + rl)], [X(s.L - rl), Y(widthAt(s, s.L - rl) / 2 - rl)], [X(rl), Y(widthAt(s, rl) / 2 - rl)]], closed: true, layer: 'cotas', w: 0.13, dash: 'hidden' });
  const ext = 12 * k;
  // eje longitudinal
  P.push({ t: 'line', x1: X(-ext), y1: Y(0), x2: X(s.L + ext), y2: Y(0), layer: 'ejes', dash: 'axis', w: 0.18 });
  const Bm = s.Bmax;
  const cols = [...p.columns].sort((a, b) => a.x - b.x);
  cols.forEach((c, i) => {
    const { x, y } = localXY(p, c);
    const d = colDims(c);
    P.push({ t: 'line', x1: X(x), y1: Y(-Bm / 2 - ext), x2: X(x), y2: Y(Bm / 2 + ext * 1.6), layer: 'ejes', dash: 'axis', w: 0.18 });
    P.push({ t: 'circle', x: X(x), y: Y(Bm / 2 + ext * 1.6 + 4 * k), r: 4 * k, layer: 'ejes', w: 0.25 });
    P.push({ t: 'text', x: X(x), y: Y(Bm / 2 + ext * 1.6 + 2.6 * k), s: String(i + 1), h: 2, layer: 'ejes', anchor: 'middle', bold: true });
    if (c.ped.activo) P.push({ t: 'poly', pts: rectPts(X(x), Y(y), c.ped.bx, c.ped.by, 0), closed: true, layer: 'columnas', w: 0.35, dash: 'hidden' });
    if (c.forma === 'circ') P.push({ t: 'circle', x: X(x), y: Y(y), r: c.D / 2, layer: 'columnas', fill: '#94a3b8', w: 0.5 });
    else P.push({ t: 'poly', pts: rectPts(X(x), Y(y), d.bx, d.by, c.angulo), closed: true, layer: 'columnas', fill: '#94a3b8', w: 0.5 });
    P.push({ t: 'text', x: X(x) + d.bx / 2 + 1.5 * k, y: Y(y) + d.by / 2 + 1 * k, s: c.nombre, h: 2, layer: 'textos', bold: true });
    if (modo === 'encofrado') P.push({ t: 'text', x: X(x) + d.bx / 2 + 1.5 * k, y: Y(y) - d.by / 2 - 3.5 * k, s: `(${mm(c.x)}; ${mm(c.y)})`, h: 2, layer: 'cotas' });
  });
  // cotas generales y parciales (abajo)
  const yb = Y(-Bm / 2);
  const xs = [0, ...cols.map((c) => localXY(p, c).x), s.L];
  for (let i = 0; i < xs.length - 1; i++) P.push({ t: 'dim', x1: X(xs[i]), y1: yb, x2: X(xs[i + 1]), y2: yb, off: -10 * k, layer: 'cotas' });
  P.push({ t: 'dim', x1: X(0), y1: yb, x2: X(s.L), y2: yb, off: -18 * k, layer: 'cotas' });
  P.push({ t: 'dim', x1: X(0), y1: Y(-s.B1 / 2), x2: X(0), y2: Y(s.B1 / 2), off: -(ext + 10 * k), layer: 'cotas' });
  if (f.forma === 'trapezoidal') P.push({ t: 'dim', x1: X(s.L), y1: Y(-s.B2 / 2), x2: X(s.L), y2: Y(s.B2 / 2), off: ext + 10 * k, layer: 'cotas' });
  // cotas transversales de columnas a los bordes (encofrado: todas; armadura: la primera)
  for (const c0 of modo === 'encofrado' ? cols : cols.slice(0, 1)) {
    const { x, y } = localXY(p, c0);
    const B = widthAt(s, x);
    P.push({ t: 'dim', x1: X(x), y1: Y(-B / 2), x2: X(x), y2: Y(y), off: 6 * k, layer: 'cotas' });
    P.push({ t: 'dim', x1: X(x), y1: Y(y), x2: X(x), y2: Y(B / 2), off: 6 * k, layer: 'cotas' });
  }

  if (modo === 'encofrado') {
    if (f.forma === 'trapezoidal') P.push({ t: 'text', x: X(s.L / 2), y: Y(0) + 2 * k, s: 'TRAPEZOIDAL', h: 2, layer: 'cotas', anchor: 'middle' });
    return { id: 'encofrado', title: 'Planta de encofrado', prims: P, bbox: bboxOf(P, k) };
  }
  // Armaduras: inferior en ambas direcciones, superior en ambas, refuerzos
  const L = r.long, T = r.trans;
  const Bmin = Math.min(s.B1, s.B2);
  const barsY = (n: number, db: number, B: number) => {
    const a = B - 2 * rl - db;
    return Array.from({ length: n }, (_, i) => -a / 2 + (n > 1 ? (i * a) / (n - 1) : a / 2));
  };
  const longBars = (face: 'inf' | 'sup') => {
    const F = L[face];
    if (!F.total) return;
    const layer = face === 'inf' ? 'armInf' : 'armSup';
    const ys = barsY(F.total.n, F.total.db, Bmin);
    // continuas en posiciones alternadas cuando hay refuerzos
    const step = F.nCont < F.total.n ? F.total.n / F.nCont : 1;
    const contIdx = new Set<number>();
    for (let i = 0; i < F.nCont; i++) contIdx.add(Math.min(F.total.n - 1, Math.round(i * step)));
    ys.forEach((yy, i) => {
      if (face === 'inf' ? yy > 0 : yy < 0) return; // media planta
      const off = 0;
      if (contIdx.has(i)) P.push({ t: 'line', x1: X(rl), y1: Y(yy + off), x2: X(s.L - rl), y2: Y(yy + off), layer, w: 0.25, dash: face === 'sup' ? 'hidden' : undefined });
      else for (const rf of F.refuerzos) P.push({ t: 'line', x1: X(rf.x1), y1: Y(yy + off), x2: X(rf.x2), y2: Y(yy + off), layer: 'refuerzos', w: 0.35, dash: face === 'sup' ? 'hidden' : undefined });
    });
  };
  longBars('inf'); longBars('sup');
  const transBars = (face: 'inf' | 'sup') => {
    const F = T[face];
    if (!F.sel) return;
    const layer = face === 'inf' ? 'armInf' : 'armSup';
    for (let x = rl; x <= s.L - rl + 1; x += F.sel.s) {
      const B = widthAt(s, x);
      const ya = face === 'inf' ? -B / 2 + rl : 0, yb2 = face === 'inf' ? 0 : B / 2 - rl;
      P.push({ t: 'line', x1: X(x), y1: Y(ya), x2: X(x), y2: Y(yb2), layer, w: 0.18, dash: face === 'sup' ? 'hidden' : undefined });
    }
    for (const b of F.bandas) {
      if (!b.nAdd) continue;
      for (let i = 0; i < b.nAdd; i++) {
        const x = b.x1 + ((i + 0.5) * (b.x2 - b.x1)) / b.nAdd;
        const B = widthAt(s, x);
        P.push({ t: 'line', x1: X(x), y1: Y(-B / 2 + rl), x2: X(x), y2: Y(0), layer: 'refuerzos', w: 0.35 });
      }
    }
  };
  transBars('inf'); transBars('sup');
  P.push({ t: 'text', x: X(0) - 2 * k, y: Y(-Bmin / 4), s: 'ARM. INFERIOR', h: 2, layer: 'armInf', bold: true, anchor: 'middle', rot: 90 });
  P.push({ t: 'text', x: X(0) - 2 * k, y: Y(Bmin / 4), s: 'ARM. SUPERIOR', h: 2, layer: 'armSup', bold: true, anchor: 'middle', rot: 90 });
  // Marcas (globo con número) para cada marca relevante
  const marca = (g: string) => r.schedule.marcas.filter((m) => m.grupo === g);
  const label = (x: number, y: number, txt: string, layer: Layer) => P.push({ t: 'text', x, y, s: txt, h: 2, layer, box: true });
  const mi = marca('longInf')[0], ms = marca('longSup')[0], ti = marca('transInf')[0], ts = marca('transSup')[0];
  if (mi) label(X(s.L * 0.08), Y(-Bmin / 2 + rl + 3 * k), `(${mi.marca}) ${mi.n}Ø${mi.db} L=${mm(mi.lu)} inf.`, 'armInf');
  if (ms) label(X(s.L * 0.08), Y(Bmin / 2 - rl - 6 * k), `(${ms.marca}) ${ms.n}Ø${ms.db} L=${mm(ms.lu)} sup.`, 'armSup');
  if (ti && T.inf.sel) label(X(s.L * 0.72), Y(-Bmin / 2 + rl + 3 * k), `(${ti.marca}) Ø${ti.db} c/${T.inf.sel.s} inf.`, 'armInf');
  if (ts && T.sup.sel) label(X(s.L * 0.72), Y(Bmin / 2 - rl - 6 * k), `(${ts.marca}) Ø${ts.db} c/${T.sup.sel.s} sup.`, 'armSup');
  for (const m of [...marca('longInfRef'), ...marca('longSupRef')]) label(X(((m.x1 ?? 0) + (m.x2 ?? 0)) / 2), Y(m.grupo === 'longSupRef' ? 2 * k : -6 * k), `(${m.marca}) ${m.n}Ø${m.db} L=${mm(m.lu)}`, 'refuerzos');
  for (const m of r.schedule.marcas.filter((q) => q.grupo === 'transInf' && q.col)) label(X(((m.x1 ?? 0) + (m.x2 ?? 0)) / 2), Y(Bmin / 2 + 3 * k), `(${m.marca}) ${m.n}Ø${m.db}`, 'refuerzos');

  // Cortes A-A (longitudinal) y B-B (transversal por la columna más cargada)
  const cB = governingCol(p, r);
  const xB = cB ? localXY(p, cB).x : s.L / 2;
  const cut = (x1: number, y1: number, x2: number, y2: number, n: string) => {
    P.push({ t: 'line', x1, y1, x2, y2, layer: 'ejes', w: 0.5, dash: 'axis' });
    P.push({ t: 'text', x: x1, y: y1 + 1.5 * k, s: n, h: 3.5, layer: 'textos', anchor: 'middle', bold: true });
    P.push({ t: 'text', x: x2, y: y2 + 1.5 * k, s: n, h: 3.5, layer: 'textos', anchor: 'middle', bold: true });
  };
  cut(X(-ext - 6 * k), Y(-Bm / 4), X(s.L + ext + 6 * k), Y(-Bm / 4), 'A');
  cut(X(xB + 0.6 * colDims(cB ?? p.columns[0]).bx), Y(-Bm / 2 - ext - 4 * k), X(xB + 0.6 * colDims(cB ?? p.columns[0]).bx), Y(Bm / 2 + ext + 4 * k), 'B');

  return { id: 'planta', title: 'Planta de armaduras', prims: P, bbox: bboxOf(P, k) };
}

function rectPts(cx: number, cy: number, bx: number, by: number, ang: number): [number, number][] {
  const a = (ang * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return [[-bx / 2, -by / 2], [bx / 2, -by / 2], [bx / 2, by / 2], [-bx / 2, by / 2]].map(([x, y]) => [cx + x * c - y * sn, cy + x * sn + y * c]);
}

export function governingCol(p: Project, r: Results) {
  let best = p.columns[0], N = -Infinity;
  for (const c of p.columns) for (const u of r.ult) { const v = u.tot.combo.cargas[c.id]?.N ?? 0; if (v > N) { N = v; best = c; } }
  return best;
}

/** Corte longitudinal A-A: x horizontal, z vertical (cota relativa al terreno) */
export function longSection(p: Project, r: Results, k: number, modo: 'encofrado' | 'armadura' = 'armadura'): Drawing {
  const f = p.footing, s = r.shape, P: Prim[] = [];
  const zb = f.cotaTerreno - f.Df, zt = zb + f.h, zg = f.cotaTerreno;
  const X = (x: number) => x;
  common(P, f, k, 0, s.L, zb, zt, zg, 'x');
  for (const c of p.columns) apoyoElev(P, p, r, c, localXY(p, c).x, colDims(c).bx, c.ped.bx, k, modo === 'armadura');
  const xs = [0, ...p.columns.map((c) => localXY(p, c).x).sort((q, w) => q - w), s.L];
  P.push({ t: 'dim', x1: 0, y1: zb, x2: s.L, y2: zb, off: -18 * k, layer: 'cotas' });
  for (let i = 0; i < xs.length - 1; i++) P.push({ t: 'dim', x1: xs[i], y1: zb, x2: xs[i + 1], y2: zb, off: -24 * k, layer: 'cotas' });
  if (modo === 'encofrado') return { id: 'cAe', title: 'Corte A-A (encofrado)', prims: P, bbox: bboxOf(P, k) };
  // armadura longitudinal
  const L = r.long, T = r.trans, rl = f.recLat;
  const extOut = p.crit.capaInferiorExterna === 'long';
  const zLI = zb + f.recInf + (extOut ? 0 : (T.inf.sel?.db ?? 0)) + (L.inf.total?.db ?? 0) / 2;
  const zLS = zt - f.recSup - (extOut ? 0 : (T.sup.sel?.db ?? 0)) - (L.sup.total?.db ?? 0) / 2;
  const mLI = r.schedule.marcas.find((q) => q.grupo === 'longInf'), mLS = r.schedule.marcas.find((q) => q.grupo === 'longSup');
  if (mLI) {
    P.push({ t: 'poly', pts: [[X(rl), zLI + mLI.A], [X(rl), zLI], [X(s.L - rl), zLI], [X(s.L - rl), zLI + mLI.A]], layer: 'armInf', w: 0.5 });
    P.push({ t: 'text', x: X(s.L * 0.3), y: zb - 9 * k, s: `(${mLI.marca}) ${mLI.n}Ø${mLI.db} L=${mm(mLI.lu)}`, h: 2, layer: 'armInf', box: true });
  }
  if (mLS) {
    P.push({ t: 'poly', pts: [[X(rl), zLS - mLS.A], [X(rl), zLS], [X(s.L - rl), zLS], [X(s.L - rl), zLS - mLS.A]], layer: 'armSup', w: 0.5 });
    P.push({ t: 'text', x: X(s.L * 0.3), y: zt + 4 * k, s: `(${mLS.marca}) ${mLS.n}Ø${mLS.db} L=${mm(mLS.lu)}`, h: 2, layer: 'armSup', box: true });
  }
  for (const m of r.schedule.marcas.filter((q) => q.grupo === 'longInfRef' || q.grupo === 'longSupRef')) {
    const sup = m.grupo === 'longSupRef';
    const z = sup ? zLS - 2.2 * (L.sup.total?.db ?? 16) : zLI + 2.2 * (L.inf.total?.db ?? 16);
    P.push({ t: 'line', x1: X(m.x1 ?? 0), y1: z, x2: X(m.x2 ?? 0), y2: z, layer: 'refuerzos', w: 0.5 });
    P.push({ t: 'text', x: X(((m.x1 ?? 0) + (m.x2 ?? 0)) / 2), y: z + (sup ? -6 * k : 2.5 * k), s: `(${m.marca}) ${m.n}Ø${m.db} L=${mm(m.lu)}`, h: 2, layer: 'refuerzos', anchor: 'middle' });
  }
  // barras transversales en corte (puntos)
  const dots = (face: 'inf' | 'sup') => {
    const F = T[face];
    if (!F.sel) return;
    const z = face === 'inf' ? zb + f.recInf + (extOut ? (L.inf.total?.db ?? 0) : 0) + F.sel.db / 2 : zt - f.recSup - (extOut ? (L.sup.total?.db ?? 0) : 0) - F.sel.db / 2;
    for (let x = rl; x <= s.L - rl + 1; x += F.sel.s) P.push({ t: 'circle', x: X(x), y: z, r: Math.max(F.sel.db / 2, 0.5 * k), layer: face === 'inf' ? 'armInf' : 'armSup', fill: '#0f1d2b' });
  };
  dots('inf'); dots('sup');
  return { id: 'cA', title: 'Corte A-A (longitudinal)', prims: P, bbox: bboxOf(P, k) };
}

/** Corte transversal B-B por la columna más cargada */
export function transSection(p: Project, r: Results, k: number, modo: 'encofrado' | 'armadura' = 'armadura'): Drawing {
  const f = p.footing, s = r.shape, P: Prim[] = [];
  const c = governingCol(p, r);
  const { x: xc, y: yc } = localXY(p, c);
  const B = widthAt(s, xc);
  const zb = f.cotaTerreno - f.Df, zt = zb + f.h, zg = f.cotaTerreno;
  common(P, f, k, -B / 2, B / 2, zb, zt, zg, 'y');
  const d = colDims(c);
  apoyoElev(P, p, r, c, yc, d.by, c.ped.by, k, modo === 'armadura');
  P.push({ t: 'dim', x1: -B / 2, y1: zb, x2: B / 2, y2: zb, off: -18 * k, layer: 'cotas' });
  P.push({ t: 'dim', x1: -B / 2, y1: zb, x2: yc - d.by / 2, y2: zb, off: -24 * k, layer: 'cotas' });
  P.push({ t: 'dim', x1: yc + d.by / 2, y1: zb, x2: B / 2, y2: zb, off: -24 * k, layer: 'cotas' });
  if (modo === 'encofrado') return { id: 'cBe', title: `Corte B-B (encofrado, por ${c.nombre})`, prims: P, bbox: bboxOf(P, k) };
  const L = r.long, T = r.trans, rl = f.recLat;
  const extOut = p.crit.capaInferiorExterna === 'long';
  const zTI = zb + f.recInf + (extOut ? (L.inf.total?.db ?? 0) : 0) + (T.inf.sel?.db ?? 0) / 2;
  const zTS = zt - f.recSup - (extOut ? (L.sup.total?.db ?? 0) : 0) - (T.sup.sel?.db ?? 0) / 2;
  const mTI = r.schedule.marcas.find((q) => q.grupo === 'transInf'), mTS = r.schedule.marcas.find((q) => q.grupo === 'transSup');
  if (mTI) {
    P.push({ t: 'poly', pts: [[-B / 2 + rl, zTI + mTI.A], [-B / 2 + rl, zTI], [B / 2 - rl, zTI], [B / 2 - rl, zTI + mTI.A]], layer: 'armInf', w: 0.5 });
    P.push({ t: 'text', x: -B / 2, y: zb - 9 * k, s: `(${mTI.marca}) Ø${mTI.db} c/${T.inf.sel?.s} L=${mm(mTI.lu)}`, h: 2, layer: 'armInf', box: true });
  }
  if (mTS) {
    P.push({ t: 'poly', pts: [[-B / 2 + rl, zTS - mTS.A], [-B / 2 + rl, zTS], [B / 2 - rl, zTS], [B / 2 - rl, zTS - mTS.A]], layer: 'armSup', w: 0.5 });
    P.push({ t: 'text', x: -B / 2, y: zt + 4 * k, s: `(${mTS.marca}) Ø${mTS.db} c/${T.sup.sel?.s} L=${mm(mTS.lu)}`, h: 2, layer: 'armSup', box: true });
  }
  const dots = (face: 'inf' | 'sup') => {
    const F = L[face];
    if (!F.total) return;
    const z = face === 'inf' ? zb + f.recInf + (extOut ? 0 : (T.inf.sel?.db ?? 0)) + F.total.db / 2 : zt - f.recSup - (extOut ? 0 : (T.sup.sel?.db ?? 0)) - F.total.db / 2;
    const a = Math.min(s.B1, s.B2) - 2 * rl - F.total.db;
    for (let i = 0; i < F.total.n; i++) P.push({ t: 'circle', x: -a / 2 + (F.total.n > 1 ? (i * a) / (F.total.n - 1) : a / 2), y: z, r: Math.max(F.total.db / 2, 0.6 * k), layer: face === 'inf' ? 'armInf' : 'armSup', fill: '#0f1d2b' });
  };
  dots('inf'); dots('sup');
  return { id: 'cB', title: `Corte B-B (transversal por ${c.nombre})`, prims: P, bbox: bboxOf(P, k) };
}

function common(P: Prim[], f: Project['footing'], k: number, a: number, b: number, zb: number, zt: number, zg: number, _ax: 'x' | 'y') {
  const ext = 12 * k;
  // terreno, limpieza y zapata
  P.push({ t: 'line', x1: a - ext, y1: zg, x2: b + ext, y2: zg, layer: 'terreno', w: 0.35 });
  for (let x = a - ext; x < b + ext; x += 4 * k) P.push({ t: 'line', x1: x, y1: zg, x2: x - 2 * k, y2: zg - 2 * k, layer: 'terreno', w: 0.13 });
  P.push({ t: 'poly', pts: [[a - 100, zb], [b + 100, zb], [b + 100, zb - f.limpieza], [a - 100, zb - f.limpieza]], closed: true, layer: 'terreno', w: 0.25, fill: '#e7e5e4' });
  P.push({ t: 'poly', pts: [[a, zb], [b, zb], [b, zt], [a, zt]], closed: true, layer: 'contorno', w: 0.6, fill: '#f1f5f9' });
  // niveles
  const lvl = (z: number, t: string) => {
    P.push({ t: 'poly', pts: [[b + ext * 0.6, z], [b + ext * 0.6 - 1.5 * k, z + 2.5 * k], [b + ext * 0.6 + 1.5 * k, z + 2.5 * k]], closed: true, layer: 'cotas', w: 0.18 });
    P.push({ t: 'text', x: b + ext * 0.6 + 2.5 * k, y: z + 0.5 * k, s: `${t} ${z >= 0 ? '+' : ''}${fmt(z / 1000, 2)}`, h: 2, layer: 'cotas' });
  };
  lvl(zg, 'N.T.N.'); lvl(zt, 'N.S.Z.'); lvl(zb, 'N.Fund.');
  P.push({ t: 'dim', x1: a, y1: zb, x2: a, y2: zt, off: -8 * k, layer: 'cotas' });
  P.push({ t: 'dim', x1: a, y1: zb, x2: a, y2: zg, off: -14 * k, layer: 'cotas', s: `Df ${mm(zg - zb)}` });
  P.push({ t: 'text', x: a + 2 * k, y: zb + 1.2 * k, s: `rec. ${f.recInf}`, h: 2, layer: 'cotas' });
  P.push({ t: 'text', x: a + 2 * k, y: zt - 3 * k, s: `rec. ${f.recSup}`, h: 2, layer: 'cotas' });
  P.push({ t: 'text', x: b - 2 * k, y: zb - f.limpieza - 4 * k, s: `H° limpieza e = ${f.limpieza} mm`, h: 2, layer: 'terreno', anchor: 'end' });
}

/** Elevación del apoyo en un corte: pedestal, elemento apoyado (H°A°, metálico o equipo), esperas y armadura del pedestal */
function apoyoElev(P: Prim[], p: Project, r: Results, c: Project['columns'][number], u: number, dCol: number, dPed: number, k: number, arm: boolean) {
  const f = p.footing;
  const zb = f.cotaTerreno - f.Df, zt = zb + f.h, zg = f.cotaTerreno;
  const hp = c.ped.activo ? c.ped.h : 0;
  const zTop = zt + hp;
  if (hp > 0) {
    P.push({ t: 'poly', pts: [[u - dPed / 2, zt], [u + dPed / 2, zt], [u + dPed / 2, zTop], [u - dPed / 2, zTop]], closed: true, layer: 'columnas', w: 0.5, fill: '#f8fafc' });
    P.push({ t: 'dim', x1: u + dPed / 2, y1: zt, x2: u + dPed / 2, y2: zTop, off: 5 * k, layer: 'cotas' });
    P.push({ t: 'dim', x1: u - dPed / 2, y1: zTop, x2: u + dPed / 2, y2: zTop, off: 4 * k, layer: 'cotas' });
  }
  const top = Math.max(zg + 150, zTop + 350);
  if (c.apoyo === 'equipo') {
    P.push({ t: 'poly', pts: [[u - dCol / 2, zTop], [u + dCol / 2, zTop], [u + dCol / 2, zTop + 450], [u - dCol / 2, zTop + 450]], closed: true, layer: 'columnas', w: 0.35, dash: 'hidden' });
    P.push({ t: 'text', x: u, y: zTop + 180, s: 'EQUIPO', h: 2, layer: 'textos', anchor: 'middle' });
  } else if (c.apoyo === 'metalica') {
    const tp = 25, bw = 0.6 * dCol;
    P.push({ t: 'poly', pts: [[u - dCol / 2, zTop], [u + dCol / 2, zTop], [u + dCol / 2, zTop + tp], [u - dCol / 2, zTop + tp]], closed: true, layer: 'columnas', w: 0.35, fill: '#475569' });
    P.push({ t: 'poly', pts: [[u - bw / 2, zTop + tp], [u - bw / 2, top], [u + bw / 2, top], [u + bw / 2, zTop + tp]], layer: 'columnas', w: 0.5 });
    P.push({ t: 'line', x1: u - bw / 2 + 15, y1: zTop + tp, x2: u - bw / 2 + 15, y2: top, layer: 'columnas', w: 0.25 });
    P.push({ t: 'line', x1: u + bw / 2 - 15, y1: zTop + tp, x2: u + bw / 2 - 15, y2: top, layer: 'columnas', w: 0.25 });
    if (arm) for (const sx of [-1, 1]) {
      const ub = u + sx * (dCol / 2 - 50);
      P.push({ t: 'line', x1: ub, y1: zTop + tp + 60, x2: ub, y2: Math.max(zb + f.recInf + 100, zTop - 400), layer: 'esperas', w: 0.35, dash: 'hidden' });
    }
    if (arm) P.push({ t: 'text', x: u + dCol / 2 + 2 * k, y: zTop + tp + 2 * k, s: 'PERNOS S/ FABRICANTE', h: 2, layer: 'esperas' });
  } else {
    P.push({ t: 'poly', pts: [[u - dCol / 2, zTop], [u - dCol / 2, top], [u + dCol / 2, top], [u + dCol / 2, zTop]], layer: 'columnas', w: 0.5 });
  }
  P.push({ t: 'poly', pts: [[u - dCol / 2 - 3 * k, top], [u - 2 * k, top], [u, top + 4 * k], [u + 1 * k, top - 4 * k], [u + 3 * k, top], [u + dCol / 2 + 3 * k, top]], layer: 'columnas', w: 0.25 });
  P.push({ t: 'line', x1: u, y1: zb - 15 * k, x2: u, y2: top + 8 * k, layer: 'ejes', dash: 'axis', w: 0.18 });
  P.push({ t: 'text', x: u, y: top + 9 * k, s: c.nombre, h: 2.5, layer: 'textos', anchor: 'middle', bold: true });
  if (!arm) return;
  const meshDb = (r.long.inf.total?.db ?? 16) + (r.trans.inf.sel?.db ?? 12);
  // esperas de columna de H°A°
  const m = r.schedule.marcas.find((q) => q.grupo === 'espera' && q.col === c.id);
  if (m) {
    const zbar = zb + f.recInf + meshDb + m.db / 2;
    const cov = c.rec + c.dbEstribo + m.db / 2;
    for (const sx of [-1, 1]) {
      const ub = u + sx * (dCol / 2 - cov);
      const pts: [number, number][] = [[ub, zbar + m.A], [ub, zbar]];
      if (m.B) pts.push([ub + sx * m.B, zbar]);
      P.push({ t: 'poly', pts, layer: 'esperas', w: 0.4 });
    }
    P.push({ t: 'text', x: u + dCol / 2 + 2 * k, y: zTop + 0.5 * (m.A - hp - f.h), s: `(${m.marca}) ${m.n}Ø${m.db} L=${mm(m.lu)}`, h: 2, layer: 'esperas', box: true });
  }
  // armadura del pedestal
  const pr = r.peds?.find((q) => q.colId === c.id);
  const mp = r.schedule.marcas.find((q) => q.grupo === 'ped' && q.col === c.id);
  const me = r.schedule.marcas.find((q) => q.grupo === 'estribo' && q.col === c.id);
  if (pr && mp) {
    const a = pr.des.arm, cov = c.ped.rec + a.dbE + a.db / 2;
    const zbar = zb + f.recInf + meshDb + a.db / 2;
    for (const sx of [-1, 1]) {
      const ub = u + sx * (dPed / 2 - cov);
      P.push({ t: 'poly', pts: [[ub, zTop - c.ped.rec], [ub, zbar], [ub + sx * mp.B, zbar]], layer: 'esperas', w: 0.5 });
    }
    const zs = [zt - 80, zt - Math.min(250, f.h / 2)];
    for (let z = zt + 50; z <= zTop - 40; z += a.sE) zs.push(z);
    for (const z of zs) P.push({ t: 'line', x1: u - dPed / 2 + c.ped.rec, y1: z, x2: u + dPed / 2 - c.ped.rec, y2: z, layer: 'esperas', w: 0.25 });
    P.push({ t: 'text', x: u - dPed / 2 - 2 * k, y: zt + hp * 0.65, s: `(${mp.marca}) ${mp.n}Ø${mp.db}`, h: 2, layer: 'esperas', anchor: 'end', box: true });
    if (me) P.push({ t: 'text', x: u - dPed / 2 - 2 * k, y: zt + hp * 0.3, s: `(${me.marca}) E Ø${me.db} c/${a.sE}`, h: 2, layer: 'esperas', anchor: 'end', box: true });
  }
}

/** Detalle de armadura del pedestal: sección horizontal con barras y estribo */
export function pedestalDetail(p: Project, r: Results, colId: string, k = 10): Drawing | null {
  const c = p.columns.find((q) => q.id === colId);
  const pr = r.peds?.find((q) => q.colId === colId);
  if (!c || !pr) return null;
  const P: Prim[] = [];
  const { bx, by, rec } = c.ped;
  const a = pr.des.arm;
  P.push({ t: 'poly', pts: [[-bx / 2, -by / 2], [bx / 2, -by / 2], [bx / 2, by / 2], [-bx / 2, by / 2]], closed: true, layer: 'contorno', w: 0.5, fill: '#f1f5f9' });
  const e = rec + a.dbE / 2;
  P.push({ t: 'poly', pts: [[-bx / 2 + e, -by / 2 + e], [bx / 2 - e, -by / 2 + e], [bx / 2 - e, by / 2 - e], [-bx / 2 + e, by / 2 - e]], closed: true, layer: 'esperas', w: Math.max(0.25, a.dbE / 10 / 2) });
  for (const b of pr.des.sec.bars) P.push({ t: 'circle', x: b.x, y: b.y, r: a.db / 2, layer: 'esperas', fill: '#0f1d2b' });
  if (c.apoyo === 'hormigon') {
    const d = colDims(c);
    P.push({ t: 'poly', pts: [[-d.bx / 2, -d.by / 2], [d.bx / 2, -d.by / 2], [d.bx / 2, d.by / 2], [-d.bx / 2, d.by / 2]], closed: true, layer: 'columnas', w: 0.25, dash: 'hidden' });
  }
  P.push({ t: 'dim', x1: -bx / 2, y1: -by / 2, x2: bx / 2, y2: -by / 2, off: -6 * k, layer: 'cotas', s: `${bx}` });
  P.push({ t: 'dim', x1: bx / 2, y1: -by / 2, x2: bx / 2, y2: by / 2, off: 6 * k, layer: 'cotas', s: `${by}` });
  const nb = 2 * a.nx + 2 * a.ny - 4;
  P.push({ t: 'text', x: -bx / 2, y: by / 2 + 3 * k, s: `${c.nombre}: ${nb}Ø${a.db} + E Ø${a.dbE} c/${a.sE} · h = ${c.ped.h} mm · rec. ${rec}`, h: 2, layer: 'textos' });
  return { id: `ped-${colId}`, title: `Armadura pedestal ${c.nombre}`, prims: P, bbox: bboxOf(P, k) };
}
