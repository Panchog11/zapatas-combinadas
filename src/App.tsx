import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze, type Results } from './core/analysis';
import type { Project } from './core/types';
import { exampleProject, migrar } from './data/example';
import { Badge, Btn, download, ESTADO_COLOR } from './ui/components';
import { ProjectTab, GeometryTab, ColumnsTab, GeoTab, MaterialsTab, CriteriaTab } from './ui/InputTabs';
import { GeoResultsTab, ForcesTab, RebarTab, SummaryTab } from './ui/ResultTabs';
import { DrawingsTab } from './drawings/DrawingsTab';
import { ReportTab } from './report/ReportTab';
import { NORM_DEFAULT } from './norm/config';
import { ErrorBoundary } from './ui/ErrorBoundary';

export interface TabProps { p: Project; set: (fn: (d: Project) => void) => void; r: Results | null; go: (t: number) => void }

const TABS = [
  'Proyecto y normativa', 'Geometría', 'Columnas y cargas', 'Geotecnia', 'Materiales', 'Criterios de cálculo',
  'Resultados geotécnicos', 'Esfuerzos', 'Armaduras', 'Planos y despiece', 'Memoria de cálculo', 'Resumen y vista 3D',
];
const GRUPOS: [string, number[]][] = [['Inicio', [11]], ['Datos', [0, 1, 2, 3, 4, 5]], ['Resultados', [6, 7, 8]], ['Documentación', [9, 10]]];
const ORDEN = GRUPOS.flatMap(([, i]) => i);
const KEY = 'zapatas-combinadas:v1';

function load(): Project {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const p = JSON.parse(s) as Project;
      p.norm = { ...structuredClone(NORM_DEFAULT), ...p.norm };
      migrar(p);
      return p;
    }
  } catch { /* proyecto corrupto: se usa el ejemplo */ }
  return exampleProject();
}

