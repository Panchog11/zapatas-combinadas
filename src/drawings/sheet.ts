import type { Results } from '../core/analysis';
import type { Project } from '../core/types';
import { fmt } from '../core/units';
import { ganchoExt, radioDoblado } from '../core/section';
import { longSection, pedestalDetail, planDrawing, transSection, type Drawing, type Layer, type Prim } from './model';
import { build3D, projectFaces, shade } from './axo';

/** Hoja A2 apaisada (mm de papel, Y hacia arriba, origen abajo-izquierda) */
export const A2 = { W: 594, H: 420 };
export const ESCALAS = [10, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250];
const TXT = 2; // altura de texto general [mm]
const MARCO = { x0: 15, y0: 10, x1: 584, y1: 410 };
const DERECHA = { x0: 404, x1: 584 }; // columna de rótulo, planilla y notas
const VISTAS = { x0: 20, x1: 398, y0: 15, y1: 404 };

/** Lleva las primitivas de una vista (mm de modelo, escala 1:k) al papel en la posición (ox, oy) = esquina inferior izquierda */
export function placePrims(d: Drawing, k: number, ox: number, oy: number): Prim[] {
  const [x0, y0] = d.bbox;
  const X = (x: number) => ox + (x - x0) / k, Y = (y: number) => oy + (y - y0) / k;
  return d.prims.map((p): Prim => {
    switch (p.t) {
      case 'line': return { ...p, x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2) };
      case 'poly': return { ...p, pts: p.pts.map(([x, y]) => [X(x), Y(y)] as [number, number]) };
      case 'circle': return { ...p, x: X(p.x), y: Y(p.y), r: p.r / k };
      case 'text': return { ...p, x: X(p.x), y: Y(p.y) };
      // el texto conserva la medida real del modelo
      case 'dim': return { ...p, x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2), off: p.off / k, s: p.s ?? fmt(Math.hypot(p.x2 - p.x1, p.y2 - p.y1) / 1000, 2) };
    }
  });
}

function bbox(prims: Prim[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const a = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of prims) {
    if (p.t === 'line' || p.t === 'dim') { a(p.x1, p.y1); a(p.x2, p.y2); }
    else if (p.t === 'poly') p.pts.forEach(([x, y]) => a(x, y));
    else if (p.t === 'circle') { a(p.x - p.r, p.y - p.r); a(p.x + p.r, p.y + p.r); }
  }
  return [x0, y0, x1, y1];
}

/** Axonometría como primitivas (mm de modelo proyectados) */
export function axoDrawing(p: Project, r: Results): Drawing {
  const faces = projectFaces(build3D(p, r, false), 32, 28);
  const layer = (k: string): Layer => (k === 'limpieza' ? 'terreno' : k === 'zapata' ? 'contorno' : 'columnas');
  const prims: Prim[] = faces.map(({ f, q }) => ({ t: 'poly', pts: q.map((v) => [v.x, v.y] as [number, number]), closed: true, layer: layer(f.kind), fill: shade(f), w: 0.18 }));
  return { id: 'axo', title: 'Axonometría', prims, bbox: bbox(prims) };
}

/** Detalle de gancho normal a 90° de la armadura inferior (escala 1:10) */
export function hookDetail(p: Project, r: Results): Drawing {
  const db = r.long.inf.total?.db ?? 16;
  const n = p.norm;
  const rad = radioDoblado(db, n), ext = ganchoExt(db, '90', n);
  const P: Prim[] = [];
  const L0 = 300;
  // eje de la barra: tramo horizontal, curva y extensión vertical
  const pts: [number, number][] = [[-L0, 0]];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * (Math.PI / 2); pts.push([rad * Math.cos(a), rad + rad * Math.sin(a)]); }
  pts.push([rad, rad + ext]);
  P.push({ t: 'poly', pts, layer: 'armInf', w: Math.max(0.35, db / 10 / 2) });
  P.push({ t: 'dim', x1: rad, y1: rad, x2: rad, y2: rad + ext, off: 25 * 1, layer: 'cotas', s: `${n.ganchos.ext90Db}db = ${Math.round(ext)}` });
  P.push({ t: 'dim', x1: 0, y1: rad, x2: rad, y2: rad, off: 0, layer: 'cotas', s: `r = ${Math.round(rad)}` });
  P.push({ t: 'text', x: -L0, y: 12, s: `Ø${db} — diám. doblado ${Math.round(2 * rad)} mm`, h: TXT, layer: 'textos' });
  P.push({ t: 'text', x: -L0, y: -30, s: 'Medidas en mm', h: TXT, layer: 'cotas' });
  return { id: 'gancho', title: 'Detalle gancho 90°', prims: P, bbox: bbox(P) };
}

