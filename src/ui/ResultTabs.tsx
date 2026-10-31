import { Fragment, useState } from 'react';
import type { TabProps } from '../App';
import { Badge, Card, Note, Stat, ESTADO_COLOR } from './components';
import type { Check, Project } from '../core/types';
import type { Results } from '../core/analysis';
import { fmt } from '../core/units';
import { widthAt, colDims } from '../core/geometry';
import { qAt, type PressureField } from '../core/pressure';
import type { BeamResult } from '../core/beam';
import { localXY } from '../core/loads';
import { AxoView } from '../drawings/AxoView';
import { PedSummary } from './PedestalPanel';

const kN = (v: number, d = 1) => fmt(v / 1e3, d);
const kNm = (v: number, d = 1) => fmt(v / 1e6, d);
const kPa = (v: number, d = 1) => fmt(v * 1e3, d);
const m = (v: number, d = 2) => fmt(v / 1e3, d);

export function ChecksTable({ checks }: { checks: Check[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead><tr><th>Estado</th><th>Verificación</th><th>Desarrollo</th><th>D/C</th><th>Combinación</th><th>Referencia</th></tr></thead>
        <tbody>
          {checks.map((c) => (
            <Fragment key={c.id}>
              <tr className="cursor-pointer" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <td><Badge e={c.estado} /></td>
                <td className="font-semibold">{c.titulo}{c.nota && <div className="text-[10px] font-normal text-amber-700">{c.nota}</div>}</td>
                <td className="text-[11px]">{c.sustitucion}</td>
                <td className="font-bold" style={{ color: ESTADO_COLOR[c.estado] }}>{Number.isFinite(c.ratio) ? fmt(c.ratio, 3) : c.ratio === Infinity ? '∞' : '—'}</td>
                <td className="text-[11px]">{c.combo}</td>
                <td className="text-[10px] text-slate-500">{c.ref}</td>
              </tr>
              {open === c.id && (
                <tr><td colSpan={6} className="bg-teal-50 text-[11px]">
                  <div><b>Fórmula:</b> {c.formula}</div>
                  {c.variables && <div><b>Variables:</b> {c.variables}</div>}
                  <div><b>Demanda:</b> {fmt(c.demanda, 3)} · <b>Capacidad:</b> {fmt(c.capacidad, 3)} {c.unidad}</div>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Mapa de presiones ----------------
export function PressureMap({ p, r, pf, title }: { p: Project; r: Results; pf: PressureField; title?: string }) {
  const s = r.shape;
  const nx = 60, ny = 24;
  const W = 600, pad = 50;
  const sc = (W - 2 * pad) / s.L;
  const H = s.Bmax * sc + 2 * pad;
  const qmax = Math.max(pf.qmax, 1e-9);
  const color = (q: number) => {
    if (q <= 0) return '#e2e8f0';
    const t = Math.min(1, q / qmax);
    const h = 220 - 220 * t;
    return `hsl(${h},75%,${55 - 8 * t}%)`;
  };
  const X = (x: number) => pad + x * sc;
  const Y = (y: number) => H / 2 - y * sc;
  const cells = [];
  for (let i = 0; i < nx; i++) {
    const x = ((i + 0.5) * s.L) / nx;
    const B = widthAt(s, x);
    for (let j = 0; j < ny; j++) {
      const y = -B / 2 + ((j + 0.5) * B) / ny;
      cells.push(<rect key={`${i}-${j}`} x={X(x - s.L / nx / 2)} y={Y(y + B / ny / 2)} width={(s.L / nx) * sc + 0.5} height={(B / ny) * sc + 0.5} fill={color(qAt(pf, x - s.xc, y))} />);
    }
  }
  const pts = [[0, -s.B1 / 2], [s.L, -s.B2 / 2], [s.L, s.B2 / 2], [0, s.B1 / 2]];
  return (
    <div>
      {title && <div className="mb-1 text-[12px] font-bold text-steel">{title}</div>}
      <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full">
        {cells}
        <polygon points={pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} fill="none" stroke="#0f1d2b" strokeWidth="1.5" />
        {p.columns.map((c) => {
          const { x, y } = localXY(p, c);
          const d = colDims(c);
          return <rect key={c.id} x={X(x - d.bx / 2)} y={Y(y + d.by / 2)} width={d.bx * sc} height={d.by * sc} fill="none" stroke="#0f1d2b" strokeDasharray="3 2" />;
        })}
        <circle cx={X(s.xc + pf.ex)} cy={Y(pf.ey)} r="5" fill="#fff" stroke="#0f1d2b" strokeWidth="2" />
        <text x={X(s.xc + pf.ex) + 7} y={Y(pf.ey) - 6} fontSize="10">R</text>
        <circle cx={X(s.xc)} cy={Y(0)} r="2.5" fill="#0f1d2b" />
        {pf.esquinas.map((e, i) => {
          const xx = X(e.x + s.xc), yy = Y(e.y);
          return <text key={i} x={xx + (e.x > 0 ? 4 : -4)} y={yy + (e.y > 0 ? -6 : 14)} fontSize="11" fontWeight="bold" textAnchor={e.x > 0 ? 'start' : 'end'}>{kPa(e.q)}</text>;
        })}
        <defs><linearGradient id="lg"><stop offset="0" stopColor="hsl(220,75%,55%)" /><stop offset="0.5" stopColor="hsl(110,75%,51%)" /><stop offset="1" stopColor="hsl(0,75%,47%)" /></linearGradient></defs>
        <rect x={pad} y={H + 8} width={200} height={10} fill="url(#lg)" />
        <text x={pad} y={H + 28} fontSize="10">0</text><text x={pad + 200} y={H + 28} fontSize="10" textAnchor="end">{kPa(qmax)} kPa</text>
        <rect x={pad + 230} y={H + 8} width={12} height={10} fill="#e2e8f0" stroke="#94a3b8" /><text x={pad + 246} y={H + 17} fontSize="10">sin contacto</text>
      </svg>
    </div>
  );
}

// ---------------- 7. Resultados geotécnicos ----------------
export function GeoResultsTab({ p, r }: TabProps) {
  const [sel, setSel] = useState(0);
  if (!r) return <Note kind="error">Sin resultados.</Note>;
  const sr = r.service[Math.min(sel, r.service.length - 1)];
  const w = r.w;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Área" value={`${fmt(r.shape.A / 1e6, 2)} m²`} />
        <Stat label="Peso zapata" value={`${kN(w.Wz)} kN`} />
        <Stat label="Suelo sobre zapata" value={`${kN(w.Ws)} kN`} />
        <Stat label="Pedestales" value={`${kN(w.Wp)} kN`} />
        <Stat label="Subpresión" value={`${kN(w.U)} kN`} sub={`hw = ${m(w.hw)} m`} />
      </div>
      <Card title="Presiones de contacto por combinación de servicio">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Combinación</th><th>N total [kN]</th><th>Mx [kNm]</th><th>My [kNm]</th><th>ex [m]</th><th>ey [m]</th><th>q med [kPa]</th><th>q máx [kPa]</th><th>q mín [kPa]</th><th>Área comp.</th><th>Núcleo</th><th>q adm [kPa]</th><th>Estado</th></tr></thead>
            <tbody>
              {r.service.map((s, i) => {
                const ok = s.qComparada <= s.qadm * (1 + 1e-6) && (s.pf.contactoTotal || p.crit.permitirPerdidaContacto);
                return (
                  <tr key={s.tot.combo.id} className={`cursor-pointer ${i === sel ? 'outline outline-2 outline-accent' : ''}`} onClick={() => setSel(i)}>
                    <td className="font-semibold">{s.tot.combo.nombre}{s.tot.combo.transitoria ? ' (T)' : ''}</td>
                    <td>{kN(s.tot.N)}</td><td>{kNm(s.tot.Mx)}</td><td>{kNm(s.tot.My)}</td><td>{m(s.pf.ex, 3)}</td><td>{m(s.pf.ey, 3)}</td>
                    <td>{kPa(s.pf.qmed)}</td><td className="font-bold">{kPa(s.pf.qmax)}</td><td>{kPa(s.pf.qmin)}</td>
                    <td>{fmt(s.pf.areaComprimida * 100, 1)} %{!s.pf.contactoTotal && ' (iterativo)'}</td>
                    <td>{s.pf.enNucleo ? 'Sí' : 'No'}</td><td>{kPa(s.qadm)}{p.geo.qadmTipo === 'neta' ? ' neta' : ''}</td>
                    <td><Badge e={ok ? 'ok' : 'fail'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">q(x,y) = N/A + My·x/Iy − Mx·y/Ix respecto del centroide. Si q mín &lt; 0 se calcula el área comprimida en forma iterativa (no se usa la ecuación lineal sobre toda el área).{p.geo.qadmTipo === 'neta' && ` q comparada = q máx − σ'v0 (σ'v0 = ${kPa(r.service[0]?.sigmaV0 ?? 0)} kPa).`}</div>
      </Card>
      {sr && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card title={`Mapa de presiones — ${sr.tot.combo.nombre}`}><PressureMap p={p} r={r} pf={sr.pf} /></Card>
          <Card title="Predimensionado">
            <div className="space-y-1 text-[12px]">
              <div>Combinación de mayor carga: <b>{r.predim.combo}</b></div>
              <div>A req = {fmt(r.predim.factor)}·N/q_adm = {fmt(r.predim.factor)}·{kN(r.predim.N)}/{kPa(r.predim.qadm)} = <b>{fmt(r.predim.Areq / 1e6, 2)} m²</b></div>
              <div>A adoptada = <b>{fmt(r.shape.A / 1e6, 2)} m²</b></div>
              <div>q estimada = {fmt(r.predim.factor)}·N/A = <b>{kPa(r.predim.qEst)} kPa</b></div>
            </div>
          </Card>
        </div>
      )}
      <Card title="Verificaciones geotécnicas (servicio)"><ChecksTable checks={r.checks.filter((c) => c.grupo === 'geo')} /></Card>
    </div>
  );
}

// ---------------- Diagramas ----------------
export function Diagram({ b, p, r, k, title, unit, scale, invert, color }: {
  b: BeamResult; p: Project; r: Results; k: 'w' | 'V' | 'M'; title: string; unit: string; scale: number; invert?: boolean; color: string;
}) {
  const W = 700, H = 190, pad = 46;
  const L = r.shape.L;
  const vals = b.pts.map((q) => q[k] / scale);
  const vmax = Math.max(1e-9, ...vals.map(Math.abs));
  const X = (x: number) => pad + (x / L) * (W - 2 * pad);
  const Y = (v: number) => H / 2 - ((invert ? -v : v) / vmax) * (H / 2 - 34);
  const path = `M${X(0)},${Y(0)} ` + b.pts.map((q, i) => `L${X(q.x)},${Y(vals[i])}`).join(' ') + ` L${X(L)},${Y(0)} Z`;
  const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
  return (
    <div>
      <div className="text-[12px] font-bold text-steel">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 230 }}>
        <path d={path} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5" />
        <line x1={X(0)} x2={X(L)} y1={Y(0)} y2={Y(0)} stroke="#0f1d2b" />
        {p.columns.map((c) => {
          const x = localXY(p, c).x;
          return <g key={c.id}><line x1={X(x)} x2={X(x)} y1={14} y2={H - 8} stroke="#94a3b8" strokeDasharray="3 3" /><text x={X(x)} y={11} fontSize="10" textAnchor="middle">{c.nombre}</text></g>;
        })}
        {[iMax, iMin].filter((i, j, a) => a.indexOf(i) === j && Math.abs(vals[i]) > vmax * 0.02).map((i) => (
          <g key={i}><circle cx={X(b.pts[i].x)} cy={Y(vals[i])} r="3" fill={color} />
            <text x={X(b.pts[i].x)} y={Y(vals[i]) + ((invert ? -vals[i] : vals[i]) > 0 ? -6 : 14)} fontSize="11" fontWeight="bold" textAnchor="middle">{fmt(vals[i], 1)} {unit}</text>
            {k !== 'w' && <text x={X(b.pts[i].x) + 8} y={Y(vals[i]) + ((invert ? -vals[i] : vals[i]) > 0 ? -6 : 14)} fontSize="9" fill="#64748b" textAnchor="start" dx={40}>x = {m(b.pts[i].x)} m</text>}</g>
        ))}
        {(k === 'V' ? b.ceroV : k === 'M' ? b.ceroM : []).map((x, i) => <g key={i}><circle cx={X(x)} cy={Y(0)} r="2.5" fill="#fff" stroke="#0f1d2b" /><text x={X(x)} y={Y(0) + (k === 'M' ? -5 : 12)} fontSize="9" textAnchor="middle" fill="#334155">{m(x)}</text></g>)}
        <text x={4} y={Y(0) + 4} fontSize="10" fill="#64748b">0</text>
        <text x={X(L)} y={H - 2} fontSize="10" textAnchor="end" fill="#64748b">L = {m(L)} m</text>
      </svg>
    </div>
  );
}

export function tramoEq(b: BeamResult, p: Project): string[] {
  if (!b.poly) return ['Contacto parcial: w(x) obtenida por integración numérica del área comprimida.'];
  const [c0, c1, c2] = b.poly;
  const loads = p.columns.map((c) => ({ x: localXY(p, c).x, n: c.nombre })).sort((a, z) => a.x - z.x);
  const out = [`w(x) = ${fmt(c0, 3)} ${c1 >= 0 ? '+' : '−'} ${fmt(Math.abs(c1 * 1e3), 4)}·x ${c2 >= 0 ? '+' : '−'} ${fmt(Math.abs(c2 * 1e6), 5)}·x²  [kN/m; x en m]`];
  let prev = 0;
  const acc: string[] = [];
  for (const l of [...loads, { x: Infinity, n: '' }]) {
    const x2 = Math.min(l.x, Infinity);
    const base = `V(x) = ${fmt(c0, 2)}·x + ${fmt(c1 * 1e3 / 2, 3)}·x² + ${fmt(c2 * 1e6 / 3, 4)}·x³${acc.map((a) => ` − ${a}`).join('')}`;
    const baseM = `M(x) = ${fmt(c0 / 2, 2)}·x² + ${fmt(c1 * 1e3 / 6, 3)}·x³ + ${fmt(c2 * 1e6 / 12, 4)}·x⁴${acc.map((a) => ` − ${a}·(x − x${a.slice(1)})`).join('')}`;
    out.push(`Tramo ${m(prev)} ≤ x ≤ ${Number.isFinite(x2) ? m(x2) : 'L'} m:  ${base} ;  ${baseM}`);
    if (!Number.isFinite(l.x)) break;
    acc.push(`P${l.n}`);
    prev = l.x;
  }
  out.push('P: carga mayorada de la columna (kN); x medido desde el extremo izquierdo; se agregan pares C = My + z·Vx en cada columna si existen.');
  return out;
}

// ---------------- 8. Esfuerzos ----------------
export function ForcesTab({ p, r }: TabProps) {
  const [sel, setSel] = useState(0);
  if (!r || !r.ult.length) return <Note kind="error">No hay combinaciones últimas activas.</Note>;
  const u = r.ult[Math.min(sel, r.ult.length - 1)];
  const b = u.beam;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.ult.map((x, i) => <button key={x.tot.combo.id} onClick={() => setSel(i)} className={`rounded px-3 py-1 text-[12px] font-semibold ${i === sel ? 'bg-accent text-white' : 'bg-white text-steel border border-slate-300'}`}>{x.tot.combo.nombre}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Presión neta media" value={`${kPa(u.pf.qmed)} kPa`} sub={u.pf.contactoTotal ? 'contacto total' : `contacto ${fmt(u.pf.areaComprimida * 100, 0)} %`} />
        <Stat label="M máx positivo" value={`${kNm(b.Mpos.M)} kNm`} sub={`x = ${m(b.Mpos.x)} m (tracción inferior)`} />
        <Stat label="M máx negativo" value={`${kNm(b.Mneg.M)} kNm`} sub={`x = ${m(b.Mneg.x)} m (tracción superior)`} />
        <Stat label="V máx" value={`${kN(Math.abs(b.Vmax.V))} kN`} sub={`x = ${m(b.Vmax.x)} m`} />
        <Stat label="Equilibrio" value={`${fmt(Math.abs(b.equilibrio.sumW - b.equilibrio.sumP) / b.equilibrio.sumP * 100, 3)} %`} sub={`Σw = ${kN(b.equilibrio.sumW)} / ΣP = ${kN(b.equilibrio.sumP)} kN`} e={Math.abs(b.equilibrio.sumW - b.equilibrio.sumP) / b.equilibrio.sumP < 0.005 ? 'ok' : 'fail'} />
      </div>
      {r.advertenciasModelo.map((t, i) => <Note key={i} kind="warn">{t}</Note>)}
      <Card title="Método 1: viga invertida (dirección longitudinal)">
        <Diagram b={b} p={p} r={r} k="w" title="Carga lineal ascendente w(x)" unit="kN/m" scale={1} color="#0e7c86" />
        <Diagram b={b} p={p} r={r} k="V" title="Corte V(x)" unit="kN" scale={1e3} color="#d97706" />
        <Diagram b={b} p={p} r={r} k="M" title="Momento M(x) — dibujado del lado traccionado (positivo abajo)" unit="kNm" scale={1e6} invert color="#7c3aed" />
        <div className="mt-2 rounded bg-slate-50 p-2 text-[11px] leading-relaxed">
          {tramoEq(b, p).map((t, i) => <div key={i} className="font-mono">{t}</div>)}
          <div className="mt-1">Ceros de V: {b.ceroV.map((x) => `${m(x)} m`).join(', ') || '—'} · Ceros de M (inflexión): {b.ceroM.map((x) => `${m(x)} m`).join(', ') || '—'}</div>
          <div>Zonas de armadura: inferior donde M &gt; 0 (bajo columnas y voladizos), superior donde M &lt; 0 (entre columnas).</div>
        </div>
      </Card>
      <Card title="Método 2: franjas ortogonales (flexión transversal)">
        <table className="tbl"><thead><tr><th>Columna</th><th>Banda b [m]</th><th>Vuelo c [m]</th><th>Mu banda [kNm]</th><th>As req [mm²]</th><th>As distribuida [mm²]</th><th>Adicionales</th><th>Comb.</th></tr></thead><tbody>
          {r.trans.inf.bandas.map((x) => <tr key={x.colId}><td>{x.col}</td><td>{m(x.bf)}</td><td>{m(x.c)}</td><td>{kNm(x.Mu)}</td><td>{fmt(x.AsReq, 0)}</td><td>{fmt(x.AsProv, 0)}</td><td>{x.nAdd ? `${x.nAdd}Ø${r.trans.inf.sel?.db}` : '—'}</td><td>{x.combo}</td></tr>)}
        </tbody></table>
        <div className="mt-1 text-[11px] text-slate-500">Distribuida: Mu/m = q_u,máx·c²/2 = {kNm(r.trans.inf.MuM * 1000)} kNm/m (gobierna {r.trans.inf.col}, {r.trans.inf.combo}). Bandas: viga transversal de ancho b_col + d cargada con Pu/B.</div>
      </Card>
      <Card title="Corte y punzonamiento">
        <ChecksTable checks={r.checks.filter((c) => c.id.includes('corte') || c.id.includes('punz') || c.id.includes('aplast'))} />
        <div className="mt-3 overflow-x-auto">
          <table className="tbl"><thead><tr><th>Columna</th><th>Tipo</th><th>b0 [mm]</th><th>d [mm]</th><th>Vu [kN]</th><th>Mux / Muy [kNm]</th><th>γvx / γvy</th><th>vc (a/b/c) [MPa]</th><th>vu [MPa]</th><th>φvc [MPa]</th><th>Comb.</th></tr></thead><tbody>
            {[...r.punz, ...(r.punzConjunto ? [r.punzConjunto] : [])].map((x) => (
              <tr key={x.col}><td>{x.col}</td><td>{x.cp.tipo}</td><td>{fmt(x.cp.b0, 0)}</td><td>{fmt(x.d, 0)}</td><td>{kN(x.Vu)}</td><td>{kNm(x.Mux)} / {kNm(x.Muy)}</td><td>{fmt(x.chk.gvx, 2)} / {fmt(x.chk.gvy, 2)}</td><td>{fmt(x.chk.vcA, 2)} / {fmt(x.chk.vcB, 2)} / {fmt(x.chk.vcC, 2)}</td><td className="font-bold">{fmt(x.chk.vu, 3)}</td><td>{fmt(x.chk.phivc, 3)}</td><td>{x.combo}</td></tr>
            ))}
          </tbody></table>
        </div>
      </Card>
    </div>
  );
}

// ---------------- 9. Armaduras ----------------
export function RebarTab({ p, r, go }: TabProps) {
  if (!r) return <Note kind="error">Sin resultados.</Note>;
  const L = r.long, T = r.trans;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[L.inf, L.sup].map((f) => (
          <Card key={f.cara} title={`Longitudinal ${f.cara === 'inf' ? 'inferior' : 'superior'}`}>
            <div className="space-y-0.5 text-[12px]">
              <div>Mu = <b>{kNm(f.Mu)} kNm</b> ({f.combo}) en x = {m(f.x)} m</div>
              <div>b = {m(f.b)} m · d = {fmt(f.d, 0)} mm</div>
              <div>As req = {fmt(f.AsReq, 0)} mm² · As mín = {fmt(f.AsMin, 0)} mm²</div>
              {f.total ? <>
                <div className="text-[14px] font-bold text-accent">{f.total.n} Ø{f.total.db} c/{fmt(f.total.s, 0)} mm</div>
                <div>As = {fmt(f.total.As, 0)} mm² · φMn = {kNm(f.phiMnTot)} kNm</div>
                <div>Continuas: {f.nCont} Ø{f.total.db} (φMn = {kNm(f.phiMnCont)} kNm)</div>
                {f.refuerzos.map((x, i) => <div key={i}>Refuerzo: {x.n} Ø{f.total!.db} de x = {m(x.x1)} a {m(x.x2)} m</div>)}
                <div>εt = {fmt(f.eps, 4)} {f.manual && <Badge e="warn" txt="MANUAL" />}</div>
              </> : <Badge e="fail" txt="NO CABE" />}
            </div>
          </Card>
        ))}
        {[T.inf, T.sup].map((f) => (
          <Card key={f.cara} title={`Transversal ${f.cara === 'inf' ? 'inferior' : 'superior'}`}>
            <div className="space-y-0.5 text-[12px]">
              {f.cara === 'inf' && <div>Mu/m = <b>{kNm(f.MuM * 1000)} kNm/m</b> ({f.combo})</div>}
              <div>d = {fmt(f.d, 0)} mm · As req = {fmt(f.AsReqM, 0)} · As mín = {fmt(f.AsMinM, 0)} mm²/m</div>
              {f.sel ? <>
                <div className="text-[14px] font-bold text-accent">Ø{f.sel.db} c/{fmt(f.sel.s, 0)} mm</div>
                <div>As = {fmt(f.sel.As, 0)} mm²/m{f.cara === 'inf' && ` · φMn = ${kNm(f.phiMnM * 1000)} kNm/m`}</div>
                {f.bandas.filter((x) => x.nAdd).map((x) => <div key={x.colId}>+ {x.nAdd} Ø{f.sel!.db} bajo {x.col}</div>)}
                {f.manual && <Badge e="warn" txt="MANUAL" />}
              </> : <Badge e="fail" txt="NO CABE" />}
            </div>
          </Card>
        ))}
      </div>
      <Note>Altura útil por capa: long. inf. d = {fmt(r.d.LI, 0)} mm · transv. inf. d = {fmt(r.d.TI, 0)} mm · long. sup. d = {fmt(r.d.LS, 0)} mm · transv. sup. d = {fmt(r.d.TS, 0)} mm · punzonamiento d = {fmt(r.d.punz, 0)} mm. Para modificar diámetro y separación manualmente: <button className="underline" onClick={() => go(5)}>Criterios de cálculo</button>.</Note>
      <Card title="Verificaciones de armadura, anclajes y esperas">
        <ChecksTable checks={r.checks.filter((c) => c.grupo === 'est' && !c.id.includes('corte') && !c.id.includes('punz') && !c.id.includes('aplast') && !c.id.startsWith('est-ped-') && !c.id.startsWith('est-pernos'))} />
      </Card>
      <Card title="Barras generadas">
        <table className="tbl"><thead><tr><th>Marca</th><th>Elemento</th><th>Cant.</th><th>Ø</th><th>Long. unit. [m]</th><th>Peso [kg]</th><th>Ubicación</th><th>Observaciones</th></tr></thead><tbody>
          {r.schedule.marcas.map((x) => <tr key={x.marca}><td className="font-bold">{x.marca}</td><td>{x.elemento}</td><td>{x.n}</td><td>{x.db}</td><td>{m(x.lu)}</td><td>{fmt(x.pt, 1)}</td><td>{x.ubic}</td><td className="text-[10px]">{x.obs}</td></tr>)}
        </tbody></table>
        <div className="mt-1 text-[11px] text-slate-500">Las barras no se cortan en el punto teórico de momento nulo: los refuerzos se prolongan máx(d; 12db) más allá de la sección donde dejan de ser necesarios y al menos ld desde la sección de máximo momento. Refuerzos de punzonamiento: no implementados (si no verifica, aumentar h).</div>
      </Card>
      {r.peds.length > 0 && (
        <Card title="Pedestales — columna corta">
          <div className="grid gap-3 lg:grid-cols-2">
            {r.peds.map((pr) => <div key={pr.colId}><div className="mb-1 text-[13px] font-bold">{pr.col} — {pr.bx}×{pr.by} mm, h = {pr.hp} mm</div><PedSummary pr={pr} n={p.norm} /></div>)}
          </div>
          <div className="mt-3"><ChecksTable checks={r.checks.filter((c) => c.id.startsWith('est-ped-') || c.id.startsWith('est-pernos'))} /></div>
        </Card>
      )}
    </div>
  );
}

// ---------------- Resumen ----------------
export function SummaryTab({ p, r, go }: TabProps) {
  if (!r) return <Note kind="error">Sin resultados.</Note>;
  const s = r.shape;
  const sv = r.service.length ? r.service.reduce((a, b) => (b.pf.qmax > a.pf.qmax ? b : a)) : null;
  const svMin = r.service.length ? r.service.reduce((a, b) => (b.pf.qmin < a.pf.qmin ? b : a)) : null;
  const cont = r.service.length ? Math.min(...r.service.map((x) => x.pf.areaComprimida)) : NaN;
  const pz = r.punz.length ? r.punz.reduce((a, b) => (b.chk.ratio > a.chk.ratio ? b : a)) : null;
  const ck = (id: string) => r.checks.find((c) => c.id === id);
  const fails = r.checks.filter((c) => c.estado === 'fail');
  const warns = r.checks.filter((c) => c.estado === 'warn' || c.estado === 'nc');
  const L = r.long, T = r.trans;
  const govMax = r.checks.filter((c) => Number.isFinite(c.ratio) && c.estado !== 'nc').sort((a, b) => b.ratio - a.ratio)[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><AxoView p={p} r={r} height={400} /></div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl p-4 text-white shadow" style={{ background: `linear-gradient(135deg, ${ESTADO_COLOR[r.estado.nivel]}, #0f1d2b 140%)` }}>
            <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">Estado general</div>
            <div className="text-[22px] font-bold leading-tight">{r.estado.texto}</div>
            <div className="mt-1 text-[12px] opacity-90">D/C máx = {fmt(r.estado.maxRatio, 3)}{govMax ? ` (${govMax.titulo}, ${govMax.combo})` : ''}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-white/20 px-2 py-0.5">{fails.length} no verifican</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5">{warns.length} advertencias / no calculadas</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Zapata adoptada</div>
            <div className="mt-1 text-[22px] font-bold text-ink">{m(s.L)} × {m(s.B1)}{p.footing.forma === 'trapezoidal' ? `/${m(s.B2)}` : ''} × {m(p.footing.h)} m</div>
            <div className="text-[12px] text-slate-500">{p.footing.forma} · {p.columns.length} columnas · {p.mat.hormigon.nombre} / {p.mat.acero.nombre}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 py-2"><div className="text-[16px] font-bold">{fmt((r.cantidades.Vh + r.cantidades.Vped) / 1e9, 2)}</div><div className="text-[10px] uppercase text-slate-500">m³ hormigón</div></div>
              <div className="rounded-lg bg-slate-50 py-2"><div className="text-[16px] font-bold">{fmt(r.cantidades.acero, 0)}</div><div className="text-[10px] uppercase text-slate-500">kg acero</div></div>
              <div className="rounded-lg bg-slate-50 py-2"><div className="text-[16px] font-bold">{fmt(r.cantidades.kgm3, 0)}</div><div className="text-[10px] uppercase text-slate-500">kg/m³</div></div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dimensiones" value={`${m(s.L)} × ${m(s.B1)}${p.footing.forma === 'trapezoidal' ? `/${m(s.B2)}` : ''} × ${m(p.footing.h)} m`} sub={p.footing.forma} />
        <Stat label="Hormigón" value={`${fmt((r.cantidades.Vh + r.cantidades.Vped) / 1e9, 2)} m³`} sub={`Limpieza ${fmt(r.cantidades.Vlimp / 1e9, 2)} m³`} />
        <Stat label="Excavación" value={`${fmt(r.cantidades.Vexc / 1e9, 2)} m³`} />
        <Stat label="Acero total" value={`${fmt(r.cantidades.acero, 0)} kg`} sub={`${fmt(r.cantidades.kgm3, 1)} kg/m³ (incl. desperdicio)`} />
        <Stat label="Presión máxima" value={`${sv ? kPa(sv.pf.qmax) : '—'} kPa`} sub={sv?.tot.combo.nombre} e={ck('geo-q')?.estado} />
        <Stat label="Presión mínima" value={`${svMin ? kPa(svMin.pf.qmin) : '—'} kPa`} sub={svMin?.tot.combo.nombre} />
        <Stat label="Contacto" value={`${fmt(cont * 100, 1)} %`} e={ck('geo-contacto')?.estado} />
        <Stat label="Corte máximo (a d)" value={`${kN(r.env.V.V)} kN`} sub={r.env.V.combo} e={ck('est-corte-long')?.estado} />
        <Stat label="M máx positivo" value={`${kNm(r.env.Mpos.M)} kNm`} sub={r.env.Mpos.combo} e={ck('est-flex-inf')?.estado} />
        <Stat label="M máx negativo" value={`${kNm(r.env.Mneg.M)} kNm`} sub={r.env.Mneg.combo} e={ck('est-flex-sup')?.estado} />
        <Stat label="Punzonamiento más exigido" value={pz ? `${pz.col}: ${fmt(pz.chk.ratio, 2)}` : '—'} sub={pz ? `vu = ${fmt(pz.chk.vu, 3)} MPa · ${pz.combo}` : ''} e={pz ? (pz.chk.ratio <= 1 ? 'ok' : 'fail') : 'nc'} />
        <Stat label="D/C máxima" value={fmt(r.estado.maxRatio, 3)} e={r.estado.maxRatio <= 1 ? 'ok' : 'fail'} />
      </div>
      <Card title="Armaduras principales">
        <div className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div>Longitudinal inferior: <b>{L.inf.total ? `${L.inf.total.n}Ø${L.inf.total.db} (${L.inf.nCont} continuas)` : '—'}</b></div>
          <div>Longitudinal superior: <b>{L.sup.total ? `${L.sup.total.n}Ø${L.sup.total.db} (${L.sup.nCont} continuas)` : '—'}</b></div>
          <div>Transversal inferior: <b>{T.inf.sel ? `Ø${T.inf.sel.db} c/${T.inf.sel.s}` : '—'}</b>{T.inf.bandas.filter((b) => b.nAdd).map((b) => ` + ${b.nAdd}Ø${T.inf.sel?.db} bajo ${b.col}`).join('')}</div>
          <div>Transversal superior: <b>{T.sup.sel ? `Ø${T.sup.sel.db} c/${T.sup.sel.s}` : '—'}</b></div>
        </div>
      </Card>
      <Card title="Combinaciones gobernantes">
        <table className="tbl"><thead><tr><th>Verificación</th><th>Combinación</th><th>D/C</th><th>Estado</th></tr></thead><tbody>
          {r.checks.filter((c) => c.combo !== '—' && Number.isFinite(c.ratio)).sort((a, b) => b.ratio - a.ratio).slice(0, 12).map((c) => <tr key={c.id}><td>{c.titulo}</td><td>{c.combo}</td><td>{fmt(c.ratio, 3)}</td><td><Badge e={c.estado} /></td></tr>)}
        </tbody></table>
      </Card>
      <Card title="Advertencias y pendientes">
        <div className="space-y-1">
          {fails.map((c) => <Note key={c.id} kind="error">{c.titulo}: {c.sustitucion}</Note>)}
          {r.issues.map((i, k) => <Note key={k} kind={i.nivel === 'error' ? 'error' : i.nivel === 'warn' ? 'warn' : 'info'}>{i.msg}</Note>)}
          {r.advertenciasModelo.map((t, k) => <Note key={`m${k}`} kind="warn">{t}</Note>)}
          {warns.map((c) => <Note key={c.id} kind="warn">{c.titulo}: {c.nota ?? c.sustitucion}</Note>)}
        </div>
        <div className="mt-2 flex gap-2 text-[12px]"><button className="text-accent underline" onClick={() => go(10)}>Ver memoria</button><button className="text-accent underline" onClick={() => go(9)}>Ver planos</button></div>
      </Card>
    </div>
  );
}
