# Investigación 01 — Mercado, APIs y diseño solar (Perplexity)

- Fuente: Perplexity (búsqueda estándar, 10 fuentes). Sesión: /search/1a5e0c4a-088a-4e42-8476-0c96bc10eefc
- Fecha: 2026-08-23
- Nota: corrió como respuesta estándar, NO como "Deep Research" completo, porque este
  Chrome no tiene sesión iniciada en Perplexity (se requiere cuenta Pro con login).
  Tratar como primer barrido, a profundizar cuando haya sesión.

## 1. Competidores (qué hacen, precios, huecos)
- **Aurora Solar**: diseño y ventas de PV, propuestas rápidas, fuerte precisión en sombreado.
  Precio alto. Huecos: cobertura completa en LatAm, soporte local, integración con datos
  regulatorios y CRM regional.
- **OpenSolar**: diseño y propuestas con plan gratuito/escala; fuerte para ventas y flujo
  colaborativo. Huecos: precisión de sombreado menor, menor soporte en México/LatAm.
- **Solargraf**: diseño solar orientado a mercados hispanohablantes; costo competitivo.
  Huecos: automatización de propuestas y soporte internacional limitado.
- **HelioScope**: diseño eléctrico avanzado y detallado, fuerte en instalaciones complejas;
  precio medio-alto. Huecos: curva de aprendizaje, menor velocidad para ventas en campo.
- **PVsyst**: simulación detallada para ingeniería/estudios; alto costo y curva de aprendizaje.
  Huecos: no enfocado en ventas/propuestas.
- **PV*SOL / PVcase / Pylon**: multifunción con sombreado 3D y simulaciones. Huecos: precios
  altos en LatAm, integración nativa limitada con CRM latino.
- **SolarEdge Designer / Google Solar API**: diseño con datos de fabricantes y APIs.
  Huecos: cobertura regional, costos de uso, hay que combinarlas para un flujo completo de ventas.

## 2. APIs para análisis satelital y potencial solar (cobertura en México, costos)
- **Google Solar API (Building Insights + Data Layers/flux maps)**: datos detallados de
  techos y mapas de flujo; costo variable por uso; cobertura en zonas urbanas; precisión
  depende de imágenes/modelos.
- **NREL PVWatts v8**: estimaciones de producción por ubicación y sistema; **gratis**.
- **PVGIS**: estimaciones para Europa/África y otras regiones; **limitaciones en México**; gratis.
- **Solcast**: pronósticos e irradiancia; por suscripción.
- **Nearmap / Mapbox**: ortofotos y mapas de alta resolución; costos por región/uso; precisión variable.
- Cobertura MX: Google y Solcast dan cobertura razonable; Nearmap/Mapbox dependen de
  proveedores locales; PVWatts/PVGIS con limitaciones regionales.

## 3. Ángulo (tilt), orientación (azimut), sombreado y separación entre filas
- Tilt/azimut óptimos dependen de latitud y objetivo. Regla general: inclinación ≈ latitud;
  azimut al **sur** (hemisferio norte) para máximo rendimiento anual.
- Ajustar tilt/azimut si se busca maximizar verano o invierno.
- **Separación entre filas** para evitar autosombreado: separación ≥ altura de la fila × cot(tilt),
  modelando sombras por hora y estación.
- Métodos en SaaS: LiDAR/fotogrametría, simulaciones 3D, mapas de sombra temporales; validar con
  mediciones de insolación en sitio.

## 4. Datos de paneles y scraping
- **CEC (California Energy Commission)** y **ENF Solar**: fichas técnicas, specs, rendimientos,
  temperaturas, homologaciones.
- Fabricantes: curvas I-V, dimensiones, peso, compatibilidad con inversores.
- **Legal**: datos públicos suelen permitir scraping pero puede violar términos; preferir APIs
  oficiales/acuerdos; revisar robots.txt y ToS; citar fuentes. Para el MVP usar CEC/ENF con licencia.

## 5. Mercado México
- **Residencial**: demanda estable en expansión; net metering y derechos de techo impulsan adopción.
- **Comercial**: instalaciones mayores; oportunidad en techos de edificios/empresas; costos y
  trámites regulatorios influyen.
- Necesidad detectada: flujo diseño-venta-propuesta simplificado, integración con
  proveedores/regulación local, soporte en español con métricas locales.

## Recomendaciones accionables para el MVP (según Perplexity)
1. Flujo **diseño → venta → propuesta en español**, con plantillas de propuestas y presupuestos.
2. Integrar al menos **una API satelital localizable + una base de datos de paneles**.
3. Datos: usar **CEC/ENF** con licencia; evitar scraping agresivo.
4. APIs: priorizar **Google Solar API** (si hay cobertura en MX) + **PVWatts v8** + **Solcast** para irradiancia.
5. Enfoque MVP: **residencial y pequeña comercial**, soporte en español, precios competitivos, alianzas locales.
6. Roadmap: MVP con diseño rápido + propuestas + captura de leads → analítica → benchmarking → expansión LatAm.

> Nota de Perplexity: precios y cobertura regional varían; confirmar con proveedores.

## Preguntas de seguimiento sugeridas (para profundizar con sesión Pro)
- Métricas de plataformas SaaS B2B para instaladores solares en LatAm.
- Características clave que buscan los instaladores en una app SaaS de gestión.
- Cómo diferenciarse de Aurora Solar en México.
- Casos de uso y flujos de trabajo del instalador.
- Modelos de precios y paquetes para SaaS B2B solar.
