import { describe, it, expect } from 'vitest';
import { NORM_DEFAULT } from '../norm/config';
import { section, nominal, phiPnMax, pmRatio, contour, designPed } from '../core/pedestal';
import { exampleProject } from '../data/example';
import { analyze } from '../core/analysis';

const n = NORM_DEFAULT;
const arm = { auto: false, nx: 2, ny: 2, db: 20, dbE: 8, sE: 150 };

describe('Pedestal / columna corta', () => {
  const s = section(400, 400, 40, arm, 25, 420, 200000);
  it('φPn,máx (estribos)', () => {
    const As = 4 * Math.PI * 100;
    expect(phiPnMax(s, n)).toBeCloseTo(0.65 * 0.8 * (0.85 * 25 * (160000 - As) + 420 * As), 0);
  });
  it('equilibrio de fuerzas en flexión pura ≈ estimación con armadura simple', () => {
    const c = contour(s, 0, n, 4); // θ = 0, 90, 180, 270°
    const Mx = Math.abs(c[0][0]) / 1e6;
    // As·fy·(d − a/2) con 2Ø20, d = 342 mm → φMn ≈ 77,5 kNm (armadura comprimida aumenta levemente)
    expect(Mx).toBeGreaterThan(75);
    expect(Mx).toBeLessThan(90);
    expect(Math.abs(c[1][1]) / 1e6).toBeCloseTo(Mx, 3); // sección simétrica
  });
  it('compresión pura con c grande y tracción pura con c pequeño', () => {
    expect(nominal(s, 0, 1e5, n).P).toBeCloseTo(0.85 * 25 * (160000 - s.As) + 420 * s.As, -3);
    expect(nominal(s, 0, 1e-3, n).P).toBeLessThan(0);
  });
  it('un punto del contorno biaxial tiene D/C ≈ 1 y el doble ≈ 2', () => {
    const cs = contour(s, 300e3, n, 36);
    const [mx, my] = cs[5]; // 50°
    expect(pmRatio(s, 300e3, mx, my, n).ratio).toBeCloseTo(1, 2);
    expect(pmRatio(s, 300e3, 2 * mx, 2 * my, n).ratio).toBeCloseTo(2, 2);
  });
  it('armado automático cumple ρmín y D/C ≤ 1', () => {
    const d = designPed(600, 600, 800, 40, { ...arm, auto: true }, [12, 16, 20, 25], 25, 420, 200000,
      [{ combo: 'U', Pu: 1500e3, Vx: 80e3, Vy: 40e3, Mx: 120e6, My: 90e6, Tu: 0 }], n);
    expect(d.rho).toBeGreaterThanOrEqual(0.01);
    expect(d.pm.ratio).toBeLessThanOrEqual(1);
    expect(d.corte.ratio).toBeLessThanOrEqual(1);
  });
  it('integra pedestal en el análisis y en la planilla', () => {
    const p = exampleProject();
    p.columns.forEach((c) => { c.ped.activo = true; c.ped.h = 800; c.apoyo = 'metalica'; });
    p.combos[1].cargas.C2 = { N: 1800e3, Vx: 50e3, Vy: 30e3, Mx: 60e6, My: 80e6, Mz: 5e6 };
    const r = analyze(p);
    expect(r.peds.length).toBe(2);
    expect(r.checks.some((c) => c.id === 'est-ped-pm-C2')).toBe(true);
    expect(r.schedule.marcas.some((m) => m.grupo === 'ped')).toBe(true);
    expect(r.schedule.marcas.some((m) => m.grupo === 'espera')).toBe(false); // metálica: sin esperas
    expect(r.checks.find((c) => c.id === 'est-pernos-C1')?.estado).toBe('warn');
  });
});
