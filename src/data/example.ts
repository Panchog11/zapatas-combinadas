import { NORM_DEFAULT } from '../norm/config';
import { UNIT_DEFAULT } from '../core/units';
import type { Column, Combo, Loads, Pedestal, Project } from '../core/types';

export const PESOS_LINEALES: Record<number, number> = {
  6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 16: 1.578, 20: 2.466, 25: 3.853, 32: 6.313,
};

const kN = 1e3;
export const zeroLoads = (): Loads => ({ N: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, Mz: 0 });

export const defaultPedestal = (): Pedestal => ({
  activo: false, h: 500, bx: 600, by: 600, rec: 40,
  arm: { auto: true, nx: 3, ny: 3, db: 16, dbE: 8, sE: 150 },
});

/** Completa campos agregados en versiones posteriores (proyectos guardados) */
export function migrar(p: Project): Project {
  const N = structuredClone(NORM_DEFAULT);
  p.norm = { ...N, ...p.norm, referencias: { ...N.referencias, ...(p.norm?.referencias ?? {}) }, ped: { ...N.ped, ...(p.norm?.ped ?? {}) } };
  p.casos ??= [];
  p.plantillas ??= [];
  for (const c of p.columns) {
    c.apoyo ??= 'hormigon';
    const d = defaultPedestal();
    c.ped = { ...d, ...c.ped, arm: { ...d.arm, ...(c.ped?.arm ?? {}) } };
  }
  return p;
}

export function newColumn(id: string, x: number, y = 0): Column {
  return {
    id, nombre: id, x, y, forma: 'rect', bx: 400, by: 400, D: 400, angulo: 0, zCarga: 0,
    condicion: 'auto', material: 'H-25', rec: 30, nBarras: 8, dbBarras: 16, distribucion: '3 por cara',
    dbEstribo: 8, sEstribo: 150, lEspera: null, lAnclaje: null, gancho: '90',
    apoyo: 'hormigon',
    ped: defaultPedestal(),
  };
}

/** Caso de validación: 2 columnas 0,40×0,40 a 4,00 m; zapata 6,00×1,90×0,60 m. */
export function exampleProject(): Project {
  const c1 = newColumn('C1', 0);
  const c2 = newColumn('C2', 4000);
  const combos: Combo[] = [
    {
      id: 'S1', nombre: 'Servicio D+L', tipo: 'servicio', transitoria: false, origen: 'Combinada', activa: true,
      cargas: { C1: { ...zeroLoads(), N: 800 * kN }, C2: { ...zeroLoads(), N: 1200 * kN } },
    },
    {
      id: 'U1', nombre: 'Última 1,5·(D+L) equiv.', tipo: 'ultima', transitoria: false, origen: 'Combinada', activa: true,
      cargas: { C1: { ...zeroLoads(), N: 1200 * kN }, C2: { ...zeroLoads(), N: 1800 * kN } },
    },
  ];
  return {
    version: 1,
    meta: {
      obra: 'Ejemplo de validación', ubicacion: '—', profesional: '—', fecha: new Date().toISOString().slice(0, 10),
      codigo: 'ZC-01', descripcion: 'Zapata combinada de dos columnas', observaciones: '',
      modo: 'verificacion', direccionLongitudinal: 'X', tolerancia: 1e-6, criterioPresion: 'bruta',
      criterioCombinaciones: 'Combinaciones ingresadas directamente por el usuario (servicio y últimas)',
    },
    units: { ...UNIT_DEFAULT },
    norm: structuredClone(NORM_DEFAULT),
    footing: {
      forma: 'rectangular', L: 6000, B1: 1900, B2: 1900, h: 600, x0: -600, y0: 0,
      cotaTerreno: 0, Df: 1000, recInf: 75, recSup: 50, recLat: 75, limpieza: 50,
      limites: { xMin: null, xMax: null, yMin: null, yMax: null },
      Lmax: 12000, Bmax: 5000, hMin: 400, hMax: 1500, vigasFundacion: '',
    },
    columns: [c1, c2],
    combos,
    casos: [],
    plantillas: [],
    geo: {
      qadm: 0.2, qadmTipo: 'bruta', qadmPerm: null, qadmTrans: null, qult: null,
      gamma: 18e-6, gammaSat: 20e-6, gammaSum: null, nf: null, c: 0, phi: 30, mu: 0.45, adhesion: 0,
      ks: null, Es: null, nu: null, sAdm: null, sDifAdm: null, DfMin: null, estratos: [],
      fsDesl: 1.5, fsVuelco: 1.5, perdidaMax: 0, agresividad: 'No informada', obs: '',
    },
    mat: {
      hormigon: { nombre: 'H-25', fc: 25, gammaC: 24e-6, Ec: null },
      acero: { nombre: 'ADN 420', fy: 420, Es: 200000 },
      diametros: [10, 12, 16, 20, 25],
      sMin: 100, sMax: 300, agregado: 19, exposicion: 'A1 (no agresivo)', gammaRelleno: 18e-6,
      bibliotecaH: [20, 25, 30, 35, 40].map((f) => ({ nombre: `H-${f}`, fc: f, gammaC: 24e-6, Ec: null })),
      bibliotecaA: [{ nombre: 'ADN 420', fy: 420, Es: 200000 }, { nombre: 'ADN 500', fy: 500, Es: 200000 }],
    },
    crit: {
      permitirPerdidaContacto: false, incPlanta: 50, incEspesor: 50, ratioMax: 6,
      lockL: false, lockB: false, lockH: false, probarTrapezoidal: true, capaInferiorExterna: 'long',
      incluirPesoPropio: true, incluirSuelo: true, incluirPedestales: true, incluirSubpresion: true,
      nPuntos: 400, desperdicio: 5, barraComercial: 12000, sobreancho: 300, dbMontaje: 10, caballetesPorM2: 1,
      manual: {},
    },
    pesosLineales: { ...PESOS_LINEALES },
  };
}
