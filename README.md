# Zapatas combinadas de H°A°

Aplicación web local para verificar y dimensionar zapatas combinadas de 2 o más columnas. Criterios configurables compatibles con CIRSOC 201 / CIRSOC 401.

> Herramienta de asistencia al cálculo. **No reemplaza la revisión de un ingeniero estructural matriculado.**

## Usar online

https://panchog11.github.io/zapatas-combinadas/

Los datos se guardan en el navegador de cada usuario; use "Guardar JSON" para conservar proyectos.

## Instalación y ejecución

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas unitarias (Vitest)
npm run build    # compilación estática en dist/
npm run deploy   # publica dist/ en GitHub Pages (rama gh-pages)
```

Sin backend. El proyecto se guarda automáticamente en el navegador y se exporta/importa como JSON.

## Estructura

```
src/norm/config.ts      Parámetros normativos centralizados (φ, β1, ρmín, ld, punzonamiento, referencias)
src/core/units.ts       Unidades internas N, mm, MPa y conversiones (kN, kNm, m, cm, mm, kPa, MPa)
src/core/geometry.ts    Rectángulo/trapecio: área, centroide, Ix, Iy
src/core/loads.ts       Traslado M = M0 + r × F, pesos, subpresión, resultantes
src/core/pressure.ts    Presiones biaxiales y área comprimida iterativa (Newton) si q mín < 0
src/core/beam.ts        Viga invertida: w(x), V(x), M(x), ceros, equilibrio
src/core/section.ts     As exacta, φMn, εt, selección de barras, ld / ldh / ldc
src/core/punching.ts    Perímetro crítico interior/borde/esquina, Jc, transferencia de momento
src/core/analysis.ts    Orquestador: verificaciones geotécnicas y estructurales, estado general
src/core/combos.ts      Casos de carga (D, L, Lr, W, E, S, H…) y generador de combinaciones por plantillas
src/core/rebar.ts       Armado, refuerzos con prolongación, planilla de doblado, totales
src/core/autosize.ts    Dimensionamiento automático rectangular/trapezoidal
src/core/validate.ts    Validaciones de datos
src/ui/                 Pestañas de entrada y resultados
src/drawings/           Plano A2 (grilla, rótulo, notas, planilla), axonometría 3D; SVG, PNG, PDF y DXF R12
src/report/             Memoria de cálculo (PDF vía impresión, Arial, A4)
src/tests/              Pruebas unitarias y caso de validación
```

## Caso de validación precargado

2 columnas 0,40×0,40 m a 4,00 m; N servicio 800/1200 kN; N última 1200/1800 kN; zapata 6,00×1,90×0,60 m; q adm 200 kPa.
Resultados: A = 11,40 m², q estimada 193 kPa, q_u = 263,16 kPa, w = 500 kN/m, M⁻ = −720 kNm, M⁺ = 490 kNm.
Con h = 0,60 m **no verifica el corte unidireccional longitudinal** (Vu ≈ 741 kN > φVc ≈ 614 kN); el dimensionamiento automático propone 6,50×1,75×0,70 m.

## Combinaciones desde casos

En "Columnas y cargas": defina casos sin mayorar por columna, cargue o edite las plantillas de factores y presione "Generar combinaciones". Los casos del mismo tipo se suman; W y E son alternativas excluyentes (una combinación por dirección) con variantes ± opcionales. Las combinaciones generadas se marcan GEN, conviven con las ingresadas manualmente y la app avisa si quedan desactualizadas.

## Verificaciones implementadas

- Presión máxima (bruta o neta), pérdida de contacto (área comprimida iterativa), núcleo central, levantamiento.
- Deslizamiento X, Y y combinado; vuelco en ambos ejes; flotación; FS a capacidad portante si se informa q_ult.
- Asentamiento elástico inmediato (semiespacio homogéneo, Steinbrenner) si se informan Es, ν y s adm.
- Viga invertida (V, M, ecuaciones por tramo, equilibrio) y franjas transversales con bandas b_col + d.
- Flexión longitudinal ±, flexión transversal, cuantía mínima, εt ≥ 0,005, separaciones mínima y máxima.
- Corte unidireccional longitudinal y transversal; punzonamiento interior/borde/esquina con transferencia de momento y perímetros superpuestos.
- Aplastamiento, cuantía y anclaje de esperas, tracción de esperas, anclaje de armaduras, empalmes en barras > barra comercial.
- Refuerzos con prolongación máx(d; 12db) y ld desde la sección de momento máximo.

## Verificaciones pendientes / limitaciones

- Capacidad portante teórica (c, φ), asentamiento diferencial, modelo de losa sobre resortes (ks) o elementos finitos.
- Diseño del pedestal como columna corta (se dispone mínimo 0,005·Ag); refuerzo de punzonamiento.
- Torsión Mz; columnas rotadas (se usan bx, by sin rotar); dirección longitudinal fija en X.
- Plantilla base de factores: forma de CIRSOC 201-2005 §9.2 con f1 = 0,5; verificar contra CIRSOC 101/102/103 y el destino de la obra.
- Vigas de fundación: solo registro descriptivo.
- Longitudes de barra por dimensiones exteriores sin descuento por doblado; barras comerciales sin optimización de cortes.
- DXF básico (LINE, CIRCLE, TEXT); no se genera DWG.
