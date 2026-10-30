import { analyze } from './analysis';
import { colDims } from './geometry';
import { resultantGlobal } from './loads';
import type { Footing, Project } from './types';

export interface Candidate {
  forma: Footing['forma'];
  L: number; B1: number; B2: number; h: number; x0: number; y0: number;
  ok: boolean;
  vol: number; // mm³
  acero: number; // kg
  maxRatio: number;
  falla: string;
  marcas: number;
}

export interface AutoResult {
  candidatos: Candidate[];
  mejor: Candidate | null;
  explicacion: string[];
  evaluaciones: number;
}

const up = (v: number, inc: number) => Math.ceil(v / inc - 1e-9) * inc;
const down = (v: number, inc: number) => Math.floor(v / inc + 1e-9) * inc;

export function autosize(p0: Project): AutoResult {
  const p = structuredClone(p0);
  const f = p.footing, cr = p.crit, lim = f.limites;
  const inc = cr.incPlanta, incH = cr.incEspesor;
  const expl: string[] = [];
  let evals = 0;

  const serv = p.combos.filter((c) => c.activa && c.tipo === 'servicio');
  if (!serv.length || !p.combos.some((c) => c.activa && c.tipo === 'ultima'))
    return { candidatos: [], mejor: null, explicacion: ['Se requieren combinaciones de servicio y últimas activas.'], evaluaciones: 0 };
  const govS = serv.reduce((a, b) => (resultantGlobal(p, b).N > resultantGlobal(p, a).N ? b : a));
  const R = resultantGlobal(p, govS);
  expl.push(`Resultante de servicio (${govS.nombre}): N = ${(R.N / 1e3).toFixed(1)} kN en X = ${(R.X / 1e3).toFixed(3)} m, Y = ${(R.Y / 1e3).toFixed(3)} m.`);
  const qadm = p.geo.qadmPerm ?? p.geo.qadm;
  const Aest = (p.norm.pesoPropioPreliminar * R.N) / qadm;
  expl.push(`Área estimada A = ${p.norm.pesoPropioPreliminar}·N/q_adm = ${(Aest / 1e6).toFixed(2)} m².`);

  // Caras extremas de columnas/pedestales
  const faces = p.columns.map((c) => {
    const d = c.ped.activo ? { bx: c.ped.bx, by: c.ped.by } : colDims(c);
    return { x1: c.x - d.bx / 2, x2: c.x + d.bx / 2, y1: c.y - d.by / 2, y2: c.y + d.by / 2 };
  });
  const fxMin = Math.min(...faces.map((q) => q.x1)), fxMax = Math.max(...faces.map((q) => q.x2));
  const fyMin = Math.min(...faces.map((q) => q.y1)), fyMax = Math.max(...faces.map((q) => q.y2));
  const spanY = 2 * Math.max(Math.abs(fyMin - R.Y), Math.abs(fyMax - R.Y));
  const LmaxLim = Math.min(f.Lmax, lim.xMin !== null && lim.xMax !== null ? lim.xMax - lim.xMin : Infinity);
  const Lmin = up(fxMax - fxMin, inc);
  const Ls: number[] = [];
  if (cr.lockL) Ls.push(f.L);
  else {
    const n = Math.max(1, Math.floor((LmaxLim - Lmin) / inc));
    const step = inc * Math.max(1, Math.ceil(n / 60));
    for (let L = Lmin; L <= LmaxLim + 1e-6; L += step) Ls.push(L);
  }
  const hs: number[] = [];
  if (cr.lockH) hs.push(f.h);
  else for (let h = up(f.hMin, incH); h <= f.hMax + 1e-6; h += incH) hs.push(h);

  const evalGeo = (ff: Partial<Footing>) => {
    evals++;
    const r = analyze({ ...p, footing: { ...f, ...ff } }, { geoOnly: true });
    return !r.checks.some((c) => c.estado === 'fail') && !r.issues.some((i) => i.nivel === 'error');
  };
  const evalF = (ff: Partial<Footing>) => {
    evals++;
    const r = analyze({ ...p, footing: { ...f, ...ff } });
    const estFail = r.checks.find((c) => c.estado === 'fail');
    const err = r.issues.find((i) => i.nivel === 'error');
    return { r, estFail, err };
  };

  const candidatos: Candidate[] = [];
  const yClamp = (B: number) => {
    let y0 = R.Y;
    if (lim.yMin !== null) y0 = Math.max(y0, lim.yMin + B / 2);
    if (lim.yMax !== null) y0 = Math.min(y0, lim.yMax - B / 2);
    return y0;
  };

  const tryShape = (forma: Footing['forma'], L: number, x0: number, widths: (k: number) => [number, number] | null) => {
    let kIni = 0; // el ancho mínimo no decrece al aumentar h (mayor peso propio)
    for (const h of hs) {
      // 1) ancho mínimo que satisface verificaciones geotécnicas (evaluación rápida)
      let found: ReturnType<typeof evalF> | null = null;
      let geom: [number, number] | null = null;
      for (let k = kIni; k < 120; k++) {
        const w = widths(k);
        if (!w) break;
        const [B1, B2] = w;
        const Bm = Math.max(B1, B2);
        if (Bm > f.Bmax) break;
        if (L / Math.min(B1, B2) > cr.ratioMax) continue;
        const y0 = yClamp(Bm);
        if (Math.abs(fyMin - y0) > Bm / 2 || Math.abs(fyMax - y0) > Bm / 2) continue;
        if (!evalGeo({ forma, L, B1, B2, h, x0, y0 })) continue;
        // 2) análisis completo
        found = evalF({ forma, L, B1, B2, h, x0, y0 });
        geom = w;
        kIni = k;
        break;
      }
      if (!found || !geom) {
        candidatos.push({ forma, L, B1: 0, B2: 0, h, x0, y0: R.Y, ok: false, vol: Infinity, acero: Infinity, maxRatio: Infinity, falla: 'Sin ancho que verifique presiones/estabilidad dentro de los límites', marcas: 0 });
        return;
      }
      const ok = !found.estFail && !found.err;
      const c: Candidate = {
        forma, L, B1: geom[0], B2: geom[1], h, x0, y0: yClamp(Math.max(...geom)), ok,
        vol: found.r.shape.A * h, acero: found.r.schedule.pesoTotal, maxRatio: found.r.estado.maxRatio,
        falla: found.estFail ? found.estFail.titulo : found.err ? found.err.msg : '', marcas: found.r.schedule.marcas.length,
      };
      if (ok || h === hs[hs.length - 1]) { candidatos.push(c); return; }
    }
  };

  for (const L of Ls) {
    // posición: centroide sobre la resultante, acotada por caras de columnas y medianeras
    let lo = fxMax - L, hi = fxMin;
    if (lim.xMin !== null) lo = Math.max(lo, lim.xMin);
    if (lim.xMax !== null) hi = Math.min(hi, lim.xMax - L);
    if (cr.lockL) { lo = Math.min(lo, f.x0); hi = Math.max(hi, f.x0); }
    if (lo > hi + 1e-6) continue;
    const ideal = R.X - L / 2;
    const x0r = Math.min(Math.max(ideal, lo), hi);
    const x0 = x0r;
    const Bstart = Math.max(up(spanY, inc), down(Aest / L, inc) - 2 * inc, inc);
    tryShape('rectangular', L, x0, (k) => {
      if (cr.lockB) return k === 0 ? [f.B1, f.B1] : null;
      const B = Bstart + k * inc;
      return [B, B];
    });
    // Trapezoidal cuando la rectangular no puede centrarse sobre la resultante
    const desc = Math.abs(x0 - ideal);
    if (cr.probarTrapezoidal && !cr.lockB && desc > inc / 2) {
      const xbar = R.X - x0;
      const t = (3 * xbar) / L - 1; // B2/S
      if (t > 0.05 && t < 0.95) {
        const S0 = Math.max(2 * spanY, down((2 * Aest) / L, inc) - 4 * inc);
        tryShape('trapezoidal', L, x0, (k) => {
          const S = S0 + 2 * k * inc;
          const B2 = up(S * t, inc), B1 = up(S - S * t, inc);
          if (Math.min(B1, B2) < spanY) return [Math.max(B1, spanY), Math.max(B2, spanY)];
          return [B1, B2];
        });
      }
    }
  }

  const oks = candidatos.filter((c) => c.ok);
  oks.sort((a, b) => {
    if (Math.abs(a.vol - b.vol) > 0.01 * Math.min(a.vol, b.vol)) return a.vol - b.vol;
    if (Math.abs(a.acero - b.acero) > 0.01 * Math.min(a.acero, b.acero)) return a.acero - b.acero;
    if (a.forma !== b.forma) return a.forma === 'rectangular' ? -1 : 1;
    return a.marcas - b.marcas;
  });
  const mejor = oks[0] ?? null;
  if (mejor) {
    expl.push(`Se evaluaron ${candidatos.length} alternativas (${evals} análisis); ${oks.length} cumplen todas las verificaciones implementadas.`);
    expl.push(`Criterio: 1) cumplimiento, 2) menor volumen de hormigón, 3) menor peso de acero, 4) simplicidad (rectangular y menos marcas).`);
    expl.push(`Seleccionada: ${mejor.forma} L = ${(mejor.L / 1e3).toFixed(2)} m, B1 = ${(mejor.B1 / 1e3).toFixed(2)} m${mejor.forma === 'trapezoidal' ? `, B2 = ${(mejor.B2 / 1e3).toFixed(2)} m` : ''}, h = ${(mejor.h / 1e3).toFixed(2)} m → ${(mejor.vol / 1e9).toFixed(2)} m³ de hormigón y ${mejor.acero.toFixed(0)} kg de acero.`);
    const seg = oks[1];
    if (seg) expl.push(`Siguiente alternativa: ${seg.forma} ${(seg.L / 1e3).toFixed(2)}×${(seg.B1 / 1e3).toFixed(2)}×${(seg.h / 1e3).toFixed(2)} m con ${(seg.vol / 1e9).toFixed(2)} m³ y ${seg.acero.toFixed(0)} kg.`);
  } else {
    expl.push('Ninguna alternativa cumple dentro de los límites: ampliar dimensiones máximas, espesor máximo o revisar cargas/suelo.');
  }
  candidatos.sort((a, b) => Number(b.ok) - Number(a.ok) || a.vol - b.vol);
  return { candidatos, mejor, explicacion: expl, evaluaciones: evals };
}
