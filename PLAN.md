# SolarMe — Plan del producto y arquitectura

> App web que facilita al 10.000% el trabajo de los instaladores de paneles solares:
> desde una dirección, obtiene imagen satelital del techo, proyecta automáticamente
> la instalación óptima (dónde, cuántos, con qué ángulo y orientación), estima la
> producción de energía, recomienda el mejor panel para ese clima y negocio, y
> conecta con instaladores.

Estado: **fase 0 — investigación + fundación** (repo recién creado el 2026-08-23).

---

## 1. Para quién es y qué problema resuelve

**Usuario principal:** instaladores y empresas de energía solar (residencial y comercial).

**Dolor actual:** cotizar y diseñar una instalación hoy exige visita física, medir el
techo a mano, estimar sombras "a ojo", calcular producción en hojas de cálculo y
elegir paneles sin datos comparables. Lento, caro y con errores.

**Promesa de SolarMe:** el instalador escribe una dirección y en segundos ve:
1. El techo desde el satélite, con las zonas aprovechables.
2. Una propuesta de distribución de paneles (layout) lista, con ángulo y orientación óptimos.
3. Cuánta energía produciría al año y el ahorro estimado.
4. Qué panel conviene para ese clima/negocio, filtrable por rangos (potencia, precio, marca…).
5. Una cotización/propuesta presentable al cliente final.

---

## 2. Funcionalidades (por prioridad)

### MVP (lo que hace único al producto)
- **Búsqueda por dirección** → geocodificación → vista satelital/aérea del inmueble.
- **Análisis solar del techo**: segmentos de techo, área utilizable, irradiación,
  inclinación y orientación reales.
- **Layout automático de paneles** sobre el techo (proyección rápida) + edición manual.
- **Ángulo/orientación óptimos** calculados según latitud y clima local.
- **Estimación de producción anual** (kWh) y ahorro económico.
- **Recomendador de panel** según clima, tipo de negocio y presupuesto.
- **Catálogo de paneles filtrable por rangos** (potencia W, eficiencia, precio, marca, garantía).
- **Propuesta/cotización exportable** (PDF) para el cliente final.

### Fase 2
- **Análisis de sombreado** con obstáculos (árboles, edificios) usando el modelo 3D del techo.
- **Scraper/actualizador de catálogo de paneles** desde fuentes públicas.
- **Cuentas de empresa** (varios instaladores por empresa, historial de proyectos).

### Fase 3
- **Marketplace de instaladores**: un dueño de casa/negocio publica y recibe a instaladores;
  o un instalador encuentra proyectos/otros instaladores.
- **Integración con distribuidores** (precios/stock reales de paneles).

---

## 3. La decisión técnica clave: NO construir la visión satelital desde cero

Casi todo el "análisis satelital + potencial solar + layout óptimo" ya existe como API
de nivel mundial. La estrategia inteligente es **integrar**, no reinventar:

| Necesidad | Solución recomendada | Notas |
|---|---|---|
| Imagen satelital/aérea del techo | **Google Solar API – Data Layers** (RGB, DSM, mapas de flujo) o Mapbox/Google Static como respaldo | Data Layers da modelo de elevación del techo |
| Segmentos de techo, potencial, layout óptimo, finanzas | **Google Solar API – Building Insights** | Devuelve configuraciones de paneles listas, kWh/año, ahorro |
| Producción PV donde no hay cobertura de Solar API | **NREL PVWatts v8** (gratis, EE.UU. + global) + **PVGIS** | Cálculo por irradiación + parámetros del sistema |
| Ángulo/orientación óptimos | Heurística por latitud + optimización con PVWatts | Barrer tilt/azimut y elegir el de mayor producción |
| Datos/fichas de paneles | **CEC Module Database** (CSV público) primero; scraping de ENF Solar/fabricantes en fase 2 | Empezar con dato público y legal |
| Mapa interactivo / dibujar techo | **Mapbox GL JS** o Google Maps JS | Para editar el layout a mano |

> **Riesgo a validar en la investigación:** la cobertura de Google Solar API en **México**
> es parcial. Por eso el diseño debe tener un **modo de respaldo** (dibujar el techo sobre
> imagen satelital + PVWatts/PVGIS) para direcciones sin cobertura. Esto lo confirma la
> investigación en curso (Perplexity Deep Research).

---

## 4. Arquitectura propuesta (stack)

Pensado para calidad "empresa top" con un equipo pequeño y rápido de iterar:

- **Frontend:** Next.js (React) + TypeScript, Tailwind CSS + shadcn/ui (componentes premium).
- **Mapa/visor:** Mapbox GL JS (o Google Maps JS) + capa de layout de paneles.
- **Backend:** rutas API de Next.js (o servicio Node aparte) que orquestan Google Solar API,
  PVWatts y PVGIS, y cachean resultados.
- **Base de datos:** PostgreSQL vía Supabase (auth + datos + storage; ya usado en proyectos previos).
- **Catálogo de paneles:** tabla en Postgres, poblada primero desde CEC CSV, luego por scraper.
- **Generación de PDF:** render server-side (p. ej. Playwright/React-PDF).
- **Despliegue:** Vercel (frontend + API) + Supabase (datos).

---

## 5. Investigación (en curso)

Herramientas usadas por petición del usuario:
- **Perplexity Deep Research** — consulta lanzada el 2026-08-23 sobre: competidores
  (Aurora Solar, OpenSolar, Pylon, Solargraf, HelioScope, PVsyst, SolarEdge Designer,
  Project Sunroof), APIs satelitales y su cobertura en México, cálculo de ángulo/sombreado,
  fuentes de datos de paneles y tamaño de mercado en México.
- **NotebookLM** — se alimentará con el informe y las fuentes de Perplexity para dejar
  una base de conocimiento consultable y un resumen del proyecto.
- **Mobbin (MCP)** — referencia de diseño UX de apps de primer nivel para el look & feel.

Los hallazgos se resumirán en `research/` y se usarán para ajustar este plan antes de
escribir código de producto.

---

## 6. Próximos pasos inmediatos

1. Recoger el informe de Perplexity Deep Research y guardarlo en `research/`.
2. Cargar el informe + fuentes en NotebookLM para la base de conocimiento.
3. Buscar en Mobbin referencias de diseño (mapas, dashboards de energía, onboarding).
4. Validar cobertura de Google Solar API en México y confirmar el modo de respaldo.
5. Definir el diseño de pantallas del MVP y empezar el scaffold del frontend.

---

## 7. Riesgos y decisiones abiertas (para el fundador)

- **Cobertura Google Solar API en México** → puede exigir el modo respaldo desde el día 1.
- **Costos de APIs** (Google Solar, Mapbox) → afectan el modelo de precios del SaaS.
- **Scraping de paneles** → empezar con datos públicos (CEC) para evitar problemas legales.
- **Alcance del MVP** → recomiendo lanzar primero el análisis + layout + propuesta, y dejar
  el marketplace de instaladores para más adelante (es otro producto en sí mismo).
