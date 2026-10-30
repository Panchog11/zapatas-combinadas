import { widthAt, colDims, type Shape } from './geometry';
import { ld, longGancho90, radioDoblado, ganchoExt, barArea } from './section';
import type { Project } from './types';
import type { LongFace, TransFace } from './analysis';

export type Forma = 'recta' | 'L' | 'U' | 'Ui' | 'estribo' | 'caballete';

export interface BarMark {
  marca: number;
  elemento: string;
  db: number;
  forma: Forma;
  A: number; B: number; C: number; D: number;
  radio: number;
  gancho: number;
  lu: number;
  n: number;
  lt: number;
  pu: number; // kg/m
  pt: number; // kg
  ubic: string;
  obs: string;
  grupo: 'longInf' | 'longInfRef' | 'longSup' | 'longSupRef' | 'transInf' | 'transSup' | 'espera' | 'estribo' | 'ped' | 'caballete' | 'piel';
  x1?: number; x2?: number; s?: number; col?: string;
}

export interface Schedule {
  marcas: BarMark[];
  porDiametro: { db: number; lt: number; peso: number; pesoDesp: number; barras: number }[];
  pesoTotal: number;
  avisos: string[];
}

export const pesoLineal = (p: Project, db: number) => p.pesosLineales[db] ?? (Math.PI * db * db / 4) * 7.85e-3;

