import { beta1, type NormConfig } from '../norm/config';
import { barArea } from './section';
import type { PedArmado } from './types';

/**
 * Pedestal / columna corta rectangular bx × by con barras perimetrales.
 * Convención de la sección (centro en el baricentro): Sx = ΣF·x, Sy = ΣF·y con F de compresión positiva.
 * Con la convención de cargas de la app (q = N/A + My·x/Iy − Mx·y/Ix): Sx ↔ My y Sy ↔ −Mx.
 */
export interface Bar { x: number; y: number; A: number }
export interface Sec { bx: number; by: number; fc: number; fy: number; Es: number; bars: Bar[]; Ag: number; As: number }

export function layoutBars(bx: number, by: number, rec: number, a: PedArmado): Bar[] {
  const cx = bx / 2 - rec - a.dbE - a.db / 2, cy = by / 2 - rec - a.dbE - a.db / 2;
  const A = barArea(a.db);
  const pts = new Map<string, Bar>();
  const add = (x: number, y: number) => pts.set(`${x.toFixed(1)}|${y.toFixed(1)}`, { x, y, A });
  const nx = Math.max(2, a.nx), ny = Math.max(2, a.ny);
  for (let i = 0; i < nx; i++) { const x = -cx + (2 * cx * i) / (nx - 1); add(x, -cy); add(x, cy); }
  for (let j = 0; j < ny; j++) { const y = -cy + (2 * cy * j) / (ny - 1); add(-cx, y); add(cx, y); }
  return [...pts.values()];
}

export function section(bx: number, by: number, rec: number, a: PedArmado, fc: number, fy: number, Es: number): Sec {
  const bars = layoutBars(bx, by, rec, a);
  return { bx, by, fc, fy, Es, bars, Ag: bx * by, As: bars.reduce((s, b) => s + b.A, 0) };
}

type Pt = [number, number];
/** Recorte de un polígono convexo por el semiplano f(x,y) ≥ 0 (Sutherland–Hodgman) */
function clip(poly: Pt[], f: (x: number, y: number) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(...a), fb = f(...b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}
function areaCentroid(p: Pt[]): { A: number; x: number; y: number } {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    const c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  A /= 2;
  return Math.abs(A) < 1e-9 ? { A: 0, x: 0, y: 0 } : { A: Math.abs(A), x: cx / (6 * A), y: cy / (6 * A) };
}

/** Fuerzas nominales para eje neutro con normal θ (hacia la fibra más comprimida) y profundidad c */
export function nominal(s: Sec, th: number, c: number, n: NormConfig) {
  const u = Math.cos(th), v = Math.sin(th);
  const proj = (x: number, y: number) => x * u + y * v;
  const smax = Math.abs(u) * s.bx / 2 + Math.abs(v) * s.by / 2;
  const a = beta1(s.fc, n) * c;
  let P = 0, Sx = 0, Sy = 0;
  // bloque rectangular equivalente: recorte exacto del rectángulo por el semiplano proj ≥ smax − a
  const sc = 0.85 * s.fc;
  const poly = clip([[-s.bx / 2, -s.by / 2], [s.bx / 2, -s.by / 2], [s.bx / 2, s.by / 2], [-s.bx / 2, s.by / 2]], (x, y) => proj(x, y) - (smax - a));
  const g = areaCentroid(poly);
  if (g.A > 0) { const F = sc * g.A; P += F; Sx += F * g.x; Sy += F * g.y; }
  let epsT = -Infinity;
  for (const b of s.bars) {
    const dist = proj(b.x, b.y) - (smax - c); // > 0 comprimido
    const eps = (0.003 * dist) / c;
    epsT = Math.max(epsT, -eps);
    let fs = Math.max(-s.fy, Math.min(s.fy, s.Es * eps));
    if (proj(b.x, b.y) >= smax - a) fs -= sc; // hormigón desplazado
    const F = fs * b.A;
    P += F; Sx += F * b.x; Sy += F * b.y;
  }
  const ey = s.fy / s.Es;
  const phi = epsT >= n.epsTMin ? n.phiFlexion : epsT <= ey ? n.ped.phiComp : n.ped.phiComp + ((n.phiFlexion - n.ped.phiComp) * (epsT - ey)) / (n.epsTMin - ey);
  return { P, Sx, Sy, phi, epsT };
}

export const phiPnMax = (s: Sec, n: NormConfig) => n.ped.phiComp * n.ped.pnMax * (0.85 * s.fc * (s.Ag - s.As) + s.fy * s.As);
export const phiPnTrac = (s: Sec, n: NormConfig) => -n.phiFlexion * s.fy * s.As;

/** Curva de interacción Mx–My (con φ) al nivel de carga Pu */
export function contour(s: Sec, Pu: number, n: NormConfig, nAng = 36): [number, number][] {
  const D = Math.hypot(s.bx, s.by);
  const out: [number, number][] = [];
  for (let k = 0; k < nAng; k++) {
    const th = (2 * Math.PI * k) / nAng;
    let lo = 1e-3 * D, hi = 30 * D;
    const f = (c: number) => { const r = nominal(s, th, c, n); return Math.min(r.phi * r.P, phiPnMax(s, n)); };
    if (f(lo) > Pu || f(hi) < Pu) { out.push([0, 0]); continue; }
    for (let it = 0; it < 32; it++) { const m = (lo + hi) / 2; if (f(m) < Pu) lo = m; else hi = m; }
    const r = nominal(s, th, (lo + hi) / 2, n);
    out.push([r.phi * r.Sx, r.phi * r.Sy]);
  }
  return out;
}

/** Relación demanda/capacidad para (Pu, Sx, Sy): radio de la demanda sobre el contorno en esa dirección */
export function pmRatio(s: Sec, Pu: number, Sx: number, Sy: number, n: NormConfig): { ratio: number; cap: number; pCap: number } {
  const pMax = phiPnMax(s, n), pT = phiPnTrac(s, n);
  if (Pu > pMax) return { ratio: Pu / pMax, cap: 0, pCap: pMax };
  if (Pu < pT) return { ratio: Pu / pT, cap: 0, pCap: pT };
  const M = Math.hypot(Sx, Sy);
  if (M < 1) return { ratio: Pu >= 0 ? Pu / pMax : Pu / pT, cap: Infinity, pCap: Pu >= 0 ? pMax : pT };
  const cs = contour(s, Pu, n);
  const ang = Math.atan2(Sy, Sx);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let R = Infinity;
  for (let i = 0; i < cs.length; i++) {
    const [ax, ay] = cs[i], [bx, by] = cs[(i + 1) % cs.length];
    // intersección del rayo t·u con el segmento a + s·(b − a)
    const ex = bx - ax, ey = by - ay;
    const den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * ey - ay * ex) / den;
    const sg = (ax * uy - ay * ux) / den;
    if (t > 0 && sg >= -1e-9 && sg <= 1 + 1e-9) R = Math.min(R, t);
  }
  if (!Number.isFinite(R)) R = 0;
  return { ratio: R > 0 ? M / R : Infinity, cap: R, pCap: Pu };
}

