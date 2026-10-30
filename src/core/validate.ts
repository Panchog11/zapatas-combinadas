import { colDims, inside, type Shape } from './geometry';
import type { Issue, Project } from './types';
import { generateCombos } from './combos';

export function validate(p: Project, s: Shape): Issue[] {
  const out: Issue[] = [];
  const f = p.footing;
  const e = (msg: string) => out.push({ nivel: 'error', msg });
  const w = (msg: string) => out.push({ nivel: 'warn', msg });
  const pos: [string, number][] = [['L', f.L], ['B1', f.B1], ['h', f.h], ['Df', f.Df]];
  if (f.forma === 'trapezoidal') pos.push(['B2', f.B2]);
  for (const [k, v] of pos) if (!(v > 0) || !Number.isFinite(v)) e(`Dimensión ${k} debe ser positiva.`);
  for (const [k, v] of [['rec. inferior', f.recInf], ['rec. superior', f.recSup], ['rec. lateral', f.recLat]] as const)
    if (!(v >= 0)) e(`Recubrimiento ${k} negativo.`);
  if (f.recInf < 50) w('Recubrimiento inferior < 50 mm: para hormigón contra el terreno se recomienda ≥ 75 mm (sobre limpieza ≥ 50 mm).');
  if (f.h > f.Df) w('El espesor supera la profundidad de desplante: la zapata sobresale del terreno.');
  if (p.columns.length < 2) e('Se requieren al menos 2 columnas o fustes.');
  if (f.L > f.Lmax || Math.max(s.B1, s.B2) > f.Bmax) e('Las dimensiones exceden los máximos disponibles.');
  if (f.h < f.hMin || f.h > f.hMax) w('El espesor está fuera del rango configurado (h mín – h máx).');
  if (s.L / Math.min(s.B1, s.B2) > p.crit.ratioMax) w(`Relación L/B > ${p.crit.ratioMax}.`);
  if (p.geo.DfMin !== null && f.Df < p.geo.DfMin) e('Profundidad de desplante menor que la mínima del estudio de suelos.');
  const lim = f.limites;
  if (lim.xMin !== null && f.x0 < lim.xMin - 1e-6) e('La zapata invade el límite izquierdo (medianera).');
  if (lim.xMax !== null && f.x0 + f.L > lim.xMax + 1e-6) e('La zapata invade el límite derecho (medianera).');
  if (lim.yMin !== null && f.y0 - s.Bmax / 2 < lim.yMin - 1e-6) e('La zapata invade el límite inferior (Y).');
  if (lim.yMax !== null && f.y0 + s.Bmax / 2 > lim.yMax + 1e-6) e('La zapata invade el límite superior (Y).');
  // Columnas
  const rects = p.columns.map((c) => {
    const d = c.ped.activo ? { bx: c.ped.bx, by: c.ped.by } : colDims(c);
    const x = c.x - f.x0, y = c.y - f.y0;
    return { c, x1: x - d.bx / 2, x2: x + d.bx / 2, y1: y - d.by / 2, y2: y + d.by / 2 };
  });
  const ids = new Set<string>();
  for (const r of rects) {
    if (ids.has(r.c.id)) e(`Identificación de columna duplicada: ${r.c.id}`);
    ids.add(r.c.id);
    if (!(r.c.bx > 0 && r.c.by > 0) && r.c.forma === 'rect') e(`Columna ${r.c.nombre}: dimensiones inválidas.`);
    const ok = [[r.x1, r.y1], [r.x1, r.y2], [r.x2, r.y1], [r.x2, r.y2]].every(([x, y]) => inside(s, x, y));
    if (!ok) e(`Columna ${r.c.nombre} (o su pedestal) queda fuera de la zapata.`);
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) e(`Columnas ${a.c.nombre} y ${b.c.nombre} superpuestas.`);
  }
  // Cargas
  const act = p.combos.filter((c) => c.activa);
  if (!act.some((c) => c.tipo === 'servicio')) e('No hay combinaciones de servicio activas.');
  if (!act.some((c) => c.tipo === 'ultima')) e('No hay combinaciones últimas activas.');
  for (const cb of act) {
    const N = p.columns.reduce((a, c) => a + (cb.cargas[c.id]?.N ?? 0), 0);
    if (!(N > 0)) e(`${cb.nombre}: carga vertical total nula o de tracción.`);
    for (const c of p.columns) {
      const l = cb.cargas[c.id];
      if (!l) { w(`${cb.nombre}: sin cargas para ${c.nombre} (se toman nulas).`); continue; }
      if (Object.values(l).some((v) => !Number.isFinite(v))) e(`${cb.nombre} / ${c.nombre}: valores no numéricos.`);
      if (l.N < 0) w(`${cb.nombre} / ${c.nombre}: columna traccionada.`);
      if (l.Mz !== 0) w(`${cb.nombre} / ${c.nombre}: Mz (torsión) no se considera en las verificaciones.`);
    }
  }
  if (combosDesactualizadas(p)) w('Las combinaciones generadas no coinciden con los casos/plantillas actuales: presione "Generar combinaciones".');
  // Geotecnia
  const g = p.geo;
  if (!(g.qadm > 0)) e('Falta la tensión admisible del suelo.');
  if (g.nf !== null && g.nf < f.Df) w('Nivel freático por encima de la base: se considera subpresión y peso saturado del relleno.');
  if (g.nf === null) w('Nivel freático no informado: se supone por debajo de la base.');
  if (!(g.mu > 0)) w('Coeficiente de fricción suelo-hormigón no informado: no se puede verificar deslizamiento.');
  if (g.qult === null) out.push({ nivel: 'info', msg: 'Capacidad portante última no informada.' });
  if (g.c > 0 || g.phi > 0) out.push({ nivel: 'info', msg: 'Cohesión y ángulo de fricción: registrados, no utilizados en el cálculo.' });
  if (g.ks !== null) out.push({ nivel: 'info', msg: 'Módulo de balasto: registrado, no utilizado (no hay modelo de losa sobre resortes).' });
  if (g.estratos.length) out.push({ nivel: 'info', msg: 'Estratos: registrados, no utilizados en el cálculo.' });
  // Materiales
  if (!(p.mat.hormigon.fc > 0) || !(p.mat.acero.fy > 0)) e('Resistencias de materiales inválidas.');
  if (p.mat.hormigon.fc < 20) w('f\'c < 20 MPa: inferior al mínimo usual para fundaciones de H°A°.');
  if (!p.mat.diametros.length) e('No hay diámetros disponibles.');
  for (const d of p.mat.diametros) if (!p.pesosLineales[d]) w(`Sin peso lineal para Ø${d}: se calcula con 7850 kg/m³.`);
  return out;
}

/** true si las combinaciones generadas difieren de lo que producen los casos y plantillas actuales */
export function combosDesactualizadas(p: Project): boolean {
  const gen = (p.combos ?? []).filter((c) => c.generada);
  if (!gen.length) return false;
  const sig = (cs: typeof gen) => JSON.stringify(cs.map((c) => [c.id, c.tipo, c.transitoria, c.cargas]));
  return sig(gen) !== sig(generateCombos({ columns: p.columns, casos: p.casos ?? [], plantillas: p.plantillas ?? [] }));
}
