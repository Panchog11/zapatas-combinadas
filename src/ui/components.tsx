import { useEffect, useState, type ReactNode } from 'react';
import { fromInternal, toInternal, unitOf, type Qty, type UnitPrefs } from '../core/units';
import type { Estado } from '../core/types';

export const ESTADO_COLOR: Record<Estado, string> = { ok: '#16a34a', warn: '#d97706', fail: '#dc2626', nc: '#94a3b8' };
export const ESTADO_TXT: Record<Estado, string> = { ok: 'VERIFICA', warn: 'ADVERTENCIA', fail: 'NO VERIFICA', nc: 'NO CALCULADO' };

export function Badge({ e, txt }: { e: Estado; txt?: string }) {
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white whitespace-nowrap" style={{ background: ESTADO_COLOR[e] }}>
      {txt ?? ESTADO_TXT[e]}
    </span>
  );
}

export function Tip({ t }: { t?: string }) {
  if (!t) return null;
  return (
    <span className="group relative ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-300 text-[9px] font-bold text-slate-700">
      ?
      <span className="pointer-events-none absolute bottom-5 left-1/2 z-50 hidden w-64 -translate-x-1/2 rounded bg-ink px-2 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg group-hover:block">
        {t}
      </span>
    </span>
  );
}

export function Card({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-steel">{title}</h3>
          {right}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

export function Grid({ children, cols = 3 }: { children: ReactNode; cols?: number }) {
  const c = cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-2 ${c}`}>{children}</div>;
}

function Label({ label, tip }: { label: string; tip?: string }) {
  return (
    <span className="mb-0.5 flex items-center text-[11px] font-semibold text-slate-600">
      {label}
      <Tip t={tip} />
    </span>
  );
}

const parse = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

/** Campo numérico con conversión de unidades (valor interno N, mm, MPa) */
export function Num({
  label, value, onChange, q = 'none', u, tip, min, max, allowNull, step, disabled, unit,
}: {
  label: string; value: number | null; onChange: (v: number | null) => void; q?: Qty; u: UnitPrefs; tip?: string;
  min?: number; max?: number; allowNull?: boolean; step?: number; disabled?: boolean; unit?: string;
}) {
  const un = unit ?? unitOf(q, u);
  const disp = value === null ? '' : String(+fromInternal(value, un).toPrecision(10));
  const [txt, setTxt] = useState(disp);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(disp); }, [disp, focus]);
  const v = parse(txt);
  const err = txt.trim() === '' ? (allowNull ? '' : 'Requerido') : !Number.isFinite(v) ? 'Número inválido' : min !== undefined && toInternal(v, un) < min ? `Mínimo ${fromInternal(min, un)}` : max !== undefined && toInternal(v, un) > max ? `Máximo ${fromInternal(max, un)}` : '';
  return (
    <label className="block">
      <Label label={label} tip={tip} />
      <div className={`flex items-stretch overflow-hidden rounded border ${err ? 'border-fail bg-red-50' : 'border-slate-300 bg-white'} focus-within:border-accent`}>
        <input
          className="w-full min-w-0 bg-transparent px-2 py-1 text-[13px] outline-none disabled:text-slate-400"
          value={txt}
          disabled={disabled}
          inputMode="decimal"
          step={step}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => {
            setTxt(e.target.value);
            const n = parse(e.target.value);
            if (e.target.value.trim() === '' && allowNull) onChange(null);
            else if (Number.isFinite(n)) onChange(toInternal(n, un));
          }}
        />
        {un && <span className="flex items-center bg-slate-100 px-1.5 text-[11px] text-slate-500">{un}</span>}
      </div>
      {err && <span className="text-[10px] text-fail">{err}</span>}
    </label>
  );
}

export function Txt({ label, value, onChange, tip, area }: { label: string; value: string; onChange: (v: string) => void; tip?: string; area?: boolean }) {
  return (
    <label className="block">
      <Label label={label} tip={tip} />
      {area ? (
        <textarea className="w-full rounded border border-slate-300 px-2 py-1 text-[13px] outline-none focus:border-accent" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="w-full rounded border border-slate-300 px-2 py-1 text-[13px] outline-none focus:border-accent" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

export function Sel<T extends string>({ label, value, options, onChange, tip }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; tip?: string }) {
  return (
    <label className="block">
      <Label label={label} tip={tip} />
      <select className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[13px] outline-none focus:border-accent" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Chk({ label, value, onChange, tip }: { label: string; value: boolean; onChange: (v: boolean) => void; tip?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px] text-slate-700">
      <input type="checkbox" className="accent-accent" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
      <Tip t={tip} />
    </label>
  );
}

export function Btn({ children, onClick, kind = 'sec', title, disabled }: { children: ReactNode; onClick: () => void; kind?: 'pri' | 'sec' | 'dan'; title?: string; disabled?: boolean }) {
  const cls = kind === 'pri' ? 'bg-accent text-white hover:bg-teal-700' : kind === 'dan' ? 'bg-white text-fail border border-red-200 hover:bg-red-50' : 'bg-white text-steel border border-slate-300 hover:bg-slate-50';
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`rounded px-2.5 py-1 text-[12px] font-semibold shadow-sm transition disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

export function Stat({ label, value, sub, e }: { label: string; value: ReactNode; sub?: ReactNode; e?: Estado }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm" style={e ? { borderLeft: `4px solid ${ESTADO_COLOR[e]}` } : undefined}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-[17px] font-bold text-ink">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'error' }) {
  const c = kind === 'error' ? 'border-fail bg-red-50 text-red-900' : kind === 'warn' ? 'border-warn bg-amber-50 text-amber-900' : 'border-accent bg-teal-50 text-teal-900';
  return <div className={`rounded border-l-4 px-3 py-1.5 text-[12px] ${c}`}>{children}</div>;
}

export function download(name: string, data: string | Blob, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
