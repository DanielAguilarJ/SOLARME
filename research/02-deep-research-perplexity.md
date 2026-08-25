# Investigación profunda — Perplexity Deep Research (2026-08-23)

Sesión: Perplexity Pro, modo **Deep research**. 14 pasos, **90 fuentes**.
URL: https://www.perplexity.ai/search/3e1e958a-0de1-4cc2-b94b-7dbd86e28b38

Este documento recoge únicamente datos citados por la investigación. Cada cifra que entra
al código de SolarMe debe poder rastrearse hasta aquí.

---

## 1. Google Solar API en México

### Calidad de imagen
La Solar API expone tres calidades vía `imageryQuality`: `HIGH` (aérea de baja altura, ~0.1 m/px),
`MEDIUM` y `BASE`. La cobertura en México existe para buena parte de los techos residenciales y
comerciales, pero **no es uniforme**: hay que consultarla, no asumirla.

Táctica recomendada para verificar cobertura de una ciudad o colonia: disparar
`buildingInsights:findClosest` sobre una malla de puntos y guardar los resultados.

### Precios por 1,000 solicitudes (CPM, marzo–agosto 2026)
Modelo pay-as-you-go con tope gratuito mensual y luego tarifa por 1,000 eventos.

| SKU | Tope gratis | 10k–100k | 100k–500k | 500k–1M | 1M–5M | >5M |
|---|---|---|---|---|---|---|
| Solar API **Building Insights** | 10,000/mes | 10 USD | 5 USD | 4.5 USD | 4 USD | 3.5 USD |
| Solar API **Data Layers** | 1,000/mes | 75 USD | 37.5 USD | 33.75 USD | 30 USD | 26.25 USD |

- Las primeras 10,000 consultas mensuales de Building Insights y 1,000 de Data Layers son
  gratuitas, con tarjeta y proyecto de Google Maps activado.
- Las consultas que devuelven `NOT_FOUND` (404) **no se facturan**, aunque sí cuentan al
  límite general de uso.

### Consecuencia de arquitectura para SolarMe
Building Insights cuesta ~**0.01 USD por domicilio**; Data Layers cuesta ~**0.075 USD**, es decir
**7.5× más**. Por lo tanto:

- Building Insights se llama en **todo** análisis (barato, da geometría y superficie útil).
- Data Layers (el mapa de flujo solar en GeoTIFF) se llama **solo bajo petición explícita** del
  instalador, y se cachea de forma agresiva por edificio.

---

## 2. Alternativas cuando no hay cobertura

### PVWatts v8 (NREL) — gratis
Estima producción de sistemas FV conectados a red en cualquier ubicación del mundo donde exista
cobertura de la base **NSRDB con datos TMY 2020**.

Endpoint `/api/pvwatts/v8`: acepta latitud, longitud, potencia DC, pérdidas, inclinación y azimut;
devuelve producción **mensual y anual por kW**. Es el respaldo natural de SolarMe.

### PVGIS v5.3
Alternativa europea; cobertura de México presente pero menos detallada que NSRDB.

