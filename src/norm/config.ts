/**
 * Parámetros normativos centralizados.
 * Unidades internas: N, mm, MPa (N/mm²).
 * Todos los valores son editables desde la pestaña "Proyecto y normativa".
 * Las referencias son orientativas: el profesional debe verificarlas contra la edición vigente.
 */
export interface NormConfig {
  reglamento: string;
  edicion: string;
  reglamentoSuelos: string;
  // Factores de reducción de resistencia
  phiFlexion: number;
  phiCorte: number;
  phiAplastamiento: number;
  // Bloque de tensiones
  beta1: { fcLim: number; base: number; paso: number; cadaMPa: number; minimo: number };
  // Cuantías
  rhoMinFlexion: number; // sobre sección bruta b·h, cara traccionada
  rhoMinCaraComprimida: number; // hipótesis constructiva
  epsTMin: number; // deformación mínima del acero para sección controlada por tracción
  // Separaciones
  sMaxFactorH: number;
  sMaxAbs: number;
  sMinAbs: number;
  sMinFactorAgregado: number;
  // Corte
  vcCoef: number; // Vc = vcCoef·λ·√f'c·b·d
  lambda: number;
  punz: { a: number; b: number; c: number; alphaInterior: number; alphaBorde: number; alphaEsquina: number };
  // Desarrollo / anclaje
  ld: { dbLimite: number; coefMenor: number; coefMayor: number; psiTSup: number; psiE: number; minimo: number };
  ldh: { coef: number; minDb: number; minAbs: number };
  ldc: { coef: number; coef2: number; minAbs: number };
  empalmeClaseB: number;
  empalmeCompresion: { coef: number; minimo: number };
  sMaxTemp: { factorH: number; abs: number };
  piel: { hLimite: number; sMax: number; db: number };
  ganchos: { ext90Db: number; ext180Db: number; ext180Min: number; diamDoblado: { hasta: number; factor: number }[]; estriboExtDb: number };
  aplastamiento: { coef: number; raizMax: number };
  esperasCuantiaMin: number; // As esperas ≥ cuantía·Ag columna
  // Pedestal / columna corta
  ped: {
    phiComp: number; // estribos cerrados
    pnMax: number; // factor de Pn,máx
    rhoMin: number;
    rhoMax: number;
    sLibreAbs: number;
    sLibreDb: number;
    estriboDb: number; // s ≤ estriboDb·db long.
    estriboDbE: number; // s ≤ estriboDbE·db estribo
    vcAxial: number; // Vc = (1 + Nu/(vcAxial·Ag))·(1/6)·√f'c·bw·d
    torsionUmbral: number; // Tth = φ·coef·√f'c·Acp²/pcp·√(1 + Nu/(Ag·√f'c/3))
    kEsbeltez: number;
    esbeltezLim: number;
    gammaPP: number; // mayoración del peso propio del pedestal
  };
  // Geotecnia (factores por defecto, editables en Geotecnia)
  fsPortante: number;
  fsFlotacion: number;
  pesoPropioPreliminar: number; // factor de mayoración preliminar del peso propio en predimensionado
  referencias: Record<string, string>;
}

