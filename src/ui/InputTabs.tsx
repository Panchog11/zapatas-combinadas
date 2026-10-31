import { useState } from 'react';
import type { TabProps } from '../App';
import { Btn, Card, Chk, Grid, Note, Num, Sel, Txt, Badge, download } from './components';
import { NORM_DEFAULT } from '../norm/config';
import { shapeOf, colDims } from '../core/geometry';
import { newColumn, zeroLoads } from '../data/example';
import type { Combo, Loads, Origen, Project, Column } from '../core/types';
import { autosize, type AutoResult } from '../core/autosize';
import { fmt } from '../core/units';
import { SignConvention } from './SignConvention';
import { CasesPanel } from './CasesPanel';
import { PedestalPanel } from './PedestalPanel';
import { expresion } from '../core/combos';

// ---------------- 1. Proyecto y normativa ----------------
export function ProjectTab({ p, set }: TabProps) {
  const m = p.meta, u = p.units;
  return (
    <div className="space-y-4">
      <Card title="Datos del proyecto">
        <Grid>
          <Txt label="Nombre de obra" value={m.obra} onChange={(v) => set((d) => { d.meta.obra = v; })} />
          <Txt label="Ubicación" value={m.ubicacion} onChange={(v) => set((d) => { d.meta.ubicacion = v; })} />
          <Txt label="Profesional" value={m.profesional} onChange={(v) => set((d) => { d.meta.profesional = v; })} />
          <Txt label="Fecha" value={m.fecha} onChange={(v) => set((d) => { d.meta.fecha = v; })} />
          <Txt label="Código / identificación" value={m.codigo} onChange={(v) => set((d) => { d.meta.codigo = v; })} />
          <Sel label="Tipo de análisis" value={m.modo} options={[['verificacion', 'Verificación de dimensiones ingresadas'], ['dimensionamiento', 'Dimensionamiento automático']]} onChange={(v) => set((d) => { d.meta.modo = v; })} tip="En dimensionamiento, use 'Criterios de cálculo' → Dimensionar automáticamente." />
        </Grid>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Txt area label="Descripción" value={m.descripcion} onChange={(v) => set((d) => { d.meta.descripcion = v; })} />
          <Txt area label="Observaciones" value={m.observaciones} onChange={(v) => set((d) => { d.meta.observaciones = v; })} />
        </div>
      </Card>
      <Card title="Unidades y criterios generales">
        <Grid cols={4}>
          <Sel label="Longitud" value={u.length} options={[['m', 'm'], ['cm', 'cm'], ['mm', 'mm']]} onChange={(v) => set((d) => { d.units.length = v; })} tip="Unidades de visualización. Internamente: N, mm, MPa." />
          <Sel label="Fuerza" value={u.force} options={[['kN', 'kN'], ['N', 'N']]} onChange={(v) => set((d) => { d.units.force = v; })} />
          <Sel label="Momento" value={u.moment} options={[['kNm', 'kNm'], ['Nmm', 'N·mm']]} onChange={(v) => set((d) => { d.units.moment = v; })} />
          <Sel label="Presión suelo" value={u.soilStress} options={[['kPa', 'kPa'], ['MPa', 'MPa']]} onChange={(v) => set((d) => { d.units.soilStress = v; })} />
          <Sel label="Dirección longitudinal" value={m.direccionLongitudinal} options={[['X', 'Eje X global']]} onChange={() => undefined} tip="Hipótesis: el eje longitudinal de la zapata coincide con X global. Para orientarla en Y, ingrese las coordenadas intercambiadas." />
          <Num label="Tolerancia numérica" value={m.tolerancia} onChange={(v) => set((d) => { d.meta.tolerancia = v ?? 1e-6; })} u={u} tip="Tolerancia relativa para considerar D/C ≤ 1." />
          <Sel label="Criterio de presión admisible" value={p.geo.qadmTipo} options={[['bruta', 'Bruta (q_max ≤ q_adm)'], ['neta', 'Neta (q_max − σ\'v0 ≤ q_adm)']]} onChange={(v) => set((d) => { d.geo.qadmTipo = v; d.meta.criterioPresion = v; })} />
          <Txt label="Criterio de combinaciones" value={m.criterioCombinaciones} onChange={(v) => set((d) => { d.meta.criterioCombinaciones = v; })} tip="Las combinaciones se ingresan ya factorizadas en 'Columnas y cargas'." />
        </Grid>
      </Card>
      <NormEditor {...{ p, set }} />
    </div>
  );
}

