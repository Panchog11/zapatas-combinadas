import type { BarMark } from '../core/rebar';
import type { Results } from '../core/analysis';
import type { Project } from '../core/types';
import { fmt } from '../core/units';

/** Croquis de la barra con letras de dimensión */
export function Croquis({ m }: { m: BarMark }) {
  const W = 110, H = 34, s = 'stroke-[#0f1d2b]';
  const t = (x: number, y: number, v: string) => <text x={x} y={y} fontSize="8" textAnchor="middle" fill="#0e5a8a">{v}</text>;
  let body;
  switch (m.forma) {
    case 'U': body = <><polyline points="12,6 12,26 98,26 98,6" fill="none" strokeWidth="2" className={s} />{t(55, 22, 'B')}{t(6, 18, 'A')}{t(104, 18, 'C')}</>; break;
    case 'Ui': body = <><polyline points="12,28 12,8 98,8 98,28" fill="none" strokeWidth="2" className={s} />{t(55, 20, 'B')}{t(6, 20, 'A')}{t(104, 20, 'C')}</>; break;
    case 'L': body = m.grupo === 'espera' || m.grupo === 'ped'
      ? <><polyline points="20,4 20,28 60,28" fill="none" strokeWidth="2" className={s} />{t(13, 18, 'A')}{t(40, 25, 'B')}</>
      : <><polyline points="12,6 12,26 98,26" fill="none" strokeWidth="2" className={s} />{t(6, 18, 'A')}{t(55, 22, 'B')}</>; break;
    case 'estribo': body = <><rect x="30" y="5" width="50" height="24" fill="none" strokeWidth="2" className={s} /><polyline points="30,5 40,13" fill="none" strokeWidth="2" className={s} />{t(55, 17, 'A')}{t(88, 19, 'B')}</>; break;
    case 'caballete': body = <><polyline points="10,28 30,28 40,6 70,6 80,28 100,28" fill="none" strokeWidth="2" className={s} />{t(30, 18, 'A')}{t(55, 15, 'B')}{t(20, 25, 'C')}</>; break;
    default: body = <><line x1="10" y1="17" x2="100" y2="17" strokeWidth="2" className={s} />{t(55, 13, 'B')}</>;
  }
  return <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>{body}</svg>;
}

const formaTxt: Record<BarMark['forma'], string> = { recta: 'Recta', L: 'L (gancho 90°)', U: 'U (ganchos ↑)', Ui: 'U invertida (ganchos ↓)', estribo: 'Estribo cerrado 135°', caballete: 'Caballete' };

export function BendingSchedule({ p, r }: { p: Project; r: Results }) {
  const sc = r.schedule;
  const d = (v: number) => (v ? fmt(v / 1000, 2) : '—');
  const Vh = (r.cantidades.Vh + r.cantidades.Vped) / 1e9;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead><tr><th>Marca</th><th>Elemento</th><th>Ø [mm]</th><th>Forma</th><th>Croquis</th><th>A [m]</th><th>B [m]</th><th>C [m]</th><th>D [m]</th><th>Radio dobl. [mm]</th><th>Gancho [m]</th><th>L unit. [m]</th><th>Cant.</th><th>L total [m]</th><th>kg/m</th><th>Peso [kg]</th><th>Ubicación</th><th>Observaciones</th></tr></thead>
        <tbody>
          {sc.marcas.map((m) => (
            <tr key={m.marca}>
              <td className="font-bold">{m.marca}</td><td>{m.elemento}</td><td>{m.db}</td><td>{formaTxt[m.forma]}</td><td><Croquis m={m} /></td>
              <td>{d(m.A)}</td><td>{d(m.B)}</td><td>{d(m.C)}</td><td>{d(m.D)}</td><td>{fmt(m.radio, 0)}</td><td>{d(m.gancho)}</td>
              <td className="font-semibold">{fmt(m.lu / 1000, 2)}</td><td>{m.n}</td><td>{fmt(m.lt / 1000, 2)}</td><td>{fmt(m.pu, 3)}</td><td className="font-semibold">{fmt(m.pt, 1)}</td><td className="text-[10px]">{m.ubic}</td><td className="text-[10px]">{m.obs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="tbl mt-3 max-w-3xl">
        <thead><tr><th>Ø [mm]</th><th>Longitud total [m]</th><th>Peso neto [kg]</th><th>Peso c/desperdicio {p.crit.desperdicio}% [kg]</th><th>Barras de {fmt(p.crit.barraComercial / 1000, 0)} m (estim.)</th></tr></thead>
        <tbody>
          {sc.porDiametro.map((x) => <tr key={x.db}><td>{x.db}</td><td>{fmt(x.lt / 1000, 2)}</td><td>{fmt(x.peso, 1)}</td><td>{fmt(x.pesoDesp, 1)}</td><td>{x.barras}</td></tr>)}
          <tr className="font-bold"><td>Total</td><td>{fmt(sc.porDiametro.reduce((a, x) => a + x.lt, 0) / 1000, 2)}</td><td>{fmt(sc.porDiametro.reduce((a, x) => a + x.peso, 0), 1)}</td><td>{fmt(sc.pesoTotal, 1)}</td><td>{sc.porDiametro.reduce((a, x) => a + x.barras, 0)}</td></tr>
        </tbody>
      </table>
      <div className="mt-1 text-[11px] text-slate-500">Cuantía: {fmt(sc.pesoTotal / Vh, 1)} kg/m³ de hormigón ({fmt(Vh, 2)} m³). Peso = longitud total × peso lineal. Longitudes por dimensiones exteriores sin descuento por doblado (criterio conservador). Cantidad de barras comerciales estimada sin optimización de cortes.</div>
    </div>
  );
}
