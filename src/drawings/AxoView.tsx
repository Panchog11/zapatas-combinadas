import { useMemo, useRef, useState } from 'react';
import type { Results } from '../core/analysis';
import type { Project } from '../core/types';
import { fmt } from '../core/units';
import { build3D, projectFaces, projector, shade, type V3 } from './axo';

const LC = { inf: '#c2410c', sup: '#7c3aed', espera: '#15803d', eje: '#64748b' };

/** Axonometría interactiva de la zapata: arrastrar para girar */
export function AxoView({ p, r, height = 420 }: { p: Project; r: Results; height?: number }) {
  const [az, setAz] = useState(32);
  const [el, setEl] = useState(28);
  const [rebar, setRebar] = useState(false);
  const [cotas, setCotas] = useState(true);
  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null);
  const m = useMemo(() => build3D(p, r, rebar), [p, r, rebar]);
  const s = r.shape, f = p.footing;
  const faces = projectFaces(m, az, el);
  const { P } = projector(az, el);
  const all = faces.flatMap((x) => x.q);
  const xs = all.map((q) => q.x), ys = all.map((q) => q.y);
  const pad = 0.12 * Math.max(s.L, s.Bmax);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const fs = Math.max(x1 - x0, y1 - y0) / 55;
  const pt = (v: V3) => { const q = P(v); return `${q.x},${-q.y}`; };
  const lbl = (a: V3, b: V3, t: string, off: V3) => {
    const qa = P([a[0] + off[0], a[1] + off[1], a[2] + off[2]]), qb = P([b[0] + off[0], b[1] + off[1], b[2] + off[2]]);
    return (
      <g>
        <line x1={qa.x} y1={-qa.y} x2={qb.x} y2={-qb.y} stroke="#0e5a8a" strokeWidth={fs / 14} />
        <text x={(qa.x + qb.x) / 2} y={-(qa.y + qb.y) / 2 - fs * 0.35} fontSize={fs} fill="#0e5a8a" textAnchor="middle" fontWeight="bold" paintOrder="stroke" stroke="#fff" strokeWidth={fs / 4}>{t}</text>
      </g>
    );
  };
  const yFront = -s.B1 / 2;
  return (
    <div>
      <div
        className="relative cursor-grab touch-none select-none overflow-hidden rounded-lg bg-gradient-to-b from-slate-50 to-slate-200 active:cursor-grabbing"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, az, el }; }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          setAz(d.az - (e.clientX - d.x) * 0.4);
          setEl(Math.max(5, Math.min(85, d.el + (e.clientY - d.y) * 0.3)));
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <svg viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`} style={{ width: '100%', height }} preserveAspectRatio="xMidYMid meet">
          {faces.map(({ f, q }, i) => (
            <polygon key={i} points={q.map((v) => `${v.x},${-v.y}`).join(' ')} fill={shade(f, rebar && f.kind !== 'limpieza' ? 0.28 : 1)}
              stroke="#334155" strokeWidth={fs / 18} strokeLinejoin="round" />
          ))}
          {m.lines.map((l, i) => <polyline key={i} points={`${pt(l.a)} ${pt(l.b)}`} stroke={LC[l.kind]} strokeWidth={fs / (l.kind === 'espera' ? 7 : 10)} fill="none" />)}
          {cotas && <>
            {lbl([0, yFront, 0], [s.L, -s.B2 / 2, 0], `L = ${fmt(s.L / 1000)} m`, [0, -pad * 0.35, 0])}
            {lbl([s.L, -s.B2 / 2, 0], [s.L, s.B2 / 2, 0], `B = ${fmt(s.B2 / 1000)} m`, [pad * 0.35, 0, 0])}
            {lbl([0, yFront, 0], [0, yFront, f.h], `h = ${fmt(f.h / 1000)} m`, [-pad * 0.3, -pad * 0.1, 0])}
            {p.columns.map((c) => {
              const x = c.x - f.x0, y = c.y - f.y0;
              const zTop = f.h + (c.ped.activo ? c.ped.h : 0) + Math.max(600, 0.15 * s.L);
              const q = P([x, y, zTop]);
              return <text key={c.id} x={q.x} y={-q.y - fs * 0.6} fontSize={fs * 1.1} textAnchor="middle" fontWeight="bold" fill="#0f1d2b" paintOrder="stroke" stroke="#fff" strokeWidth={fs / 4}>{c.nombre}</text>;
            })}
          </>}
        </svg>
        <div className="pointer-events-none absolute left-3 top-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Axonometría · arrastrar para girar</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {[['Isométrica', 32, 28], ['Frontal', 0, 12], ['Lateral', 90, 12], ['Superior', 0, 85]].map(([t, a, e]) => (
          <button key={t as string} onClick={() => { setAz(a as number); setEl(e as number); }} className="rounded-full border border-slate-300 bg-white px-3 py-0.5 font-semibold text-steel hover:border-accent hover:text-accent">{t}</button>
        ))}
        <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={rebar} onChange={(e) => setRebar(e.target.checked)} />Mostrar armaduras</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={cotas} onChange={(e) => setCotas(e.target.checked)} />Cotas</label>
        {rebar && <span className="flex gap-3 text-[11px]"><span style={{ color: LC.inf }}>■ inferior</span><span style={{ color: LC.sup }}>■ superior</span><span style={{ color: LC.espera }}>■ esperas</span></span>}
      </div>
    </div>
  );
}
