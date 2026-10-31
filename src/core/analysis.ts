import { colDims, shapeOf, widthAt, inside, type Shape } from './geometry';
import { comboTotals, weights, localXY, armZ, zSobreZapata, type ComboTotals, type Weights } from './loads';
import { solvePressure, qAt, type PressureField } from './pressure';
import { beamAnalysis, interp, type BeamResult, type PointLoad } from './beam';
import {
  asRequired, phiMn, epsT, selectBars, selectBarsPerM, barArea, ld, ldh, ldc, type BarSet,
} from './section';
import { criticalPerimeter, punchingCheck, overlaps, type CriticalPerimeter, type Rect } from './punching';
import type { Check, Column, Combo, Estado, Issue, Project } from './types';
import { fmt } from './units';
import { buildSchedule, type Schedule } from './rebar';
import { validate } from './validate';
import { designPed, type PedDemand, type PedDesign } from './pedestal';

const k = (v: number, d = 2) => fmt(v / 1e3, d); // N → kN
const km = (v: number, d = 2) => fmt(v / 1e6, d); // N·mm → kN·m
const kp = (v: number, d = 2) => fmt(v * 1e3, d); // MPa → kPa
const mt = (v: number, d = 3) => fmt(v / 1e3, d); // mm → m

export interface ServiceRes {
  tot: ComboTotals;
  pf: PressureField;
  qadm: number;
  qComparada: number;
  sigmaV0: number;
}

export interface UltRes { tot: ComboTotals; pf: PressureField; beam: BeamResult }

export interface Peak { M: number; x: number; combo: string }

export interface LongFace {
  cara: 'inf' | 'sup';
  Mu: number; x: number; combo: string; b: number; d: number;
  AsReq: number; AsMin: number; AsObj: number; okSeccion: boolean;
  total: BarSet | null;
  nCont: number; AsCont: number; phiMnCont: number; phiMnTot: number;
  refuerzos: { x1: number; x2: number; ganchoIzq: boolean; ganchoDer: boolean; n: number }[];
  eps: number; manual: boolean;
}

export interface TransFace {
  cara: 'inf' | 'sup';
  MuM: number; // por unidad de ancho (N·mm/mm)
  VuM: number;
  col: string; combo: string; c: number; d: number; bf: number; metodo: string;
  AsReqM: number; AsMinM: number; sel: BarSet | null; phiMnM: number; eps: number; manual: boolean;
  bandas: { col: string; colId: string; x1: number; x2: number; bf: number; c: number; Mu: number; Vu: number; combo: string; AsReq: number; AsProv: number; nAdd: number; ok: boolean; phiMn: number }[];
}

export interface PunchRes {
  col: string; combo: string; cp: CriticalPerimeter; Pu: number; qu: number; Vu: number; Mux: number; Muy: number; d: number;
  chk: ReturnType<typeof punchingCheck>; beta: number;
}

export interface Results {
  shape: Shape;
  w: Weights;
  service: ServiceRes[];
  ult: UltRes[];
  predim: { N: number; combo: string; factor: number; qadm: number; Areq: number; qEst: number };
  env: { Mpos: Peak; Mneg: Peak; V: { V: number; x: number; combo: string }; xs: number[]; pos: number[]; neg: number[] };
  d: { LI: number; TI: number; LS: number; TS: number; punz: number; corte: number };
  long: { inf: LongFace; sup: LongFace };
  trans: { inf: TransFace; sup: TransFace };
  punz: PunchRes[];
  punzConjunto: PunchRes | null;
  peds: PedRes[];
  checks: Check[];
  schedule: Schedule;
  issues: Issue[];
  estado: { texto: string; nivel: Estado; maxRatio: number };
  cantidades: { Vh: number; Vped: number; Vlimp: number; Vexc: number; acero: number; kgm3: number };
  advertenciasModelo: string[];
}

interface Ctx { p: Project; s: Shape; checks: Check[]; tol: number }

function mk(c: Ctx, o: Omit<Check, 'ratio' | 'estado'> & { estado?: Estado }): Check {
  const ratio = o.capacidad === 0 ? (o.demanda > 0 ? Infinity : 0) : o.demanda / o.capacidad;
  const estado: Estado = o.estado ?? (!Number.isFinite(ratio) && ratio !== Infinity ? 'nc' : ratio <= 1 + c.tol ? 'ok' : 'fail');
  const ch = { ...o, ratio, estado };
  c.checks.push(ch);
  return ch;
}

const activeCombos = (p: Project, t: 'servicio' | 'ultima') => p.combos.filter((c) => c.activa && c.tipo === t);

export function faceRect(p: Project, col: Column): Rect & { bx: number; by: number } {
  const { x, y } = localXY(p, col);
  const d = col.ped.activo ? { bx: col.ped.bx, by: col.ped.by } : colDims(col);
  return { x1: x - d.bx / 2, x2: x + d.bx / 2, y1: y - d.by / 2, y2: y + d.by / 2, bx: d.bx, by: d.by };
}