function NormEditor({ p, set }: Pick<TabProps, 'p' | 'set'>) {
  const n = p.norm;
  const [open, setOpen] = useState(false);
  const rows: [string, string, number][] = [];
  const walk = (o: Record<string, unknown>, path: string) => {
    for (const [k, v] of Object.entries(o)) {
      const pth = path ? `${path}.${k}` : k;
      if (typeof v === 'number') rows.push([pth, k, v]);
      else if (v && typeof v === 'object' && k !== 'referencias' && !Array.isArray(v)) walk(v as Record<string, unknown>, pth);
    }
  };
  walk(n as unknown as Record<string, unknown>, '');
  const setPath = (d: Project, path: string, v: number) => {
    const ks = path.split('.');
    let o = d.norm as unknown as Record<string, unknown>;
    for (const k of ks.slice(0, -1)) o = o[k] as Record<string, unknown>;
    o[ks[ks.length - 1]] = v;
  };
  return (
    <Card title="Normativa (parámetros centralizados)" right={<div className="flex gap-2"><Btn onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Editar parámetros'}</Btn><Btn kind="dan" onClick={() => set((d) => { d.norm = structuredClone(NORM_DEFAULT); })}>Restablecer</Btn></div>}>
      <Grid>
        <Txt label="Reglamento estructural" value={n.reglamento} onChange={(v) => set((d) => { d.norm.reglamento = v; })} />
        <Txt label="Edición" value={n.edicion} onChange={(v) => set((d) => { d.norm.edicion = v; })} />
        <Txt label="Reglamento / criterio geotécnico" value={n.reglamentoSuelos} onChange={(v) => set((d) => { d.norm.reglamentoSuelos = v; })} />
      </Grid>
      <div className="mt-2"><Note kind="warn">Criterios configurables compatibles con CIRSOC 201 / CIRSOC 401. La aplicación no afirma cumplimiento reglamentario: verifique cada coeficiente contra la edición vigente.</Note></div>
      {open && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <table className="tbl"><thead><tr><th>Parámetro</th><th>Valor</th></tr></thead><tbody>
            {rows.map(([path, , v]) => (
              <tr key={path}><td className="font-mono text-[11px]">{path}</td><td>
                <input value={v} onChange={(e) => { const x = Number(e.target.value.replace(',', '.')); if (Number.isFinite(x)) set((d) => setPath(d, path, x)); }} />
              </td></tr>
            ))}
          </tbody></table>
          <table className="tbl"><thead><tr><th>Verificación</th><th>Referencia (editable)</th></tr></thead><tbody>
            {Object.entries(n.referencias).map(([k, v]) => (
              <tr key={k}><td>{k}</td><td><input value={v} onChange={(e) => set((d) => { d.norm.referencias[k] = e.target.value; })} /></td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </Card>
  );
}

// ---------------- 2. Geometría ----------------
export function MiniPlan({ p, h = 260 }: { p: Project; h?: number }) {
  const f = p.footing;
  const s = shapeOf(f);
  const pad = 0.12 * Math.max(s.L, s.Bmax) + 400;
  const minX = f.x0 - pad, maxX = f.x0 + s.L + pad;
  const minY = f.y0 - s.Bmax / 2 - pad, maxY = f.y0 + s.Bmax / 2 + pad;
  const W = maxX - minX, H = maxY - minY;
  const fs = Math.max(W, H) / 45;
  const pts = [[f.x0, f.y0 - s.B1 / 2], [f.x0 + s.L, f.y0 - s.B2 / 2], [f.x0 + s.L, f.y0 + s.B2 / 2], [f.x0, f.y0 + s.B1 / 2]];
  const lim = f.limites;
  return (
    <svg viewBox={`${minX} ${-maxY} ${W} ${H}`} className="w-full rounded border border-slate-200 bg-slate-50" style={{ height: h }}>
      <g transform="scale(1,1)">
        <polygon points={pts.map(([x, y]) => `${x},${-y}`).join(' ')} fill="#cfe7ea" stroke="#1e3a52" strokeWidth={fs / 6} />
        <line x1={f.x0 - pad / 2} y1={-f.y0} x2={f.x0 + s.L + pad / 2} y2={-f.y0} stroke="#64748b" strokeDasharray={`${fs} ${fs / 3} ${fs / 6} ${fs / 3}`} strokeWidth={fs / 12} />
        {[lim.xMin, lim.xMax].map((x, i) => x !== null && <line key={i} x1={x} x2={x} y1={-maxY} y2={-minY} stroke="#dc2626" strokeWidth={fs / 5} strokeDasharray={`${fs / 2} ${fs / 4}`} />)}
        {[lim.yMin, lim.yMax].map((y, i) => y !== null && <line key={i} y1={-y} y2={-y} x1={minX} x2={maxX} stroke="#dc2626" strokeWidth={fs / 5} strokeDasharray={`${fs / 2} ${fs / 4}`} />)}
        {p.columns.map((c) => {
          const d = colDims(c);
          return (
            <g key={c.id}>
              {c.ped.activo && <rect x={c.x - c.ped.bx / 2} y={-c.y - c.ped.by / 2} width={c.ped.bx} height={c.ped.by} fill="none" stroke="#1e3a52" strokeDasharray={`${fs / 3}`} strokeWidth={fs / 10} />}
              {c.forma === 'circ' ? <circle cx={c.x} cy={-c.y} r={c.D / 2} fill="#475569" /> : <rect x={c.x - d.bx / 2} y={-c.y - d.by / 2} width={d.bx} height={d.by} fill="#475569" transform={`rotate(${-c.angulo} ${c.x} ${-c.y})`} />}
              <text x={c.x} y={-c.y - d.by / 2 - fs * 0.6} fontSize={fs} textAnchor="middle" fill="#0f1d2b" fontWeight="bold">{c.nombre}</text>
            </g>
          );
        })}
        {/* cotas */}
        <g fontSize={fs * 0.9} fill="#0f1d2b" textAnchor="middle">
          <line x1={f.x0} x2={f.x0 + s.L} y1={-(f.y0 - s.Bmax / 2) + fs * 2} y2={-(f.y0 - s.Bmax / 2) + fs * 2} stroke="#0f1d2b" strokeWidth={fs / 12} />
          <text x={f.x0 + s.L / 2} y={-(f.y0 - s.Bmax / 2) + fs * 1.6}>L = {fmt(s.L / 1000)} m</text>
          <text x={f.x0 - fs * 0.6} y={-f.y0} transform={`rotate(-90 ${f.x0 - fs * 0.6} ${-f.y0})`}>B1 = {fmt(s.B1 / 1000)} m</text>
          {f.forma === 'trapezoidal' && <text x={f.x0 + s.L + fs * 1.2} y={-f.y0} transform={`rotate(-90 ${f.x0 + s.L + fs * 1.2} ${-f.y0})`}>B2 = {fmt(s.B2 / 1000)} m</text>}
          {p.columns.slice(1).map((c, i) => {
            const a = p.columns[i];
            return <text key={c.id} x={(a.x + c.x) / 2} y={-(f.y0 + s.Bmax / 2) - fs * 0.6}>{fmt(Math.hypot(c.x - a.x, c.y - a.y) / 1000)} m</text>;
          })}
        </g>
        <g stroke="#0e7c86" strokeWidth={fs / 8}>
          <line x1={minX + fs} y1={-minY - fs} x2={minX + fs * 4} y2={-minY - fs} /><line x1={minX + fs} y1={-minY - fs} x2={minX + fs} y2={-minY - fs * 4} />
          <text x={minX + fs * 4.3} y={-minY - fs * 0.7} fontSize={fs} fill="#0e7c86" stroke="none">X</text>
          <text x={minX + fs * 0.6} y={-minY - fs * 4.4} fontSize={fs} fill="#0e7c86" stroke="none">Y</text>
        </g>
      </g>
    </svg>
  );
}

export function GeometryTab({ p, set }: TabProps) {
  const f = p.footing, u = p.units;
  const s = shapeOf(f);
  const N = (label: string, k: keyof typeof f, tip?: string, min = 0) => (
    <Num label={label} value={f[k] as number} q="length" u={u} tip={tip} min={min} onChange={(v) => set((d) => { (d.footing[k] as number) = v ?? 0; })} />
  );
  const lim = (label: string, k: keyof typeof f.limites) => (
    <Num label={label} value={f.limites[k]} q="length" u={u} allowNull tip="Coordenada global del límite (medianera). Vacío = sin restricción." onChange={(v) => set((d) => { d.footing.limites[k] = v; })} />
  );
  const cotaBase = f.cotaTerreno - f.Df;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <Card title="Forma y dimensiones">
          <Grid>
            <Sel label="Forma" value={f.forma} options={[['rectangular', 'Rectangular'], ['trapezoidal', 'Trapezoidal']]} onChange={(v) => set((d) => { d.footing.forma = v; if (v === 'trapezoidal' && d.footing.B2 <= 0) d.footing.B2 = d.footing.B1; })} />
            {N('Largo total L', 'L', 'Dimensión según el eje longitudinal X.', 1)}
            {N(f.forma === 'trapezoidal' ? 'Ancho inicial B1' : 'Ancho B', 'B1', 'Ancho en el extremo izquierdo (x = x0).', 1)}
            {f.forma === 'trapezoidal' && N('Ancho final B2', 'B2', 'Ancho en el extremo derecho.', 1)}
            {N('Espesor total h', 'h', undefined, 1)}
            {N('X extremo izquierdo x0', 'x0', 'Coordenada global X del borde izquierdo.', -1e9)}
            {N('Y eje longitudinal y0', 'y0', 'Coordenada global Y del eje de simetría de la zapata.', -1e9)}
          </Grid>
        </Card>
        <Card title="Niveles y recubrimientos">
          <Grid>
            {N('Cota de terreno natural', 'cotaTerreno', 'Nivel de referencia del terreno.', -1e9)}
            {N('Profundidad de desplante Df', 'Df', 'Desde el terreno hasta la base de la zapata.', 1)}
            {N('Hormigón de limpieza', 'limpieza')}
            {N('Recubrimiento inferior', 'recInf')}
            {N('Recubrimiento superior', 'recSup')}
            {N('Recubrimiento lateral', 'recLat')}
          </Grid>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <div className="rounded bg-slate-50 px-2 py-1">Cota superior: <b>{fmt((cotaBase + f.h) / 1000, 3)} m</b></div>
            <div className="rounded bg-slate-50 px-2 py-1">Cota inferior / fundación: <b>{fmt(cotaBase / 1000, 3)} m</b></div>
            <div className="rounded bg-slate-50 px-2 py-1">Fondo excavación: <b>{fmt((cotaBase - f.limpieza) / 1000, 3)} m</b></div>
          </div>
        </Card>
        <Card title="Límites y restricciones">
          <Grid>
            {lim('Medianera izquierda (X mín)', 'xMin')}
            {lim('Medianera derecha (X máx)', 'xMax')}
            {lim('Límite inferior (Y mín)', 'yMin')}
            {lim('Límite superior (Y máx)', 'yMax')}
            {N('Largo máximo disponible', 'Lmax', 'Incluye límites de transporte o excavación.', 1)}
            {N('Ancho máximo disponible', 'Bmax', undefined, 1)}
            {N('Espesor mínimo', 'hMin', undefined, 1)}
            {N('Espesor máximo', 'hMax', undefined, 1)}
          </Grid>
          <div className="mt-2"><Txt label="Vigas de fundación (descripción)" value={f.vigasFundacion} onChange={(v) => set((d) => { d.footing.vigasFundacion = v; })} tip="Registro descriptivo: las vigas de fundación no se incluyen en el modelo de cálculo." /></div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Planta esquemática (tiempo real)">
          <MiniPlan p={p} h={340} />
          <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
            <div>A = <b>{fmt(s.A / 1e6, 3)} m²</b></div>
            <div>x̄ = <b>{fmt(s.xc / 1000, 3)} m</b></div>
            <div>Ix = <b>{fmt(s.Ix / 1e12, 3)} m⁴</b></div>
            <div>Iy = <b>{fmt(s.Iy / 1e12, 3)} m⁴</b></div>
          </div>
        </Card>
        <Note>Ejes globales: X longitudinal, Y transversal, Z vertical hacia arriba. Pedestales: se definen por columna en "Columnas y cargas".</Note>
      </div>
    </div>
  );
}

// ---------------- 3. Columnas y cargas ----------------
const LKEYS: (keyof Loads)[] = ['N', 'Vx', 'Vy', 'Mx', 'My', 'Mz'];
const isM = (k: keyof Loads) => k.startsWith('M');

export function ColumnsTab({ p, set, r }: TabProps) {
  const u = p.units;
  const [sel, setSel] = useState(p.combos[0]?.id ?? '');
  const combo = p.combos.find((c) => c.id === sel) ?? p.combos[0];
  const fL = u.length === 'm' ? 1000 : u.length === 'cm' ? 10 : 1;
  const fF = u.force === 'kN' ? 1000 : 1;
  const fM = u.moment === 'kNm' ? 1e6 : 1;
  const nextId = (pref: string, ids: string[]) => { let i = 1; while (ids.includes(`${pref}${i}`)) i++; return `${pref}${i}`; };

  const colField = (c: Column, k: keyof Column, len = true) => (
    <input value={len ? +((c[k] as number) / fL).toPrecision(8) : (c[k] as number)} onChange={(e) => {
      const v = Number(e.target.value.replace(',', '.'));
      if (Number.isFinite(v)) set((d) => { const cc = d.columns.find((x) => x.id === c.id)!; (cc[k] as number) = len ? v * fL : v; });
    }} />
  );
  const exportCSV = () => {
    const head = 'combo_id;nombre;tipo;transitoria;origen;activa;columna;N_kN;Vx_kN;Vy_kN;Mx_kNm;My_kNm;Mz_kNm';
    const rows = p.combos.flatMap((cb) => p.columns.map((c) => {
      const l = cb.cargas[c.id] ?? zeroLoads();
      return [cb.id, cb.nombre, cb.tipo, cb.transitoria ? 1 : 0, cb.origen, cb.activa ? 1 : 0, c.id, ...LKEYS.map((k) => (l[k] / (isM(k) ? 1e6 : 1e3)).toString().replace('.', ','))].join(';');
    }));
    download(`${p.meta.codigo}-cargas.csv`, [head, ...rows].join('\n'), 'text/csv');
  };
  const importCSV = async (file: File) => {
    const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
    const out = new Map<string, Combo>();
    for (const l of lines.slice(1)) {
      const c = l.split(';');
      if (c.length < 13) continue;
      const num = (s: string) => Number(s.replace(',', '.'));
      const cb = out.get(c[0]) ?? { id: c[0], nombre: c[1], tipo: c[2] === 'ultima' ? 'ultima' : 'servicio', transitoria: c[3] === '1', origen: (c[4] || 'Combinada') as Origen, activa: c[5] !== '0', cargas: {} } as Combo;
      cb.cargas[c[6]] = { N: num(c[7]) * 1e3, Vx: num(c[8]) * 1e3, Vy: num(c[9]) * 1e3, Mx: num(c[10]) * 1e6, My: num(c[11]) * 1e6, Mz: num(c[12]) * 1e6 };
      out.set(c[0], cb);
    }
    if (!out.size) { alert('CSV sin filas válidas.'); return; }
    set((d) => { d.combos = [...out.values()]; });
    setSel([...out.keys()][0]);
  };

  return (
    <div className="space-y-4">
      <Card title="Columnas o fustes" right={<Btn kind="pri" onClick={() => set((d) => {
        const id = nextId('C', d.columns.map((c) => c.id));
        const last = d.columns[d.columns.length - 1];
        d.columns.push(newColumn(id, (last?.x ?? 0) + 3000, last?.y ?? 0));
        d.combos.forEach((cb) => { cb.cargas[id] = zeroLoads(); });
        d.casos.forEach((cb) => { cb.cargas[id] = zeroLoads(); });
      })}>+ Agregar columna</Btn>}>
        <div className="overflow-x-auto">
          <table className="tbl min-w-[1500px]">
            <thead><tr>
              <th>Id</th><th>Nombre</th><th>X [{u.length}]</th><th>Y [{u.length}]</th><th>Forma</th><th>bx [{u.length}]</th><th>by [{u.length}]</th><th>D [{u.length}]</th>
              <th>Áng. [°]</th><th title="Altura adicional sobre el tope del pedestal (o de la zapata) donde se aplican las cargas">z carga [{u.length}]</th><th>Condición</th><th>Material</th><th>Rec. [{u.length}]</th>
              <th>n barras</th><th>Ø long [mm]</th><th>Distribución</th><th>Ø estribo [mm]</th><th>s estribo [{u.length}]</th><th>Gancho espera</th><th title="Vacío = automática">L espera [{u.length}]</th>
              <th></th>
            </tr></thead>
            <tbody>
              {p.columns.map((c) => (
                <tr key={c.id}>
                  <td className="font-bold">{c.id}</td>
                  <td><input value={c.nombre} onChange={(e) => set((d) => { d.columns.find((x) => x.id === c.id)!.nombre = e.target.value; })} /></td>
                  <td>{colField(c, 'x')}</td><td>{colField(c, 'y')}</td>
                  <td><select value={c.forma} onChange={(e) => set((d) => { d.columns.find((x) => x.id === c.id)!.forma = e.target.value as 'rect' | 'circ'; })}><option value="rect">Rect.</option><option value="circ">Circ.</option></select></td>
                  <td>{colField(c, 'bx')}</td><td>{colField(c, 'by')}</td><td>{colField(c, 'D')}</td>
                  <td>{colField(c, 'angulo', false)}</td><td>{colField(c, 'zCarga')}</td>
                  <td><select value={c.condicion} onChange={(e) => set((d) => { d.columns.find((x) => x.id === c.id)!.condicion = e.target.value as Column['condicion']; })}><option value="auto">Automática</option><option value="interior">Interior</option><option value="borde">Borde</option><option value="esquina">Esquina</option></select></td>
                  <td><input value={c.material} onChange={(e) => set((d) => { d.columns.find((x) => x.id === c.id)!.material = e.target.value; })} /></td>
                  <td>{colField(c, 'rec')}</td><td>{colField(c, 'nBarras', false)}</td><td>{colField(c, 'dbBarras', false)}</td>
                  <td><input value={c.distribucion} onChange={(e) => set((d) => { d.columns.find((x) => x.id === c.id)!.distribucion = e.target.value; })} /></td>
                  <td>{colField(c, 'dbEstribo', false)}</td><td>{colField(c, 'sEstribo')}</td>
                  <td><select value={c.gancho} onChange={(e) => set((d) => { d.columns.find((x) => x.id === c.id)!.gancho = e.target.value as Column['gancho']; })}><option value="recto">Recto</option><option value="90">90°</option><option value="180">180°</option></select></td>
                  <td><input value={c.lEspera === null ? '' : +(c.lEspera / fL).toPrecision(8)} placeholder="auto" onChange={(e) => { const t = e.target.value.trim(); const v = Number(t.replace(',', '.')); set((d) => { d.columns.find((x) => x.id === c.id)!.lEspera = t === '' || !Number.isFinite(v) ? null : v * fL; }); }} /></td>
                  <td className="whitespace-nowrap">
                    <button className="mr-1 text-accent" title="Copiar" onClick={() => set((d) => {
                      const id = nextId('C', d.columns.map((x) => x.id));
                      d.columns.push({ ...structuredClone(c), id, nombre: id, x: c.x + 1000 });
                      d.combos.forEach((cb) => { cb.cargas[id] = { ...(cb.cargas[c.id] ?? zeroLoads()) }; });
                      d.casos.forEach((cb) => { cb.cargas[id] = { ...(cb.cargas[c.id] ?? zeroLoads()) }; });
                    })}>⧉</button>
                    <button className="text-fail" title="Eliminar" disabled={p.columns.length <= 2} onClick={() => set((d) => {
                      d.columns = d.columns.filter((x) => x.id !== c.id);
                      d.combos.forEach((cb) => { delete cb.cargas[c.id]; });
                      d.casos.forEach((cb) => { delete cb.cargas[c.id]; });
                    })}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">Mínimo 2 columnas. Las columnas circulares se tratan como cuadradas de igual área para cortes y punzonamiento. "z carga": altura adicional sobre el tope del pedestal (o de la zapata) donde se aplican las cargas. Pedestales y tipo de apoyo: ver la tarjeta siguiente.</div>
      </Card>

      <PedestalPanel p={p} set={set} r={r} />

      <CasesPanel p={p} set={set} />

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card title="Combinaciones de carga" right={
          <div className="flex flex-wrap gap-1.5">
            <Btn onClick={() => set((d) => { const id = nextId('S', d.combos.map((c) => c.id)); d.combos.push({ id, nombre: `Servicio ${id}`, tipo: 'servicio', transitoria: false, origen: 'Combinada', activa: true, cargas: Object.fromEntries(d.columns.map((c) => [c.id, zeroLoads()])) }); setSel(id); })}>+ Servicio</Btn>
            <Btn onClick={() => set((d) => { const id = nextId('U', d.combos.map((c) => c.id)); d.combos.push({ id, nombre: `Última ${id}`, tipo: 'ultima', transitoria: false, origen: 'Combinada', activa: true, cargas: Object.fromEntries(d.columns.map((c) => [c.id, zeroLoads()])) }); setSel(id); })}>+ Última</Btn>
            <Btn onClick={exportCSV}>Exportar CSV</Btn>
            <label className="cursor-pointer rounded border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-steel shadow-sm hover:bg-slate-50">Importar CSV<input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ''; }} /></label>
          </div>}>
          <div className="overflow-x-auto">
            <table className="tbl mb-3">
              <thead><tr><th>Activa</th><th>Id</th><th>Nombre</th><th>Tipo</th><th>Origen</th><th title="Usa q adm. transitoria">Transitoria</th><th>ΣN [{u.force}]</th><th></th></tr></thead>
              <tbody>
                {p.combos.map((cb) => (
                  <tr key={cb.id} className={cb.id === combo?.id ? 'outline outline-2 outline-accent' : ''} onClick={() => setSel(cb.id)}>
                    <td><input type="checkbox" checked={cb.activa} onChange={(e) => set((d) => { d.combos.find((x) => x.id === cb.id)!.activa = e.target.checked; })} /></td>
                    <td className="font-bold" title={cb.generada ? expresion(cb) : 'Ingresada manualmente'}>{cb.id}{cb.generada && <span className="ml-1 rounded bg-teal-100 px-1 text-[9px] text-teal-800">GEN</span>}</td>
                    <td><input value={cb.nombre} onChange={(e) => set((d) => { d.combos.find((x) => x.id === cb.id)!.nombre = e.target.value; })} /></td>
                    <td><select value={cb.tipo} onChange={(e) => set((d) => { d.combos.find((x) => x.id === cb.id)!.tipo = e.target.value as Combo['tipo']; })}><option value="servicio">Servicio</option><option value="ultima">Última</option></select></td>
                    <td><select value={cb.origen} onChange={(e) => set((d) => { d.combos.find((x) => x.id === cb.id)!.origen = e.target.value as Origen; })}>{['Permanente', 'Variable', 'Viento', 'Sismo', 'Otros', 'Combinada'].map((o) => <option key={o}>{o}</option>)}</select></td>
                    <td><input type="checkbox" checked={cb.transitoria} onChange={(e) => set((d) => { d.combos.find((x) => x.id === cb.id)!.transitoria = e.target.checked; })} /></td>
                    <td>{fmt(p.columns.reduce((a, c) => a + (cb.cargas[c.id]?.N ?? 0), 0) / fF, 1)}</td>
                    <td className="whitespace-nowrap">
                      <button className="mr-1 text-accent" title="Copiar" onClick={(e) => { e.stopPropagation(); set((d) => { const id = nextId(cb.tipo === 'ultima' ? 'U' : 'S', d.combos.map((c) => c.id)); d.combos.push({ ...structuredClone(cb), id, nombre: `${cb.nombre} (copia)` }); }); }}>⧉</button>
                      <button className="text-fail" title="Eliminar" onClick={(e) => { e.stopPropagation(); set((d) => { d.combos = d.combos.filter((x) => x.id !== cb.id); }); }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {combo && (
            <>
              <div className="mb-1 text-[12px] font-bold text-steel">Cargas de "{combo.nombre}" en el punto de aplicación de cada columna</div>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Columna</th>{LKEYS.map((k) => <th key={k}>{k} [{isM(k) ? u.moment : u.force}]</th>)}</tr></thead>
                  <tbody>
                    {p.columns.map((c) => {
                      const l = combo.cargas[c.id] ?? zeroLoads();
                      return (
                        <tr key={c.id}><td className="font-bold">{c.nombre}</td>
                          {LKEYS.map((k) => (
                            <td key={k}><input value={+(l[k] / (isM(k) ? fM : fF)).toPrecision(10)} onChange={(e) => {
                              const v = Number(e.target.value.replace(',', '.'));
                              if (Number.isFinite(v)) set((d) => { const cb = d.combos.find((x) => x.id === combo.id)!; cb.cargas[c.id] = { ...(cb.cargas[c.id] ?? zeroLoads()), [k]: v * (isM(k) ? fM : fF) }; });
                            }} /></td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="mt-2 space-y-1">
            <Note>Las cargas se trasladan al centroide del plano de contacto: <b>M_final = M_inicial + r × F</b>, con F = (Vx, Vy, −N) y r desde el centroide de la base hasta el punto de aplicación. El desarrollo se muestra en la memoria.</Note>
            <Note>Cargas de columnas: brutas en servicio (se agregan peso propio, suelo, pedestales y subpresión según "Criterios"). En combinaciones últimas se usa la presión neta debida solo a las cargas de columnas.</Note>
          </div>
        </Card>
        <Card title="Convención de signos"><SignConvention /></Card>
      </div>
    </div>
  );
}

// ---------------- 4. Geotecnia ----------------
export function GeoTab({ p, set }: TabProps) {
  const g = p.geo, u = p.units;
  type K = keyof typeof g;
  const N = (label: string, k: K, q: Parameters<typeof Num>[0]['q'], tip?: string, allowNull = false, unit?: string) => (
    <Num label={label} value={g[k] as number | null} q={q} u={u} unit={unit} tip={tip} allowNull={allowNull} min={0} onChange={(v) => set((d) => { (d.geo[k] as number | null) = allowNull ? v : v ?? 0; })} />
  );
  const used = (b: boolean) => <Badge e={b ? 'ok' : 'nc'} txt={b ? 'UTILIZADO' : 'NO UTILIZADO'} />;
  return (
    <div className="space-y-4">
      <Card title="Capacidad del suelo">
        <Grid>
          {N('Tensión admisible q_adm', 'qadm', 'soilStress', 'Valor del estudio de suelos.')}
          <Sel label="q_adm es" value={g.qadmTipo} options={[['bruta', 'Bruta'], ['neta', 'Neta']]} onChange={(v) => set((d) => { d.geo.qadmTipo = v; })} tip="Neta: se descuenta la tensión efectiva del terreno a cota de fundación σ'v0." />
          {N('q_adm cargas permanentes', 'qadmPerm', 'soilStress', 'Vacío = q_adm.', true)}
          {N('q_adm combinaciones transitorias', 'qadmTrans', 'soilStress', 'Vacío = q_adm. Se aplica a combinaciones marcadas como transitorias.', true)}
          {N('Capacidad portante última q_ult', 'qult', 'soilStress', 'Si se informa, se verifica FS = q_ult/q_max.', true)}
          {N('Profundidad mínima de fundación', 'DfMin', 'length', undefined, true)}
        </Grid>
      </Card>
      <Card title="Parámetros del terreno">
        <Grid>
          {N('Peso unitario natural γ', 'gamma', 'unitWeight')}
          {N('Peso unitario saturado γsat', 'gammaSat', 'unitWeight')}
          {N('Peso unitario sumergido γ\'', 'gammaSum', 'unitWeight', 'Vacío = γsat − γw.', true)}
          {N('Nivel freático (prof. desde terreno)', 'nf', 'length', 'Vacío = no detectado.', true)}
          {N('Cohesión c', 'c', 'soilStress')}
          {N('Ángulo de fricción φ', 'phi', 'none', undefined, false, '°')}
          {N('Coef. fricción suelo-hormigón μ', 'mu', 'none')}
          {N('Adhesión ca', 'adhesion', 'soilStress')}
          {N('Módulo de balasto vertical ks', 'ks', 'none', undefined, true, 'MPa')}
          {N('Módulo de deformación Es', 'Es', 'stress', undefined, true)}
          {N('Coeficiente de Poisson ν', 'nu', 'none', undefined, true)}
          {N('Asentamiento total admisible', 'sAdm', 'length', undefined, true, 'mm')}
          {N('Asentamiento diferencial admisible', 'sDifAdm', 'length', undefined, true, 'mm')}
          {N('FS deslizamiento', 'fsDesl', 'none')}
          {N('FS vuelco', 'fsVuelco', 'none')}
          {N('Pérdida de contacto admisible', 'perdidaMax', 'none', 'Solo si se habilita en Criterios.', false, '%')}
        </Grid>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Txt label="Agresividad química" value={g.agresividad} onChange={(v) => set((d) => { d.geo.agresividad = v; })} />
          <Txt area label="Observaciones del estudio de suelos" value={g.obs} onChange={(v) => set((d) => { d.geo.obs = v; })} />
        </div>
      </Card>
      <Card title="Estratos" right={<Btn onClick={() => set((d) => { d.geo.estratos.push({ espesor: 1000, descripcion: '', gamma: 18e-6, c: 0, phi: 30, E: 20 }); })}>+ Estrato</Btn>}>
        {g.estratos.length === 0 ? <div className="text-[12px] text-slate-500">Sin estratos cargados.</div> : (
          <table className="tbl"><thead><tr><th>Espesor [m]</th><th>Descripción</th><th>γ [kN/m³]</th><th>c [kPa]</th><th>φ [°]</th><th>E [MPa]</th><th></th></tr></thead><tbody>
            {g.estratos.map((e, i) => (
              <tr key={i}>
                {(['espesor', 'descripcion', 'gamma', 'c', 'phi', 'E'] as const).map((k) => {
                  const f = k === 'espesor' ? 1000 : k === 'gamma' ? 1e-6 : k === 'c' ? 1e-3 : 1;
                  return <td key={k}><input value={k === 'descripcion' ? e[k] : +((e[k] as number) / f).toPrecision(8)} onChange={(ev) => set((d) => { const x = d.geo.estratos[i]; if (k === 'descripcion') x.descripcion = ev.target.value; else { const v = Number(ev.target.value.replace(',', '.')); if (Number.isFinite(v)) x[k] = v * f; } })} /></td>;
                })}
                <td><button className="text-fail" onClick={() => set((d) => { d.geo.estratos.splice(i, 1); })}>✕</button></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Card>
      <Card title="Uso de los datos geotécnicos en el cálculo">
        <table className="tbl"><tbody>
          <tr><td>q_adm, tipo neta/bruta, q_adm perm./transitoria</td><td>{used(true)}</td></tr>
          <tr><td>γ, γsat, nivel freático</td><td>{used(true)} peso del relleno, subpresión y σ'v0</td></tr>
          <tr><td>μ, adhesión, FS deslizamiento y vuelco</td><td>{used(true)}</td></tr>
          <tr><td>q_ult</td><td>{used(g.qult !== null)}</td></tr>
          <tr><td>Es, ν, asentamiento admisible</td><td>{used(!!(g.Es && g.nu !== null && g.sAdm))} solo asentamiento elástico inmediato</td></tr>
          <tr><td>c, φ (capacidad portante teórica)</td><td>{used(false)} no se implementa fórmula de capacidad portante</td></tr>
          <tr><td>ks (balasto)</td><td>{used(false)} sin modelo de losa sobre resortes</td></tr>
          <tr><td>Asentamiento diferencial, estratos, agresividad</td><td>{used(false)} registro informativo</td></tr>
        </tbody></table>
      </Card>
    </div>
  );
}

// ---------------- 5. Materiales ----------------
const ALL_D = [6, 8, 10, 12, 16, 20, 25, 32];
export function MaterialsTab({ p, set }: TabProps) {
  const m = p.mat, u = p.units;
  const Ec = m.hormigon.Ec ?? 4700 * Math.sqrt(m.hormigon.fc);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Hormigón">
          <Grid cols={2}>
            <Sel label="Calidad (biblioteca)" value={m.hormigon.nombre} options={m.bibliotecaH.map((h) => [h.nombre, h.nombre] as [string, string]).concat(m.bibliotecaH.some((h) => h.nombre === m.hormigon.nombre) ? [] : [[m.hormigon.nombre, m.hormigon.nombre]])} onChange={(v) => set((d) => { const h = d.mat.bibliotecaH.find((x) => x.nombre === v); if (h) d.mat.hormigon = { ...h }; })} />
            <Txt label="Designación" value={m.hormigon.nombre} onChange={(v) => set((d) => { d.mat.hormigon.nombre = v; })} />
            <Num label="f'c" value={m.hormigon.fc} q="stress" u={u} min={1} tip="Resistencia característica a compresión." onChange={(v) => set((d) => { d.mat.hormigon.fc = v ?? 25; })} />
            <Num label="Peso específico γc" value={m.hormigon.gammaC} q="unitWeight" u={u} onChange={(v) => set((d) => { d.mat.hormigon.gammaC = v ?? 24e-6; })} />
            <Num label="Módulo Ec" value={m.hormigon.Ec} q="stress" u={u} allowNull tip={`Vacío = 4700·√f'c = ${fmt(Ec, 0)} MPa (informativo, no interviene en las verificaciones).`} onChange={(v) => set((d) => { d.mat.hormigon.Ec = v; })} />
            <Num label="Tamaño máximo del agregado" value={m.agregado} q="length" u={u} unit="mm" onChange={(v) => set((d) => { d.mat.agregado = v ?? 19; })} />
            <Txt label="Clase de exposición" value={m.exposicion} onChange={(v) => set((d) => { d.mat.exposicion = v; })} />
            <Num label="Peso unitario del relleno" value={m.gammaRelleno} q="unitWeight" u={u} onChange={(v) => set((d) => { d.mat.gammaRelleno = v ?? 18e-6; })} />
          </Grid>
          <div className="mt-2"><Btn onClick={() => set((d) => { if (!d.mat.bibliotecaH.some((h) => h.nombre === d.mat.hormigon.nombre)) d.mat.bibliotecaH.push({ ...d.mat.hormigon }); })}>Guardar en biblioteca</Btn></div>
        </Card>
        <Card title="Acero">
          <Grid cols={2}>
            <Sel label="Acero (biblioteca)" value={m.acero.nombre} options={m.bibliotecaA.map((a) => [a.nombre, a.nombre] as [string, string]).concat(m.bibliotecaA.some((a) => a.nombre === m.acero.nombre) ? [] : [[m.acero.nombre, m.acero.nombre]])} onChange={(v) => set((d) => { const a = d.mat.bibliotecaA.find((x) => x.nombre === v); if (a) d.mat.acero = { ...a }; })} />
            <Txt label="Designación" value={m.acero.nombre} onChange={(v) => set((d) => { d.mat.acero.nombre = v; })} />
            <Num label="fy" value={m.acero.fy} q="stress" u={u} min={1} onChange={(v) => set((d) => { d.mat.acero.fy = v ?? 420; })} />
            <Num label="Es" value={m.acero.Es} q="stress" u={u} onChange={(v) => set((d) => { d.mat.acero.Es = v ?? 200000; })} />
            <Num label="Separación mínima constructiva" value={m.sMin} q="length" u={u} unit="mm" tip="Separación entre ejes mínima adoptada por criterio constructivo." onChange={(v) => set((d) => { d.mat.sMin = v ?? 100; })} />
            <Num label="Separación máxima" value={m.sMax} q="length" u={u} unit="mm" tip="Se aplica además el límite reglamentario mín(3h; 300 mm)." onChange={(v) => set((d) => { d.mat.sMax = v ?? 300; })} />
          </Grid>
          <div className="mt-2 text-[11px] font-semibold text-slate-600">Diámetros disponibles para la zapata</div>
          <div className="flex flex-wrap gap-2">
            {ALL_D.map((dd) => (
              <label key={dd} className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={m.diametros.includes(dd)} onChange={(e) => set((d) => { d.mat.diametros = e.target.checked ? [...d.mat.diametros, dd].sort((a, b) => a - b) : d.mat.diametros.filter((x) => x !== dd); })} />Ø{dd}</label>
            ))}
          </div>
          <div className="mt-2"><Btn onClick={() => set((d) => { if (!d.mat.bibliotecaA.some((a) => a.nombre === d.mat.acero.nombre)) d.mat.bibliotecaA.push({ ...d.mat.acero }); })}>Guardar en biblioteca</Btn></div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Factores de reducción de resistencia">
          <Grid>
            <Num label="φ flexión" value={p.norm.phiFlexion} u={u} onChange={(v) => set((d) => { d.norm.phiFlexion = v ?? 0.9; })} />
            <Num label="φ corte" value={p.norm.phiCorte} u={u} onChange={(v) => set((d) => { d.norm.phiCorte = v ?? 0.75; })} />
            <Num label="φ aplastamiento" value={p.norm.phiAplastamiento} u={u} onChange={(v) => set((d) => { d.norm.phiAplastamiento = v ?? 0.65; })} />
          </Grid>
          <div className="mt-2 text-[11px] text-slate-500">Recubrimientos: se editan en "Geometría" (zapata) y por columna.</div>
        </Card>
        <Card title="Pesos lineales [kg/m] (biblioteca)">
          <div className="grid grid-cols-4 gap-2">
            {ALL_D.map((dd) => (
              <Num key={dd} label={`Ø${dd}`} value={p.pesosLineales[dd] ?? null} u={u} unit="kg/m" allowNull onChange={(v) => set((d) => { if (v === null) delete d.pesosLineales[dd]; else d.pesosLineales[dd] = v; })} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- 6. Criterios ----------------
export function CriteriaTab({ p, set, r }: TabProps) {
  const c = p.crit, u = p.units;
  const [auto, setAuto] = useState<AutoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    setTimeout(() => { try { setAuto(autosize(p)); } finally { setBusy(false); } }, 30);
  };
  const apply = (k: AutoResult['candidatos'][number]) => set((d) => {
    Object.assign(d.footing, { forma: k.forma, L: k.L, B1: k.B1, B2: k.B2, h: k.h, x0: k.x0, y0: k.y0 });
  });
  const man = (k: 'longInf' | 'longSup' | 'transInf' | 'transSup', label: string) => {
    const v = c.manual[k];
    return (
      <tr key={k}>
        <td>{label}</td>
        <td><input type="checkbox" checked={!!v} onChange={(e) => set((d) => { if (e.target.checked) d.crit.manual[k] = { db: 16, s: 150 }; else delete d.crit.manual[k]; })} /></td>
        <td><select disabled={!v} value={v?.db ?? 16} onChange={(e) => set((d) => { d.crit.manual[k]!.db = Number(e.target.value); })}>{ALL_D.map((x) => <option key={x} value={x}>Ø{x}</option>)}</select></td>
        <td><input disabled={!v} value={v?.s ?? ''} onChange={(e) => { const x = Number(e.target.value); if (x > 0) set((d) => { d.crit.manual[k]!.s = x; }); }} /></td>
      </tr>
    );
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cargas y presiones">
          <Chk label="Incluir peso propio de la zapata" value={c.incluirPesoPropio} onChange={(v) => set((d) => { d.crit.incluirPesoPropio = v; })} />
          <Chk label="Incluir suelo sobre la zapata" value={c.incluirSuelo} onChange={(v) => set((d) => { d.crit.incluirSuelo = v; })} />
          <Chk label="Incluir pedestales" value={c.incluirPedestales} onChange={(v) => set((d) => { d.crit.incluirPedestales = v; })} />
          <Chk label="Incluir subpresión (nivel freático)" value={c.incluirSubpresion} onChange={(v) => set((d) => { d.crit.incluirSubpresion = v; })} />
          <Chk label="Permitir pérdida parcial de contacto" value={c.permitirPerdidaContacto} onChange={(v) => set((d) => { d.crit.permitirPerdidaContacto = v; })} tip="Si se habilita, se admite hasta el % definido en Geotecnia. El área comprimida se calcula iterativamente." />
          <div className="mt-2"><Grid cols={2}>
            <Num label="Puntos de cálculo de la viga" value={c.nPuntos} u={u} min={50} onChange={(v) => set((d) => { d.crit.nPuntos = Math.round(v ?? 400); })} />
            <Num label="Factor preliminar de peso propio" value={p.norm.pesoPropioPreliminar} u={u} tip="Solo para predimensionado del área (ej. 1,10 = 10 % adicional)." onChange={(v) => set((d) => { d.norm.pesoPropioPreliminar = v ?? 1.1; })} />
          </Grid></div>
        </Card>
        <Card title="Armado y cómputo">
          <Grid cols={2}>
            <Sel label="Capa inferior externa" value={c.capaInferiorExterna} options={[['long', 'Longitudinal'], ['trans', 'Transversal']]} onChange={(v) => set((d) => { d.crit.capaInferiorExterna = v; })} tip="Define qué armadura queda más cerca de la cara (mayor altura útil)." />
            <Num label="Desperdicio de acero" value={c.desperdicio} u={u} unit="%" onChange={(v) => set((d) => { d.crit.desperdicio = v ?? 5; })} />
            <Num label="Longitud barra comercial" value={c.barraComercial} q="length" u={u} onChange={(v) => set((d) => { d.crit.barraComercial = v ?? 12000; })} />
            <Num label="Sobreancho de excavación" value={c.sobreancho} q="length" u={u} onChange={(v) => set((d) => { d.crit.sobreancho = v ?? 300; })} />
            <Num label="Ø caballetes" value={c.dbMontaje} u={u} unit="mm" onChange={(v) => set((d) => { d.crit.dbMontaje = v ?? 10; })} />
            <Num label="Caballetes por m²" value={c.caballetesPorM2} u={u} onChange={(v) => set((d) => { d.crit.caballetesPorM2 = v ?? 1; })} />
          </Grid>
          <div className="mt-3 text-[11px] font-bold text-slate-600">Armadura manual (diámetro y separación entre ejes [mm])</div>
          <table className="tbl"><thead><tr><th>Armadura</th><th>Manual</th><th>Ø</th><th>s [mm]</th></tr></thead><tbody>
            {man('longInf', 'Longitudinal inferior')}{man('longSup', 'Longitudinal superior')}{man('transInf', 'Transversal inferior')}{man('transSup', 'Transversal superior')}
          </tbody></table>
        </Card>
      </div>
      <Card title="Dimensionamiento automático" right={<Btn kind="pri" disabled={busy} onClick={run}>{busy ? 'Calculando…' : 'Dimensionar automáticamente'}</Btn>}>
        <Grid cols={4}>
          <Num label="Incremento en planta" value={c.incPlanta} q="length" u={u} min={10} onChange={(v) => set((d) => { d.crit.incPlanta = v ?? 50; })} />
          <Num label="Incremento de espesor" value={c.incEspesor} q="length" u={u} min={10} onChange={(v) => set((d) => { d.crit.incEspesor = v ?? 50; })} />
          <Num label="Relación máxima L/B" value={c.ratioMax} u={u} onChange={(v) => set((d) => { d.crit.ratioMax = v ?? 6; })} />
          <div className="pt-3">
            <Chk label="Probar trapezoidal" value={c.probarTrapezoidal} onChange={(v) => set((d) => { d.crit.probarTrapezoidal = v; })} />
          </div>
        </Grid>
        <div className="mt-1 flex flex-wrap gap-4">
          <Chk label="Bloquear largo" value={c.lockL} onChange={(v) => set((d) => { d.crit.lockL = v; })} />
          <Chk label="Bloquear ancho" value={c.lockB} onChange={(v) => set((d) => { d.crit.lockB = v; })} />
          <Chk label="Bloquear espesor" value={c.lockH} onChange={(v) => set((d) => { d.crit.lockH = v; })} />
        </div>
        <div className="text-[11px] text-slate-500">Límites: dimensiones máximas, medianeras y espesores mín./máx. de la pestaña Geometría; diámetros y separaciones de Materiales.</div>
        {auto && (
          <div className="mt-3 space-y-2">
            {auto.explicacion.map((t, i) => <Note key={i} kind={auto.mejor ? 'info' : 'error'}>{t}</Note>)}
            {auto.mejor && <Btn kind="pri" onClick={() => apply(auto.mejor!)}>Adoptar solución seleccionada</Btn>}
            <div className="max-h-80 overflow-auto">
              <table className="tbl">
                <thead><tr><th>Forma</th><th>L [m]</th><th>B1 [m]</th><th>B2 [m]</th><th>h [m]</th><th>x0 [m]</th><th>Vol. H° [m³]</th><th>Acero [kg]</th><th>D/C máx</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {auto.candidatos.slice(0, 60).map((k, i) => (
                    <tr key={i} style={k === auto.mejor ? { fontWeight: 'bold' } : undefined}>
                      <td>{k.forma}</td><td>{fmt(k.L / 1e3)}</td><td>{k.B1 ? fmt(k.B1 / 1e3) : '—'}</td><td>{k.forma === 'trapezoidal' ? fmt(k.B2 / 1e3) : '—'}</td><td>{fmt(k.h / 1e3)}</td><td>{fmt(k.x0 / 1e3)}</td>
                      <td>{Number.isFinite(k.vol) ? fmt(k.vol / 1e9) : '—'}</td><td>{Number.isFinite(k.acero) ? fmt(k.acero, 0) : '—'}</td><td>{Number.isFinite(k.maxRatio) ? fmt(k.maxRatio) : '—'}</td>
                      <td>{k.ok ? <Badge e="ok" /> : <span title={k.falla}><Badge e="fail" /></span>}</td>
                      <td>{k.B1 > 0 && <button className="text-accent underline" onClick={() => apply(k)}>usar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {r && p.meta.modo === 'dimensionamiento' && !auto && <div className="mt-2"><Note>Modo dimensionamiento: presione "Dimensionar automáticamente" y adopte la solución.</Note></div>}
      </Card>
    </div>
  );
}