export interface PedDemand { combo: string; Pu: number; Vx: number; Vy: number; Mx: number; My: number; Tu: number }

export interface PedDesign {
  arm: PedArmado;
  sec: Sec;
  rho: number;
  pm: { ratio: number; cap: number; d: PedDemand };
  corte: { ratio: number; x: { Vc: number; Vs: number; phiVn: number; d: number; bw: number }; y: { Vc: number; Vs: number; phiVn: number; d: number; bw: number }; d: PedDemand };
  torsion: { Tu: number; Tth: number; ok: boolean; d: PedDemand };
  sMaxE: number;
  libre: number;
  libreMin: number;
  esbeltez: number;
}

/** Verifica un armado dado frente a todas las demandas */
export function checkPed(bx: number, by: number, hp: number, rec: number, arm: PedArmado, fc: number, fy: number, Es: number, ds: PedDemand[], n: NormConfig): PedDesign {
  const sec = section(bx, by, rec, arm, fc, fy, Es);
  let pm = { ratio: 0, cap: Infinity, d: ds[0] };
  let co = { ratio: -1, x: { Vc: 0, Vs: 0, phiVn: 0, d: 0, bw: 0 }, y: { Vc: 0, Vs: 0, phiVn: 0, d: 0, bw: 0 }, d: ds[0] };
  let to = { Tu: 0, Tth: Infinity, ok: true, d: ds[0] };
  let toR = -1;
  const Av = 2 * barArea(arm.dbE);
  const shear = (Nu: number, h: number, bw: number) => {
    const d = h - rec - arm.dbE - arm.db / 2;
    const k = Nu >= 0 ? 1 + Nu / (n.ped.vcAxial * sec.Ag) : Math.max(0, 1 + (0.3 * Nu) / sec.Ag);
    const Vc = k * n.vcCoef * n.lambda * Math.sqrt(fc) * bw * d;
    const Vs = Math.min((Av * fy * d) / arm.sE, (2 / 3) * Math.sqrt(fc) * bw * d);
    return { Vc, Vs, phiVn: n.phiCorte * (Vc + Vs), d, bw };
  };
  const Acp = bx * by, pcp = 2 * (bx + by);
  for (const d of ds) {
    const r = pmRatio(sec, d.Pu, d.My, -d.Mx, n);
    if (r.ratio > pm.ratio) pm = { ratio: r.ratio, cap: r.cap, d };
    const sx = shear(d.Pu, bx, by), sy = shear(d.Pu, by, bx);
    // interacción lineal de corte biaxial (hipótesis conservadora)
    const rv = Math.abs(d.Vx) / sx.phiVn + Math.abs(d.Vy) / sy.phiVn;
    if (rv > co.ratio) co = { ratio: rv, x: sx, y: sy, d };
    const Tth = n.phiCorte * n.ped.torsionUmbral * n.lambda * Math.sqrt(fc) * (Acp * Acp / pcp) * Math.sqrt(Math.max(0, 1 + d.Pu / (sec.Ag * Math.sqrt(fc) / 3)));
    if (Math.abs(d.Tu) / Tth > toR) { toR = Math.abs(d.Tu) / Tth; to = { Tu: d.Tu, Tth, ok: Math.abs(d.Tu) <= Tth, d }; }
  }
  const sMaxE = Math.min(n.ped.estriboDb * arm.db, n.ped.estriboDbE * arm.dbE, Math.min(bx, by), 300);
  const cx = bx - 2 * (rec + arm.dbE) - arm.db, cy = by - 2 * (rec + arm.dbE) - arm.db;
  const libre = Math.min(cx / (Math.max(2, arm.nx) - 1), cy / (Math.max(2, arm.ny) - 1)) - arm.db;
  return {
    arm, sec, rho: sec.As / sec.Ag, pm, corte: { ...co, ratio: Math.max(0, co.ratio) }, torsion: to, sMaxE, libre,
    libreMin: Math.max(n.ped.sLibreAbs, n.ped.sLibreDb * arm.db),
    esbeltez: (n.ped.kEsbeltez * hp) / (0.3 * Math.min(bx, by)),
  };
}