export function analyze(p: Project, opts: { schedule?: boolean; geoOnly?: boolean } = {}): Results {
  const s = shapeOf(p.footing);
  const f = p.footing;
  const n = p.norm;
  const fc = p.mat.hormigon.fc;
  const fy = p.mat.acero.fy;
  const ctx: Ctx = { p, s, checks: [], tol: p.meta.tolerancia || 1e-6 };
  const issues: Issue[] = validate(p, s);
  const advertenciasModelo: string[] = [];
  const w = weights(p, s);

  // ---------------- Servicio: presiones y estabilidad ----------------
  const sigmaV0 = (() => {
    const hw = w.hw;
    return p.geo.gamma * (f.Df - hw) + Math.max(0, p.geo.gammaSat - 9.81e-6) * hw;
  })();
  const service: ServiceRes[] = activeCombos(p, 'servicio').map((cb) => {
    const tot = comboTotals(p, s, cb, w);
    const pf = solvePressure(s, tot.N, tot.Mx, tot.My);
    const qadm = cb.transitoria ? p.geo.qadmTrans ?? p.geo.qadm : p.geo.qadmPerm ?? p.geo.qadm;
    const qComparada = p.geo.qadmTipo === 'neta' ? pf.qmax - sigmaV0 : pf.qmax;
    return { tot, pf, qadm, qComparada, sigmaV0 };
  });

  const govS = service.length ? service.reduce((a, b) => (b.tot.Ncol > a.tot.Ncol ? b : a)) : null;
  const qadmP = p.geo.qadmPerm ?? p.geo.qadm;
  const predim = govS
    ? {
        N: govS.tot.Ncol, combo: govS.tot.combo.nombre, factor: n.pesoPropioPreliminar, qadm: qadmP,
        Areq: (n.pesoPropioPreliminar * govS.tot.Ncol) / qadmP, qEst: (n.pesoPropioPreliminar * govS.tot.Ncol) / s.A,
      }
    : { N: 0, combo: '—', factor: n.pesoPropioPreliminar, qadm: qadmP, Areq: 0, qEst: 0 };

  if (!service.length) {
    mk(ctx, { id: 'geo-sin', grupo: 'geo', titulo: 'Combinaciones de servicio', formula: '—', variables: '', sustitucion: 'No hay combinaciones de servicio activas', demanda: NaN, capacidad: NaN, unidad: '', combo: '—', ref: n.referencias.suelo, estado: 'nc' });
  }

  // Presión máxima
  let worst = service[0];
  for (const r of service) if (r.qComparada / r.qadm > worst.qComparada / worst.qadm) worst = r;
  if (worst) {
    const neta = p.geo.qadmTipo === 'neta';
    mk(ctx, {
      id: 'geo-q', grupo: 'geo', titulo: 'Presión máxima de contacto',
      formula: neta ? 'q_max − σ\'v0 ≤ q_adm,neta' : 'q_max ≤ q_adm,bruta',
      variables: 'q_max: presión máxima en la base; σ\'v0: tensión efectiva vertical a cota de fundación',
      sustitucion: neta
        ? `${kp(worst.pf.qmax)} − ${kp(sigmaV0)} = ${kp(worst.qComparada)} kPa ≤ ${kp(worst.qadm)} kPa`
        : `${kp(worst.pf.qmax)} kPa ≤ ${kp(worst.qadm)} kPa`,
      demanda: worst.qComparada, capacidad: worst.qadm, unidad: 'MPa', combo: worst.tot.combo.nombre, ref: n.referencias.suelo,
    });
    // Contacto
    let wc = service[0];
    for (const r of service) if (r.pf.areaComprimida < wc.pf.areaComprimida) wc = r;
    const perdida = (1 - wc.pf.areaComprimida) * 100;
    const perm = p.crit.permitirPerdidaContacto ? p.geo.perdidaMax : 0;
    mk(ctx, {
      id: 'geo-contacto', grupo: 'geo', titulo: 'Pérdida de contacto',
      formula: '(1 − A_comp/A)·100 ≤ % admisible', variables: 'A_comp: área comprimida (cálculo iterativo si q_min < 0)',
      sustitucion: `${fmt(perdida, 1)} % ≤ ${fmt(perm, 1)} %`,
      demanda: perdida, capacidad: perm, unidad: '%', combo: wc.tot.combo.nombre, ref: n.referencias.suelo,
      estado: !wc.pf.dentroDeBase ? 'fail' : perdida <= perm + 1e-6 ? 'ok' : 'fail',
      nota: !wc.pf.dentroDeBase ? 'La resultante cae fuera de la base: no hay equilibrio posible.' : !wc.pf.convergio ? 'El cálculo iterativo no convergió.' : undefined,
    });
    const fueraNucleo = service.filter((r) => !r.pf.enNucleo);
    mk(ctx, {
      id: 'geo-nucleo', grupo: 'geo', titulo: 'Resultante dentro del núcleo central',
      formula: '|ex|/kx + |ey|/ky ≤ 1', variables: 'kx = Iy/(A·x_max); ky = Ix/(A·B/2)',
      sustitucion: fueraNucleo.length ? `Fuera del núcleo en: ${fueraNucleo.map((r) => r.tot.combo.nombre).join(', ')}` : 'Todas las combinaciones dentro del núcleo',
      demanda: fueraNucleo.length, capacidad: 0, unidad: '', combo: fueraNucleo[0]?.tot.combo.nombre ?? '—', ref: n.referencias.suelo,
      estado: fueraNucleo.length ? (p.crit.permitirPerdidaContacto ? 'warn' : 'fail') : 'ok',
    });
    // Levantamiento
    const minN = service.reduce((a, b) => (b.tot.N < a.tot.N ? b : a));
    mk(ctx, {
      id: 'geo-lev', grupo: 'geo', titulo: 'Levantamiento', formula: 'N_total > 0',
      variables: 'N_total = ΣN + Wz + Ws + Wp − U', sustitucion: `${k(minN.tot.N)} kN > 0`,
      demanda: 0, capacidad: minN.tot.N, unidad: 'N', combo: minN.tot.combo.nombre, ref: n.referencias.suelo,
      estado: minN.tot.N > 0 ? 'ok' : 'fail',
    });
    // Deslizamiento
    const desl = (dir: 'x' | 'y' | 'xy') => {
      let gov: { fs: number; r: ServiceRes; H: number; R: number } | null = null;
      for (const r of service) {
        const H = dir === 'x' ? Math.abs(r.tot.Hx) : dir === 'y' ? Math.abs(r.tot.Hy) : Math.hypot(r.tot.Hx, r.tot.Hy);
        const R = p.geo.mu * Math.max(0, r.tot.N) + p.geo.adhesion * s.A * r.pf.areaComprimida;
        const fs = H > 0 ? R / H : Infinity;
        if (!gov || fs < gov.fs) gov = { fs, r, H, R };
      }
      if (!gov) return;
      mk(ctx, {
        id: `geo-desl-${dir}`, grupo: 'geo', titulo: `Deslizamiento ${dir === 'xy' ? 'combinado' : 'en ' + dir.toUpperCase()}`,
        formula: 'FS = (μ·N + ca·A_comp)/H ≥ FS_req', variables: 'μ: fricción suelo-hormigón; ca: adhesión; H: horizontal',
        sustitucion: Number.isFinite(gov.fs) ? `FS = ${k(gov.R)}/${k(gov.H)} = ${fmt(gov.fs)} ≥ ${fmt(p.geo.fsDesl)}` : 'H = 0 → no hay acción deslizante',
        demanda: p.geo.fsDesl, capacidad: gov.fs, unidad: '', combo: gov.r.tot.combo.nombre, ref: n.referencias.suelo,
      });
    };
    desl('x'); desl('y'); desl('xy');
    // Vuelco
    const vuelco = (eje: 'x' | 'y') => {
      let gov: { fs: number; r: ServiceRes; Me: number; Mv: number; borde: string } | null = null;
      const Bmin = Math.min(s.B1, s.B2);
      for (const r of service) {
        const cb = r.tot.combo;
        const lados = eje === 'x' ? ['izq', 'der'] : ['inf', 'sup'];
        for (const lado of lados) {
          let Me = 0, Mv = 0;
          const Wt = w.Wz + w.Ws + w.Wp - w.U;
          for (const c of p.columns) {
            const l = cb.cargas[c.id];
            if (!l) continue;
            const { x, y } = localXY(p, c);
            const z = armZ(p, c);
            if (eje === 'x') {
              const arm = lado === 'der' ? s.L - x : x;
              const mv = (l.My + z * l.Vx) * (lado === 'der' ? 1 : -1);
              Me += l.N * arm; Mv += mv;
            } else {
              const arm = lado === 'sup' ? Bmin / 2 - y : Bmin / 2 + y;
              const mv = (-l.Mx + z * l.Vy) * (lado === 'sup' ? 1 : -1);
              Me += l.N * arm; Mv += mv;
            }
          }
          Me += Wt * (eje === 'x' ? (lado === 'der' ? s.L - s.xc : s.xc) : Bmin / 2);
          const fs = Mv > 0 ? Me / Mv : Infinity;
          if (!gov || fs < gov.fs) gov = { fs, r, Me, Mv, borde: lado };
        }
      }
      if (!gov) return;
      mk(ctx, {
        id: `geo-vuelco-${eje}`, grupo: 'geo', titulo: `Vuelco alrededor del borde ${gov.borde} (${eje === 'x' ? 'eje Y' : 'eje X'})`,
        formula: 'FS = M_estabilizante / M_volcador ≥ FS_req', variables: 'Momentos respecto del borde de la base',
        sustitucion: Number.isFinite(gov.fs) ? `FS = ${km(gov.Me)}/${km(gov.Mv)} = ${fmt(gov.fs)} ≥ ${fmt(p.geo.fsVuelco)}` : 'No existe momento volcador',
        demanda: p.geo.fsVuelco, capacidad: gov.fs, unidad: '', combo: gov.r.tot.combo.nombre, ref: n.referencias.suelo,
      });
    };
    vuelco('x'); vuelco('y');
    // Flotación
    if (w.U > 0) {
      const minCol = service.reduce((a, b) => (b.tot.Ncol < a.tot.Ncol ? b : a));
      const est = w.Wz + w.Ws + w.Wp + Math.max(0, minCol.tot.Ncol);
      mk(ctx, {
        id: 'geo-flot', grupo: 'geo', titulo: 'Flotación', formula: 'FS = (W + N_min)/U ≥ FS_flot',
        variables: 'U = γw·hw·A (subpresión)', sustitucion: `FS = ${k(est)}/${k(w.U)} = ${fmt(est / w.U)} ≥ ${fmt(n.fsFlotacion)}`,
        demanda: n.fsFlotacion, capacidad: est / w.U, unidad: '', combo: minCol.tot.combo.nombre, ref: n.referencias.suelo,
      });
    } else {
      mk(ctx, { id: 'geo-flot', grupo: 'geo', titulo: 'Flotación', formula: 'U = γw·hw·A', variables: '', sustitucion: 'Nivel freático por debajo de la base (o no informado): no aplica', demanda: 0, capacidad: 1, unidad: '', combo: '—', ref: n.referencias.suelo, estado: p.geo.nf === null ? 'warn' : 'ok', nota: p.geo.nf === null ? 'Nivel freático no informado.' : undefined });
    }
    // Capacidad portante última
    if (p.geo.qult) {
      const fs = p.geo.qult / worst.pf.qmax;
      mk(ctx, { id: 'geo-qult', grupo: 'geo', titulo: 'Capacidad portante última', formula: 'FS = q_ult/q_max ≥ FS', variables: 'q_ult del estudio de suelos', sustitucion: `FS = ${kp(p.geo.qult)}/${kp(worst.pf.qmax)} = ${fmt(fs)} ≥ ${fmt(n.fsPortante)}`, demanda: n.fsPortante, capacidad: fs, unidad: '', combo: worst.tot.combo.nombre, ref: n.referencias.suelo });
    } else {
      mk(ctx, { id: 'geo-qult', grupo: 'geo', titulo: 'Capacidad portante última', formula: '—', variables: '', sustitucion: 'q_ult no informada: se verifica solo con q_adm del estudio. c y φ no se utilizan (no se implementa fórmula de capacidad portante).', demanda: NaN, capacidad: NaN, unidad: '', combo: '—', ref: n.referencias.suelo, estado: 'nc' });
    }
    // Asentamientos
    const g = p.geo;
    if (g.Es && g.nu !== null && g.sAdm) {
      const gp = service.find((r) => !r.tot.combo.transitoria) ?? service[0];
      const qn = Math.max(0, gp.pf.qmed - sigmaV0);
      const Bm = s.A / s.L;
      const mR = s.L / Bm;
      const I1 = (1 / Math.PI) * (mR * Math.log((1 + Math.sqrt(mR * mR + 1)) / mR) + Math.log(mR + Math.sqrt(mR * mR + 1)));
      const sc = (2 * qn * Bm * (1 - g.nu ** 2) * I1) / g.Es;
      mk(ctx, { id: 'geo-asent', grupo: 'geo', titulo: 'Asentamiento total (elástico, centro, flexible)', formula: 's = 2·q_n·B·(1−ν²)·I₁/Es', variables: 'Semiespacio elástico homogéneo; I₁ de Steinbrenner (prof. infinita), m = L/B', sustitucion: `s = 2·${kp(qn)}·${mt(Bm)}·(1−${fmt(g.nu)}²)·${fmt(I1, 3)}/${fmt(g.Es)} MPa = ${fmt(sc, 1)} mm ≤ ${fmt(g.sAdm, 1)} mm`, demanda: sc, capacidad: g.sAdm, unidad: 'mm', combo: gp.tot.combo.nombre, ref: n.referencias.suelo, nota: 'Modelo elástico simplificado; no reemplaza el análisis de consolidación del estudio de suelos.' });
    } else {
      mk(ctx, { id: 'geo-asent', grupo: 'geo', titulo: 'Asentamiento total', formula: '—', variables: '', sustitucion: 'Faltan Es, ν o asentamiento admisible: no calculado', demanda: NaN, capacidad: NaN, unidad: '', combo: '—', ref: n.referencias.suelo, estado: 'nc' });
    }
    mk(ctx, { id: 'geo-asent-dif', grupo: 'geo', titulo: 'Asentamiento diferencial', formula: '—', variables: '', sustitucion: 'Modelo no implementado: requiere análisis de interacción suelo-estructura', demanda: NaN, capacidad: NaN, unidad: '', combo: '—', ref: n.referencias.suelo, estado: 'nc' });
  }

  // Modo rápido para el dimensionamiento: solo verificaciones geotécnicas (resultado parcial)
  if (opts.geoOnly) return { checks: ctx.checks, issues, shape: s } as unknown as Results;

  // ---------------- Últimas: presión neta estructural y viga invertida ----------------
  const pointLoads = (cb: Combo): PointLoad[] =>
    p.columns.map((c) => {
      const l = cb.cargas[c.id] ?? { N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 };
      const { x } = localXY(p, c);
      return { id: c.id, x, P: l.N, C: l.My + armZ(p, c) * l.Vx, ancho: faceRect(p, c).bx };
    });
  const ult: UltRes[] = activeCombos(p, 'ultima').map((cb) => {
    const tot = comboTotals(p, s, cb, null);
    const pf = solvePressure(s, tot.N, tot.Mx, tot.My);
    const beam = beamAnalysis(s, pf, pointLoads(cb), p.crit.nPuntos);
    return { tot, pf, beam };
  });

  // Validez del modelo
  const ys = p.columns.map((c) => localXY(p, c).y);
  if (Math.max(...ys.map(Math.abs)) > 0.15 * Math.min(s.B1, s.B2))
    advertenciasModelo.push('Columnas desalineadas respecto del eje longitudinal (> 15 % del ancho): el método de viga invertida pierde validez. Se recomienda un modelo de losa sobre apoyos elásticos o elementos finitos.');
  if (s.L / Math.min(s.B1, s.B2) < 1.5)
    advertenciasModelo.push('Relación L/B < 1,5: el comportamiento es de placa bidireccional. Se recomienda un modelo de losa sobre apoyos elásticos o elementos finitos.');
  if (ult.some((u) => !u.pf.contactoTotal))
    advertenciasModelo.push('Presión neta mayorada con pérdida parcial de contacto: la carga lineal se obtiene por integración numérica del área comprimida.');
  if (ult.some((u) => u.tot.Mx !== 0 && Math.abs(u.pf.b) * s.Bmax / 2 > 0.25 * u.pf.q0))
    advertenciasModelo.push('Momento transversal significativo: la flexión transversal se verifica con q máxima, hipótesis conservadora.');
  if (p.columns.some((c) => c.angulo % 90 !== 0))
    advertenciasModelo.push('Columnas giradas: el cálculo usa las dimensiones sin rotar (bx, by) alineadas con los ejes globales.');

  // Envolvente
  const ref = ult[0]?.beam.pts ?? [];
  const xs = ref.map((q) => q.x);
  const pos = xs.map(() => 0), neg = xs.map(() => 0);
  let Mpos: Peak = { M: 0, x: 0, combo: '—' }, Mneg: Peak = { M: 0, x: 0, combo: '—' };
  let Vgov = { V: 0, x: 0, combo: '—' };
  for (const u of ult) {
    u.beam.pts.forEach((q, i) => {
      if (i < pos.length) { pos[i] = Math.max(pos[i], q.M); neg[i] = Math.min(neg[i], q.M); }
    });
    if (u.beam.Mpos.M > Mpos.M) Mpos = { ...u.beam.Mpos, combo: u.tot.combo.nombre };
    if (u.beam.Mneg.M < Mneg.M) Mneg = { ...u.beam.Mneg, combo: u.tot.combo.nombre };
  }

  // ---------------- Alturas útiles (iteración con diámetros adoptados) ----------------
  const diams = [...p.mat.diametros].sort((a, b) => a - b);
  const sLibre = Math.max(n.sMinAbs, n.sMinFactorAgregado * p.mat.agregado);
  const sMax = Math.min(n.sMaxFactorH * f.h, n.sMaxAbs, p.mat.sMax);
  const sMaxT = Math.min(n.sMaxTemp.factorH * f.h, n.sMaxTemp.abs);
  let db = { LI: 16, TI: 12, LS: 16, TS: 12 };
  const extLong = p.crit.capaInferiorExterna === 'long';
  const dOf = () => ({
    LI: f.h - f.recInf - (extLong ? db.LI / 2 : db.TI + db.LI / 2),
    TI: f.h - f.recInf - (extLong ? db.LI + db.TI / 2 : db.TI / 2),
    LS: f.h - f.recSup - (extLong ? db.LS / 2 : db.TS + db.LS / 2),
    TS: f.h - f.recSup - (extLong ? db.LS + db.TS / 2 : db.TS / 2),
  });
  let dd = dOf();
  let long!: { inf: LongFace; sup: LongFace };
  let trans!: { inf: TransFace; sup: TransFace };

  const designLong = (cara: 'inf' | 'sup', dAct: number): LongFace => {
    const pk = cara === 'inf' ? Mpos : { ...Mneg, M: -Mneg.M };
    const b = widthAt(s, Math.min(Math.max(pk.x, 0), s.L));
    const bMin = Math.min(s.B1, s.B2);
    const r = asRequired(pk.M, b, dAct, fc, fy, n.phiFlexion);
    const AsMinT = pk.M > 0 ? n.rhoMinFlexion * b * f.h : 0;
    const AsObj = Math.max(r.As || 0, AsMinT);
    const AsCont = (cara === 'inf' ? n.rhoMinFlexion : n.rhoMinCaraComprimida) * bMin * f.h;
    const man = p.crit.manual[cara === 'inf' ? 'longInf' : 'longSup'];
    let total: BarSet | null;
    if (man) {
      const nB = Math.floor((bMin - 2 * f.recLat - man.db) / man.s) + 1;
      total = { db: man.db, n: nB, s: man.s, As: nB * barArea(man.db), libre: man.s - man.db };
    } else total = selectBars(Math.max(AsObj, AsCont), bMin, f.recLat, diams, sLibre, sMax, p.mat.sMin);
    const res: LongFace = {
      cara, Mu: pk.M, x: pk.x, combo: pk.combo, b, d: dAct, AsReq: r.As, AsMin: AsMinT, AsObj, okSeccion: r.ok,
      total, nCont: 0, AsCont: 0, phiMnCont: 0, phiMnTot: 0, refuerzos: [], eps: Infinity, manual: !!man,
    };
    if (!total) return res;
    const Ab = barArea(total.db);
    const ancho = bMin - 2 * f.recLat - total.db;
    let nC = man ? total.n : Math.max(2, Math.ceil(AsCont / Ab - 1e-9), Math.ceil(ancho / sMaxT) + 1);
    nC = Math.min(nC, total.n);
    // si la diferencia es mínima, se corren todas las barras
    if (total.n - nC <= 1) nC = total.n;
    res.nCont = nC;
    res.AsCont = nC * Ab;
    res.phiMnCont = phiMn(res.AsCont, b, dAct, fc, fy, n.phiFlexion).phiMn;
    res.phiMnTot = phiMn(total.As, b, dAct, fc, fy, n.phiFlexion).phiMn;
    res.eps = epsT(total.As, b, dAct, fc, fy, n).eps;
    const nRef = total.n - nC;
    if (nRef > 0) {
      const ext = Math.max(dAct, 12 * total.db);
      const ldv = ld(total.db, fc, fy, n, cara === 'sup');
      const sign = cara === 'inf' ? 1 : -1;
      const need = (i: number) => sign * (cara === 'inf' ? pos[i] : neg[i]) > res.phiMnCont * (1 - 1e-9);
      let i = 0;
      while (i < xs.length) {
        if (!need(i)) { i++; continue; }
        let j = i;
        let pkx = xs[i], pkm = 0;
        while (j < xs.length && need(j)) {
          const mv = Math.abs(cara === 'inf' ? pos[j] : neg[j]);
          if (mv > pkm) { pkm = mv; pkx = xs[j]; }
          j++;
        }
        let x1 = Math.min(xs[i] - ext, pkx - ldv);
        let x2 = Math.max(xs[j - 1] + ext, pkx + ldv);
        const gI = x1 <= f.recLat, gD = x2 >= s.L - f.recLat;
        x1 = Math.max(f.recLat, x1);
        x2 = Math.min(s.L - f.recLat, x2);
        res.refuerzos.push({ x1, x2, ganchoIzq: gI, ganchoDer: gD, n: nRef });
        i = j;
      }
    }
    return res;
  };

  const designTrans = (cara: 'inf' | 'sup', dAct: number): TransFace => {
    // Distribuida: q_u,máx·c²/2 por unidad de ancho. Bandas: viga transversal de ancho b_col + d con Pu/B.
    let gov = { MuM: 0, VuM: 0, col: '—', combo: '—', c: 0, bf: 0, metodo: 'q_u,máx·c²/2 por metro' };
    const bandas: TransFace['bandas'] = [];
    if (cara === 'inf') {
      for (const c of p.columns) {
        const fr = faceRect(p, c);
        const xc = (fr.x1 + fr.x2) / 2;
        const B = widthAt(s, Math.min(Math.max(xc, 0), s.L));
        const cv = Math.max(B / 2 - fr.y2, fr.y1 + B / 2);
        const bx1 = Math.max(0, fr.x1 - dAct / 2), bx2 = Math.min(s.L, fr.x2 + dAct / 2);
        const bf = bx2 - bx1;
        let band = { Mu: 0, Vu: 0, combo: '—' };
        for (const u of ult) {
          const qmax = u.pf.contactoTotal ? Math.max(...u.pf.esquinas.map((e) => e.q)) : u.pf.qmax;
          const Pu = u.tot.combo.cargas[c.id]?.N ?? 0;
          const m1 = (qmax * cv * cv) / 2;
          const v1 = qmax * Math.max(0, cv - dAct);
          if (m1 > gov.MuM) gov = { ...gov, MuM: m1, VuM: Math.max(gov.VuM, v1), col: c.nombre, combo: u.tot.combo.nombre, c: cv, bf };
          gov.VuM = Math.max(gov.VuM, v1);
          const Mb = ((Pu / B) * cv * cv) / 2;
          const Vb = (Pu / B) * Math.max(0, cv - dAct);
          if (Mb > band.Mu) band = { Mu: Mb, Vu: Vb, combo: u.tot.combo.nombre };
        }
        bandas.push({ col: c.nombre, colId: c.id, x1: bx1, x2: bx2, bf, c: cv, Mu: band.Mu, Vu: band.Vu, combo: band.combo, AsReq: 0, AsProv: 0, nAdd: 0, ok: true, phiMn: 0 });
      }
    }
    const man = p.crit.manual[cara === 'inf' ? 'transInf' : 'transSup'];
    const r = asRequired(gov.MuM * 1000, 1000, dAct, fc, fy, n.phiFlexion);
    const AsReqM = (r.As || 0);
    const AsMinM = (cara === 'inf' ? n.rhoMinFlexion : n.rhoMinCaraComprimida) * 1000 * f.h;
    const sel = man
      ? { db: man.db, n: 0, s: man.s, As: (barArea(man.db) * 1000) / man.s, libre: man.s - man.db }
      : selectBarsPerM(Math.max(AsReqM, AsMinM), diams, sLibre, cara === 'inf' ? sMax : sMaxT, p.mat.sMin);
    if (sel) for (const b of bandas) {
      const rb = asRequired(b.Mu, b.bf, dAct, fc, fy, n.phiFlexion);
      b.AsReq = rb.As;
      b.AsProv = (sel.As * b.bf) / 1000;
      b.ok = rb.ok;
      b.nAdd = rb.ok && rb.As > b.AsProv ? Math.ceil((rb.As - b.AsProv) / barArea(sel.db)) : 0;
      b.phiMn = phiMn(b.AsProv + b.nAdd * barArea(sel.db), b.bf, dAct, fc, fy, n.phiFlexion).phiMn;
    }
    return {
      cara, ...gov, d: dAct, AsReqM, AsMinM, sel, bandas,
      phiMnM: sel ? phiMn(sel.As, 1000, dAct, fc, fy, n.phiFlexion).phiMn / 1000 : 0,
      eps: sel ? epsT(sel.As, 1000, dAct, fc, fy, n).eps : Infinity, manual: !!man,
    };
  };

  for (let it = 0; it < 3; it++) {
    dd = dOf();
    long = { inf: designLong('inf', dd.LI), sup: designLong('sup', dd.LS) };
    trans = { inf: designTrans('inf', dd.TI), sup: designTrans('sup', dd.TS) };
    const nd = {
      LI: long.inf.total?.db ?? db.LI, LS: long.sup.total?.db ?? db.LS,
      TI: trans.inf.sel?.db ?? db.TI, TS: trans.sup.sel?.db ?? db.TS,
    };
    if (nd.LI === db.LI && nd.LS === db.LS && nd.TI === db.TI && nd.TS === db.TS) break;
    db = nd;
  }
  dd = dOf();
  const dPunz = (dd.LI + dd.TI) / 2;
  const dCorte = Math.min(dd.LI, dd.LS);

  // ---------------- Verificaciones estructurales ----------------
  const flexCheck = (L: LongFace, titulo: string) => {
    if (!ult.length) return;
    if (!L.okSeccion) {
      mk(ctx, { id: `est-flex-${L.cara}`, grupo: 'est', titulo, formula: 'φMn ≥ Mu', variables: '', sustitucion: `Mu = ${km(L.Mu)} kNm excede la capacidad de la sección (discriminante < 0): aumentar h`, demanda: L.Mu, capacidad: 0, unidad: 'N·mm', combo: L.combo, ref: n.referencias.flexion, estado: 'fail' });
      return;
    }
    mk(ctx, {
      id: `est-flex-${L.cara}`, grupo: 'est', titulo,
      formula: 'As = 0,85·f\'c·b·d/fy·[1 − √(1 − 2·Mu/(φ·0,85·f\'c·b·d²))]; φMn = φ·As·fy·(d − a/2) ≥ Mu',
      variables: `b = ${mt(L.b)} m; d = ${fmt(L.d, 0)} mm; x = ${mt(L.x)} m`,
      sustitucion: L.total
        ? `As,req = ${fmt(L.AsReq, 0)} mm²; As,min = ${fmt(L.AsMin, 0)} mm²; adoptado ${L.total.n}Ø${L.total.db} (${fmt(L.total.As, 0)} mm²) → φMn = ${km(L.phiMnTot)} kNm ≥ Mu = ${km(L.Mu)} kNm`
        : 'No se encontró una disposición de barras que quepa con las separaciones exigidas',
      demanda: L.Mu, capacidad: L.total ? L.phiMnTot : 0, unidad: 'N·mm', combo: L.combo, ref: n.referencias.flexion,
      estado: !L.total ? 'fail' : undefined,
    });
    if (L.total) {
      mk(ctx, { id: `est-rhomin-${L.cara}`, grupo: 'est', titulo: `Cuantía mínima longitudinal ${L.cara === 'inf' ? 'inferior' : 'superior'}`, formula: 'As ≥ ρmin·b·h', variables: `ρmin = ${n.rhoMinFlexion}`, sustitucion: `${fmt(L.total.As, 0)} ≥ ${fmt(L.AsMin, 0)} mm²`, demanda: L.AsMin, capacidad: L.total.As, unidad: 'mm²', combo: L.combo, ref: n.referencias.rhoMin });
      mk(ctx, { id: `est-rhomax-${L.cara}`, grupo: 'est', titulo: `Cuantía máxima (εt) longitudinal ${L.cara === 'inf' ? 'inferior' : 'superior'}`, formula: 'εt = 0,003·(d − c)/c ≥ 0,005', variables: 'c = a/β1', sustitucion: `εt = ${fmt(L.eps, 4)} ≥ ${n.epsTMin}`, demanda: n.epsTMin, capacidad: L.eps, unidad: '', combo: L.combo, ref: n.referencias.epsT });
      const sReal = L.total.s;
      mk(ctx, { id: `est-sep-${L.cara}`, grupo: 'est', titulo: `Separación barras longitudinales ${L.cara === 'inf' ? 'inferiores' : 'superiores'}`, formula: 's_libre ≥ máx(25 mm; db; 4/3·Tmáx); s ≤ mín(3h; 300 mm)', variables: '', sustitucion: `s = ${fmt(sReal, 0)} mm; libre = ${fmt(L.total.libre, 0)} ≥ ${fmt(sLibre, 0)} mm; s ≤ ${fmt(sMax, 0)} mm`, demanda: Math.max(sLibre / L.total.libre, sReal / sMax), capacidad: 1, unidad: '', combo: '—', ref: n.referencias.sMax });
    }
  };
  flexCheck(long.inf, 'Flexión longitudinal positiva (armadura inferior)');
  flexCheck(long.sup, 'Flexión longitudinal negativa (armadura superior)');

  if (ult.length) {
    const T = trans.inf;
    mk(ctx, {
      id: 'est-flex-trans', grupo: 'est', titulo: 'Flexión transversal (franjas ortogonales)',
      formula: 'Mu/m = q·c²/2 ; φMn/m ≥ Mu/m', variables: `c = ${mt(T.c)} m (vuelo desde cara de ${T.col}); método: ${T.metodo}; d = ${fmt(T.d, 0)} mm`,
      sustitucion: T.sel ? `Mu = ${km(T.MuM * 1000)} kNm/m; As,req = ${fmt(T.AsReqM, 0)} mm²/m; As,min = ${fmt(T.AsMinM, 0)} mm²/m; Ø${T.sel.db} c/${fmt(T.sel.s, 0)} mm (${fmt(T.sel.As, 0)} mm²/m) → φMn = ${km(T.phiMnM * 1000)} kNm/m` : 'Sin disposición válida',
      demanda: T.MuM, capacidad: T.sel ? T.phiMnM : 0, unidad: 'N·mm/mm', combo: T.combo, ref: n.referencias.zapatas,
    });
    for (const b of T.bandas) {
      if (!T.sel) break;
      mk(ctx, {
        id: `est-banda-${b.colId}`, grupo: 'est', titulo: `Flexión transversal en banda bajo ${b.col}`,
        formula: 'Mu = (Pu/B)·c²/2 sobre banda b = b_col + d ; φMn ≥ Mu', variables: `b = ${mt(b.bf)} m; c = ${mt(b.c)} m`,
        sustitucion: b.ok ? `Mu = ${km(b.Mu)} kNm; As,req = ${fmt(b.AsReq, 0)} mm²; As distribuida en banda = ${fmt(b.AsProv, 0)} mm²${b.nAdd ? ` + ${b.nAdd}Ø${T.sel.db} adicionales` : ''} → φMn = ${km(b.phiMn)} kNm` : 'La sección de la banda no alcanza: aumentar h',
        demanda: b.Mu, capacidad: b.ok ? b.phiMn : 0, unidad: 'N·mm', combo: b.combo, ref: n.referencias.zapatas,
      });
    }
    if (T.sel) mk(ctx, { id: 'est-rhomin-trans', grupo: 'est', titulo: 'Cuantía mínima transversal inferior', formula: 'As/m ≥ ρmin·1000·h', variables: '', sustitucion: `${fmt(T.sel.As, 0)} ≥ ${fmt(T.AsMinM, 0)} mm²/m`, demanda: T.AsMinM, capacidad: T.sel.As, unidad: 'mm²/m', combo: '—', ref: n.referencias.rhoMin });
    const TS = trans.sup;
    mk(ctx, { id: 'est-trans-sup', grupo: 'est', titulo: 'Armadura transversal superior (mínima constructiva)', formula: 'As/m ≥ ρ·1000·h', variables: `ρ = ${n.rhoMinCaraComprimida} (hipótesis cara comprimida)`, sustitucion: TS.sel ? `Ø${TS.sel.db} c/${fmt(TS.sel.s, 0)} → ${fmt(TS.sel.As, 0)} ≥ ${fmt(TS.AsMinM, 0)} mm²/m` : 'Sin disposición válida', demanda: TS.AsMinM, capacidad: TS.sel?.As ?? 0, unidad: 'mm²/m', combo: '—', ref: n.referencias.rhoMin });
    // Corte unidireccional longitudinal
    let gv = { Vu: 0, x: 0, combo: '—' };
    for (const u of ult) for (const c of p.columns) {
      const fr = faceRect(p, c);
      for (const x of [fr.x1 - dCorte, fr.x2 + dCorte]) {
        if (x <= 0 || x >= s.L) continue;
        const V = Math.abs(interp(u.beam, x, 'V'));
        if (V > gv.Vu) gv = { Vu: V, x, combo: u.tot.combo.nombre };
      }
    }
    Vgov = { V: gv.Vu, x: gv.x, combo: gv.combo };
    const bV = widthAt(s, Math.min(Math.max(gv.x, 0), s.L));
    const phiVc = n.phiCorte * n.vcCoef * n.lambda * Math.sqrt(fc) * bV * dCorte;
    mk(ctx, { id: 'est-corte-long', grupo: 'est', titulo: 'Corte unidireccional longitudinal', formula: 'φVc = φ·(1/6)·λ·√f\'c·b·d ≥ Vu (a d de la cara)', variables: `b = ${mt(bV)} m; d = ${fmt(dCorte, 0)} mm; x = ${mt(gv.x)} m`, sustitucion: `φVc = ${n.phiCorte}·(1/6)·√${fc}·${fmt(bV, 0)}·${fmt(dCorte, 0)} = ${k(phiVc)} kN ≥ Vu = ${k(gv.Vu)} kN`, demanda: gv.Vu, capacidad: phiVc, unidad: 'N', combo: gv.combo, ref: n.referencias.corte });
    const phiVcT = n.phiCorte * n.vcCoef * n.lambda * Math.sqrt(fc) * dd.TI;
    const VbM = Math.max(0, ...T.bandas.map((b) => b.Vu / b.bf));
    const VuT = Math.max(T.VuM, VbM);
    mk(ctx, { id: 'est-corte-trans', grupo: 'est', titulo: 'Corte unidireccional transversal', formula: 'φVc/m = φ·(1/6)·λ·√f\'c·1000·d ≥ Vu/m (máx. entre q_u,máx y bandas Pu/B)', variables: `c − d = ${mt(Math.max(0, T.c - dd.TI))} m; d = ${fmt(dd.TI, 0)} mm`, sustitucion: `φVc = ${k(phiVcT * 1000)} kN/m ≥ Vu = ${k(VuT * 1000)} kN/m`, demanda: VuT, capacidad: phiVcT, unidad: 'N/mm', combo: T.combo, ref: n.referencias.corte });
  }

  // Punzonamiento
  const punz: PunchRes[] = [];
  const bAt = (x: number) => widthAt(s, Math.min(Math.max(x, 0), s.L));
  for (const c of p.columns) {
    const fr = faceRect(p, c);
    const xc = (fr.x1 + fr.x2) / 2;
    const B = bAt(xc);
    const cp = criticalPerimeter(fr, dPunz, s.L, -B / 2, B / 2);
    const beta = Math.max(fr.bx, fr.by) / Math.min(fr.bx, fr.by);
    let gov: PunchRes | null = null;
    for (const u of ult) {
      const l = u.tot.combo.cargas[c.id];
      if (!l) continue;
      const xm = (cp.rect.x1 + cp.rect.x2) / 2 - s.xc, ym = (cp.rect.y1 + cp.rect.y2) / 2;
      const qu = qAt(u.pf, xm, ym);
      const Vu = Math.max(0, l.N - qu * cp.area);
      const ex = xc - cp.xg, ey = (fr.y1 + fr.y2) / 2 - cp.yg;
      const Mux = l.Mx - zSobreZapata(c) * l.Vy - Vu * ey;
      const Muy = l.My + zSobreZapata(c) * l.Vx + Vu * ex;
      const chk = punchingCheck({ Vu, Mux, Muy, cp, d: dPunz, beta, fc }, n);
      const r = { col: c.nombre, combo: u.tot.combo.nombre, cp, Pu: l.N, qu, Vu, Mux, Muy, d: dPunz, chk, beta };
      if (!gov || chk.ratio > gov.chk.ratio) gov = r;
    }
    if (!gov) continue;
    punz.push(gov);
    const tipoForzado = c.condicion !== 'auto' && c.condicion !== cp.tipo;
    mk(ctx, {
      id: `est-punz-${c.id}`, grupo: 'est', titulo: `Punzonamiento ${c.nombre} (${cp.tipo})`,
      formula: 'vu = Vu/(b0·d) + γv·Mu·c/Jc ≤ φ·vc ; vc = mín[(1+2/β)/6; (αs·d/b0+2)/12; 1/3]·λ√f\'c',
      variables: `b0 = ${fmt(cp.b0, 0)} mm; d = ${fmt(dPunz, 0)} mm; β = ${fmt(beta)}; αs = ${gov.chk.alpha}; lados = ${cp.lados}`,
      sustitucion: `Vu = ${k(gov.Pu)} − ${kp(gov.qu)}·${fmt(cp.area / 1e6, 3)} = ${k(gov.Vu)} kN; vu = ${fmt(gov.chk.vu, 3)} MPa ≤ φvc = ${fmt(gov.chk.phivc, 3)} MPa`,
      demanda: gov.chk.vu, capacidad: gov.chk.phivc, unidad: 'MPa', combo: gov.combo, ref: n.referencias.punz,
      estado: cp.tipo === 'franja' ? 'warn' : undefined,
      nota: cp.tipo === 'franja' ? 'El perímetro crítico ocupa todo el ancho: gobierna el corte unidireccional.' : tipoForzado ? `Condición declarada "${c.condicion}" difiere de la detectada "${cp.tipo}"; se usa la detectada.` : undefined,
    });
  }
  // Superposición de perímetros
  let punzConjunto: PunchRes | null = null;
  for (let i = 0; i < punz.length; i++) for (let j = i + 1; j < punz.length; j++) {
    if (!overlaps(punz[i].cp.rect, punz[j].cp.rect)) continue;
    issues.push({ nivel: 'warn', msg: `Perímetros críticos de ${punz[i].col} y ${punz[j].col} se superponen: se verifica un perímetro conjunto.` });
    const ci = p.columns.find((c) => c.nombre === punz[i].col)!, cj = p.columns.find((c) => c.nombre === punz[j].col)!;
    const a = faceRect(p, ci), b = faceRect(p, cj);
    const face = { x1: Math.min(a.x1, b.x1), x2: Math.max(a.x2, b.x2), y1: Math.min(a.y1, b.y1), y2: Math.max(a.y2, b.y2) };
    const xm = (face.x1 + face.x2) / 2;
    const cp = criticalPerimeter(face, dPunz, s.L, -bAt(xm) / 2, bAt(xm) / 2);
    for (const u of ult) {
      const Pu = (u.tot.combo.cargas[ci.id]?.N ?? 0) + (u.tot.combo.cargas[cj.id]?.N ?? 0);
      const qu = qAt(u.pf, (cp.rect.x1 + cp.rect.x2) / 2 - s.xc, (cp.rect.y1 + cp.rect.y2) / 2);
      const Vu = Math.max(0, Pu - qu * cp.area);
      const beta = (face.x2 - face.x1) / (face.y2 - face.y1);
      const chk = punchingCheck({ Vu, Mux: 0, Muy: 0, cp, d: dPunz, beta: Math.max(beta, 1 / beta), fc }, n);
      if (!punzConjunto || chk.ratio > punzConjunto.chk.ratio) punzConjunto = { col: `${ci.nombre}+${cj.nombre}`, combo: u.tot.combo.nombre, cp, Pu, qu, Vu, Mux: 0, Muy: 0, d: dPunz, chk, beta };
    }
    if (punzConjunto) mk(ctx, { id: `est-punz-conj-${i}-${j}`, grupo: 'est', titulo: `Punzonamiento conjunto ${punzConjunto.col}`, formula: 'vu = Vu/(b0·d) ≤ φvc', variables: `b0 = ${fmt(punzConjunto.cp.b0, 0)} mm`, sustitucion: `vu = ${fmt(punzConjunto.chk.vu, 3)} ≤ ${fmt(punzConjunto.chk.phivc, 3)} MPa`, demanda: punzConjunto.chk.vu, capacidad: punzConjunto.chk.phivc, unidad: 'MPa', combo: punzConjunto.combo, ref: n.referencias.punz, nota: 'Transferencia de momento no considerada en el perímetro conjunto.' });
  }

  // Aplastamiento, esperas, pedestales y anclajes
  const peds: PedRes[] = [];
  for (const c of p.columns) {
    const fr = faceRect(p, c);
    const cd = c.ped.activo ? { bx: c.ped.bx, by: c.ped.by, area: c.ped.bx * c.ped.by } : colDims(c);
    const xc = (fr.x1 + fr.x2) / 2;
    const B = bAt(xc);
    const sMarg = Math.max(0, Math.min(fr.x1, s.L - fr.x2, fr.y1 + B / 2, B / 2 - fr.y2, 2 * f.h));
    const A1 = cd.area, A2 = (cd.bx + 2 * sMarg) * (cd.by + 2 * sMarg);
    const raiz = Math.min(Math.sqrt(A2 / A1), n.aplastamiento.raizMax);
    const phiBn = n.phiAplastamiento * n.aplastamiento.coef * fc * A1 * raiz;
    const Pu = Math.max(0, ...ult.map((u) => u.tot.combo.cargas[c.id]?.N ?? 0));
    const govU = ult.find((u) => (u.tot.combo.cargas[c.id]?.N ?? 0) === Pu);
    if (ult.length) mk(ctx, { id: `est-aplast-${c.id}`, grupo: 'est', titulo: `Aplastamiento bajo ${c.nombre}${c.ped.activo ? ' (pedestal)' : ''}`, formula: 'φBn = φ·0,85·f\'c·A1·√(A2/A1) ≥ Pu ; √(A2/A1) ≤ 2', variables: `A1 = ${fmt(A1 / 1e6, 4)} m²; A2 = ${fmt(A2 / 1e6, 3)} m²`, sustitucion: `φBn = ${n.phiAplastamiento}·0,85·${fc}·${fmt(A1, 0)}·${fmt(raiz, 2)} = ${k(phiBn)} kN ≥ ${k(Pu)} kN`, demanda: Pu, capacidad: phiBn, unidad: 'N', combo: govU?.tot.combo.nombre ?? '—', ref: n.referencias.aplast, nota: 'Si no verifica, el exceso debe transferirse por las esperas (no calculado automáticamente).' });
    const disp = f.h - f.recInf - (long.inf.total?.db ?? 16) - (trans.inf.sel?.db ?? 12);
    if (c.apoyo === 'hormigon') {
      // Esperas
      const Ag = colDims(c).area;
      const AsEsp = c.nBarras * barArea(c.dbBarras);
      mk(ctx, { id: `est-esp-cuantia-${c.id}`, grupo: 'est', titulo: `Cuantía de esperas ${c.nombre}`, formula: 'As,esperas ≥ 0,005·Ag', variables: `Ag = ${fmt(Ag / 1e6, 4)} m²`, sustitucion: `${c.nBarras}Ø${c.dbBarras} = ${fmt(AsEsp, 0)} ≥ ${fmt(n.esperasCuantiaMin * Ag, 0)} mm²`, demanda: n.esperasCuantiaMin * Ag, capacidad: AsEsp, unidad: 'mm²', combo: '—', ref: n.referencias.esperas });
      const ldcv = ldc(c.dbBarras, fc, fy, n);
      mk(ctx, { id: `est-esp-anc-${c.id}`, grupo: 'est', titulo: `Anclaje de esperas en compresión ${c.nombre}`, formula: 'ldc = máx(0,24·fy/(λ√f\'c)·db; 0,043·fy·db; 200 mm) ≤ disponible', variables: 'disponible = h − rec. inf. − Ø malla inferior (esperas apoyadas sobre la malla)', sustitucion: `ldc = ${fmt(ldcv, 0)} mm ≤ ${fmt(disp, 0)} mm`, demanda: ldcv, capacidad: disp, unidad: 'mm', combo: '—', ref: n.referencias.ldc });
      const Nmin = Math.min(0, ...ult.map((u) => u.tot.combo.cargas[c.id]?.N ?? 0));
      if (Nmin < 0) {
        const ldhv = ldh(c.dbBarras, fc, fy, n);
        const Treq = -Nmin / (n.phiFlexion * fy);
        mk(ctx, { id: `est-esp-trac-${c.id}`, grupo: 'est', titulo: `Arrancamiento de esperas ${c.nombre}`, formula: 'As ≥ Tu/(φ·fy) ; ldh ≤ disponible', variables: '', sustitucion: `As,req = ${fmt(Treq, 0)} ≤ ${fmt(AsEsp, 0)} mm²; ldh = ${fmt(ldhv, 0)} ≤ ${fmt(disp, 0)} mm`, demanda: Math.max(Treq / AsEsp, ldhv / disp), capacidad: 1, unidad: '', combo: '—', ref: n.referencias.ldh });
      } else {
        mk(ctx, { id: `est-esp-trac-${c.id}`, grupo: 'est', titulo: `Arrancamiento de esperas ${c.nombre}`, formula: '—', variables: '', sustitucion: 'Sin tracción axial en combinaciones últimas. Tracción por flexión de columna: verificar con el diseño de la columna.', demanda: 0, capacidad: 1, unidad: '', combo: '—', ref: n.referencias.ldh, estado: Math.max(...ult.map((u) => Math.hypot(u.tot.combo.cargas[c.id]?.Mx ?? 0, u.tot.combo.cargas[c.id]?.My ?? 0))) > 0 ? 'warn' : 'ok' });
      }
    } else {
      mk(ctx, { id: `est-pernos-${c.id}`, grupo: 'est', titulo: `Anclaje de ${c.apoyo === 'metalica' ? 'columna metálica' : 'equipo'} ${c.nombre}`, formula: '—', variables: '', sustitucion: 'Pernos de anclaje y placa base: no calculados. Verificar con el fabricante o el diseño de la estructura metálica (incluye corte y tracción de pernos).', demanda: NaN, capacidad: NaN, unidad: '', combo: '—', ref: n.referencias.zapatas, estado: 'warn' });
    }
    if (c.ped.activo) peds.push(pedestalChecks(ctx, c, ult, disp));
  }
  // Anclaje de armaduras de la zapata
  const anc = (titulo: string, id: string, dbv: number, x: number, sup: boolean, hook: boolean) => {
    const disp = Math.min(x, s.L - x) - f.recLat;
    const req = hook ? ldh(dbv, fc, fy, n) : ld(dbv, fc, fy, n, sup);
    mk(ctx, { id, grupo: 'est', titulo, formula: hook ? 'ldh ≤ longitud disponible (extremo con gancho 90°)' : 'ld ≤ longitud disponible', variables: `Ø${dbv}; sección crítica x = ${mt(x)} m`, sustitucion: `${hook ? 'ldh' : 'ld'} = ${fmt(req, 0)} mm ≤ ${fmt(disp, 0)} mm`, demanda: req, capacidad: disp, unidad: 'mm', combo: '—', ref: hook ? n.referencias.ldh : n.referencias.ld });
  };
  if (long.inf.total && ult.length) anc('Anclaje armadura longitudinal inferior', 'est-anc-li', long.inf.total.db, long.inf.x, false, true);
  if (long.sup.total && ult.length && long.sup.Mu > 0) anc('Anclaje armadura longitudinal superior', 'est-anc-ls', long.sup.total.db, long.sup.x, true, true);
  if (trans.inf.sel && ult.length) {
    const req = ldh(trans.inf.sel.db, fc, fy, n);
    const disp = trans.inf.c - f.recLat;
    mk(ctx, { id: 'est-anc-ti', grupo: 'est', titulo: 'Anclaje armadura transversal inferior', formula: 'ldh ≤ c − rec', variables: `c = ${mt(trans.inf.c)} m`, sustitucion: `ldh = ${fmt(req, 0)} ≤ ${fmt(disp, 0)} mm`, demanda: req, capacidad: disp, unidad: 'mm', combo: '—', ref: n.referencias.ldh });
  }

  // Equilibrio
  for (const u of ult) {
    const e = u.beam.equilibrio;
    const err = Math.abs(e.sumW - e.sumP) / Math.max(1, e.sumP);
    if (err > 0.005 || Math.abs(e.errM) > 0.005 * Math.max(1, Math.abs(Mneg.M), Math.abs(Mpos.M)))
      issues.push({ nivel: 'error', msg: `Falta de equilibrio en ${u.tot.combo.nombre}: Σw = ${k(e.sumW)} kN vs ΣP = ${k(e.sumP)} kN; M(L) = ${km(e.errM)} kNm` });
  }
  if (!ult.length) issues.push({ nivel: 'error', msg: 'No hay combinaciones últimas activas: no se realizan verificaciones estructurales.' });
  // NaN / infinitos
  if ([Mpos.M, Mneg.M, dPunz, s.A].some((v) => !Number.isFinite(v))) issues.push({ nivel: 'error', msg: 'Resultados no numéricos (NaN/∞): revisar datos de entrada.' });

  const schedule = buildSchedule(p, s, { long, trans, dd, peds }, opts.schedule !== false);
  for (const wmsg of schedule.avisos) issues.push({ nivel: 'warn', msg: wmsg });

  // Cantidades
  const Vh = s.A * f.h;
  const Vped = p.columns.reduce((a, c) => a + (c.ped.activo ? c.ped.bx * c.ped.by * c.ped.h : 0), 0);
  const sob = p.crit.sobreancho;
  const Bm = s.A / s.L;
  const Vlimp = (s.L + 200) * (Bm + 200) * f.limpieza;
  const Vexc = (s.L + 2 * sob) * (Bm + 2 * sob) * (f.Df + f.limpieza);
  const acero = schedule.pesoTotal;
  const cantidades = { Vh, Vped, Vlimp, Vexc, acero, kgm3: acero / ((Vh + Vped) / 1e9) };

  // Estado general
  const crit = ctx.checks;
  const maxRatio = Math.max(0, ...crit.filter((c) => Number.isFinite(c.ratio) && c.estado !== 'nc').map((c) => c.ratio));
  const hasFail = crit.some((c) => c.estado === 'fail') || issues.some((i) => i.nivel === 'error');
  const geoInsuf = crit.some((c) => c.grupo === 'geo' && c.estado === 'nc');
  const hasWarn = crit.some((c) => c.estado === 'warn') || issues.some((i) => i.nivel === 'warn') || advertenciasModelo.length > 0;
  const estado = hasFail
    ? { texto: 'NO VERIFICA', nivel: 'fail' as Estado, maxRatio }
    : geoInsuf || hasWarn
      ? { texto: 'VERIFICA CON OBSERVACIONES — revisar pendientes', nivel: 'warn' as Estado, maxRatio }
      : { texto: 'VERIFICA', nivel: 'ok' as Estado, maxRatio };

  return {
    shape: s, w, service, ult, predim,
    env: { Mpos, Mneg, V: Vgov, xs, pos, neg },
    d: { ...dd, punz: dPunz, corte: dCorte }, long, trans, punz, punzConjunto, peds,
    checks: ctx.checks, schedule, issues, estado, cantidades, advertenciasModelo,
  };
}

