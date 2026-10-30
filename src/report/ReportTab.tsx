import { useRef, type ReactNode } from 'react';
import type { TabProps } from '../App';
import { Btn, Note, ESTADO_TXT, ESTADO_COLOR } from '../ui/components';
import type { Check, Project } from '../core/types';
import type { LongFace } from '../core/analysis';
import { fmt } from '../core/units';
import { beta1 } from '../norm/config';
import { comboTotals } from '../core/loads';
import { expresion } from '../core/combos';
import { interp } from '../core/beam';
import { ld, ldh, ldc } from '../core/section';
import { Diagram, PressureMap, tramoEq } from '../ui/ResultTabs';
import { SignConvention } from '../ui/SignConvention';
import { BendingSchedule } from '../drawings/Schedule';
import { SvgDrawing, printHTML } from '../drawings/render';
import { LAYERS, longSection, planDrawing, transSection } from '../drawings/model';

const kN = (v: number, d = 2) => fmt(v / 1e3, d);
const kNm = (v: number, d = 2) => fmt(v / 1e6, d);
const kPa = (v: number, d = 2) => fmt(v * 1e3, d);
const m = (v: number, d = 3) => fmt(v / 1e3, d);

const Eq = ({ children }: { children: ReactNode }) => <div className="eq">{children}</div>;
const V = ({ e }: { e: Check['estado'] }) => <b style={{ color: ESTADO_COLOR[e] }}>{ESTADO_TXT[e]}</b>;
function KV({ rows }: { rows: [string, ReactNode][] }) {
  return <table><tbody>{rows.map(([a, b], i) => <tr key={i}><th style={{ width: '40%' }}>{a}</th><td>{b}</td></tr>)}</tbody></table>;
}
function CheckBlock({ c }: { c?: Check }) {
  if (!c) return null;
  return (
    <div className="avoid" style={{ marginBottom: 6 }}>
      <h3>{c.titulo}</h3>
      <Eq>{c.formula}</Eq>
      {c.variables && <div style={{ fontSize: '9pt' }}>Donde: {c.variables}</div>}
      <Eq>{c.sustitucion}</Eq>
      <div>D/C = {Number.isFinite(c.ratio) ? fmt(c.ratio, 3) : '—'} · Combinación gobernante: {c.combo} · Ref.: {c.ref} → <V e={c.estado} /></div>
      {c.nota && <div style={{ fontSize: '9pt', color: '#92400e' }}>Nota: {c.nota}</div>}
    </div>
  );
}

function FlexStep({ f, p, titulo }: { f: LongFace; p: Project; titulo: string }) {
  const fc = p.mat.hormigon.fc, fy = p.mat.acero.fy, n = p.norm;
  if (!f.total || !(f.Mu > 0)) return <div><h3>{titulo}</h3><p>Sin demanda o sin disposición válida.</p></div>;
  const a = (f.total.As * fy) / (0.85 * fc * f.b);
  return (
    <div className="avoid">
      <h3>{titulo}</h3>
      <KV rows={[['Mu (envolvente)', `${kNm(f.Mu)} kNm en x = ${m(f.x)} m (${f.combo})`], ['b (ancho en la sección)', `${fmt(f.b, 0)} mm`], ['d (altura útil de la capa)', `${fmt(f.d, 0)} mm`], ["f'c / fy / φ", `${fc} MPa / ${fy} MPa / ${n.phiFlexion}`]]} />
      <Eq>As = (0,85·f'c·b·d/fy)·[1 − √(1 − 2·Mu/(φ·0,85·f'c·b·d²))]</Eq>
      <Eq>As = (0,85·{fc}·{fmt(f.b, 0)}·{fmt(f.d, 0)}/{fy})·[1 − √(1 − 2·{fmt(f.Mu, 0)}/({n.phiFlexion}·0,85·{fc}·{fmt(f.b, 0)}·{fmt(f.d, 0)}²))] = {fmt(f.AsReq, 0)} mm²</Eq>
      <Eq>As,mín = ρmín·b·h = {n.rhoMinFlexion}·{fmt(f.b, 0)}·{p.footing.h} = {fmt(f.AsMin, 0)} mm²</Eq>
      <Eq>Adoptado: {f.total.n} Ø{f.total.db} (s = {fmt(f.total.s, 0)} mm) → As = {fmt(f.total.As, 0)} mm² ; continuas {f.nCont}, refuerzos {f.total.n - f.nCont}</Eq>
      <Eq>a = As·fy/(0,85·f'c·b) = {fmt(a, 1)} mm ; φMn = φ·As·fy·(d − a/2) = {kNm(f.phiMnTot)} kNm ≥ Mu = {kNm(f.Mu)} kNm</Eq>
      <Eq>c = a/β1 = {fmt(a / beta1(fc, n), 1)} mm ; εt = 0,003·(d − c)/c = {fmt(f.eps, 4)} ≥ {n.epsTMin} (controlada por tracción)</Eq>
    </div>
  );
}

