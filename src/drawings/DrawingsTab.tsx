import { useMemo, useRef, useState } from 'react';
import type { TabProps } from '../App';
import { Btn, Card, Note, download } from '../ui/components';
import { LAYERS, longSection, planDrawing, transSection, type Layer } from './model';
import { SvgDrawing, printHTML, svgToPng, toDXF } from './render';
import { BendingSchedule } from './Schedule';

const SCALES = [20, 25, 50, 75, 100];

export function DrawingsTab({ p, r }: TabProps) {
  const [k, setK] = useState(50);
  const [custom, setCustom] = useState('');
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState<'A4 landscape' | 'A3 landscape' | 'A4 portrait' | 'A3 portrait'>('A3 landscape');
  const [mono, setMono] = useState(false);
  const [layers, setLayers] = useState<Set<Layer>>(new Set(LAYERS.map((l) => l.id)));
  const [view, setView] = useState<'planta' | 'cA' | 'cB' | 'todo'>('todo');
  const refs = useRef<Record<string, SVGSVGElement | null>>({});
  const ds = useMemo(() => (r ? [planDrawing(p, r, k), longSection(p, r, k), transSection(p, r, k)] : []), [p, r, k]);
  if (!r) return <Note kind="error">Sin resultados.</Note>;
  const shown = view === 'todo' ? ds : ds.filter((d) => d.id === view);
  const svgOf = (id: string) => refs.current[id];
  const exportSvg = () => shown.forEach((d) => { const s = svgOf(d.id); if (s) download(`${p.meta.codigo}-${d.id}.svg`, new XMLSerializer().serializeToString(s), 'image/svg+xml'); });
  const exportPng = () => shown.forEach((d) => { const s = svgOf(d.id); if (s) svgToPng(s, `${p.meta.codigo}-${d.id}.png`, 8, k); });
  const print = () => {
    const html = shown.map((d) => {
      const s = svgOf(d.id);
      if (!s) return '';
      const c = s.cloneNode(true) as SVGSVGElement;
      const vb = s.viewBox.baseVal;
      c.setAttribute('width', `${vb.width / k}mm`);
      c.setAttribute('height', `${vb.height / k}mm`);
      return `<div class="pg"><div style="font:bold 12pt Arial;margin-bottom:4mm">${p.meta.obra} — ${d.title} — Esc. 1:${k}</div>${c.outerHTML}</div>`;
    }).join('');
    printHTML(html, page);
  };
  return (
    <div className="space-y-4">
      <Card title="Controles">
        <div className="flex flex-wrap items-end gap-3 text-[12px]">
          <label>Vista<br /><select className="rounded border px-2 py-1" value={view} onChange={(e) => setView(e.target.value as typeof view)}><option value="todo">Planta + cortes</option><option value="planta">Planta</option><option value="cA">Corte A-A</option><option value="cB">Corte B-B</option></select></label>
          <label>Escala<br /><select className="rounded border px-2 py-1" value={SCALES.includes(k) ? k : 'otra'} onChange={(e) => { if (e.target.value !== 'otra') setK(Number(e.target.value)); }}>{SCALES.map((s) => <option key={s} value={s}>1:{s}</option>)}<option value="otra">Otra…</option></select></label>
          <label>Otra escala 1:<br /><input className="w-16 rounded border px-2 py-1" value={custom} onChange={(e) => { setCustom(e.target.value); const v = Number(e.target.value); if (v >= 5 && v <= 500) setK(v); }} /></label>
          <label>Hoja<br /><select className="rounded border px-2 py-1" value={page} onChange={(e) => setPage(e.target.value as typeof page)}><option>A3 landscape</option><option>A4 landscape</option><option>A3 portrait</option><option>A4 portrait</option></select></label>
          <div>Zoom<br /><div className="flex gap-1"><Btn onClick={() => setZoom(Math.max(0.25, zoom / 1.25))}>−</Btn><Btn onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</Btn><Btn onClick={() => setZoom(Math.min(6, zoom * 1.25))}>+</Btn></div></div>
          <label className="flex items-center gap-1 pb-1"><input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />Monocromo</label>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Btn onClick={exportSvg}>SVG</Btn><Btn onClick={exportPng}>PNG</Btn>
            <Btn onClick={() => download(`${p.meta.codigo}-planos.dxf`, toDXF(ds, k, layers), 'application/dxf')}>DXF básico</Btn>
            <Btn kind="pri" onClick={print}>Imprimir / PDF</Btn>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {LAYERS.map((l) => (
            <label key={l.id} className="flex items-center gap-1 text-[12px]">
              <input type="checkbox" checked={layers.has(l.id)} onChange={(e) => { const s = new Set(layers); if (e.target.checked) s.add(l.id); else s.delete(l.id); setLayers(s); }} />
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />{l.nombre}
            </label>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">Textos dimensionados en mm de papel según la escala elegida. "Imprimir / PDF" respeta la escala real en la hoja seleccionada (elegir "Guardar como PDF" en el diálogo). DXF R12 con entidades LINE, CIRCLE y TEXT por capa; no se genera DWG.</div>
      </Card>
      {shown.map((d) => (
        <Card key={d.id} title={`${d.title} — Esc. 1:${k}`}>
          <div className="overflow-auto rounded border border-slate-200" style={{ maxHeight: '75vh' }}>
            <div style={{ width: `${zoom * 100}%`, minWidth: 320 }}>
              <SvgDrawing ref={(el) => { refs.current[d.id] = el; }} d={d} k={k} layers={layers} mono={mono} />
            </div>
          </div>
        </Card>
      ))}
      <Card title="Planilla de doblado"><BendingSchedule p={p} r={r} /></Card>
    </div>
  );
}