export { inside };

export interface PedRes { colId: string; col: string; hp: number; bx: number; by: number; dem: PedDemand[]; des: PedDesign; Wpu: number }

/** Pedestal / columna corta: flexo-compresión biaxial, corte, torsión, esbeltez, aplastamiento y anclaje */
function pedestalChecks(ctx: Ctx, c: Column, ult: UltRes[], disp: number): PedRes {
  const { p } = ctx;
  const n = p.norm, fc = p.mat.hormigon.fc, fy = p.mat.acero.fy, Es = p.mat.acero.Es;
  const { h: hp, bx, by, rec } = c.ped;
  const Wpu = n.ped.gammaPP * p.mat.hormigon.gammaC * bx * by * hp;
  const zc = hp + c.zCarga; // brazo desde el tope de carga hasta la base del pedestal
  const dem: PedDemand[] = ult.map((u) => {
    const l = u.tot.combo.cargas[c.id] ?? { N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 };
    return { combo: u.tot.combo.nombre, Pu: l.N + Wpu, Vx: l.Vx, Vy: l.Vy, Mx: l.Mx - zc * l.Vy, My: l.My + zc * l.Vx, Tu: l.Mz };
  });
  const des = designPed(bx, by, hp, rec, c.ped.arm, p.mat.diametros, fc, fy, Es, dem, n);
  const a = des.arm, R = n.referencias, nb = 2 * a.nx + 2 * a.ny - 4;
  const arm = `${nb}Ø${a.db} (${a.nx} por cara X, ${a.ny} por cara Y) + E Ø${a.dbE} c/${a.sE}`;
  const g = des.pm.d;
  mk(ctx, {
    id: `est-ped-pm-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: flexo-compresión biaxial`,
    formula: 'Compatibilidad de deformaciones (εcu = 0,003, bloque 0,85·f\'c·β1·c), φ variable 0,65–0,90; demanda (Pu, Mux, Muy) dentro del contorno φMn(Pu)',
    variables: `Sección ${bx}×${by} mm; ${arm}; ρ = ${fmt(des.rho * 100, 2)} %; Pu incluye ${fmt(n.ped.gammaPP, 1)}·peso propio = ${k(Wpu)} kN`,
    sustitucion: `Pu = ${k(g?.Pu ?? 0)} kN; Mux = ${km(g?.Mx ?? 0)} kNm; Muy = ${km(g?.My ?? 0)} kNm en la base (M + (h_ped + z)·V); |Mu| = ${km(Math.hypot(g?.Mx ?? 0, g?.My ?? 0))} kNm ≤ φMn(Pu) = ${Number.isFinite(des.pm.cap) ? km(des.pm.cap) : '—'} kNm en esa dirección`,
    demanda: des.pm.ratio, capacidad: 1, unidad: '', combo: g?.combo ?? '—', ref: R.pedFlex,
  });
  mk(ctx, { id: `est-ped-rho-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: cuantía longitudinal`, formula: 'ρmín ≤ As/Ag ≤ ρmáx', variables: `ρmín = ${n.ped.rhoMin}; ρmáx = ${n.ped.rhoMax}`, sustitucion: `${fmt(n.ped.rhoMin * 100, 2)} % ≤ ${fmt(des.rho * 100, 2)} % ≤ ${fmt(n.ped.rhoMax * 100, 2)} %`, demanda: Math.max(n.ped.rhoMin / des.rho, des.rho / n.ped.rhoMax), capacidad: 1, unidad: '', combo: '—', ref: R.pedCuantia });
  mk(ctx, { id: `est-ped-sep-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: separación de barras`, formula: 's_libre ≥ máx(40 mm; 1,5·db) y separación libre ≤ 300 mm', variables: '', sustitucion: `libre = ${fmt(des.libre, 0)} mm ≥ ${fmt(des.libreMin, 0)} mm`, demanda: des.libreMin / Math.max(1, des.libre), capacidad: 1, unidad: '', combo: '—', ref: R.pedSepar, estado: des.libre >= des.libreMin && des.libre <= 300 ? 'ok' : 'fail' });
  const cv = des.corte;
  mk(ctx, {
    id: `est-ped-v-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: corte biaxial`,
    formula: 'φVn = φ·(Vc + Vs); Vc = (1 + Nu/(14·Ag))·(1/6)·√f\'c·bw·d; Vs = Av·fy·d/s; Vux/φVnx + Vuy/φVny ≤ 1 (interacción lineal)',
    variables: `Av = 2 ramas Ø${a.dbE}; s = ${a.sE} mm`,
    sustitucion: `φVnx = ${k(cv.x.phiVn)} kN, φVny = ${k(cv.y.phiVn)} kN; Vux = ${k(Math.abs(cv.d?.Vx ?? 0))} kN, Vuy = ${k(Math.abs(cv.d?.Vy ?? 0))} kN → ${fmt(cv.ratio, 3)}`,
    demanda: cv.ratio, capacidad: 1, unidad: '', combo: cv.d?.combo ?? '—', ref: R.pedCorte,
  });
  mk(ctx, { id: `est-ped-est-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: separación de estribos`, formula: 's ≤ mín(16·db; 48·dbE; lado menor; 300 mm)', variables: '', sustitucion: `s = ${a.sE} mm ≤ ${fmt(des.sMaxE, 0)} mm`, demanda: a.sE, capacidad: des.sMaxE, unidad: 'mm', combo: '—', ref: R.pedEstribos });
  const t = des.torsion;
  mk(ctx, {
    id: `est-ped-t-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: torsión Mz`,
    formula: 'Tu ≤ Tth = φ·(1/12)·√f\'c·(Acp²/pcp)·√(1 + Nu/(Ag·√f\'c/3)) → se puede despreciar la torsión', variables: `Acp = ${fmt(bx * by / 1e6, 4)} m²; pcp = ${fmt(2 * (bx + by), 0)} mm`,
    sustitucion: `Tu = ${km(Math.abs(t.Tu))} kNm ≤ Tth = ${km(t.Tth)} kNm`, demanda: Math.abs(t.Tu), capacidad: t.Tth, unidad: 'N·mm', combo: t.d?.combo ?? '—', ref: R.pedTorsion,
    nota: t.ok ? undefined : 'Supera el umbral: requiere armadura de torsión (no implementada en esta versión).',
  });
  mk(ctx, { id: `est-ped-esb-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: esbeltez`, formula: 'k·lu/r ≤ 22 (columna corta)', variables: `k = ${n.ped.kEsbeltez} (voladizo, conservador); lu = ${hp} mm; r = 0,3·${Math.min(bx, by)} mm`, sustitucion: `k·lu/r = ${fmt(des.esbeltez, 1)} ≤ ${n.ped.esbeltezLim}`, demanda: des.esbeltez, capacidad: n.ped.esbeltezLim, unidad: '', combo: '—', ref: R.pedEsbeltez, estado: des.esbeltez <= n.ped.esbeltezLim ? 'ok' : 'warn', nota: des.esbeltez > n.ped.esbeltezLim ? 'Efectos de segundo orden no considerados: reducir la altura o aumentar la sección.' : undefined });
  // aplastamiento bajo el elemento apoyado (placa, columna o equipo)
  const A1 = colDims(c).area, A2 = bx * by;
  const raiz = Math.min(Math.sqrt(A2 / A1), n.aplastamiento.raizMax);
  const phiBn = n.phiAplastamiento * n.aplastamiento.coef * fc * A1 * raiz;
  const Pmax = Math.max(0, ...dem.map((d) => d.Pu - Wpu));
  mk(ctx, { id: `est-ped-apl-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: aplastamiento en el tope`, formula: 'φBn = φ·0,85·f\'c·A1·√(A2/A1) ≥ Pu', variables: `A1 = ${c.apoyo === 'hormigon' ? 'columna' : 'placa / apoyo'} ${fmt(A1 / 1e6, 4)} m²; A2 = ${fmt(A2 / 1e6, 4)} m²`, sustitucion: `φBn = ${k(phiBn)} kN ≥ ${k(Pmax)} kN`, demanda: Pmax, capacidad: phiBn, unidad: 'N', combo: '—', ref: R.aplast });
  // anclaje de las barras del pedestal en la zapata (gancho apoyado sobre la malla inferior)
  const ldhv = ldh(a.db, fc, fy, n);
  mk(ctx, { id: `est-ped-anc-${c.id}`, grupo: 'est', titulo: `Pedestal ${c.nombre}: anclaje de barras en la zapata`, formula: 'ldh ≤ h − rec. inf. − Ø malla (tracción por flexión)', variables: '', sustitucion: `ldh = ${fmt(ldhv, 0)} mm ≤ ${fmt(disp, 0)} mm`, demanda: ldhv, capacidad: disp, unidad: 'mm', combo: '—', ref: R.ldh });
  return { colId: c.id, col: c.nombre, hp, bx, by, dem, des, Wpu };
}