export function buildSchedule(
  p: Project, s: Shape,
  r: { long: { inf: LongFace; sup: LongFace }; trans: { inf: TransFace; sup: TransFace }; dd: { LI: number; TI: number; LS: number; TS: number } },
  full = true,
): Schedule {
  const f = p.footing, n = p.norm, fc = p.mat.hormigon.fc, fy = p.mat.acero.fy;
  const marcas: BarMark[] = [];
  const avisos: string[] = [];
  const hLibre = f.h - f.recInf - f.recSup;
  const leg = (db: number) => {
    const g = longGancho90(db, n);
    if (g > hLibre) avisos.push(`Gancho de Ø${db} recortado a ${Math.round(hLibre)} mm por altura disponible (estándar ${Math.round(g)} mm).`);
    return Math.min(g, hLibre);
  };
  const add = (m: Omit<BarMark, 'marca' | 'lt' | 'pu' | 'pt' | 'radio'>) => {
    if (m.n <= 0) return;
    let lu = m.lu;
    let obs = m.obs;
    // empalmes en barras más largas que la comercial
    const recta = Math.max(m.A, m.B, m.C);
    if (recta > p.crit.barraComercial && m.forma !== 'estribo') {
      const lap = n.empalmeClaseB * ld(m.db, fc, fy, n, m.grupo.startsWith('longSup'));
      const ns = Math.ceil((lu - p.crit.barraComercial) / (p.crit.barraComercial - lap));
      lu += ns * lap;
      obs = `${obs ? obs + '; ' : ''}${ns} empalme(s) clase B de ${Math.round(lap)} mm alternados`;
    }
    const pu = pesoLineal(p, m.db);
    marcas.push({ ...m, lu, obs, marca: marcas.length + 1, radio: radioDoblado(m.db, n), lt: lu * m.n, pu, pt: (lu * m.n * pu) / 1000 });
  };
  const Lb = s.L - 2 * f.recLat;

  // Longitudinales
  for (const L of [r.long.inf, r.long.sup]) {
    if (!L.total) continue;
    const inf = L.cara === 'inf';
    const db = L.total.db, A = leg(db);
    add({ elemento: `Long. ${inf ? 'inferior' : 'superior'} continua`, db, forma: inf ? 'U' : 'Ui', A, B: Lb, C: A, D: 0, gancho: A, lu: Lb + 2 * A, n: L.nCont, ubic: inf ? 'Cara inferior, dirección X' : 'Cara superior, dirección X', obs: 'Ganchos 90° en extremos', grupo: inf ? 'longInf' : 'longSup', x1: f.recLat, x2: s.L - f.recLat, s: L.total.s });
    for (const rf of L.refuerzos) {
      const len = rf.x2 - rf.x1;
      const gi = rf.ganchoIzq ? A : 0, gd = rf.ganchoDer ? A : 0;
      add({ elemento: `Refuerzo ${inf ? 'inferior' : 'superior'}`, db, forma: gi && gd ? (inf ? 'U' : 'Ui') : gi || gd ? 'L' : 'recta', A: gi || gd, B: len, C: gi && gd ? gd : 0, D: 0, gancho: Math.max(gi, gd), lu: len + gi + gd, n: rf.n, ubic: `x = ${(rf.x1 / 1000).toFixed(2)} a ${(rf.x2 / 1000).toFixed(2)} m`, obs: 'Intercaladas entre barras continuas; incluye prolongación máx(d; 12db) y ld', grupo: inf ? 'longInfRef' : 'longSupRef', x1: rf.x1, x2: rf.x2 });
    }
  }
  // Transversales
  for (const T of [r.trans.inf, r.trans.sup]) {
    if (!T.sel) continue;
    const inf = T.cara === 'inf';
    const db = T.sel.db, A = leg(db), sp = T.sel.s;
    const nT = Math.floor(Lb / sp) + 1;
    const grupos = new Map<number, number>();
    for (let i = 0; i < nT; i++) {
      const x = f.recLat + i * sp;
      const B = widthAt(s, Math.min(x, s.L)) - 2 * f.recLat;
      const key = Math.ceil(B / 50) * 50;
      grupos.set(key, (grupos.get(key) ?? 0) + 1);
    }
    for (const [B, cnt] of grupos) add({ elemento: `Transv. ${inf ? 'inferior' : 'superior'}`, db, forma: inf ? 'U' : 'Ui', A, B, C: A, D: 0, gancho: A, lu: B + 2 * A, n: cnt, ubic: `${inf ? 'Cara inferior' : 'Cara superior'}, dirección Y, c/${sp} mm`, obs: 'Ganchos 90°', grupo: inf ? 'transInf' : 'transSup', s: sp });
    for (const b of T.bandas) {
      if (!b.nAdd) continue;
      const B = widthAt(s, (b.x1 + b.x2) / 2) - 2 * f.recLat;
      add({ elemento: `Refuerzo transv. bajo ${b.col}`, db, forma: 'U', A, B, C: A, D: 0, gancho: A, lu: B + 2 * A, n: b.nAdd, ubic: `Banda x = ${(b.x1 / 1000).toFixed(2)} a ${(b.x2 / 1000).toFixed(2)} m`, obs: 'Intercaladas en la banda b_col + d', grupo: 'transInf', x1: b.x1, x2: b.x2, col: b.colId });
    }
  }
  // Esperas, estribos y pedestales
  const dbMalla = (r.long.inf.total?.db ?? 16) + (r.trans.inf.sel?.db ?? 12);
  for (const c of p.columns) {
    const db = c.dbBarras;
    const embed = f.h - f.recInf - dbMalla;
    const lap = c.lEspera ?? Math.max(n.empalmeClaseB * ld(db, fc, fy, n), Math.max(n.empalmeCompresion.coef * fy * db, n.empalmeCompresion.minimo));
    const hp = c.ped.activo ? c.ped.h : 0;
    const A = embed + hp + lap;
    const pie = c.gancho === 'recto' ? 0 : c.gancho === '90' ? radioDoblado(db, n) + db + ganchoExt(db, '90', n) : Math.max(4 * db, 65) + radioDoblado(db, n) * 2;
    add({ elemento: `Esperas ${c.nombre}`, db, forma: pie ? 'L' : 'recta', A, B: pie, C: 0, D: 0, gancho: pie, lu: A + pie, n: c.nBarras, ubic: `Columna ${c.nombre}`, obs: `Empalme sobre ${c.ped.activo ? 'pedestal' : 'zapata'}: ${Math.round(lap)} mm${c.lEspera ? ' (usuario)' : ' (máx. clase B / compresión)'}`, grupo: 'espera', col: c.id });
    const cd = c.ped.activo ? { bx: c.ped.bx, by: c.ped.by } : colDims(c);
    const sa = cd.bx - 2 * c.rec, sb = cd.by - 2 * c.rec;
    const ext = Math.max(n.ganchos.estriboExtDb * c.dbEstribo, 75);
    const nEst = 2 + (hp > 0 ? Math.ceil(hp / c.sEstribo) + 1 : 0);
    add({ elemento: `Estribos ${c.nombre}`, db: c.dbEstribo, forma: 'estribo', A: sa, B: sb, C: 0, D: 0, gancho: ext, lu: 2 * (sa + sb) + 2 * ext, n: nEst, ubic: hp > 0 ? `Pedestal ${c.nombre} c/${c.sEstribo} + 2 en zapata` : `En zapata (montaje esperas)`, obs: 'Ganchos 135°', grupo: 'estribo', col: c.id });
    if (c.ped.activo) {
      const req = 0.005 * c.ped.bx * c.ped.by;
      const falta = req - c.nBarras * barArea(db);
      if (falta > 0) {
        const nAdd = Math.max(4, Math.ceil(falta / barArea(db)));
        const lp = embed + hp - p.footing.recSup;
        add({ elemento: `Barras pedestal ${c.nombre}`, db, forma: 'L', A: lp, B: pie || 12 * db, C: 0, D: 0, gancho: pie || 12 * db, lu: lp + (pie || 12 * db), n: nAdd, ubic: `Perímetro del pedestal`, obs: 'Hasta 0,005·Ag pedestal (hipótesis)', grupo: 'ped', col: c.id });
      }
    }
  }
  if (full) {
    const hc = f.h - f.recInf - f.recSup - (r.long.inf.total?.db ?? 0) - (r.trans.inf.sel?.db ?? 0) - (r.long.sup.total?.db ?? 0) - (r.trans.sup.sel?.db ?? 0);
    if (hc > 0) {
      const nCab = Math.ceil((s.A / 1e6) * p.crit.caballetesPorM2);
      add({ elemento: 'Caballetes (montaje)', db: p.crit.dbMontaje, forma: 'caballete', A: hc, B: 300, C: 200, D: 0, gancho: 0, lu: 2 * hc + 300 + 2 * 200, n: nCab, ubic: 'Apoyo malla superior', obs: `${p.crit.caballetesPorM2} por m²`, grupo: 'caballete' });
    }
    if (f.h > n.piel.hLimite) {
      const nPorCara = Math.max(1, Math.ceil(hLibre / n.piel.sMax) - 1);
      add({ elemento: 'Armadura de piel', db: n.piel.db, forma: 'recta', A: 0, B: Lb, C: 0, D: 0, gancho: 0, lu: Lb, n: 2 * nPorCara, ubic: 'Caras laterales longitudinales', obs: `h > ${n.piel.hLimite} mm`, grupo: 'piel' });
    }
  }
  const map = new Map<number, { lt: number; peso: number }>();
  for (const m of marcas) {
    const e = map.get(m.db) ?? { lt: 0, peso: 0 };
    e.lt += m.lt; e.peso += m.pt;
    map.set(m.db, e);
  }
  const k = 1 + p.crit.desperdicio / 100;
  const porDiametro = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([db, e]) => ({
    db, lt: e.lt, peso: e.peso, pesoDesp: e.peso * k, barras: Math.ceil((e.lt * k) / p.crit.barraComercial),
  }));
  return { marcas, porDiametro, pesoTotal: porDiametro.reduce((a, d) => a + d.pesoDesp, 0), avisos: [...new Set(avisos)] };
}
