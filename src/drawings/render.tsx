import { forwardRef, type ReactNode } from 'react';
import { LAYERS, type Drawing, type Layer, type Prim } from './model';
import { fmt } from '../core/units';

const COLOR = Object.fromEntries(LAYERS.map((l) => [l.id, l.color])) as Record<Layer, string>;

export function dimGeom(p: Extract<Prim, { t: 'dim' }>, k: number) {
  const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const sg = Math.sign(p.off) || 1;
  const a = [p.x1 + nx * p.off, p.y1 + ny * p.off], b = [p.x2 + nx * p.off, p.y2 + ny * p.off];
  const ext = [
    [p.x1 + nx * sg * 1 * k, p.y1 + ny * sg * 1 * k, a[0] + nx * sg * 1.5 * k, a[1] + ny * sg * 1.5 * k],
    [p.x2 + nx * sg * 1 * k, p.y2 + ny * sg * 1 * k, b[0] + nx * sg * 1.5 * k, b[1] + ny * sg * 1.5 * k],
  ];
  const t = 1.2 * k;
  const ticks = [a, b].map(([x, y]) => [x - (ux + nx) * t * 0.7, y - (uy + ny) * t * 0.7, x + (ux + nx) * t * 0.7, y + (uy + ny) * t * 0.7]);
  const txt = p.s ?? fmt(len / 1000, 2);
  let ang = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (ang > 90 || ang <= -90) ang += 180;
  const tx = (a[0] + b[0]) / 2 + nx * sg * 1.0 * k, ty = (a[1] + b[1]) / 2 + ny * sg * 1.0 * k;
  return { a, b, ext, ticks, txt, ang, tx, ty, sg, len };
}

export const SvgDrawing = forwardRef<SVGSVGElement, { d: Drawing; k: number; layers: Set<Layer>; widthPx?: number; paperMm?: boolean; mono?: boolean }>(
  function SvgDrawing({ d, k, layers, widthPx, paperMm, mono }, ref) {
    const [x0, y0, x1, y1] = d.bbox;
    const W = x1 - x0, H = y1 - y0;
    const col = (l: Layer) => (mono ? '#000' : COLOR[l]);
    const sw = (w = 0.25) => w * k;
    const dash = (t?: 'axis' | 'hidden') => (t === 'axis' ? `${8 * k} ${1.5 * k} ${1 * k} ${1.5 * k}` : t === 'hidden' ? `${2.5 * k} ${1.2 * k}` : undefined);
    const out: ReactNode[] = [];
    d.prims.forEach((p, i) => {
      if (!layers.has(p.layer)) return;
      const c = col(p.layer);
      if (p.t === 'line') out.push(<line key={i} x1={p.x1} y1={-p.y1} x2={p.x2} y2={-p.y2} stroke={c} strokeWidth={sw(p.w)} strokeDasharray={dash(p.dash)} />);
      else if (p.t === 'poly') {
        const pts = p.pts.map(([x, y]) => `${x},${-y}`).join(' ');
        out.push(p.closed
          ? <polygon key={i} points={pts} fill={p.fill ?? 'none'} stroke={c} strokeWidth={sw(p.w)} strokeDasharray={dash(p.dash)} />
          : <polyline key={i} points={pts} fill="none" stroke={c} strokeWidth={sw(p.w)} strokeDasharray={dash(p.dash)} strokeLinejoin="round" />);
      } else if (p.t === 'circle') out.push(<circle key={i} cx={p.x} cy={-p.y} r={p.r} fill={p.fill ?? 'none'} stroke={c} strokeWidth={sw(p.w ?? 0.18)} />);
      else if (p.t === 'text') {
        const h = p.h * k;
        const w = p.s.length * h * 0.56;
        const xa = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'end' ? p.x - w : p.x;
        out.push(
          <g key={i} transform={p.rot ? `rotate(${-p.rot} ${p.x} ${-p.y})` : undefined}>
            {p.box && <rect x={xa - 0.8 * k} y={-p.y - h - 0.6 * k} width={w + 1.6 * k} height={h + 1.6 * k} fill="#fff" fillOpacity="0.85" stroke={c} strokeWidth={0.13 * k} />}
            <text x={p.x} y={-p.y} fontSize={h} fill={c} textAnchor={p.anchor ?? 'start'} fontWeight={p.bold ? 'bold' : 'normal'} fontFamily="Arial, Helvetica, sans-serif">{p.s}</text>
          </g>,
        );
      } else if (p.t === 'dim') {
        const g = dimGeom(p, k);
        out.push(
          <g key={i} stroke={c} strokeWidth={0.13 * k}>
            {g.ext.map((e, j) => <line key={j} x1={e[0]} y1={-e[1]} x2={e[2]} y2={-e[3]} />)}
            <line x1={g.a[0]} y1={-g.a[1]} x2={g.b[0]} y2={-g.b[1]} />
            {g.ticks.map((e, j) => <line key={`t${j}`} x1={e[0]} y1={-e[1]} x2={e[2]} y2={-e[3]} strokeWidth={0.3 * k} />)}
            <text x={g.tx} y={-g.ty} fontSize={2 * k} fill={c} stroke="none" textAnchor="middle" transform={`rotate(${-g.ang} ${g.tx} ${-g.ty})`} dy={g.sg > 0 ? 0 : 2 * k * 0.9} fontFamily="Arial, Helvetica, sans-serif">{g.txt}</text>
          </g>,
        );
      }
    });
    return (
      <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`${x0} ${-y1} ${W} ${H}`}
        width={paperMm ? `${W / k}mm` : widthPx} height={paperMm ? `${H / k}mm` : widthPx ? (widthPx * H) / W : undefined}
        style={{ background: '#fff', fontFamily: 'Arial, Helvetica, sans-serif', width: paperMm || widthPx ? undefined : '100%', height: paperMm || widthPx ? undefined : 'auto' }}>
        {out}
      </svg>
    );
  },
);