interface Item { d: Drawing; k: number; titulo: string; esc: string; w: number; h: number }
const TIT = 9; // alto reservado para título de vista [mm]
const GAP = 10;

/** Empaquetado por filas, primer hueco: cada vista va a la primera fila con ancho disponible */
function pack(items: Item[], W: number): { rows: Item[][]; H: number } {
  const rows: Item[][] = [];
  const used: number[] = [];
  for (const it of items) {
    const i = used.findIndex((u) => u + GAP + it.w <= W);
    if (i >= 0) { rows[i].push(it); used[i] += GAP + it.w; } else { rows.push([it]); used.push(it.w); }
  }
  const H = rows.reduce((s, r) => s + Math.max(...r.map((i) => i.h)), 0) + GAP * (rows.length - 1);
  return { rows, H };
}

function wrap(t: string, w: number, h: number): string[] {
  const max = Math.floor(w / (h * 0.55));
  const out: string[] = [];
  let line = '';
  for (const word of t.split(' ')) {
    if ((line + ' ' + word).trim().length > max) { out.push(line.trim()); line = word; } else line += ' ' + word;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

export interface Sheet { drawing: Drawing; k: number; ajusta: boolean }

export function sheetA2(p: Project, r: Results, kPedida: number | 'auto'): Sheet {
  const P: Prim[] = [];
  const T = (x: number, y: number, s: string, h = TXT, o: Partial<Extract<Prim, { t: 'text' }>> = {}) => P.push({ t: 'text', x, y, s, h, layer: 'notas', ...o });
  const Ln = (x1: number, y1: number, x2: number, y2: number, w = 0.25) => P.push({ t: 'line', x1, y1, x2, y2, layer: 'notas', w });
  const Rc = (x0: number, y0: number, x1: number, y1: number, w = 0.25) => P.push({ t: 'poly', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, layer: 'notas', w });

  // ---- Marco, grilla de zonas
  Rc(5, 5, A2.W - 5, A2.H - 5, 0.18);
  Rc(MARCO.x0, MARCO.y0, MARCO.x1, MARCO.y1, 0.7);
  const nc = 8, nr = 6;
  const cw = (MARCO.x1 - MARCO.x0) / nc, rh = (MARCO.y1 - MARCO.y0) / nr;
  for (let i = 0; i < nc; i++) {
    const x = MARCO.x0 + (i + 0.5) * cw;
    T(x, MARCO.y1 + 1.2, String(i + 1), 2.5, { anchor: 'middle' });
    T(x, 6.2, String(i + 1), 2.5, { anchor: 'middle' });
    if (i) { Ln(MARCO.x0 + i * cw, MARCO.y1, MARCO.x0 + i * cw, A2.H - 5, 0.18); Ln(MARCO.x0 + i * cw, 5, MARCO.x0 + i * cw, MARCO.y0, 0.18); }
  }
  for (let j = 0; j < nr; j++) {
    const y = MARCO.y1 - (j + 0.5) * rh;
    const L = 'ABCDEF'[j];
    T((5 + MARCO.x0) / 2, y - 1, L, 2.5, { anchor: 'middle' });
    T((MARCO.x1 + A2.W - 5) / 2, y - 1, L, 2.5, { anchor: 'middle' });
    if (j) { Ln(5, MARCO.y1 - j * rh, MARCO.x0, MARCO.y1 - j * rh, 0.18); Ln(MARCO.x1, MARCO.y1 - j * rh, A2.W - 5, MARCO.y1 - j * rh, 0.18); }
  }
  T(MARCO.x0 + 2, MARCO.y0 + 2, 'A2 - 594 x 420', 2.5, { bold: true });
  // escala gráfica de control de impresión (100 mm)
  for (let i = 0; i < 10; i++) P.push({ t: 'poly', pts: [[MARCO.x0 + 40 + i * 10, MARCO.y0 + 2], [MARCO.x0 + 50 + i * 10, MARCO.y0 + 2], [MARCO.x0 + 50 + i * 10, MARCO.y0 + 4], [MARCO.x0 + 40 + i * 10, MARCO.y0 + 4]], closed: true, layer: 'notas', w: 0.13, fill: i % 2 ? '#fff' : '#0f1d2b' });
  T(MARCO.x0 + 145, MARCO.y0 + 2, '100 mm', TXT);

  // ---- Columna derecha: separador
  Ln(DERECHA.x0, MARCO.y0, DERECHA.x0, MARCO.y1, 0.5);

  // ---- Rótulo
  const R = DERECHA, f = p.footing, m = p.meta;
  const rows = [MARCO.y0, MARCO.y0 + 18, MARCO.y0 + 30, MARCO.y0 + 50, MARCO.y0 + 64, MARCO.y0 + 78];
  rows.forEach((y, i) => Ln(R.x0, y, R.x1, y, i === rows.length - 1 ? 0.5 : 0.25));
  const lab = (x: number, y: number, s: string) => T(x + 1.5, y - 3, s, 1.8, { bold: true });
  // Nº de plano
  Ln(R.x0 + 120, rows[0], R.x0 + 120, rows[1]);
  lab(R.x0, rows[1], 'PLANO Nº');
  T(R.x0 + 4, rows[0] + 4, m.codigo || '—', 6, { bold: true });
  lab(R.x0 + 120, rows[1], 'HOJA');
  T(R.x0 + 150, rows[0] + 5, '1 / 1', 3.5, { anchor: 'middle', bold: true });
  // escala / fecha / revisión
  Ln(R.x0 + 60, rows[1], R.x0 + 60, rows[2]); Ln(R.x0 + 120, rows[1], R.x0 + 120, rows[2]);
  lab(R.x0, rows[2], 'ESCALAS'); lab(R.x0 + 60, rows[2], 'FECHA'); lab(R.x0 + 120, rows[2], 'REVISIÓN');
  const escTxt = (k: number) => `INDICADAS (1:${k})`;
  const iEsc = P.length;
  T(R.x0 + 3, rows[1] + 3, '', 2.5); // se completa al conocer la escala
  T(R.x0 + 63, rows[1] + 3, m.fecha, 2.5);
  T(R.x0 + 123, rows[1] + 3, 'A — Emisión inicial', 2.5);
  // título
  lab(R.x0, rows[3], 'TÍTULO');
  T(R.x0 + 4, rows[2] + 9, 'ENCOFRADO Y ARMADURA', 4, { bold: true });
  T(R.x0 + 4, rows[2] + 3, `ZAPATA COMBINADA — ${p.columns.map((c) => c.nombre).join(' / ')}`, 3);
  // obra
  lab(R.x0, rows[4], 'OBRA / UBICACIÓN');
  T(R.x0 + 4, rows[3] + 6, (m.obra || '—').toUpperCase(), 3, { bold: true });
  T(R.x0 + 4, rows[3] + 2, m.ubicacion || '—', 2.2);
  // profesional
  Ln(R.x0 + 110, rows[4], R.x0 + 110, rows[5]);
  lab(R.x0, rows[5], 'PROFESIONAL'); lab(R.x0 + 110, rows[5], 'FIRMA');
  T(R.x0 + 4, rows[4] + 4, m.profesional || '—', 2.5);

  // ---- Planilla de doblado
  const sc = r.schedule;
  const cols: [string, number, (x: typeof sc.marcas[number]) => string, 'start' | 'end' | 'middle'][] = [
    ['MARCA', 12, (x) => String(x.marca), 'middle'], ['Ø', 9, (x) => String(x.db), 'middle'], ['ELEMENTO / FORMA', 63, (x) => `${x.elemento} (${x.forma})`, 'start'],
    ['CANT.', 13, (x) => String(x.n), 'end'], ['L.UNIT [m]', 22, (x) => fmt(x.lu / 1000, 2), 'end'], ['L.TOT [m]', 28, (x) => fmt(x.lt / 1000, 2), 'end'], ['PESO [kg]', 33, (x) => fmt(x.pt, 1), 'end'],
  ];
  const rh2 = 4.2;
  const yTop0 = rows[5] + 6;
  const nFil = sc.marcas.length + sc.porDiametro.length + 2;
  let y = yTop0 + rh2 * (nFil + 1);
  const tabTop = y;
  T(R.x0 + 2, y + 2, 'PLANILLA DE DOBLADO', 3, { bold: true });
  const drawRow = (vals: string[], bold = false, anchors?: ('start' | 'end' | 'middle')[]) => {
    let x = R.x0;
    vals.forEach((v, i) => {
      const w = cols[i][1];
      const a = anchors?.[i] ?? cols[i][3];
      const tx = a === 'start' ? x + 1 : a === 'end' ? x + w - 1 : x + w / 2;
      T(tx, y - rh2 + 1.1, v, TXT, { anchor: a, bold });
      x += w;
    });
    Ln(R.x0, y - rh2, R.x1, y - rh2, 0.13);
    y -= rh2;
  };
  Ln(R.x0, y, R.x1, y, 0.35);
  drawRow(cols.map((c) => c[0]), true, cols.map(() => 'middle'));
  for (const x of sc.marcas) drawRow(cols.map((c) => c[2](x)));
  const totLt = sc.porDiametro.reduce((a, d) => a + d.lt, 0);
  for (const d of sc.porDiametro) drawRow(['', String(d.db), `Total Ø${d.db} (+${p.crit.desperdicio}% desp.)`, '', `${d.barras} b × 12 m`, fmt(d.lt / 1000, 1), fmt(d.pesoDesp, 1)], false);
  drawRow(['', '', 'TOTAL ACERO', '', '', fmt(totLt / 1000, 1), fmt(sc.pesoTotal, 1)], true);
  // verticales de la tabla
  let xv = R.x0;
  for (const c of cols.slice(0, -1)) { xv += c[1]; Ln(xv, tabTop, xv, y, 0.13); }

  // ---- Notas
  const v = (r.cantidades.Vh + r.cantidades.Vped) / 1e9;
  const notas = [
    'DIMENSIONES EN m Y NIVELES EN m REFERIDOS AL TERRENO NATURAL, SALVO INDICACIÓN. DIÁMETROS Y RECUBRIMIENTOS EN mm.',
    `HORMIGÓN ${p.mat.hormigon.nombre} (f'c = ${p.mat.hormigon.fc} MPa). EXPOSICIÓN: ${p.mat.exposicion}.`,
    `ACERO DE REFUERZO ${p.mat.acero.nombre} (fy = ${p.mat.acero.fy} MPa).`,
    `RECUBRIMIENTOS: INFERIOR ${f.recInf} mm; SUPERIOR ${f.recSup} mm; LATERAL ${f.recLat} mm. HORMIGÓN DE LIMPIEZA e = ${f.limpieza} mm.`,
    `FUNDAR A Df = ${fmt(f.Df / 1000, 2)} m. TENSIÓN ADMISIBLE ${p.geo.qadmTipo.toUpperCase()} q = ${fmt(p.geo.qadm * 1000, 0)} kPa (VERIFICAR CON ESTUDIO DE SUELOS).`,
    'GANCHOS NORMALES A 90° SEGÚN DETALLE. EMPALMES CLASE B. NO CORTAR BARRAS EN PUNTOS DE MOMENTO NULO.',
    'PLANTA DE ARMADURA: MITAD INFERIOR = ARMADURA INFERIOR (LÍNEA LLENA); MITAD SUPERIOR = ARMADURA SUPERIOR (TRAZOS).',
    `CÓMPUTO: HORMIGÓN ${fmt(v, 2)} m³ · ACERO ${fmt(sc.pesoTotal, 0)} kg (${fmt(sc.pesoTotal / v, 0)} kg/m³) · EXCAVACIÓN ${fmt(r.cantidades.Vexc / 1e9, 1)} m³.`,
    'DOCUMENTO GENERADO CON HERRAMIENTA DE ASISTENCIA AL CÁLCULO: REQUIERE REVISIÓN Y FIRMA DE PROFESIONAL MATRICULADO.',
  ];

  // ---- Datos de cálculo (arriba de la columna derecha)
  let yd = MARCO.y1 - 6;
  T(R.x0 + 2, yd, 'DATOS DE CÁLCULO', 3, { bold: true });
  yd -= 3;
  Ln(R.x0, yd, R.x1, yd, 0.35);
  const dcols: [string, number][] = [['COLUMNA', 24], ['SECCIÓN [cm]', 34], ['N SERV. MÁX [kN]', 40], ['N ÚLT. MÁX [kN]', 40], ['PEDESTAL', 42]];
  const dRow = (vals: string[], bold = false) => {
    let x = R.x0;
    vals.forEach((v, i) => { T(x + dcols[i][1] / 2, yd - rh2 + 1.1, v, TXT, { anchor: 'middle', bold }); x += dcols[i][1]; });
    yd -= rh2;
    Ln(R.x0, yd, R.x1, yd, 0.13);
  };
  dRow(dcols.map((c) => c[0]), true);
  const nMax = (c: typeof p.columns[number], t: 'servicio' | 'ultima') => Math.max(0, ...p.combos.filter((q) => q.activa && q.tipo === t).map((q) => q.cargas[c.id]?.N ?? 0));
  for (const c of p.columns) dRow([c.nombre, c.forma === 'circ' ? `Ø${c.D / 10}` : `${c.bx / 10}×${c.by / 10}`, fmt(nMax(c, 'servicio') / 1e3, 0), fmt(nMax(c, 'ultima') / 1e3, 0), c.ped.activo ? `${c.ped.bx / 10}×${c.ped.by / 10}×${c.ped.h / 10}` : '—']);
  const qmax = Math.max(0, ...r.service.map((x) => x.pf.qmax));
  const resumen = [
    `q máx servicio = ${fmt(qmax * 1000, 0)} kPa ≤ q adm = ${fmt(p.geo.qadm * 1000, 0)} kPa (${p.geo.qadmTipo})`,
    `M+ = ${fmt(r.env.Mpos.M / 1e6, 0)} kNm · M− = ${fmt(r.env.Mneg.M / 1e6, 0)} kNm · d inf = ${fmt(r.d.LI, 0)} mm`,
    `ESTADO DE VERIFICACIÓN: ${r.estado.texto} (D/C máx = ${fmt(r.estado.maxRatio, 2)})`,
  ];
  resumen.forEach((t, i) => T(R.x0 + 3, yd - 4 - i * 3.4, t, TXT, { bold: i === 2 }));
  yd -= 4 + resumen.length * 3.4;
  Ln(R.x0, yd, R.x1, yd, 0.35);
  // notas debajo de los datos de cálculo
  const notaLines = notas.flatMap((t) => wrap(t, R.x1 - R.x0 - 8, TXT).map((l, i) => (i ? '   ' : '* ') + l));
  const yNotasTop = yd;
  T(R.x0 + 2, yNotasTop - 5, 'NOTAS', 3, { bold: true });
  notaLines.forEach((l, i) => T(R.x0 + 3, yNotasTop - 9.5 - i * 3.2, l, TXT));
  Ln(R.x0, yNotasTop - 11.5 - notaLines.length * 3.2, R.x1, yNotasTop - 11.5 - notaLines.length * 3.2, 0.35);
  Ln(R.x0, tabTop + 6, R.x1, tabTop + 6, 0.35);

  // ---- Vistas
  // Bloque superior en dos columnas: [planta + corte A-A] de encofrado y de armadura, alineados según el eje longitudinal.
  // Debajo: corte B-B, detalles de pedestal, axonometría y gancho (empaquetado por filas).
  const axo = axoDrawing(p, r);
  const gancho = hookDetail(p, r);
  const W = VISTAS.x1 - VISTAS.x0, Hd = VISTAS.y1 - VISTAS.y0;
  interface Al { d: Drawing; anchor: number; titulo: string }
  const columna = (ds: Al[], k: number) => {
    const left = Math.max(...ds.map((q) => (q.anchor - q.d.bbox[0]) / k));
    const right = Math.max(...ds.map((q) => (q.d.bbox[2] - q.anchor) / k));
    const h = ds.reduce((s, q) => s + (q.d.bbox[3] - q.d.bbox[1]) / k + TIT, 0) + GAP * (ds.length - 1);
    return { ds, left, w: left + right, h, k };
  };
  const build = (k: number) => {
    const A = columna([
      { d: planDrawing(p, r, k, 'encofrado'), anchor: f.x0, titulo: 'PLANTA DE ENCOFRADO' },
      { d: longSection(p, r, k, 'encofrado'), anchor: 0, titulo: 'CORTE A-A — ENCOFRADO' },
    ], k);
    const B = columna([
      { d: planDrawing(p, r, k, 'armadura'), anchor: f.x0, titulo: 'PLANTA DE ARMADURA' },
      { d: longSection(p, r, k, 'armadura'), anchor: 0, titulo: 'CORTE A-A — ARMADURA' },
    ], k);
    const lado = A.w + GAP + B.w <= W;
    const topH = lado ? Math.max(A.h, B.h) : A.h + GAP + B.h;
    const extras: Item[] = [];
    const it = (d: Drawing, kk: number, titulo: string, esc: string): Item => ({ d, k: kk, titulo, esc, w: (d.bbox[2] - d.bbox[0]) / kk, h: (d.bbox[3] - d.bbox[1]) / kk + TIT });
    extras.push(it(transSection(p, r, k, 'armadura'), k, 'CORTE B-B — ARMADURA', `ESC. 1:${k}`));
    // un detalle por cada pedestal distinto; el título lista las columnas que lo comparten
    const grupos = new Map<string, string[]>();
    for (const pr of r.peds) {
      const c = p.columns.find((q) => q.id === pr.colId)!;
      const key = JSON.stringify([c.ped.bx, c.ped.by, c.ped.h, c.ped.rec, pr.des.arm]);
      grupos.set(key, [...(grupos.get(key) ?? []), pr.colId]);
    }
    for (const ids of grupos.values()) {
      const pr = r.peds.find((q) => q.colId === ids[0])!;
      const c = p.columns.find((q) => q.id === pr.colId)!;
      const nombres = ids.map((id) => p.columns.find((q) => q.id === id)!.nombre).join(', ');
      const kd = Math.max(c.ped.bx, c.ped.by) > 450 ? 20 : 10;
      const d = pedestalDetail(p, r, pr.colId, kd);
      if (d) extras.push(it(d, kd, `ARMADURA PEDESTAL ${nombres}`, `ESC. 1:${kd}`));
    }
    const axoW = Math.min(130, W / 2);
    extras.push(it(axo, (axo.bbox[2] - axo.bbox[0]) / axoW, 'AXONOMETRÍA', 'SIN ESCALA'));
    extras.push(it(gancho, 10, 'DETALLE GANCHO 90°', 'ESC. 1:10'));
    const ex = pack(extras, W);
    const ok = Math.max(A.w, B.w) <= W && topH + GAP + ex.H <= Hd && ex.rows.every((rw) => rw.reduce((s, i) => s + i.w, 0) + GAP * (rw.length - 1) <= W);
    return { A, B, lado, topH, ex, ok };
  };
  let k = typeof kPedida === 'number' ? kPedida : ESCALAS[ESCALAS.length - 1];
  let lay = build(k);
  if (kPedida === 'auto') {
    for (const kk of ESCALAS.filter((e) => e >= 20)) { const l = build(kk); if (l.ok) { k = kk; lay = l; break; } }
  }
  const ajusta = lay.ok;
  const titulo = (x: number, top: number, t: string, esc: string) => {
    T(x, top - 4, t, 3.5, { bold: true });
    Ln(x, top - 5, x + t.length * 3.5 * 0.62, top - 5, 0.35);
    T(x, top - 8.2, esc, TXT);
  };
  const ponerColumna = (C: ReturnType<typeof columna>, x0: number, top: number) => {
    const xa = x0 + C.left; // abscisa en papel del borde izquierdo de la zapata, común a planta y corte
    let y = top;
    for (const q of C.ds) {
      const hq = (q.d.bbox[3] - q.d.bbox[1]) / C.k;
      titulo(x0, y, q.titulo, `ESC. 1:${C.k}`);
      P.push(...placePrims(q.d, C.k, xa - (q.anchor - q.d.bbox[0]) / C.k, y - TIT - hq));
      y -= hq + TIT + GAP;
    }
  };
  const libreV = Math.max(0, Hd - lay.topH - GAP - lay.ex.H);
  const sep = libreV / 3;
  let yy = VISTAS.y1 - sep;
  if (lay.lado) {
    const libreH = (W - lay.A.w - lay.B.w) / 3;
    ponerColumna(lay.A, VISTAS.x0 + libreH, yy);
    ponerColumna(lay.B, VISTAS.x0 + 2 * libreH + lay.A.w, yy);
  } else {
    ponerColumna(lay.A, VISTAS.x0 + (W - lay.A.w) / 2, yy);
    ponerColumna(lay.B, VISTAS.x0 + (W - lay.B.w) / 2, yy - lay.A.h - GAP);
  }
  yy -= lay.topH + GAP + sep;
  for (const rw of lay.ex.rows) {
    const hRow = Math.max(...rw.map((i) => i.h));
    const sumW = rw.reduce((s, i) => s + i.w, 0);
    const gapH = Math.max(GAP, (W - sumW) / (rw.length + 1));
    let xx = VISTAS.x0 + (rw.length === 1 ? (W - sumW) / 2 : gapH);
    for (const q of rw) {
      titulo(xx, yy, q.titulo, q.esc);
      P.push(...placePrims(q.d, q.k, xx, yy - q.h));
      xx += q.w + gapH;
    }
    yy -= hRow + GAP;
  }
  // completar escala en rótulo
  (P[iEsc] as Extract<Prim, { t: 'text' }>).s = escTxt(k);
  return { drawing: { id: 'A2', title: 'Plano A2', prims: P, bbox: [0, 0, A2.W, A2.H] }, k, ajusta };
}