export const NORM_DEFAULT: NormConfig = {
  reglamento: 'CIRSOC 201',
  edicion: '2005 (criterios configurables; verificar edición vigente)',
  reglamentoSuelos: 'CIRSOC 401 (criterios geotécnicos tomados del estudio de suelos)',
  phiFlexion: 0.9,
  phiCorte: 0.75,
  phiAplastamiento: 0.65,
  beta1: { fcLim: 30, base: 0.85, paso: 0.05, cadaMPa: 7, minimo: 0.65 },
  rhoMinFlexion: 0.0018,
  rhoMinCaraComprimida: 0.0009,
  epsTMin: 0.005,
  sMaxFactorH: 3,
  sMaxAbs: 300,
  sMinAbs: 25,
  sMinFactorAgregado: 4 / 3,
  vcCoef: 1 / 6,
  lambda: 1,
  punz: { a: 1 / 6, b: 1 / 12, c: 1 / 3, alphaInterior: 40, alphaBorde: 30, alphaEsquina: 20 },
  ld: { dbLimite: 16, coefMenor: 12 / 25, coefMayor: 3 / 5, psiTSup: 1.3, psiE: 1.0, minimo: 300 },
  ldh: { coef: 0.24, minDb: 8, minAbs: 150 },
  ldc: { coef: 0.24, coef2: 0.043, minAbs: 200 },
  empalmeClaseB: 1.3,
  empalmeCompresion: { coef: 0.07, minimo: 300 },
  sMaxTemp: { factorH: 5, abs: 450 },
  piel: { hLimite: 900, sMax: 300, db: 12 },
  ganchos: {
    ext90Db: 12,
    ext180Db: 4,
    ext180Min: 65,
    diamDoblado: [
      { hasta: 25, factor: 6 },
      { hasta: 32, factor: 8 },
      { hasta: 99, factor: 10 },
    ],
    estriboExtDb: 6,
  },
  aplastamiento: { coef: 0.85, raizMax: 2 },
  esperasCuantiaMin: 0.005,
  ped: { phiComp: 0.65, pnMax: 0.8, rhoMin: 0.01, rhoMax: 0.08, sLibreAbs: 40, sLibreDb: 1.5, estriboDb: 16, estriboDbE: 48, vcAxial: 14, torsionUmbral: 1 / 12, kEsbeltez: 2.0, esbeltezLim: 22, gammaPP: 1.2 },
  fsPortante: 3,
  fsFlotacion: 1.1,
  pesoPropioPreliminar: 1.1,
  referencias: {
    phi: 'CIRSOC 201 §9.3.2',
    beta1: 'CIRSOC 201 §10.2.7.3',
    flexion: 'CIRSOC 201 §10.2 / §10.3',
    rhoMin: 'CIRSOC 201 §10.5.4 y §7.12',
    epsT: 'CIRSOC 201 §10.3.4',
    sMax: 'CIRSOC 201 §10.5.4 / §7.6.5',
    sMin: 'CIRSOC 201 §7.6.1',
    corte: 'CIRSOC 201 §11.3.1.1 y §11.12.1.1',
    punz: 'CIRSOC 201 §11.12.2.1',
    transfMomento: 'CIRSOC 201 §11.12.6 y §13.5.3',
    ld: 'CIRSOC 201 §12.2.2 (expresiones simplificadas)',
    ldh: 'CIRSOC 201 §12.5',
    ldc: 'CIRSOC 201 §12.3',
    empalme: 'CIRSOC 201 §12.15 (clase B) y §12.16 (compresión)',
    sMaxTemp: 'CIRSOC 201 §7.12.2.2',
    piel: 'CIRSOC 201 §10.6.7',
    ganchos: 'CIRSOC 201 §7.1 y §7.2',
    aplast: 'CIRSOC 201 §10.17',
    esperas: 'CIRSOC 201 §15.8.2.1',
    zapatas: 'CIRSOC 201 Cap. 15',
    suelo: 'CIRSOC 401 / estudio de suelos',
    pedFlex: 'CIRSOC 201 §10.2, §10.3.6 y §9.3.2.2 (flexo-compresión biaxial por compatibilidad)',
    pedCuantia: 'CIRSOC 201 §10.9.1',
    pedCorte: 'CIRSOC 201 §11.3.1.2 y §11.5',
    pedTorsion: 'CIRSOC 201 §11.6.1',
    pedEstribos: 'CIRSOC 201 §7.10.5',
    pedSepar: 'CIRSOC 201 §7.6.3',
    pedEsbeltez: 'CIRSOC 201 §10.10 / §10.12',
  },
};

export function beta1(fc: number, n: NormConfig): number {
  const b = n.beta1;
  if (fc <= b.fcLim) return b.base;
  return Math.max(b.minimo, b.base - (b.paso * (fc - b.fcLim)) / b.cadaMPa);
}

export function diamDoblado(db: number, n: NormConfig): number {
  const r = n.ganchos.diamDoblado.find((x) => db <= x.hasta) ?? n.ganchos.diamDoblado[n.ganchos.diamDoblado.length - 1];
  return r.factor * db;
}
