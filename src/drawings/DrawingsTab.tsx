import { useMemo, useRef, useState } from 'react';
import type { TabProps } from '../App';
import { Btn, Card, Note, download } from '../ui/components';
import { LAYERS, type Layer } from './model';
import { SvgDrawing, printHTML, svgToPng, toDXF } from './render';
import { BendingSchedule } from './Schedule';
import { ESCALAS, sheetA2 } from './sheet';

export function DrawingsTab({ p, r }: TabProps) {
  const [esc, setEsc] = useState<number | 'auto'>('auto');
  const [zoom, setZoom] = useState(1);
  const [mono, setMono] = useState(false);
  const [layers, setLayers] = useState<Set<Layer>>(new Set(LAYERS.map((l) => l.id)));
  const ref = useRef<SVGSVGElement | null>(null);
  const sheet = useMemo(() => (r ? sheetA2(p, r, esc) : null), [p, r, esc]);
  if (!r || !sheet) return <Note kind="error">Sin resultados.</Note>;
  const name = `${p.meta.codigo || 'zapata'}-A2`;
  const exportSvg = () => { if (ref.current) download(`${name}.svg`, new XMLSerializer().serializeToString(ref.current), 'image/svg+xml'); };
  const print = () => {
    if (!ref.current) return;
    const c = ref.current.cloneNode(true) as SVGSVGElement;
    c.setAttribute('width', '594mm');
    c.setAttribute('height', '420mm');
    c.removeAttribute('style');
    printHTML(`<div>${c.outerHTML}</div>`, '594mm 420mm', '0');
  };
  return (
    <div className="space-y-4">
      <Card title="Plano A2 — encofrado y armadura">
        <div className="flex flex-wrap items-end gap-3 text-[12px]">
          <label>Escala de plantas y cortes<br />
            <select className="rounded border px-2 py-1" value={esc} onChange={(e) => setEsc(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
              <option value="auto">Automática (mayor que entra)</option>
              {ESCALAS.filter((e) => e >= 20).map((s) => <option key={s} value={s}>1:{s}</option>)}
            </select>
          </label>
          <div>Zoom<br /><div className="flex gap-1"><Btn onClick={() => setZoom(Math.max(0.5, zoom / 1.25))}>−</Btn><Btn onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</Btn><Btn onClick={() => setZoom(Math.min(8, zoom * 1.25))}>+</Btn></div></div>
          <label className="flex items-center gap-1 pb-1"><input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />Monocromo</label>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Btn onClick={exportSvg}>SVG</Btn>
            <Btn onClick={() => ref.current && svgToPng(ref.current, `${name}.png`, 6, 1)}>PNG</Btn>
            <Btn onClick={() => download(`${name}.dxf`, toDXF([sheet.drawing], 1, layers), 'application/dxf')}>DXF</Btn>
            <Btn kind="pri" onClick={print}>Imprimir / PDF A2</Btn>
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
        <div className="mt-2 space-y-1">
          {!sheet.ajusta && <Note kind="warn">Con la escala 1:{sheet.k} las vistas no entran en la hoja A2: elija una escala menor (denominador mayor) o "Automática".</Note>}
          <div className="text-[11px] text-slate-500">Hoja A2 594×420 mm con grilla de zonas, rótulo, notas y planilla de doblado. Plantas y cortes a 1:{sheet.k}; textos de 2 mm en papel. "Imprimir / PDF A2" respeta el tamaño real (elegir "Guardar como PDF" y tamaño A2 si el diálogo lo solicita). DXF R12 en mm de papel, por capas.</div>
        </div>
      </Card>
      <div className="overflow-auto rounded-xl border border-slate-300 bg-slate-600 p-3 shadow-inner" style={{ maxHeight: '82vh' }}>
        <div className="mx-auto shadow-2xl" style={{ width: `${zoom * 100}%`, minWidth: 600 }}>
          <SvgDrawing ref={ref} d={sheet.drawing} k={1} layers={layers} mono={mono} />
        </div>
      </div>
      <Card title="Planilla de doblado (detalle)"><BendingSchedule p={p} r={r} /></Card>
    </div>
  );
}