/** DXF R12 (AC1009) con entidades simples: LINE, CIRCLE, TEXT */
export function toDXF(ds: Drawing[], k: number, layers: Set<Layer>): string {
  const L: string[] = [];
  const w = (...a: (string | number)[]) => { for (const x of a) L.push(String(x)); };
  const aci: Record<Layer, number> = { contorno: 7, ejes: 8, columnas: 9, cotas: 5, armInf: 1, armSup: 6, refuerzos: 3, esperas: 3, textos: 7, terreno: 30, notas: 7 };
  w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, LAYERS.length);
  for (const l of LAYERS) w(0, 'LAYER', 2, l.id.toUpperCase(), 70, 0, 62, aci[l.id], 6, 'CONTINUOUS');
  w(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  const line = (l: Layer, x1: number, y1: number, x2: number, y2: number) => w(0, 'LINE', 8, l.toUpperCase(), 10, x1.toFixed(2), 20, y1.toFixed(2), 30, 0, 11, x2.toFixed(2), 21, y2.toFixed(2), 31, 0);
  const text = (l: Layer, x: number, y: number, h: number, s: string, ang = 0, align: 'start' | 'middle' | 'end' = 'start') => {
    const hj = align === 'middle' ? 1 : align === 'end' ? 2 : 0;
    w(0, 'TEXT', 8, l.toUpperCase(), 10, x.toFixed(2), 20, y.toFixed(2), 30, 0, 40, h.toFixed(2), 1, s.replace(/[\r\n]/g, ' '), 50, ang.toFixed(2));
    if (hj) w(72, hj, 11, x.toFixed(2), 21, y.toFixed(2), 31, 0);
  };
  let dy = 0;
  for (const d of ds) {
    const oy = dy - d.bbox[3];
    for (const p of d.prims) {
      if (!layers.has(p.layer)) continue;
      if (p.t === 'line') line(p.layer, p.x1, p.y1 + oy, p.x2, p.y2 + oy);
      else if (p.t === 'poly') {
        const n = p.pts.length;
        for (let i = 0; i < n - (p.closed ? 0 : 1); i++) {
          const a = p.pts[i], b = p.pts[(i + 1) % n];
          line(p.layer, a[0], a[1] + oy, b[0], b[1] + oy);
        }
      } else if (p.t === 'circle') w(0, 'CIRCLE', 8, p.layer.toUpperCase(), 10, p.x.toFixed(2), 20, (p.y + oy).toFixed(2), 30, 0, 40, p.r.toFixed(2));
      else if (p.t === 'text') text(p.layer, p.x, p.y + oy, p.h * k, p.s, p.rot ?? 0, p.anchor);
      else if (p.t === 'dim') {
        const g = dimGeom(p, k);
        for (const e of g.ext) line(p.layer, e[0], e[1] + oy, e[2], e[3] + oy);
        line(p.layer, g.a[0], g.a[1] + oy, g.b[0], g.b[1] + oy);
        for (const e of g.ticks) line(p.layer, e[0], e[1] + oy, e[2], e[3] + oy);
        text(p.layer, g.tx, g.ty + oy, 2 * k, g.txt, g.ang, 'middle');
      }
    }
    dy = oy + d.bbox[1] - 20 * k;
  }
  w(0, 'ENDSEC', 0, 'EOF');
  return L.join('\n');
}

/** Imprime HTML en un iframe oculto (usa los estilos del documento) */
export function printHTML(html: string, page: string, margin = '10mm') {
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(ifr);
  const styles = [...document.querySelectorAll('style,link[rel=stylesheet]')].map((n) => n.outerHTML).join('');
  const doc = ifr.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8">${styles}<style>@page{size:${page};margin:${margin}}body{background:#fff;font-family:Arial,Helvetica,sans-serif;margin:0}svg{display:block;margin:0 auto}.pg{break-after:page}</style></head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => { ifr.contentWindow?.focus(); ifr.contentWindow?.print(); setTimeout(() => ifr.remove(), 2000); }, 400);
}

export function svgToPng(svg: SVGSVGElement, name: string, pxPerMm = 6, k = 50) {
  const xml = new XMLSerializer().serializeToString(svg);
  const vb = svg.viewBox.baseVal;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = Math.round((vb.width / k) * pxPerMm);
    c.height = Math.round((vb.height / k) * pxPerMm);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = name;
      a.click();
    });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}
