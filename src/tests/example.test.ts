import { describe, it, expect } from 'vitest';
import { exampleProject } from '../data/example';
import { analyze } from '../core/analysis';

describe('Caso de validación (2 columnas, 6,00 × 1,90 × 0,60 m)', () => {
  const r = analyze(exampleProject());
  it('área 11,40 m² y presión de servicio estimada ≈ 193 kPa (+10 %)', () => {
    expect(r.shape.A / 1e6).toBeCloseTo(11.4, 3);
    expect(r.predim.qEst * 1e3).toBeCloseTo(193, 0);
  });
  it('presión última neta 263,16 kPa y carga lineal 500 kN/m', () => {
    expect(r.ult[0].pf.q0 * 1e3).toBeCloseTo(263.16, 2);
    expect(r.ult[0].beam.pts[5].w).toBeCloseTo(500, 1);
  });
  it('momento superior ≈ −720 kNm entre columnas e inferior ≈ 490 kNm bajo C2', () => {
    expect(r.env.Mneg.M / 1e6).toBeCloseTo(-720, 0);
    expect(r.env.Mneg.x).toBeCloseTo(2400, -1);
    expect(r.env.Mpos.M / 1e6).toBeCloseTo(490, 0);
    expect(r.env.Mpos.x).toBeCloseTo(4600, -1);
  });
  it('estado general no es VERIFICA si hay fallas o pendientes', () => {
    expect(r.estado.texto).not.toBe('VERIFICA');
    expect(r.checks.find((c) => c.id === 'est-corte-long')?.estado).toBe('fail');
  });
});
