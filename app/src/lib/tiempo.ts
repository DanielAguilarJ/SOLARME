/**
 * Cómo se dice un periodo de tiempo en pantalla y en el papel.
 *
 * Nace de una frase concreta: el documento del cliente imprimía «sobre 3653 días de serie diaria» y
 * la aplicación decía «medida en 3653 días». El número es exacto y la unidad es de quien procesa
 * datos: son diez años de registro, y dicho así se entiende sin traducir. Está en su propio archivo
 * porque lo usan la propuesta y la pantalla de series, y las dos tienen que decir lo mismo.
 */

/** Días que tiene un año, promediando los bisiestos. */
const DIAS_POR_ANIO = 365.25;

/** Días que tiene un mes, promediando el año. */
const DIAS_POR_MES = 30.44;

/** Por debajo de este umbral se habla en meses: redondear 400 días a «1 año» pierde demasiado. */
const UMBRAL_MESES = 730;

/**
 * Un número de días dicho en años, o en meses si son menos de dos años.
 *
 * Devuelve el periodo con su unidad («10 años», «18 meses»), sin la palabra «de» delante, para que
 * cada sitio la enmarque como necesite. Con un dato ausente o absurdo devuelve una frase neutra en
 * vez de inventar una cifra: es preferible «el periodo medido» a «0 años».
 */
export function periodoEnAnios(dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return "el periodo medido";
  if (dias < UMBRAL_MESES) {
    const meses = Math.max(1, Math.round(dias / DIAS_POR_MES));
    return `${meses} ${meses === 1 ? "mes" : "meses"}`;
  }
  const anios = Math.round(dias / DIAS_POR_ANIO);
  return `${anios} ${anios === 1 ? "año" : "años"}`;
}
