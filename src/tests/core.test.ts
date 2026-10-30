import { describe, it, expect } from 'vitest';
import { toInternal, fromInternal } from '../core/units';
import { shapeOf } from '../core/geometry';
import { cross, transferColumn, resultantGlobal, comboTotals } from '../core/loads';
import { solvePressure } from '../core/pressure';
import { beamAnalysis } from '../core/beam';
import { asRequired, phiMn, selectBars, ld, barArea } from '../core/section';
import { criticalPerimeter, punchingCheck, polarJ } from '../core/punching';
import { NORM_DEFAULT } from '../norm/config';
import { exampleProject } from '../data/example';
import { analyze } from '../core/analysis';
import { autosize } from '../core/autosize';
import { pesoLineal } from '../core/rebar';

describe('Unidades', () => {
  it('conversiones', () => {
    expect(toInternal(200, 'kPa')).toBeCloseTo(0.2);
    expect(toInternal(1, 'kNm')).toBe(1e6);
    expect(fromInternal(1500, 'm')).toBe(1.5);
    expect(toInternal(24, 'kN/m³')).toBeCloseTo(24e-6);
    expect(fromInternal(25, 'cm')).toBe(2.5);
  });
});

describe('Geometría', () => {
  it('rectángulo', () => {
    const s = shapeOf({ forma: 'rectangular', L: 6000, B1: 2000, B2: 0 });
    expect(s.A).toBe(12e6);
    expect(s.xc).toBeCloseTo(3000);
    expect(s.Iy).toBeCloseTo((2000 * 6000 ** 3) / 12, -3);
    expect(s.Ix).toBeCloseTo((6000 * 2000 ** 3) / 12, -3);
  });
  it('trapecio', () => {
    const s = shapeOf({ forma: 'trapezoidal', L: 3000, B1: 1000, B2: 2000 });
    expect(s.A).toBe(4.5e6);
    expect(s.xc).toBeCloseTo((3000 * (1000 + 4000)) / (3 * 3000), 6);
    // Iy por integración numérica
    let I = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const x = (i + 0.5) * 3000 / n; I += (x - s.xc) ** 2 * (1000 + x / 3) * 3000 / n; }
    expect(s.Iy / I).toBeCloseTo(1, 5);
  });
});

describe('Cargas', () => {
  it('producto vectorial y traslado M = M0 + r × F', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    const p = exampleProject();
    p.combos[0].cargas.C1 = { N: 100e3, Vx: 10e3, Vy: 5e3, Mx: 2e6, My: 3e6, Mz: 0 };
    const s = shapeOf(p.footing);
    const t = transferColumn(p, s, p.columns[0], p.combos[0]);
    const rx = 600 - 3000, h = 600;
    expect(t.M[1]).toBeCloseTo(3e6 + h * 10e3 + rx * 100e3); // My + h·Vx + rx·N
    expect(t.M[0]).toBeCloseTo(2e6 - 0 * 100e3 - h * 5e3); // Mx − ry·N − h·Vy
  });
  it('resultante', () => {
    const p = exampleProject();
    const r = resultantGlobal(p, p.combos[0]);
    expect(r.N).toBe(2000e3);
    expect(r.X).toBeCloseTo(2400);
  });
});

describe('Presiones', () => {
  const s = shapeOf({ forma: 'rectangular', L: 4000, B1: 2000, B2: 2000 });
  it('esquinas biaxial', () => {
    const N = 1000e3, Mx = 50e6, My = 100e6;
    const pf = solvePressure(s, N, Mx, My);
    const q = N / s.A + (My * 2000) / s.Iy - (Mx * -1000) / s.Ix;
    expect(pf.qmax).toBeCloseTo(q, 9);
    expect(pf.contactoTotal).toBe(true);
  });
  it('pérdida de contacto uniaxial = solución triangular', () => {
    const N = 1000e3, e = 1000; // e > L/6
    const pf = solvePressure(s, N, 0, N * e);
    const qTri = (2 * N) / (3 * 2000 * (2000 - e));
    expect(pf.contactoTotal).toBe(false);
    expect(pf.qmax / qTri).toBeCloseTo(1, 2);
    expect(pf.areaComprimida).toBeCloseTo((3 * (2000 - e)) / 4000, 2);
  });
  it('equilibrio vertical', () => {
    const p = exampleProject();
    const r = analyze(p);
    const e = r.ult[0].beam.equilibrio;
    expect(e.sumW).toBeCloseTo(e.sumP, -1);
    expect(Math.abs(e.errM)).toBeLessThan(1e3 * 1e3);
    const t = comboTotals(p, r.shape, p.combos[1], null);
    expect(t.N).toBe(3000e3);
  });
});

describe('Viga invertida', () => {
  it('voladizo simétrico', () => {
    const s = shapeOf({ forma: 'rectangular', L: 4000, B1: 1000, B2: 1000 });
    const pf = solvePressure(s, 400e3, 0, 0);
    const b = beamAnalysis(s, pf, [{ id: 'a', x: 1000, P: 200e3, C: 0, ancho: 0 }, { id: 'b', x: 3000, P: 200e3, C: 0, ancho: 0 }], 400);
    expect(b.Mpos.M).toBeCloseTo(100 * 1000 ** 2 / 2, -2); // w = 100 N/mm
    expect(b.Mneg.M).toBeCloseTo(100 * 2000 ** 2 / 2 - 200e3 * 1000, -2);
    expect(b.ceroV.length).toBeGreaterThan(0);
  });
});

