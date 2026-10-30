import { useState } from 'react';
import type { TabProps } from '../App';
import { Btn, Card, Note } from './components';
import { TIPOS_CASO, expresion, generateCombos, plantillaBase } from '../core/combos';
import type { Loads, TipoCaso } from '../core/types';
import { zeroLoads } from '../data/example';
import { fmt } from '../core/units';
import { combosDesactualizadas } from '../core/validate';

const LKEYS: (keyof Loads)[] = ['N', 'Vx', 'Vy', 'Mx', 'My', 'Mz'];
const isM = (k: keyof Loads) => k.startsWith('M');
const num = (s: string) => Number(s.replace(',', '.'));

/** Casos de carga por columna y generador de combinaciones mediante plantillas de factores */
export function CasesPanel({ p, set }: Pick<TabProps, 'p' | 'set'>) {
  const u = p.units;
  const fF = u.force === 'kN' ? 1000 : 1;
  const fM = u.moment === 'kNm' ? 1e6 : 1;
  const [sel, setSel] = useState(p.casos[0]?.id ?? '');
  const caso = p.casos.find((c) => c.id === sel) ?? p.casos[0];
  const nextId = (pref: string, ids: string[]) => { let i = 1; while (ids.includes(`${pref}${i}`)) i++; return `${pref}${i}`; };
  const tiposUsados = [...new Set<TipoCaso>(['D', 'L', ...p.casos.map((c) => c.tipo)])];
  const preview = generateCombos(p);
  const nGen = p.combos.filter((c) => c.generada).length;

  return (
    <Card title="Casos de carga y generador de combinaciones" right={
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => set((d) => {
          const id = nextId('K', d.casos.map((c) => c.id));
          const tipo: TipoCaso = d.casos.length ? 'L' : 'D';
          d.casos.push({ id, nombre: d.casos.some((c) => c.nombre === tipo) ? id : tipo, tipo, cargas: Object.fromEntries(d.columns.map((c) => [c.id, zeroLoads()])) });
          setSel(id);
        })}>+ Caso</Btn>
        <Btn onClick={() => set((d) => { d.plantillas = plantillaBase(); })} title="Reemplaza las plantillas actuales">Cargar plantilla base</Btn>
        <Btn kind="pri" disabled={!preview.length} onClick={() => set((d) => { d.combos = [...d.combos.filter((c) => !c.generada), ...generateCombos(d)]; })}>Generar combinaciones ({preview.length})</Btn>
        {nGen > 0 && <Btn kind="dan" onClick={() => set((d) => { d.combos = d.combos.filter((c) => !c.generada); })}>Eliminar generadas ({nGen})</Btn>}
      </div>}>
      {combosDesactualizadas(p) && <div className="mb-2"><Note kind="warn">Las combinaciones generadas están desactualizadas respecto de los casos o plantillas: presione "Generar combinaciones".</Note></div>}
      {p.casos.length === 0 ? (
        <Note>Sin casos definidos: las combinaciones se ingresan directamente abajo. Para generarlas, agregue casos (D, L, W, E…) con sus cargas por columna, cargue o edite las plantillas de factores y presione "Generar combinaciones".</Note>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Id</th><th>Nombre</th><th>Tipo</th><th>ΣN [{u.force}]</th><th></th></tr></thead>
              <tbody>
                {p.casos.map((c) => (
                  <tr key={c.id} className={c.id === caso?.id ? 'outline outline-2 outline-accent' : ''} onClick={() => setSel(c.id)}>
                    <td className="font-bold">{c.id}</td>
                    <td><input value={c.nombre} onChange={(e) => set((d) => { d.casos.find((x) => x.id === c.id)!.nombre = e.target.value; })} /></td>
                    <td><select value={c.tipo} onChange={(e) => set((d) => { d.casos.find((x) => x.id === c.id)!.tipo = e.target.value as TipoCaso; })}>{TIPOS_CASO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                    <td>{fmt(p.columns.reduce((a, col) => a + (c.cargas[col.id]?.N ?? 0), 0) / fF, 1)}</td>
                    <td className="whitespace-nowrap">
                      <button className="mr-1 text-accent" title="Copiar" onClick={(e) => { e.stopPropagation(); set((d) => { const id = nextId('K', d.casos.map((x) => x.id)); d.casos.push({ ...structuredClone(c), id, nombre: `${c.nombre}'` }); }); }}>⧉</button>
                      <button className="text-fail" title="Eliminar" onClick={(e) => { e.stopPropagation(); set((d) => { d.casos = d.casos.filter((x) => x.id !== c.id); }); }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-[11px] text-slate-500">Casos del mismo tipo se suman, salvo W y E: cada caso de viento o sismo (p. ej. Wx, Wy) genera una combinación alternativa.</div>
          </div>
          {caso && (
            <div className="overflow-x-auto">
              <div className="mb-1 text-[12px] font-bold text-steel">Cargas sin mayorar del caso "{caso.nombre}"</div>
              <table className="tbl">
                <thead><tr><th>Columna</th>{LKEYS.map((k) => <th key={k}>{k} [{isM(k) ? u.moment : u.force}]</th>)}</tr></thead>
                <tbody>
                  {p.columns.map((col) => {
                    const l = caso.cargas[col.id] ?? zeroLoads();
                    return (
                      <tr key={col.id}><td className="font-bold">{col.nombre}</td>
                        {LKEYS.map((k) => (
                          <td key={k}><input value={+(l[k] / (isM(k) ? fM : fF)).toPrecision(10)} onChange={(e) => {
                            const v = num(e.target.value);
                            if (Number.isFinite(v)) set((d) => { const c = d.casos.find((x) => x.id === caso.id)!; c.cargas[col.id] = { ...(c.cargas[col.id] ?? zeroLoads()), [k]: v * (isM(k) ? fM : fF) }; });
                          }} /></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[12px] font-bold text-steel">Plantillas de combinación (factores por tipo de caso)</div>
        <Btn onClick={() => set((d) => { const id = nextId('P', d.plantillas.map((t) => t.id)); d.plantillas.push({ id, nombre: 'Nueva', tipo: 'ultima', transitoria: false, activa: true, alternar: false, factores: { D: 1.2, L: 1.6 } }); })}>+ Plantilla</Btn>
      </div>
      {p.plantillas.length === 0 ? <div className="text-[12px] text-slate-500">Sin plantillas. Use "Cargar plantilla base" o "+ Plantilla".</div> : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Activa</th><th>Nombre</th><th>Tipo</th><th title="Usa q adm. transitoria">Trans.</th><th title="Genera variantes ± para W y E">±W/E</th>{tiposUsados.map((t) => <th key={t}>{t}</th>)}<th></th></tr></thead>
            <tbody>
              {p.plantillas.map((t) => (
                <tr key={t.id}>
                  <td><input type="checkbox" checked={t.activa} onChange={(e) => set((d) => { d.plantillas.find((x) => x.id === t.id)!.activa = e.target.checked; })} /></td>
                  <td><input value={t.nombre} onChange={(e) => set((d) => { d.plantillas.find((x) => x.id === t.id)!.nombre = e.target.value; })} /></td>
                  <td><select value={t.tipo} onChange={(e) => set((d) => { d.plantillas.find((x) => x.id === t.id)!.tipo = e.target.value as 'servicio' | 'ultima'; })}><option value="servicio">Servicio</option><option value="ultima">Última</option></select></td>
                  <td><input type="checkbox" checked={t.transitoria} onChange={(e) => set((d) => { d.plantillas.find((x) => x.id === t.id)!.transitoria = e.target.checked; })} /></td>
                  <td><input type="checkbox" checked={t.alternar} onChange={(e) => set((d) => { d.plantillas.find((x) => x.id === t.id)!.alternar = e.target.checked; })} /></td>
                  {tiposUsados.map((k) => (
                    <td key={k}><input className="!min-w-[44px]" value={t.factores[k] ?? ''} placeholder="0" onChange={(e) => {
                      const s = e.target.value.trim(); const v = num(s);
                      set((d) => { const x = d.plantillas.find((y) => y.id === t.id)!; if (s === '' || v === 0) delete x.factores[k]; else if (Number.isFinite(v)) x.factores[k] = v; });
                    }} /></td>
                  ))}
                  <td><button className="text-fail" onClick={() => set((d) => { d.plantillas = d.plantillas.filter((x) => x.id !== t.id); })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2"><Note kind="warn">La plantilla base reproduce la forma de CIRSOC 201-2005 §9.2 con f1 = 0,5 y servicio con factores unitarios. Es editable y debe verificarse contra el reglamento de cargas (CIRSOC 101/102/103) y el destino de la obra.</Note></div>

      {preview.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-bold text-steel">Vista previa: {preview.length} combinaciones a generar</summary>
          <table className="tbl mt-1">
            <thead><tr><th>Id</th><th>Nombre</th><th>Tipo</th><th>Expresión</th><th>ΣN [{u.force}]</th></tr></thead>
            <tbody>{preview.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.nombre}</td><td>{c.tipo}{c.transitoria ? ' (T)' : ''}</td><td className="font-mono text-[11px]">{expresion(c)}</td><td>{fmt(p.columns.reduce((a, col) => a + (c.cargas[col.id]?.N ?? 0), 0) / fF, 1)}</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </Card>
  );
}
