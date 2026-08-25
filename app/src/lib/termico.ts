import type { Site } from "./site";

/**
 * Cuánto cambia la producción por el coeficiente térmico REAL del módulo elegido.
 *
 * El problema que resuelve: el coeficiente influía en el puntaje del recomendador pero no en la
 * energía. El instalador en Mexicali que pagaba por un módulo que aguanta mejor el calor veía
 * exactamente el mismo kWh que con uno malo, así que la recomendación no tenía consecuencia en el
 * número que ve el cliente. Es el mismo defecto que tuvo `ppw` antes de entrar en el capex.
 *
 * Lo que NO se puede hacer: aplicar el coeficiente completo del módulo. El rendimiento medido de
 * PVGIS ya incluye el efecto térmico de SU módulo de referencia; volver a aplicarlo sería duplicar,
 * el mismo error que ya se cometió con las pérdidas del 14 %. Lo único legítimo es la DIFERENCIA
 * contra esa referencia, que es justo lo que distingue un módulo de otro en el mismo techo.
 */

/**
 * Coeficientes del modelo de potencia de PVGIS v5 para silicio cristalino.
 *
 * PVGIS implementa el modelo de Huld (2011): a irradiancia nominal los términos logarítmicos se
 * anulan y queda `P/P₀ = 1 + k₃·T' + k₆·T'²` con `T' = T_celda − 25`, así que el coeficiente
 * efectivo de la referencia es `k₃ + 2·k₆·T'`. Los valores son los publicados por PVGIS y
 * replicados en pvlib (`pvlib.pvarray.huld`, `k_version="pvgis5"`), no una estimación:
 * a 25 °C dan −0.470 %/°C, o sea un módulo de generación anterior. Los del catálogo CEC rondan
 * −0.29 a −0.40 %/°C, de modo que el rendimiento medido SUBESTIMA a un módulo moderno.
 */
export const REF_PVGIS = { k3: -0.004702, k6: 0.000005, tecnologia: "silicio cristalino" } as const;

/**
 * Sobretemperatura del módulo respecto al aire, en grados, en condiciones de operación.
 *
 * ESTE ES UN SUPUESTO Y SE DECLARA COMO TAL. Sale de la relación NOCT: un módulo con NOCT de
 * 45 °C se calienta (45 − 20) = 25 °C sobre el aire a 800 W/m², y se escala a la irradiancia
 * ponderada por energía de un plano inclinado, ~700 W/m². Convertir aire en temperatura de celda
 * exige un modelo térmico; lo que sí es medido es el aire (`tMediaSol`) y lo que sí está
 * documentado es el coeficiente de la referencia. El efecto queda acotado a pocos puntos
 * porcentuales y `LIMITE` lo impide crecer sin control.
 */
export const DELTA_T_OPERACION = 22;

/** Tope del ajuste, en fracción. Un resultado mayor indica un dato mal leído, no un módulo mejor. */
export const LIMITE = 0.06;

export interface AjusteTermico {
  /** Factor multiplicativo sobre la producción. 1.02 = dos por ciento más que la referencia. */
  factor: number;
  /** Temperatura de celda supuesta en operación, en grados. */
  tCelda: number;
  /** Coeficiente efectivo de la referencia de PVGIS a esa temperatura, en %/°C. */
  coefRef: number;
  /** Coeficiente del módulo elegido, en %/°C. */
  coefModulo: number;
  /** Verdadero si el cálculo tocó el tope: el ajuste se recortó. */
  recortado: boolean;
}

/** Coeficiente efectivo de la referencia de PVGIS a una temperatura de celda dada, en %/°C. */
export function coefReferencia(tCelda: number) {
  return (REF_PVGIS.k3 + 2 * REF_PVGIS.k6 * (tCelda - 25)) * 100;
}

/**
 * Ajuste térmico de un módulo en un sitio.
 *
 * Sin sitio medido devuelve factor 1: no se supone la temperatura de operación, igual que no se
 * supone la mínima para dimensionar strings. Aquí el costo de equivocarse es una cifra optimista,
 * no un inversor quemado, pero la regla es la misma.
 */
export function ajusteTermico(coefModulo: number, site?: Site): AjusteTermico {
  if (!site || site.tMediaSol === undefined) {
    return { factor: 1, tCelda: NaN, coefRef: NaN, coefModulo, recortado: false };
  }
  const tCelda = site.tMediaSol + DELTA_T_OPERACION;
  const coefRef = coefReferencia(tCelda);
  // Ambos coeficientes vienen en %/°C, así que la diferencia se divide entre 100.
  const bruto = ((coefModulo - coefRef) / 100) * (tCelda - 25);
  const recortado = Math.abs(bruto) > LIMITE;
  const factor = 1 + (recortado ? Math.sign(bruto) * LIMITE : bruto);
  return { factor, tCelda, coefRef, coefModulo, recortado };
}

/**
 * Cuánto separa al mejor del peor módulo del catálogo en este sitio, en puntos porcentuales.
 *
 * Es la respuesta cuantificada a «cuánto importa el clima al elegir el módulo». En Campeche
 * (27.4 °C de aire ponderado) separa más del doble que en Apizaco (14.0 °C): elegir bien vale
 * distinto según dónde se instale, y esta cifra dice cuánto.
 */
export function pesoDelClima(coeficientes: number[], site?: Site) {
  if (!site || site.tMediaSol === undefined || coeficientes.length === 0) return 0;
  const factores = coeficientes.map((c) => ajusteTermico(c, site).factor);
  return (Math.max(...factores) - Math.min(...factores)) * 100;
}

/**
 * Clasificación de clima DERIVADA de la temperatura medida de operación.
 *
 * Antes era un desplegable que el instalador adivinaba —«Cálido / muy soleado»— teniendo la app
 * la temperatura medida de los 102 sitios. Es el mismo defecto que el deslizador de sombra antes de
 * capturar obstáculos: pedir una estimación donde ya existe una medición. Los cortes salen de la
 * distribución observada, remedida sobre los 102: media 21.4 °C, mediana 20.7 y rango de 14.0 a
 * 27.4. Con estos cortes el catálogo queda en 36 sitios cálidos, 23 templados y 34 frescos.
 */
export type Clima = "calido" | "templado" | "fresco";

export const CORTE_CALIDO = 24;
export const CORTE_FRESCO = 19;

export function climaDe(site?: Site): { clima: Clima; medido: boolean } {
  if (!site || site.tMediaSol === undefined) return { clima: "templado", medido: false };
  const t = site.tMediaSol;
  return {
    clima: t >= CORTE_CALIDO ? "calido" : t <= CORTE_FRESCO ? "fresco" : "templado",
    medido: true,
  };
}
