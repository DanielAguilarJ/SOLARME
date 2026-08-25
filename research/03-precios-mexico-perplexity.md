# Precios reales de módulos y sistemas en México (2025–2026)

**Perplexity Deep Research**, cuenta Pro, modo *Deep research*. **25 pasos, 139 fuentes.**
Hilo: https://www.perplexity.ai/search/c6e69531-4e50-4403-9a5c-f02aac1f4e85
Consultado: 2026-08-23.

## Por qué se hizo esta investigación

El catálogo de SolarMe tenía los 140 módulos marcados `ppw_estimated: true` y **solo dos valores
distintos de precio: 0.28 y 0.34**. En el modo "precio" del recomendador ese eje pesa el 55 % del
puntaje, así que más de la mitad de la recomendación la decidía un volado entre dos números
inventados por un proxy de eficiencia (`if eff >= 22.5: return 0.34`).

Además el campo nunca declaró moneda: 0.28–0.34 solo tiene sentido como **USD/W**, mientras
`CAPEX_PER_W = 17.5` está en **MXN/W**. Dos unidades distintas en el mismo modelo económico.

## Hallazgo principal

> Módulos **Tier 1** en México, 2025–2026: **~3.5 a ~6.5 MXN/Wp**, según marca, tecnología y canal.
> Sistemas **llave en mano**: **15–28 MXN/Wp instalado**, con el módulo representando
> **~40–50 % del CAPEX total**.

### Caso concreto verificable
| Distribuidor | Marca / modelo | Wp | Precio publicado | MXN/Wp | Fuente |
|---|---|---|---|---|---|
| PGI Energy | JA Solar 605 W Mono N-Type | 605 | $3,136.87 MXN | **5.19** | Página de producto, consultada 2026 |

La aritmética cuadra: 3,136.87 ÷ 605 = 5.185. Es el ancla más confiable que obtuve, porque es un
precio publicado de un producto identificable, no un rango de artículo.

## Discrepancia entre fuentes — no la resuelvo en silencio

Un segundo documento (opsglobal.mx, "Mejores Marcas de Paneles Solares en México 2025",
11-ago-2025) da una banda **más alta: 6.5–9.5 MXN/Wp**, con precios por panel:

| Marca / modelo | Wp | Precio | MXN/Wp calculado |
|---|---|---|---|
| JA Solar JAM60S10-360/MR | 360 | $2,950 | 8.19 |
| Jinko JKM380M-72H | 380 | $3,200 | 8.42 |
| Trina TSM-455DE09 | 455 | $3,750 | 8.24 |
| LONGi LR4-72HPH-445M | 445 | $4,200 | 9.44 |
| SunPower Maxeon 3-400 | 400 | $6,500 | 16.25 |

**Cómo lo interpreto:** las dos bandas no se contradicen tanto como parece, porque describen cosas
distintas. Los modelos de opsglobal son de 315–580 W (generación anterior) y a precio de **menudeo
por pieza**; el ancla de PGI es un módulo de 605 W N-Type actual a precio de **lista de
distribuidor**. El precio por watt baja cuando sube la potencia del módulo y cuando se compra por
canal mayorista. Aun así opsglobal es un sitio de generación de contactos operado por una sociedad
estonia (Thinktier OÜ) que cita a BloombergNEF y PVEL de forma genérica, sin enlazar la cifra
concreta; el Deep Research, con 139 fuentes y páginas de producto consultadas, es la mejor
evidencia.

**Decisión:** la banda del modelo es **3.5–6.5 MXN/Wp para Tier 1**, con el menudeo por pieza como
techo alto declarado, no como caso base. Y el precio del módulo queda marcado como **banda de
mercado**, nunca como cotización, hasta que el instalador escriba la suya.

## Clasificación Tier (para asignar banda)

- **Tier 1** — verticalmente integradas, >3 % de ingresos en I+D: Jinko, LONGi, Trina, JA Solar,
  Canadian Solar (CSI), Astronergy/Chint, REC, Q CELLS, First Solar.
- **Tier 2** — subcontratan parte del proceso, precio competitivo: Risen, GCL-SI, Suntech, Phono,
  Znshine, SEG, Talesun, Jolywood, Boviet.
- **Tier 3** — principalmente ensambladoras, calidad inconsistente.

## Otros datos utilizables

- **Garantías reales**: producto 10–12 años (no 25), producción 25 años al 83–85 % de potencia.
  SunPower es la excepción con 25 años de producto y 92 % de producción. El catálogo tenía `warr: 25`
  fijo para los 140 módulos, lo que hacía que ese término no aportara nada al puntaje.
- **First Solar** fabrica CdTe **en Mexicali, Baja California**: menor eficiencia (18.2–19.5 %) pero
  mejor comportamiento en calor. Es el único caso de fabricación local relevante.
- **Espacio vs precio**: con azotea amplia (>50 m²) conviene priorizar precio por watt; con espacio
  limitado (<30 m²) la eficiencia justifica el sobreprecio. Coincide con los modos `espacio` y
  `precio` que ya tiene el recomendador.
- **Zonas calurosas (>35 °C frecuente)**: priorizar coeficiente de temperatura bajo. Coincide con el
  modo `calido`.
- **Trámite**: se exige certificación **NOM-063-SCFI** y estar en el directorio de equipos aprobados
  por CFE. Esto NO lo cubre la base CEC, así que el catálogo no puede afirmar que un módulo sea
  instalable en México.

## Consecuencias para el código

1. `ppw` pasa a **MXN/Wp** con la unidad declarada, y con procedencia explícita.
2. El importador CEC ordenaba por `-w` y se quedaba con los 140 más potentes: por eso todo el
   catálogo estaba entre 710 y 740 W y no había ni Jinko, ni LONGi, ni JA Solar. Hay que
   estratificar por clase de potencia y limitar la concentración por marca.
3. `CAPEX_PER_W = 17.5` cae dentro de 15–28 pero es único para los tres tipos de proyecto; el
   costo por watt baja con la escala, así que residencial e industrial no pueden compartirlo.
4. La garantía fija de 25 años es falsa y hay que marcarla como desconocida.
