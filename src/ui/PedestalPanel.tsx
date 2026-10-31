import type { TabProps } from '../App';
import { Badge, Card, Note } from './components';
import type { Apoyo, Column } from '../core/types';
import type { PedRes } from '../core/analysis';
import { contour } from '../core/pedestal';
import { fmt } from '../core/units';
import type { NormConfig } from '../norm/config';

const APOYO: [Apoyo, string][] = [['hormigon', 'Columna de H°A°'], ['metalica', 'Columna metálica'], ['equipo', 'Equipo']];
const DIAM = [10, 12, 16, 20, 25, 32];
const num = (s: string) => Number(s.replace(',', '.'));

/** Apoyos y pedestales: tipo de elemento apoyado, altura y armado del pedestal */
export function PedestalPanel({ p, set, r }: Pick<TabProps, 'p' | 'set' | 'r'>) {
  const upd = (id: string, fn: (c: Column) => void) => set((d) => fn(d.columns.find((x) => x.id === id)!));
  const fL = p.units.length === 'm' ? 1000 : p.units.length === 'cm' ? 10 : 1;
  return (
    <Card title="Apoyos y pedestales (columna corta)">
      <div className="grid gap-4 xl:grid-cols-2">
        {p.columns.map((c) => {
          const pr = r?.peds.find((q) => q.colId === c.id);
          const est = pr && r ? r.checks.filter((k) => k.id.startsWith('est-ped-') && k.id.endsWith(`-${c.id}`)) : [];
          const worst = est.some((k) => k.estado === 'fail') ? 'fail' : est.some((k) => k.estado === 'warn') ? 'warn' : 'ok';
          const a = c.ped.arm; // en modo automático se muestran los valores adoptados
          return (
            <div key={c.id} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="text-[15px] font-bold text-ink">{c.nombre}</span>
                <select className="rounded border border-slate-300 px-2 py-1 text-[12px]" value={c.apoyo} onChange={(e) => upd(c.id, (x) => { x.apoyo = e.target.value as Apoyo; })}>
                  {APOYO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[12px] font-semibold"><input type="checkbox" checked={c.ped.activo} onChange={(e) => upd(c.id, (x) => { x.ped.activo = e.target.checked; })} />Pedestal</label>
                {pr && <span className="ml-auto"><Badge e={worst} /></span>}
              </div>
              <div className="text-[11px] text-slate-500">
                {c.apoyo === 'hormigon' ? 'Se generan esperas de la columna empalmadas sobre el ' + (c.ped.activo ? 'pedestal.' : 'tope de la zapata.') : 'Sin esperas: pernos de anclaje y placa base no calculados (verificar con el fabricante).'}
                {' '}Sección del apoyo (bx × by de la tabla de columnas): {c.forma === 'circ' ? `Ø${c.D}` : `${c.bx}×${c.by}`} mm.
              </div>
              {c.ped.activo && (
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600"><span>Altura del pedestal</span><span className="text-[13px] text-ink">{fmt(c.ped.h / fL, fL === 1 ? 0 : 2)} {p.units.length}</span></div>
                    <input type="range" min={100} max={3000} step={50} value={c.ped.h} className="w-full accent-accent" onChange={(e) => upd(c.id, (x) => { x.ped.h = Number(e.target.value); })} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px]">
                    {(['h', 'bx', 'by', 'rec'] as const).map((k) => (
                      <label key={k} className="font-semibold text-slate-600">{k === 'h' ? 'h' : k === 'rec' ? 'Recubr.' : k} [mm]
                        <input className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-[12px] font-normal" value={c.ped[k]} onChange={(e) => { const v = num(e.target.value); if (v > 0) upd(c.id, (x) => { x.ped[k] = v; }); }} />
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-end gap-2 text-[11px]">
                    <label className="flex items-center gap-1 pb-1 font-semibold"><input type="checkbox" checked={a.auto} onChange={(e) => upd(c.id, (x) => { x.ped.arm.auto = e.target.checked; if (!e.target.checked && pr) x.ped.arm = { ...pr.des.arm, auto: false }; })} />Armado automático</label>
                    {([['nx', 'n cara X'], ['ny', 'n cara Y'], ['db', 'Ø long.'], ['dbE', 'Ø estribo'], ['sE', 's estribo']] as const).map(([k, l]) => (
                      <label key={k} className="w-16 font-semibold text-slate-600">{l}
                        {k === 'db' || k === 'dbE'
                          ? <select disabled={a.auto} className="w-full rounded border border-slate-300 text-[12px] font-normal" value={a.auto && pr ? pr.des.arm[k] : a[k]} onChange={(e) => upd(c.id, (x) => { x.ped.arm[k] = Number(e.target.value); })}>{(k === 'dbE' ? [6, 8, 10, 12] : DIAM).map((d) => <option key={d} value={d}>Ø{d}</option>)}</select>
                          : <input disabled={a.auto} className="w-full rounded border border-slate-300 px-1 text-[12px] font-normal" value={a.auto && pr ? pr.des.arm[k] : a[k]} onChange={(e) => { const v = Math.round(num(e.target.value)); if (v >= (k === 'sE' ? 50 : 2)) upd(c.id, (x) => { x.ped.arm[k] = v; }); }} />}
                      </label>
                    ))}
                  </div>
                  {pr && <PedSummary pr={pr} n={p.norm} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 space-y-1">
        <Note>Las cargas N, Vx, Vy, Mx, My, Mz se aplican en el tope del pedestal (más la altura adicional "z carga"), sin importar el elemento apoyado. En la base del pedestal: Mx,b = Mx − (h_ped + z)·Vy ; My,b = My + (h_ped + z)·Vx. Se suma {fmt(p.norm.ped.gammaPP, 1)}·peso propio del pedestal.</Note>
        <Note kind="warn">Pedestal diseñado como columna corta: flexo-compresión biaxial por compatibilidad de deformaciones, corte, umbral de torsión, esbeltez, aplastamiento y anclaje. No incluye armadura de torsión ni efectos de segundo orden.</Note>
      </div>
    </Card>
  );
}

/** Resumen del armado y diagrama de interacción Mx–My al nivel de la carga gobernante */
export function PedSummary({ pr, n }: { pr: PedRes; n: NormConfig }) {
  const d = pr.des, a = d.arm, g = d.pm.d;
  const cs = g ? contour(d.sec, g.Pu, n, 48) : [];
  const S = 160, mx = Math.max(1, ...cs.map(([x, y]) => Math.hypot(x, y)), g ? Math.hypot(g.My, g.Mx) : 1) * 1.15;
  const X = (v: number) => S / 2 + (v / mx) * (S / 2 - 8), Y = (v: number) => S / 2 - (v / mx) * (S / 2 - 8);
  return (
    <div className="grid gap-3 rounded-lg bg-slate-50 p-2 sm:grid-cols-[1fr_auto]">
      <div className="space-y-0.5 text-[12px]">
        <div className="text-[14px] font-bold text-accent">{2 * a.nx + 2 * a.ny - 4} Ø{a.db} + E Ø{a.dbE} c/{a.sE}</div>
        <div>ρ = {fmt(d.rho * 100, 2)} % · As = {fmt(d.sec.As, 0)} mm²</div>
        <div>D/C flexo-compresión = <b>{fmt(d.pm.ratio, 2)}</b> ({g?.combo})</div>
        <div>D/C corte = <b>{fmt(d.corte.ratio, 2)}</b> · Torsión {d.torsion.ok ? 'despreciable' : 'supera umbral'}</div>
        <div>Esbeltez k·lu/r = {fmt(d.esbeltez, 1)}</div>
        {g && <div className="text-slate-500">Pu = {fmt(g.Pu / 1e3, 0)} kN · Mux = {fmt(g.Mx / 1e6, 1)} · Muy = {fmt(g.My / 1e6, 1)} kNm (base)</div>}
      </div>
      {g && (
        <svg width={S} height={S} className="rounded bg-white">
          <line x1={0} x2={S} y1={S / 2} y2={S / 2} stroke="#cbd5e1" /><line y1={0} y2={S} x1={S / 2} x2={S / 2} stroke="#cbd5e1" />
          <polygon points={cs.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} fill="#0e7c8622" stroke="#0e7c86" strokeWidth="1.5" />
          <circle cx={X(g.My)} cy={Y(-g.Mx)} r="4" fill={d.pm.ratio <= 1 ? '#16a34a' : '#dc2626'} />
          <text x={4} y={11} fontSize="9" fill="#64748b">φMn(Pu) — My / −Mx</text>
        </svg>
      )}
    </div>
  );
}
