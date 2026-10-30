/** Convención de signos: ejes globales y sentidos positivos (isométrica simplificada) */
export function SignConvention() {
  // proyección isométrica: X → derecha-abajo, Y → derecha-arriba, Z → arriba
  const P = (x: number, y: number, z: number): [number, number] => [130 + (x - y) * 0.87 * 60, 125 + (x + y) * 0.5 * 60 - z * 60];
  const ar = (a: [number, number], b: [number, number], c: string, w = 2) => (
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c} strokeWidth={w} markerEnd={`url(#ah-${c.slice(1)})`} />
  );
  const O = P(0, 0, 0);
  const cols = ['#0f1d2b', '#dc2626', '#0e7c86', '#7c3aed'];
  return (
    <div>
      <svg viewBox="0 0 260 230" className="w-full">
        <defs>
          {cols.map((c) => (
            <marker key={c} id={`ah-${c.slice(1)}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={c} /></marker>
          ))}
        </defs>
        {/* base */}
        <polygon points={[P(-1.2, -0.6, -0.35), P(1.2, -0.6, -0.35), P(1.2, 0.6, -0.35), P(-1.2, 0.6, -0.35)].map((q) => q.join(',')).join(' ')} fill="#e2e8f0" stroke="#94a3b8" />
        {ar(O, P(1.6, 0, 0), '#0f1d2b')}{ar(O, P(0, 1.3, 0), '#0f1d2b')}{ar(O, P(0, 0, 1.5), '#0f1d2b')}
        <text x={P(1.75, 0, 0)[0]} y={P(1.75, 0, 0)[1] + 4} fontSize="12" fontWeight="bold">X</text>
        <text x={P(0, 1.45, 0)[0]} y={P(0, 1.45, 0)[1]} fontSize="12" fontWeight="bold">Y</text>
        <text x={P(0, 0, 1.6)[0] - 4} y={P(0, 0, 1.6)[1]} fontSize="12" fontWeight="bold">Z</text>
        {/* N compresión hacia abajo */}
        {ar(P(-0.6, 0, 1.6), P(-0.6, 0, 0.6), '#dc2626', 2.5)}
        <text x={P(-0.6, 0, 1.6)[0] - 26} y={P(-0.6, 0, 1.6)[1] + 10} fontSize="11" fill="#dc2626" fontWeight="bold">N +</text>
        {/* cortantes */}
        {ar(P(0.6, 0, 0.9), P(1.3, 0, 0.9), '#0e7c86')}<text x={P(1.35, 0, 0.9)[0]} y={P(1.35, 0, 0.9)[1]} fontSize="11" fill="#0e7c86">Vx</text>
        {ar(P(0, 0.5, 0.9), P(0, 1.1, 0.9), '#0e7c86')}<text x={P(0, 1.15, 0.9)[0] + 2} y={P(0, 1.15, 0.9)[1]} fontSize="11" fill="#0e7c86">Vy</text>
        {/* momentos (vector doble flecha, regla de la mano derecha) */}
        {ar(P(0.2, -0.9, 0), P(0.9, -0.9, 0), '#7c3aed')}{ar(P(0.2, -0.9, 0), P(0.75, -0.9, 0), '#7c3aed')}
        <text x={P(0.95, -0.9, 0)[0]} y={P(0.95, -0.9, 0)[1] + 12} fontSize="11" fill="#7c3aed">Mx</text>
        {ar(P(-0.9, 0.2, 0), P(-0.9, 0.9, 0), '#7c3aed')}{ar(P(-0.9, 0.2, 0), P(-0.9, 0.75, 0), '#7c3aed')}
        <text x={P(-0.9, 0.95, 0)[0] - 18} y={P(-0.9, 0.95, 0)[1] - 4} fontSize="11" fill="#7c3aed">My</text>
      </svg>
      <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
        <li><b>N</b> positivo = compresión (hacia −Z).</li>
        <li><b>Vx, Vy</b> positivos en +X, +Y, aplicados a la cota de carga.</li>
        <li><b>Mx, My, Mz</b>: vectores según regla de la mano derecha (doble flecha).</li>
        <li>My &gt; 0 aumenta la presión hacia +X; Mx &gt; 0 aumenta la presión hacia −Y.</li>
        <li>Flexión de la zapata: M &gt; 0 tracciona la cara inferior.</li>
      </ul>
    </div>
  );
}