describe('Flexión', () => {
  it('As exacta reproduce Mu', () => {
    const r = asRequired(500e6, 1900, 520, 25, 420, 0.9);
    expect(phiMn(r.As, 1900, 520, 25, 420, 0.9).phiMn).toBeCloseTo(500e6, -2);
  });
  it('sección insuficiente', () => {
    expect(asRequired(5000e6, 300, 200, 25, 420, 0.9).ok).toBe(false);
  });
  it('selección de barras', () => {
    const b = selectBars(2500, 1900, 75, [12, 16, 20], 25, 300, 100)!;
    expect(b.As).toBeGreaterThanOrEqual(2500);
    expect(b.s).toBeGreaterThanOrEqual(100);
    expect(b.s).toBeLessThanOrEqual(300);
  });
  it('longitud de desarrollo', () => {
    expect(ld(12, 25, 420, NORM_DEFAULT)).toBeCloseTo((12 / 25) * 420 / 5 * 12, 3);
    expect(ld(20, 25, 420, NORM_DEFAULT)).toBeCloseTo((3 / 5) * 420 / 5 * 20, 3);
  });
});

describe('Punzonamiento', () => {
  it('interior: Jc según expresión clásica', () => {
    const d = 500;
    const cp = criticalPerimeter({ x1: 1800, x2: 2200, y1: -200, y2: 200 }, d, 6000, -1000, 1000);
    expect(cp.tipo).toBe('interior');
    expect(cp.b0).toBe(4 * 900);
    const b1 = 900, b2 = 900;
    expect(polarJ(cp, d, 'x').J).toBeCloseTo((d * b1 ** 3) / 6 + (b1 * d ** 3) / 6 + (d * b2 * b1 ** 2) / 2, -3);
    const chk = punchingCheck({ Vu: 1000e3, Mux: 0, Muy: 0, cp, d, beta: 1, fc: 25 }, NORM_DEFAULT);
    expect(chk.vc).toBeCloseTo(5 / 3, 6);
    expect(chk.vu).toBeCloseTo(1000e3 / (3600 * 500));
  });
  it('borde', () => {
    const cp = criticalPerimeter({ x1: 0, x2: 400, y1: -200, y2: 200 }, 500, 6000, -1000, 1000);
    expect(cp.tipo).toBe('borde');
    expect(cp.b0).toBe(650 * 2 + 900);
  });
});

describe('Barras', () => {
  it('peso lineal y planilla', () => {
    const p = exampleProject();
    expect(pesoLineal(p, 16)).toBe(1.578);
    expect(pesoLineal(p, 14)).toBeCloseTo(barArea(14) * 7.85e-3, 6);
    const r = analyze(p);
    for (const m of r.schedule.marcas) {
      expect(m.lt).toBeCloseTo(m.lu * m.n);
      expect(m.pt).toBeCloseTo((m.lt * m.pu) / 1000);
    }
  });
});

describe('Dimensionamiento automático', () => {
  it('encuentra una solución que verifica para el ejemplo', () => {
    const p = exampleProject();
    const t0 = Date.now();
    const a = autosize(p);
    expect(Date.now() - t0).toBeLessThan(20000);
    expect(a.mejor).not.toBeNull();
    const q = { ...p, footing: { ...p.footing, ...a.mejor! } };
    const r = analyze(q);
    expect(r.checks.some((c) => c.estado === 'fail')).toBe(false);
  });
  it('con medianera izquierda prueba trapezoidal', () => {
    const p = exampleProject();
    p.footing.limites.xMin = -200;
    p.combos.forEach((c) => { c.cargas.C1.N *= 1.6; });
    const a = autosize(p);

    expect(a.mejor).not.toBeNull();
    expect(a.mejor!.x0).toBeGreaterThanOrEqual(-200);
  });
});

import { generateCombos, plantillaBase, expresion } from '../core/combos';

describe('Combinaciones desde casos', () => {
  const p = exampleProject();
  const L = (N: number, Vx = 0) => ({ N, Vx, Vy: 0, Mx: 0, My: 0, Mz: 0 });
  p.casos = [
    { id: 'K1', nombre: 'D', tipo: 'D', cargas: { C1: L(500e3), C2: L(700e3) } },
    { id: 'K2', nombre: 'L', tipo: 'L', cargas: { C1: L(300e3), C2: L(500e3) } },
    { id: 'K3', nombre: 'Wx', tipo: 'W', cargas: { C1: L(20e3, 30e3), C2: L(-20e3, 30e3) } },
    { id: 'K4', nombre: 'Wy', tipo: 'W', cargas: { C1: L(0, 0), C2: L(10e3, 0) } },
  ];
  p.plantillas = plantillaBase();
  const g = generateCombos(p);
  it('aplica factores y suma casos', () => {
    const u2 = g.find((c) => c.id === 'GPU2')!;
    expect(u2.cargas.C1.N).toBeCloseTo(1.2 * 500e3 + 1.6 * 300e3);
    expect(expresion(u2)).toBe('1,2·D + 1,6·L');
    expect(g.find((c) => c.id === 'GPS1')!.cargas.C2.N).toBe(1200e3);
  });
  it('W excluyentes con alternancia de signo', () => {
    const w = g.filter((c) => c.generada?.plantilla === 'PU6');
    expect(w.length).toBe(4); // Wx±, Wy±
    expect(w.map((c) => c.cargas.C1.Vx).sort((a, b) => a - b)).toEqual([-48e3, 0, 0, 48e3]);
    expect(w.every((c) => c.transitoria && c.origen === 'Viento')).toBe(true);
  });
  it('omite plantillas de sismo sin casos E', () => {
    expect(g.some((c) => c.generada?.plantilla === 'PU5')).toBe(false);
  });
  it('las combinaciones generadas se analizan', () => {
    const q = { ...p, combos: g };
    const r = analyze(q);
    expect(r.service.length).toBe(g.filter((c) => c.tipo === 'servicio').length);
    expect(Number.isFinite(r.env.Mneg.M)).toBe(true);
  });
});