### Solcast
APIs de irradiancia histórica y pronóstico ("Historic Time Series", "Rooftop PV Power Forecast
Model"). El plan de prueba permite algunas consultas gratuitas por ubicación. Sus modelos de techo
se basan en datos satelitales y re-análisis globales, por lo que **son utilizables en México**
aunque la documentación no detalle países individualmente.

### Nearmap
Ortofotos aéreas de alta resolución usadas en EE. UU. y Australia. En la documentación pública
**no aparecen referencias explícitas a cobertura en México**: conviene validarlo con el proveedor
antes de diseñar flujos alrededor de Nearmap. No construir sobre esto todavía.

---

## 3. Inclinación y azimut óptimos en México

### Inclinación óptima por banda de latitud
| Banda de latitud | Ejemplos | Inclinación óptima β |
|---|---|---|
| 15–20 °N | Chiapas, Oaxaca, Guerrero | **15–18°** |
| 20–25 °N | CDMX, Jalisco, Querétaro, Yucatán | **18–22°** |
| 25–30 °N | Nuevo León, Coahuila, Sonora | **22–26°** |

Estas bandas se aproximan bien con `β ≈ latitud × 0.87`.

### Sensibilidad a la desviación de inclinación
- Desviaciones de **±10°** respecto al óptimo: pérdida **<1–2 %** anual. Prácticamente despreciable.
- Desviaciones de **~20°**: pérdida **~5 %** anual.
- Desviaciones de **30° o más**: pérdida **10–12 %** anual. Inclinaciones extremas (vertical, 90°)
  pueden implicar **>30 %** de pérdida en algunos climas.

Lectura para el producto: si el techo real está dentro de ±10° del óptimo, **no vale la pena**
proponer estructura de corrección. Si está 20–30° lejos, hay que avisar en la interfaz de una
pérdida del 5–10 % y ahí sí evaluar estructura.

### Sensibilidad al azimut
Desviaciones de **±30°** respecto al sur verdadero generan pérdidas de **~3–4 %** en producción.
El azimut es bastante más indulgente que la inclinación.

---

## 4. Separación entre filas (autosombreado)

Geometría estándar, válida para techo plano con estructura inclinada:

1. **Altura vertical de la fila**
   `H = L · sin(β)` — L es el largo del módulo, β la inclinación.

2. **Ángulo de elevación solar de diseño** (solsticio de invierno al mediodía, 21 de diciembre,
   sol al sur verdadero):
   ```
   α ≈ 90° − φ − 23.45°
   ```
   donde φ es la latitud del sitio.

3. **Separación mínima entre filas** D (del borde trasero de la fila delantera al borde delantero
   de la fila posterior):
   ```
   D = H / tan(α)
   ```

4. **Pitch total de fila** P (borde delantero a borde delantero):
   ```
   P = D + W · cos(β)
   ```
   donde W es el ancho del módulo en la proyección horizontal.

El solsticio de invierno es el caso peor del año: si no hay sombra ese día al mediodía, no hay
sombra el resto del año a esa hora.

---

## 5. Generación distribuida y tarifas en México

### Tres esquemas de contraprestación
- **Medición neta (net metering):** la energía neta del periodo de facturación es la diferencia
  entre la energía entregada por CFE y la generada entregada a la red. **Se compensa hasta 12
  meses**, lo que permite acumular excedentes de temporada.
- **Facturación neta (net billing):** energía comprada y vendida se valoran con precios distintos;
  el excedente se paga según metodología de contraprestación.
- **Venta total:** se vende toda la energía generada a la red y se cobra según contrato de
  contraprestación.

### Marco regulatorio
La CRE y la Comisión Nacional de Energía publican modelos de contrato de interconexión
(**< 0.5 MW**) y de contraprestación, además de especificaciones técnicas generales.

### Consecuencia para SolarMe
Para sistemas de **hasta 499 kW** se puede asumir que el cliente entra en régimen de generación
distribuida exento, con opción de net metering / net billing / venta total.

SolarMe debería incorporar plantillas de contrato y un checklist de requisitos: croquis, estudios,
unidad de verificación acreditada y plazos de conexión.

---

## Qué se aplicó al código

| Hallazgo | Dónde vive |
|---|---|
| Bandas de inclinación óptima por latitud | `app/src/lib/solar.ts` → `optTilt` |
| Curva de pérdida por desviación de inclinación | `app/src/lib/solar.ts` → `tiltLoss` |
| Pérdida por desviación de azimut | `app/src/lib/solar.ts` → `azimuthLoss` |
| α = 90 − φ − 23.45 ; D = H/tan α ; P = D + W·cos β | `app/src/lib/spacing.ts` |
| Límite 499 kW de GD exenta | validación en el diseño |
| Compensación a 12 meses de net metering | modelo financiero |
| CPM de Building Insights vs Data Layers | estrategia de llamadas y caché |