export function ReportTab({ p, r }: TabProps) {
  const ref = useRef<HTMLDivElement>(null);
  if (!r) return <Note kind="error">Sin resultados.</Note>;
  const f = p.footing, s = r.shape, n = p.norm, g = p.geo, mt = p.mat;
  const ck = (id: string) => r.checks.find((c) => c.id === id);
  const geo = r.checks.filter((c) => c.grupo === 'geo');
  const allLayers = new Set(LAYERS.map((l) => l.id));
  const ds = [planDrawing(p, r, 50), longSection(p, r, 50), transSection(p, r, 50)];
  const govU = r.ult.find((u) => u.tot.combo.nombre === r.env.Mneg.combo) ?? r.ult[0];
  const govS = r.service.length ? r.service.reduce((a, b) => (b.pf.qmax > a.pf.qmax ? b : a)) : null;
  const print = () => { if (ref.current) printHTML(`<div class="memoria">${ref.current.innerHTML}</div>`, 'A4 portrait'); };
  const H = ({ n: k, t, pb }: { n: number; t: string; pb?: boolean }) => <h2 className={pb ? 'pb' : ''}>{k}. {t}</h2>;

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Btn kind="pri" onClick={print}>Exportar PDF (imprimir)</Btn>
        <span className="text-[12px] text-slate-500">En el diálogo de impresión elija "Guardar como PDF". Tipografía Arial, hoja A4.</span>
      </div>
      <div ref={ref} className="memoria mx-auto max-w-[210mm] rounded border border-slate-200 p-8 shadow-sm">
        {/* 1. Carátula */}
        <section style={{ minHeight: '240mm', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '11pt', color: '#0e7c86', fontWeight: 'bold', letterSpacing: 2 }}>MEMORIA DE CÁLCULO</div>
          <h1>Zapata combinada de hormigón armado</h1>
          <div style={{ fontSize: '14pt', marginTop: 8 }}>{p.meta.obra}</div>
          <KV rows={[['Ubicación', p.meta.ubicacion], ['Código', p.meta.codigo], ['Profesional', p.meta.profesional], ['Fecha', p.meta.fecha], ['Reglamento', `${n.reglamento} — ${n.edicion}`], ['Estado general', <b style={{ color: ESTADO_COLOR[r.estado.nivel] }}>{r.estado.texto}</b>]]} />
          <p style={{ fontSize: '9pt', marginTop: 20 }}>Documento generado por una herramienta de asistencia al cálculo. No reemplaza la revisión de un ingeniero estructural matriculado. Las referencias reglamentarias son configurables y deben verificarse contra la edición vigente.</p>
        </section>

        <H n={2} t="Datos del proyecto" pb />
        <KV rows={[['Obra', p.meta.obra], ['Ubicación', p.meta.ubicacion], ['Profesional', p.meta.profesional], ['Código', p.meta.codigo], ['Descripción', p.meta.descripcion], ['Observaciones', p.meta.observaciones || '—'], ['Tipo de análisis', p.meta.modo === 'verificacion' ? 'Verificación de dimensiones ingresadas' : 'Dimensionamiento automático'], ['Unidades internas', 'N, mm, MPa (presentación en kN, kNm, m, kPa)']]} />

        <H n={3} t="Alcance" />
        <ul>
          <li>Verificaciones geotécnicas en servicio: presiones de contacto, pérdida de contacto, núcleo central, deslizamiento, vuelco, levantamiento, flotación.</li>
          <li>Verificaciones estructurales últimas: flexión longitudinal y transversal, corte unidireccional, punzonamiento, aplastamiento, cuantías, separaciones, anclajes y esperas.</li>
          <li>Generación de armaduras, planilla de doblado, cómputo y planos esquemáticos.</li>
          <li>No incluye: capacidad portante teórica (c, φ), asentamiento diferencial, diseño de pedestales como columna corta, refuerzo de punzonamiento, efectos sísmicos específicos de CIRSOC 103.</li>
        </ul>

        <H n={4} t="Normativa" />
        <KV rows={[['Estructural', `${n.reglamento} — ${n.edicion}`], ['Geotécnica', n.reglamentoSuelos], ['φ flexión / corte / aplastamiento', `${n.phiFlexion} / ${n.phiCorte} / ${n.phiAplastamiento}`], ['β1', `${beta1(mt.hormigon.fc, n)} (f'c = ${mt.hormigon.fc} MPa)`], ['ρ mín. flexión (b·h)', `${n.rhoMinFlexion}`], ['ρ cara comprimida (hipótesis)', `${n.rhoMinCaraComprimida}`], ['εt mínima', `${n.epsTMin}`], ['s máx.', `mín(${n.sMaxFactorH}·h; ${n.sMaxAbs} mm)`], ['Vc', `${fmt(n.vcCoef, 4)}·λ·√f'c·b·d`], ['Punzonamiento', `mín[(1+2/β)·${fmt(n.punz.a, 4)}; (αs·d/b0+2)·${fmt(n.punz.b, 4)}; ${fmt(n.punz.c, 4)}]·λ·√f'c ; αs = ${n.punz.alphaInterior}/${n.punz.alphaBorde}/${n.punz.alphaEsquina}`]]} />
        <table><thead><tr><th>Tema</th><th>Referencia</th></tr></thead><tbody>{Object.entries(n.referencias).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>

        <H n={5} t="Hipótesis" />
        <ul>
          <li>Zapata rígida: distribución lineal de presiones; si q mín &lt; 0 se calcula el área comprimida iterativamente (sin tracciones).</li>
          <li>Servicio: cargas brutas de columnas + peso propio{p.crit.incluirSuelo ? ' + suelo' : ''}{p.crit.incluirPedestales ? ' + pedestales' : ''}{p.crit.incluirSubpresion ? ' − subpresión' : ''}.</li>
          <li>Últimas: presión neta del suelo debida solo a las cargas mayoradas de columnas (el peso propio y el relleno se equilibran con su propia reacción).</li>
          <li>Columnas como cargas concentradas en sus ejes; momentos de diseño tomados en el eje (conservador respecto de la cara).</li>
          <li>Columnas circulares: cuadrado equivalente de igual área. Columnas giradas: dimensiones sin rotar.</li>
          <li>Flexión transversal: q_u,máx por metro en todo el largo y bandas b_col + d con Pu/B bajo cada columna.</li>
          <li>Dirección longitudinal = eje X global. Mz (torsión) no se considera.</li>
        </ul>

        <H n={6} t="Convención de signos" />
        <div style={{ maxWidth: 320 }}><SignConvention /></div>

        <H n={7} t="Geometría" pb />
        <KV rows={[['Forma', f.forma], ['L', `${m(s.L)} m`], ['B1 / B2', `${m(s.B1)} / ${m(s.B2)} m`], ['h', `${m(f.h)} m`], ['Origen (x0; y0)', `(${m(f.x0)}; ${m(f.y0)}) m`], ['Desplante Df', `${m(f.Df)} m`], ['Cotas: terreno / superior / fundación', `${m(f.cotaTerreno)} / ${m(f.cotaTerreno - f.Df + f.h)} / ${m(f.cotaTerreno - f.Df)} m`], ['Recubrimientos inf / sup / lat', `${f.recInf} / ${f.recSup} / ${f.recLat} mm`], ['Hormigón de limpieza', `${f.limpieza} mm`]]} />
        <Eq>A = L·(B1 + B2)/2 = {m(s.L)}·({m(s.B1)} + {m(s.B2)})/2 = {fmt(s.A / 1e6, 3)} m²</Eq>
        <Eq>x̄ = L·(B1 + 2·B2)/(3·(B1 + B2)) = {m(s.xc)} m ; Iy = {fmt(s.Iy / 1e12, 4)} m⁴ ; Ix = {fmt(s.Ix / 1e12, 4)} m⁴</Eq>

        <H n={8} t="Materiales" />
        <KV rows={[['Hormigón', `${mt.hormigon.nombre}: f'c = ${mt.hormigon.fc} MPa ; γc = ${fmt(mt.hormigon.gammaC * 1e6, 1)} kN/m³ ; Ec = ${fmt(mt.hormigon.Ec ?? 4700 * Math.sqrt(mt.hormigon.fc), 0)} MPa`], ['Acero', `${mt.acero.nombre}: fy = ${mt.acero.fy} MPa ; Es = ${mt.acero.Es} MPa`], ['Diámetros disponibles', mt.diametros.map((d) => `Ø${d}`).join(', ')], ['Agregado / exposición', `${mt.agregado} mm / ${mt.exposicion}`], ['Relleno', `${fmt(mt.gammaRelleno * 1e6, 1)} kN/m³`]]} />

        <H n={9} t="Datos geotécnicos" />
        <KV rows={[['q adm', `${kPa(g.qadm)} kPa (${g.qadmTipo})`], ['q adm permanente / transitoria', `${g.qadmPerm ? kPa(g.qadmPerm) : '= q adm'} / ${g.qadmTrans ? kPa(g.qadmTrans) : '= q adm'} kPa`], ['q ult', g.qult ? `${kPa(g.qult)} kPa` : 'No informada'], ['γ / γsat', `${fmt(g.gamma * 1e6, 1)} / ${fmt(g.gammaSat * 1e6, 1)} kN/m³`], ['Nivel freático', g.nf === null ? 'No informado (se supone por debajo de la base)' : `${m(g.nf)} m bajo terreno`], ['μ / adhesión', `${g.mu} / ${kPa(g.adhesion)} kPa`], ['FS deslizamiento / vuelco', `${g.fsDesl} / ${g.fsVuelco}`], ['Es / ν / s adm', `${g.Es ?? '—'} MPa / ${g.nu ?? '—'} / ${g.sAdm ?? '—'} mm`], ['c / φ / ks', `${kPa(g.c)} kPa / ${g.phi}° / ${g.ks ?? '—'} — NO UTILIZADOS`], ['Agresividad', g.agresividad], ['Observaciones', g.obs || '—']]} />

        <H n={10} t="Columnas y cargas" pb />
        <table><thead><tr><th>Col.</th><th>X [m]</th><th>Y [m]</th><th>Sección</th><th>z carga [m]</th><th>Pedestal</th><th>Barras</th><th>Estribos</th></tr></thead><tbody>
          {p.columns.map((c) => <tr key={c.id}><td>{c.nombre}</td><td>{m(c.x)}</td><td>{m(c.y)}</td><td>{c.forma === 'circ' ? `Ø${c.D}` : `${c.bx}×${c.by}`} mm</td><td>{m(c.zCarga)}</td><td>{c.ped.activo ? `${c.ped.bx}×${c.ped.by}×${c.ped.h} mm` : '—'}</td><td>{c.nBarras}Ø{c.dbBarras}</td><td>Ø{c.dbEstribo} c/{c.sEstribo}</td></tr>)}
        </tbody></table>
        <table><thead><tr><th>Comb.</th><th>Col.</th><th>N [kN]</th><th>Vx [kN]</th><th>Vy [kN]</th><th>Mx [kNm]</th><th>My [kNm]</th><th>Mz [kNm]</th></tr></thead><tbody>
          {p.combos.filter((c) => c.activa).flatMap((cb) => p.columns.map((c) => { const l = cb.cargas[c.id]; return l && <tr key={cb.id + c.id}><td>{cb.nombre}</td><td>{c.nombre}</td><td>{kN(l.N)}</td><td>{kN(l.Vx)}</td><td>{kN(l.Vy)}</td><td>{kNm(l.Mx)}</td><td>{kNm(l.My)}</td><td>{kNm(l.Mz)}</td></tr>; }))}
        </tbody></table>

        <H n={11} t="Combinaciones" />
        {p.casos.length > 0 && <>
          <h3>Casos de carga (sin mayorar)</h3>
          <table><thead><tr><th>Caso</th><th>Tipo</th><th>Col.</th><th>N [kN]</th><th>Vx [kN]</th><th>Vy [kN]</th><th>Mx [kNm]</th><th>My [kNm]</th><th>Mz [kNm]</th></tr></thead><tbody>
            {p.casos.flatMap((cs) => p.columns.map((c) => { const l = cs.cargas[c.id]; return l && <tr key={cs.id + c.id}><td>{cs.nombre}</td><td>{cs.tipo}</td><td>{c.nombre}</td><td>{kN(l.N)}</td><td>{kN(l.Vx)}</td><td>{kN(l.Vy)}</td><td>{kNm(l.Mx)}</td><td>{kNm(l.My)}</td><td>{kNm(l.Mz)}</td></tr>; }))}
          </tbody></table>
          <h3>Plantillas de factores</h3>
          <table><thead><tr><th>Plantilla</th><th>Tipo</th><th>Factores por tipo de caso</th><th>± W/E</th></tr></thead><tbody>
            {p.plantillas.filter((t) => t.activa).map((t) => <tr key={t.id}><td>{t.nombre}</td><td>{t.tipo}{t.transitoria ? ' (transitoria)' : ''}</td><td>{Object.entries(t.factores).map(([k, v]) => `${fmt(v, 2)}·${k}`).join(' + ')}</td><td>{t.alternar ? 'Sí' : 'No'}</td></tr>)}
          </tbody></table>
          <p style={{ fontSize: '9pt' }}>Casos del mismo tipo se suman; los casos W y E son alternativas excluyentes (una combinación por dirección y signo).</p>
        </>}
        <table><thead><tr><th>Id</th><th>Nombre</th><th>Tipo</th><th>Origen</th><th>Expresión</th><th>Transitoria</th><th>Activa</th></tr></thead><tbody>
          {p.combos.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.nombre}</td><td>{c.tipo}</td><td>{c.origen}</td><td>{c.generada ? expresion(c) : 'Ingresada'}</td><td>{c.transitoria ? 'Sí' : 'No'}</td><td>{c.activa ? 'Sí' : 'No'}</td></tr>)}
        </tbody></table>
        <p>Criterio: {p.meta.criterioCombinaciones}</p>

        <H n={12} t="Traslado de cargas al plano de fundación" />
        <Eq>M_final = M_inicial + r × F ; F = (Vx, Vy, −N) ; r = (x − x̄, y − y0, h + z_carga) respecto del centroide de la base</Eq>
        <Eq>r × F = (ry·Fz − rz·Fy ; rz·Fx − rx·Fz ; rx·Fy − ry·Fx)</Eq>
        <table><thead><tr><th>Comb.</th><th>Col.</th><th>r [m]</th><th>F [kN]</th><th>M inicial [kNm]</th><th>r × F [kNm]</th><th>M final [kNm]</th></tr></thead><tbody>
          {p.combos.filter((c) => c.activa).flatMap((cb) => comboTotals(p, s, cb, null).transfers.map((t) => (
            <tr key={cb.id + t.col}><td>{cb.nombre}</td><td>{t.col}</td><td>({t.r.map((v) => m(v)).join('; ')})</td><td>({t.F.map((v) => kN(v, 1)).join('; ')})</td><td>({t.M0.map((v) => kNm(v, 1)).join('; ')})</td><td>({t.rxF.map((v) => kNm(v, 1)).join('; ')})</td><td>({t.M.map((v) => kNm(v, 1)).join('; ')})</td></tr>
          )))}
        </tbody></table>

        <H n={13} t="Resultante y posición" />
        <table><thead><tr><th>Comb. servicio</th><th>N total [kN]</th><th>Mx [kNm]</th><th>My [kNm]</th><th>ex = My/N [m]</th><th>ey = −Mx/N [m]</th><th>X global [m]</th><th>Y global [m]</th></tr></thead><tbody>
          {r.service.map((x) => <tr key={x.tot.combo.id}><td>{x.tot.combo.nombre}</td><td>{kN(x.tot.N)}</td><td>{kNm(x.tot.Mx)}</td><td>{kNm(x.tot.My)}</td><td>{m(x.pf.ex)}</td><td>{m(x.pf.ey)}</td><td>{m(f.x0 + s.xc + x.pf.ex)}</td><td>{m(f.y0 + x.pf.ey)}</td></tr>)}
        </tbody></table>

        <H n={14} t="Predimensionado del área" />
        <Eq>A req = k·N/q_adm = {fmt(r.predim.factor)}·{kN(r.predim.N)} kN / {kPa(r.predim.qadm)} kPa = {fmt(r.predim.Areq / 1e6, 2)} m²  ({r.predim.combo}; k = peso propio preliminar)</Eq>
        <Eq>q estimada = k·N/A = {fmt(r.predim.factor)}·{kN(r.predim.N)}/{fmt(s.A / 1e6, 2)} = {kPa(r.predim.qEst)} kPa</Eq>

        <H n={15} t="Selección de dimensiones" />
        <p>Dimensiones adoptadas: {f.forma} {m(s.L, 2)} × {m(s.B1, 2)}{f.forma === 'trapezoidal' ? `/${m(s.B2, 2)}` : ''} × {m(f.h, 2)} m ; A = {fmt(s.A / 1e6, 2)} m² {s.A >= r.predim.Areq ? '≥' : '<'} A req = {fmt(r.predim.Areq / 1e6, 2)} m². Centroide en X = {m(f.x0 + s.xc)} m. {p.meta.modo === 'dimensionamiento' ? 'Dimensiones obtenidas con el algoritmo de dimensionamiento automático (cumplimiento → menor volumen → menor acero → simplicidad).' : 'Dimensiones ingresadas por el usuario (verificación).'}</p>

        <H n={16} t="Peso propio" />
        <KV rows={[['Zapata Wz', `${kN(r.w.Wz)} kN`], ['Suelo sobre zapata Ws', `${kN(r.w.Ws)} kN`], ['Pedestales Wp', `${kN(r.w.Wp)} kN`], ['Subpresión U', `${kN(r.w.U)} kN (hw = ${m(r.w.hw)} m)`]]} />
        {r.w.detalle.map((t, i) => <Eq key={i}>{t}</Eq>)}

        <H n={17} t="Presiones de contacto" pb />
        <Eq>q(x,y) = N/A + My·x/Iy − Mx·y/Ix (contacto total) ; si q mín &lt; 0: p = máx(0, q0 + a·x + b·y) con ∫p dA = N, ∫x·p dA = N·ex, ∫y·p dA = N·ey (Newton)</Eq>
        <table><thead><tr><th>Comb.</th><th>N [kN]</th><th>q med</th><th>q máx</th><th>q mín</th><th>Contacto</th><th>Esquinas [kPa]</th><th>q adm</th></tr></thead><tbody>
          {r.service.map((x) => <tr key={x.tot.combo.id}><td>{x.tot.combo.nombre}</td><td>{kN(x.tot.N)}</td><td>{kPa(x.pf.qmed)}</td><td>{kPa(x.pf.qmax)}</td><td>{kPa(x.pf.qmin)}</td><td>{fmt(x.pf.areaComprimida * 100, 1)}%</td><td>{x.pf.esquinas.map((e) => kPa(e.q, 1)).join(' / ')}</td><td>{kPa(x.qadm)}</td></tr>)}
        </tbody></table>
        {govS && <>
          <Eq>q máx = {kN(govS.tot.N)}/{fmt(s.A / 1e6, 3)} + {kNm(govS.tot.My)}·x/{fmt(s.Iy / 1e12, 4)} − {kNm(govS.tot.Mx)}·y/{fmt(s.Ix / 1e12, 4)} = {kPa(govS.pf.qmax)} kPa ({govS.tot.combo.nombre})</Eq>
          <div className="avoid"><PressureMap p={p} r={r} pf={govS.pf} title={`Mapa de presiones — ${govS.tot.combo.nombre}`} /></div>
        </>}
        <CheckBlock c={ck('geo-q')} />
        <CheckBlock c={ck('geo-contacto')} />

        <H n={18} t="Estabilidad" />
        {geo.filter((c) => c.id !== 'geo-q' && c.id !== 'geo-contacto').map((c) => <CheckBlock key={c.id} c={c} />)}

        <H n={19} t="Modelo estructural" pb />
        <p>Método 1 — viga invertida en dirección X: carga lineal ascendente w(x) = ∫q_neta(x,y)·dy, cargas concentradas de columnas y pares C = My + z·Vx. Método 2 — franjas ortogonales para la flexión transversal.</p>
        {govU && <Eq>q_u neta media = ΣPu/A = {kN(govU.tot.N)}/{fmt(s.A / 1e6, 3)} = {kPa(govU.pf.qmed)} kPa ; w = q_u·B = {fmt(govU.pf.qmed * s.B1, 2)} kN/m ({govU.tot.combo.nombre}, en x = 0)</Eq>}
        {r.advertenciasModelo.map((t, i) => <p key={i} style={{ color: '#92400e' }}>⚠ {t}</p>)}

        <H n={20} t="Cálculo del corte" />
        {govU && <>
          {tramoEq(govU.beam, p).map((t, i) => <Eq key={i}>{t}</Eq>)}
          <table><thead><tr><th>Sección</th><th>x [m]</th><th>V [kN]</th></tr></thead><tbody>
            {p.columns.flatMap((c) => {
              const x = c.x - f.x0; const b = c.ped.activo ? c.ped.bx : c.bx;
              return [[`${c.nombre} cara izq. − d`, x - b / 2 - r.d.corte], [`${c.nombre} izq.`, x - 1e-6], [`${c.nombre} der.`, x + 1e-6], [`${c.nombre} cara der. + d`, x + b / 2 + r.d.corte]] as [string, number][];
            }).filter(([, x]) => x > 0 && x < s.L).map(([t, x]) => <tr key={t}><td>{t}</td><td>{m(x)}</td><td>{kN(interp(govU.beam, x, 'V'))}</td></tr>)}
          </tbody></table>
        </>}

        <H n={21} t="Cálculo del momento" />
        {govU && <table><thead><tr><th>Punto</th><th>x [m]</th><th>M [kNm]</th><th>Comb.</th></tr></thead><tbody>
          <tr><td>Máximo positivo (tracción inferior)</td><td>{m(r.env.Mpos.x)}</td><td>{kNm(r.env.Mpos.M)}</td><td>{r.env.Mpos.combo}</td></tr>
          <tr><td>Máximo negativo (tracción superior)</td><td>{m(r.env.Mneg.x)}</td><td>{kNm(r.env.Mneg.M)}</td><td>{r.env.Mneg.combo}</td></tr>
          {govU.beam.ceroM.map((x, i) => <tr key={i}><td>Punto de inflexión</td><td>{m(x)}</td><td>0</td><td>{govU.tot.combo.nombre}</td></tr>)}
          {govU.beam.ceroV.map((x, i) => <tr key={`v${i}`}><td>V = 0 (extremo de M)</td><td>{m(x)}</td><td>{kNm(interp(govU.beam, x, 'M'))}</td><td>{govU.tot.combo.nombre}</td></tr>)}
        </tbody></table>}

        <H n={22} t="Diagramas V y M" />
        {r.ult.map((u) => (
          <div key={u.tot.combo.id} className="avoid">
            <h3>{u.tot.combo.nombre}</h3>
            <Diagram b={u.beam} p={p} r={r} k="V" title="V(x)" unit="kN" scale={1e3} color="#d97706" />
            <Diagram b={u.beam} p={p} r={r} k="M" title="M(x) — lado traccionado" unit="kNm" scale={1e6} invert color="#7c3aed" />
          </div>
        ))}

        <H n={23} t="Flexión longitudinal" pb />
        <FlexStep f={r.long.inf} p={p} titulo="Armadura inferior (momento positivo)" />
        <CheckBlock c={ck('est-flex-inf')} />
        <FlexStep f={r.long.sup} p={p} titulo="Armadura superior (momento negativo)" />
        <CheckBlock c={ck('est-flex-sup')} />
        {['inf', 'sup'].map((c) => <div key={c}><CheckBlock c={ck(`est-rhomin-${c}`)} /><CheckBlock c={ck(`est-rhomax-${c}`)} /><CheckBlock c={ck(`est-sep-${c}`)} /></div>)}

        <H n={24} t="Flexión transversal" />
        <CheckBlock c={ck('est-flex-trans')} />
        {r.trans.inf.bandas.map((b) => <CheckBlock key={b.colId} c={ck(`est-banda-${b.colId}`)} />)}
        <CheckBlock c={ck('est-rhomin-trans')} />
        <CheckBlock c={ck('est-trans-sup')} />

        <H n={25} t="Corte unidireccional" />
        <CheckBlock c={ck('est-corte-long')} />
        <CheckBlock c={ck('est-corte-trans')} />

        <H n={26} t="Punzonamiento de cada columna" pb />
        {r.punz.map((x) => (
          <div key={x.col} className="avoid">
            <h3>{x.col} — perímetro {x.cp.tipo} ({x.cp.lados} lados)</h3>
            <Eq>b0 = {fmt(x.cp.b0, 0)} mm ; d = {fmt(x.d, 0)} mm ; A crítica = {fmt(x.cp.area / 1e6, 4)} m² ; β = {fmt(x.beta, 2)} ; αs = {x.chk.alpha}</Eq>
            <Eq>Vu = Pu − q_u·A_crit = {kN(x.Pu)} − {kPa(x.qu)}·{fmt(x.cp.area / 1e6, 4)} = {kN(x.Vu)} kN</Eq>
            <Eq>vc = mín[(1 + 2/β)/6 ; (αs·d/b0 + 2)/12 ; 1/3]·√f'c = mín[{fmt(x.chk.vcA, 3)} ; {fmt(x.chk.vcB, 3)} ; {fmt(x.chk.vcC, 3)}] = {fmt(x.chk.vc, 3)} MPa</Eq>
            <Eq>γv = 1 − 1/(1 + (2/3)·√(b1/b2)) → γvx = {fmt(x.chk.gvx, 3)}, γvy = {fmt(x.chk.gvy, 3)} ; Jcx = {fmt(x.chk.Jx / 1e12, 4)}·10¹² mm⁴ ; Jcy = {fmt(x.chk.Jy / 1e12, 4)}·10¹² mm⁴</Eq>
            <Eq>vu = Vu/(b0·d) + γv·|Muy|·c/Jc + γv·|Mux|·c/Jc = {fmt(x.chk.v1, 3)} + {fmt(x.chk.v2, 3)} + {fmt(x.chk.v3, 3)} = {fmt(x.chk.vu, 3)} MPa ≤ φ·vc = {fmt(x.chk.phivc, 3)} MPa</Eq>
            <div>Combinación: {x.combo} → <V e={x.chk.ratio <= 1 ? 'ok' : 'fail'} /></div>
          </div>
        ))}
        {r.punzConjunto && <CheckBlock c={r.checks.find((c) => c.id.startsWith('est-punz-conj'))} />}
        {p.columns.map((c) => <CheckBlock key={c.id} c={ck(`est-aplast-${c.id}`)} />)}

        <H n={27} t="Anclajes y empalmes" />
        <table><thead><tr><th>Ø</th><th>ld inferior [mm]</th><th>ld superior (ψt) [mm]</th><th>ldh [mm]</th><th>ldc [mm]</th><th>Empalme clase B [mm]</th></tr></thead><tbody>
          {mt.diametros.map((d) => <tr key={d}><td>{d}</td><td>{fmt(ld(d, mt.hormigon.fc, mt.acero.fy, n), 0)}</td><td>{fmt(ld(d, mt.hormigon.fc, mt.acero.fy, n, true), 0)}</td><td>{fmt(ldh(d, mt.hormigon.fc, mt.acero.fy, n), 0)}</td><td>{fmt(ldc(d, mt.hormigon.fc, mt.acero.fy, n), 0)}</td><td>{fmt(n.empalmeClaseB * ld(d, mt.hormigon.fc, mt.acero.fy, n), 0)}</td></tr>)}
        </tbody></table>
        <Eq>ld = (c·fy·ψt·ψe·λ/√f'c)·db ≥ {n.ld.minimo} mm, c = {fmt(n.ld.coefMenor, 3)} (db ≤ {n.ld.dbLimite}) ó {fmt(n.ld.coefMayor, 3)} ; ldh = {n.ldh.coef}·ψe·λ·fy/√f'c·db ≥ máx(8db; 150 mm) ; ldc = máx({n.ldc.coef}·fy/(λ√f'c)·db; {n.ldc.coef2}·fy·db; 200 mm)</Eq>
        {r.checks.filter((c) => c.id.startsWith('est-anc') || c.id.startsWith('est-esp') || c.id.startsWith('est-ped')).map((c) => <CheckBlock key={c.id} c={c} />)}

        <H n={28} t="Armaduras adoptadas" pb />
        <table><thead><tr><th>Marca</th><th>Elemento</th><th>Armadura</th><th>Ubicación</th></tr></thead><tbody>
          {r.schedule.marcas.map((x) => <tr key={x.marca}><td>{x.marca}</td><td>{x.elemento}</td><td>{x.n} Ø{x.db} L = {m(x.lu, 2)} m</td><td>{x.ubic}</td></tr>)}
        </tbody></table>

        <H n={29} t="Planilla de doblado" />
        <BendingSchedule p={p} r={r} />

        <H n={30} t="Cómputo de hormigón, acero y excavación" />
        <KV rows={[['Hormigón zapata', `${fmt(r.cantidades.Vh / 1e9, 3)} m³`], ['Hormigón pedestales', `${fmt(r.cantidades.Vped / 1e9, 3)} m³`], ['Hormigón de limpieza', `${fmt(r.cantidades.Vlimp / 1e9, 3)} m³`], ['Excavación (sobreancho ' + p.crit.sobreancho + ' mm, paredes verticales)', `${fmt(r.cantidades.Vexc / 1e9, 3)} m³`], ['Acero (con desperdicio)', `${fmt(r.cantidades.acero, 1)} kg`], ['Cuantía', `${fmt(r.cantidades.kgm3, 1)} kg/m³`]]} />

        <H n={31} t="Resumen de verificaciones" pb />
        <table><thead><tr><th>Grupo</th><th>Verificación</th><th>D/C</th><th>Comb.</th><th>Estado</th></tr></thead><tbody>
          {r.checks.map((c) => <tr key={c.id}><td>{c.grupo === 'geo' ? 'Geotécnica (servicio)' : 'Estructural (última)'}</td><td>{c.titulo}</td><td>{Number.isFinite(c.ratio) ? fmt(c.ratio, 3) : '—'}</td><td>{c.combo}</td><td><V e={c.estado} /></td></tr>)}
        </tbody></table>
        <p><b>Estado general: <span style={{ color: ESTADO_COLOR[r.estado.nivel] }}>{r.estado.texto}</span></b> (D/C máx = {fmt(r.estado.maxRatio, 3)})</p>

        <H n={32} t="Advertencias y limitaciones" />
        <ul>
          {r.issues.map((i, k) => <li key={k}>[{i.nivel.toUpperCase()}] {i.msg}</li>)}
          {r.advertenciasModelo.map((t, k) => <li key={`m${k}`}>[MODELO] {t}</li>)}
          {r.checks.filter((c) => c.estado === 'nc').map((c) => <li key={c.id}>[NO CALCULADO] {c.titulo}: {c.sustitucion}</li>)}
          <li>Herramienta de asistencia al cálculo; requiere revisión de un ingeniero estructural matriculado.</li>
        </ul>

        <H n={33} t="Planos" pb />
        {ds.map((d) => <div key={d.id} className="avoid" style={{ marginBottom: 12 }}><h3>{d.title} (escala gráfica de referencia 1:50)</h3><SvgDrawing d={d} k={50} layers={allLayers} /></div>)}
      </div>
    </div>
  );
}
