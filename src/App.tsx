import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze, type Results } from './core/analysis';
import type { Project } from './core/types';
import { exampleProject } from './data/example';
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
  'Resultados geotécnicos', 'Esfuerzos', 'Armaduras', 'Planos y despiece', 'Memoria de cálculo', 'Resumen',
];
const KEY = 'zapatas-combinadas:v1';

function load(): Project {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const p = JSON.parse(s) as Project;
      p.norm = { ...structuredClone(NORM_DEFAULT), ...p.norm };
      p.casos ??= [];
      p.plantillas ??= [];
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
    if (i === 8) return pick((id) => id.includes('flex') || id.includes('rho') || id.includes('sep') || id.includes('anc') || id.includes('banda'));
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
      <header className="no-print flex flex-wrap items-center gap-3 bg-ink px-4 py-2 text-white">
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
              q.casos ??= [];
              q.plantillas ??= [];
              setP(q);
            } catch (er) { alert(`No se pudo abrir el archivo: ${er}`); }
            e.target.value = '';
          }} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className={`no-print ${menu ? 'block' : 'hidden'} absolute z-40 h-full w-60 shrink-0 overflow-y-auto bg-steel py-2 md:static md:block`}>
          {TABS.map((t, i) => {
            const st = tabState(i);
            return (
              <button key={t} onClick={() => { setTab(i); setMenu(false); }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] ${tab === i ? 'bg-white/15 font-bold text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tab === i ? 'bg-accent text-white' : 'bg-white/10'}`}>{i < 11 ? i + 1 : 'Σ'}</span>
                <span className="flex-1">{t}</span>
                {st && <span className="h-2.5 w-2.5 rounded-full" style={{ background: ESTADO_COLOR[st as keyof typeof ESTADO_COLOR] }} />}
              </button>
            );
          })}
          <div className="mt-4 px-4 text-[10px] leading-snug text-slate-400">
            Herramienta de asistencia al cálculo. No reemplaza la revisión de un ingeniero estructural matriculado.
          </div>
        </nav>
        <main className="print-root min-w-0 flex-1 overflow-y-auto p-3 md:p-5">
          {err && <div className="mb-3 rounded border-l-4 border-fail bg-red-50 px-3 py-2 text-sm">Error de cálculo: {err}</div>}
          <h2 className="no-print mb-3 text-[20px] font-bold text-ink">{tab < 11 ? `${tab + 1}. ` : ''}{TABS[tab]}</h2>
          <ErrorBoundary resetKey={`${tab}|${JSON.stringify(p).length}`}>{body}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