export default function App() {
  const [p, setP] = useState<Project>(load);
  const [tab, setTab] = useState(11);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ } }, 400);
    return () => clearTimeout(t);
  }, [p]);
  const set = (fn: (d: Project) => void) => setP((prev) => { const d = structuredClone(prev); fn(d); return d; });
  const { r, err } = useMemo(() => {
    try { return { r: analyze(p), err: '' }; } catch (e) { return { r: null, err: String(e) }; }
  }, [p]);

  const tabState = (i: number) => {
    if (!r) return 'nc';
    const pick = (g: (id: string) => boolean) => {
      const cs = r.checks.filter((c) => g(c.id));
      return cs.some((c) => c.estado === 'fail') ? 'fail' : cs.some((c) => c.estado === 'warn') ? 'warn' : cs.length ? 'ok' : 'nc';
    };
    if (i === 6) return pick((id) => id.startsWith('geo'));
    if (i === 7) return pick((id) => id.includes('corte') || id.includes('punz'));
    if (i === 8) return pick((id) => id.includes('flex') || id.includes('rho') || id.includes('sep') || id.includes('anc') || id.includes('banda') || id.startsWith('est-ped'));
    if (i === 11) return r.estado.nivel;
    return null;
  };

  const props: TabProps = { p, set, r, go: setTab };
  const body = [
    <ProjectTab {...props} />, <GeometryTab {...props} />, <ColumnsTab {...props} />, <GeoTab {...props} />,
    <MaterialsTab {...props} />, <CriteriaTab {...props} />, <GeoResultsTab {...props} />, <ForcesTab {...props} />,
    <RebarTab {...props} />, <DrawingsTab {...props} />, <ReportTab {...props} />, <SummaryTab {...props} />,
  ][tab];

  return (
    <div className="flex h-full flex-col">
      <header className="no-print z-10 flex flex-wrap items-center gap-3 border-b-2 border-accent bg-ink px-4 py-2.5 text-white shadow-md">
        <button className="rounded border border-white/30 px-2 py-0.5 text-sm md:hidden" onClick={() => setMenu(!menu)}>☰</button>
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden><rect x="2" y="15" width="22" height="7" fill="#0e7c86" /><rect x="6" y="4" width="4" height="11" fill="#cbd5e1" /><rect x="16" y="4" width="4" height="11" fill="#cbd5e1" /></svg>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">Zapatas combinadas H°A°</div>
          <div className="truncate text-[15px] font-bold">{p.meta.obra || 'Proyecto sin nombre'} <span className="font-normal text-slate-400">· {p.meta.codigo}</span></div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {r && <Badge e={r.estado.nivel} txt={r.estado.texto} />}
          <Btn onClick={() => { if (confirm('¿Cargar el ejemplo de validación? Se perderán los datos no guardados.')) setP(exampleProject()); }}>Ejemplo</Btn>
          <Btn onClick={() => fileRef.current?.click()}>Abrir JSON</Btn>
          <Btn kind="pri" onClick={() => download(`${p.meta.codigo || 'proyecto'}.json`, JSON.stringify(p, null, 1), 'application/json')}>Guardar JSON</Btn>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const q = JSON.parse(await f.text()) as Project;
              if (!q.footing || !q.columns || !q.combos) throw new Error('Formato no reconocido');
              q.norm = { ...structuredClone(NORM_DEFAULT), ...q.norm };
              migrar(q);
              setP(q);
            } catch (er) { alert(`No se pudo abrir el archivo: ${er}`); }
            e.target.value = '';
          }} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className={`no-print ${menu ? 'block' : 'hidden'} absolute z-40 h-full w-64 shrink-0 overflow-y-auto bg-gradient-to-b from-steel to-ink py-3 md:static md:block`}>
          {GRUPOS.map(([g, idx]) => (
            <div key={g} className="mb-2">
              <div className="px-5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{g}</div>
              {idx.map((i) => {
                const st = tabState(i);
                const act = tab === i;
                return (
                  <button key={i} onClick={() => { setTab(i); setMenu(false); }}
                    className={`group mx-2 flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition ${act ? 'bg-white text-ink shadow' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${act ? 'bg-accent text-white' : 'bg-white/10'}`}>{i < 11 ? i + 1 : '★'}</span>
                    <span className={`flex-1 ${act ? 'font-bold' : ''}`}>{TABS[i]}</span>
                    {st && <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/20" style={{ background: ESTADO_COLOR[st as keyof typeof ESTADO_COLOR] }} />}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="mx-4 mt-4 rounded-lg bg-white/5 p-3 text-[10px] leading-snug text-slate-400">
            Herramienta de asistencia al cálculo. No reemplaza la revisión de un ingeniero estructural matriculado.
          </div>
        </nav>
        <main className="print-root min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_right,#dbe7ef,transparent_45%)] p-3 md:p-6">
          {err && <div className="mb-3 rounded border-l-4 border-fail bg-red-50 px-3 py-2 text-sm">Error de cálculo: {err}</div>}
          <div className="no-print mb-4 flex items-end justify-between gap-3 border-b border-slate-300/70 pb-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">{GRUPOS.find(([, idx]) => idx.includes(tab))?.[0]}</div>
              <h2 className="text-[24px] font-bold leading-tight text-ink">{TABS[tab]}</h2>
            </div>
            <div className="hidden gap-1.5 sm:flex">
              <button disabled={ORDEN.indexOf(tab) <= 0} onClick={() => setTab(ORDEN[ORDEN.indexOf(tab) - 1])} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-[12px] font-semibold text-steel shadow-sm disabled:opacity-30">← Anterior</button>
              <button disabled={ORDEN.indexOf(tab) >= ORDEN.length - 1} onClick={() => setTab(ORDEN[ORDEN.indexOf(tab) + 1])} className="rounded-lg bg-accent px-3 py-1 text-[12px] font-semibold text-white shadow-sm disabled:opacity-30">Siguiente →</button>
            </div>
          </div>
          <ErrorBoundary resetKey={`${tab}|${JSON.stringify(p).length}`}>{body}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
