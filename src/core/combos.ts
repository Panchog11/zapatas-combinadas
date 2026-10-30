import type { Combo, CombTemplate, LoadCase, Loads, Project, TipoCaso } from './types';

export const TIPOS_CASO: [TipoCaso, string][] = [
  ['D', 'D — Permanente'], ['L', 'L — Sobrecarga'], ['Lr', 'Lr — Sobrecarga de cubierta'], ['W', 'W — Viento'],
  ['E', 'E — Sismo'], ['S', 'S — Nieve'], ['H', 'H — Empuje de suelo'], ['T', 'T — Temperatura / otros'], ['O', 'O — Otros'],
];

/** Tipos cuyos casos son alternativas excluyentes (direcciones de viento o sismo): uno por combinación */
const EXCLUYENTES: TipoCaso[] = ['W', 'E'];

const origenDe = (t: CombTemplate) => (t.factores.E ? 'Sismo' : t.factores.W ? 'Viento' : 'Combinada') as Combo['origen'];

/**
 * Plantilla inicial EDITABLE. Los factores replican la forma de CIRSOC 201-2005 §9.2 con f1 = 0,5 y
 * servicio con factores unitarios: el usuario debe verificarlos contra el reglamento de cargas aplicable
 * (CIRSOC 101/102/103) y el destino de la obra.
 */
export function plantillaBase(): CombTemplate[] {
  const t = (id: string, nombre: string, tipo: CombTemplate['tipo'], transitoria: boolean, factores: Record<string, number>, alternar = false): CombTemplate =>
    ({ id, nombre, tipo, transitoria, activa: true, alternar, factores });
  return [
    t('PS1', 'D + L', 'servicio', false, { D: 1, L: 1, Lr: 1, S: 1, H: 1 }),
    t('PS2', 'D + L + W', 'servicio', true, { D: 1, L: 1, W: 1 }, true),
    t('PS3', 'D + L + E', 'servicio', true, { D: 1, L: 1, E: 1 }, true),
    t('PS4', 'D + W (mín. vertical)', 'servicio', true, { D: 1, W: 1 }, true),
    t('PU1', '1,4 D', 'ultima', false, { D: 1.4 }),
    t('PU2', '1,2 D + 1,6 L + 0,5 Lr', 'ultima', false, { D: 1.2, L: 1.6, Lr: 0.5, S: 0.5, H: 1.6 }),
    t('PU3', '1,2 D + 1,6 Lr + 0,5 L', 'ultima', false, { D: 1.2, Lr: 1.6, S: 1.6, L: 0.5 }),
    t('PU4', '1,2 D + 1,6 W + 0,5 L', 'ultima', true, { D: 1.2, W: 1.6, L: 0.5, Lr: 0.5 }, true),
    t('PU5', '1,2 D + 1,0 E + 0,5 L', 'ultima', true, { D: 1.2, E: 1.0, L: 0.5, S: 0.2 }, true),
    t('PU6', '0,9 D + 1,6 W', 'ultima', true, { D: 0.9, W: 1.6, H: 1.6 }, true),
    t('PU7', '0,9 D + 1,0 E', 'ultima', true, { D: 0.9, E: 1.0, H: 1.6 }, true),
  ];
}

const zero = (): Loads => ({ N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 });
const KEYS: (keyof Loads)[] = ['N', 'Vx', 'Vy', 'Mx', 'My', 'Mz'];

/** Genera combinaciones a partir de casos y plantillas. Devuelve solo las generadas. */
export function generateCombos(p: Pick<Project, 'columns' | 'casos' | 'plantillas'>): Combo[] {
  const out: Combo[] = [];
  const porTipo = new Map<TipoCaso, LoadCase[]>();
  for (const c of p.casos) porTipo.set(c.tipo, [...(porTipo.get(c.tipo) ?? []), c]);
  for (const t of p.plantillas) {
    if (!t.activa) continue;
    // tipos con factor ≠ 0 y casos definidos
    const usados = Object.entries(t.factores).filter(([k, f]) => f !== 0 && porTipo.has(k as TipoCaso)) as [TipoCaso, number][];
    if (!usados.length) continue;
    // la plantilla exige todos sus tipos excluyentes (si no hay casos W, "D + L + W" no se genera)
    const faltaExcl = EXCLUYENTES.some((e) => (t.factores[e] ?? 0) !== 0 && !porTipo.has(e));
    if (faltaExcl) continue;
    // variantes: una elección por tipo excluyente y signo ±
    let variantes: { casos: [LoadCase, number][]; etiqueta: string[] }[] = [{ casos: [], etiqueta: [] }];
    for (const [tipo, f] of usados) {
      const lista = porTipo.get(tipo)!;
      if (EXCLUYENTES.includes(tipo)) {
        const signos = t.alternar ? [1, -1] : [1];
        const nv: typeof variantes = [];
        for (const v of variantes) for (const c of lista) for (const sg of signos)
          nv.push({ casos: [...v.casos, [c, f * sg]], etiqueta: [...v.etiqueta, `${sg < 0 ? '−' : '+'}${c.nombre}`] });
        variantes = nv;
      } else variantes = variantes.map((v) => ({ casos: [...v.casos, ...lista.map((c) => [c, f] as [LoadCase, number])], etiqueta: v.etiqueta }));
    }
    variantes.forEach((v, i) => {
      const cargas: Record<string, Loads> = {};
      for (const col of p.columns) {
        const l = zero();
        for (const [c, f] of v.casos) {
          const x = c.cargas[col.id];
          if (x) for (const k of KEYS) l[k] += f * x[k];
        }
        cargas[col.id] = l;
      }
      const factores: Record<string, number> = {};
      for (const [c, f] of v.casos) factores[c.nombre] = (factores[c.nombre] ?? 0) + f;
      out.push({
        id: `G${t.id}${variantes.length > 1 ? `-${i + 1}` : ''}`,
        nombre: `${t.nombre}${v.etiqueta.length ? ` [${v.etiqueta.join(' ')}]` : ''}`,
        tipo: t.tipo, transitoria: t.transitoria, origen: origenDe(t), activa: true, cargas,
        generada: { plantilla: t.id, factores },
      });
    });
  }
  return out;
}

/** Texto de la expresión de una combinación generada: 1,2·D + 1,6·L … */
export function expresion(c: Combo): string {
  if (!c.generada) return '—';
  return Object.entries(c.generada.factores)
    .map(([n, f], i) => `${f < 0 ? '− ' : i ? '+ ' : ''}${Math.abs(f).toLocaleString('es-AR', { maximumFractionDigits: 3 })}·${n}`)
    .join(' ');
}