const memo = new Map<string, PedDesign>();

/** Armado automático: menor As que cumple cuantía, separaciones, flexo-compresión y corte */
export function designPed(bx: number, by: number, hp: number, rec: number, base: PedArmado, diams: number[], fc: number, fy: number, Es: number, ds: PedDemand[], n: NormConfig): PedDesign {
  const key = JSON.stringify([bx, by, hp, rec, base, diams, fc, fy, Es, ds, n.ped, n.phiFlexion, n.phiCorte]);
  const hit = memo.get(key);
  if (hit) return hit;
  let res: PedDesign;
  if (!base.auto) res = checkPed(bx, by, hp, rec, base, fc, fy, Es, ds, n);
  else {
    const cands: PedArmado[] = [];
    const ds2 = diams.filter((d) => d >= 12);
    for (const db of ds2.length ? ds2 : diams) for (let nx = 2; nx <= 8; nx++) for (let ny = 2; ny <= 8; ny++) {
      const dbE = db <= 16 ? 8 : db <= 25 ? 10 : 12;
      cands.push({ auto: true, nx, ny, db, dbE, sE: 0 });
    }
    const As = (a: PedArmado) => (2 * a.nx + 2 * a.ny - 4) * barArea(a.db);
    cands.sort((a, b) => As(a) - As(b) || a.nx + a.ny - b.nx - b.ny);
    res = null as unknown as PedDesign;
    for (const c of cands) {
      const Ag = bx * by;
      if (As(c) < n.ped.rhoMin * Ag || As(c) > n.ped.rhoMax * Ag) continue;
      // separación libre entre barras y máxima de 300 mm entre barras
      const cx = bx - 2 * (rec + c.dbE) - c.db, cy = by - 2 * (rec + c.dbE) - c.db;
      const lx = cx / (c.nx - 1) - c.db, ly = cy / (c.ny - 1) - c.db;
      if (Math.min(lx, ly) < Math.max(n.ped.sLibreAbs, n.ped.sLibreDb * c.db) || Math.max(lx, ly) > 300) continue;
      const sMaxE = Math.min(n.ped.estriboDb * c.db, n.ped.estriboDbE * c.dbE, Math.min(bx, by), 300);
      c.sE = Math.max(75, Math.floor(sMaxE / 25) * 25);
      let r = checkPed(bx, by, hp, rec, c, fc, fy, Es, ds, n);
      // reducir separación de estribos si el corte lo requiere
      while (r.corte.ratio > 1 && c.sE > 75) { c.sE -= 25; r = checkPed(bx, by, hp, rec, c, fc, fy, Es, ds, n); }
      if (r.pm.ratio <= 1 && r.corte.ratio <= 1) { res = r; break; }
      // si ninguno cumple, se informa el de menor relación D/C
      if (!res || Math.max(r.pm.ratio, r.corte.ratio) < Math.max(res.pm.ratio, res.corte.ratio)) res = r;
    }
    if (!res) res = checkPed(bx, by, hp, rec, { ...base, auto: true }, fc, fy, Es, ds, n);
  }
  if (memo.size > 500) memo.clear();
  memo.set(key, res);
  return res;
}
