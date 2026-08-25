import type { Result } from "./solar";

/**
 * Ajuste del arreglo al consumo del cliente.
 *
 * La app ya era honesta con el excedente: el ahorro se topa en `min(producción, consumo)` porque las
 * fuentes consultadas no establecen que el sobrante anual se pague a tarifa minorista. Pero se
 * quedaba a medias — le decía al cliente que una parte de su inversión no vale nada y no le decía a
 * nadie cuánta.
 *
 * Medido sobre un techo comercial de 200 m² en Ciudad Juárez con consumo de 1200 kWh/mes:
 *
 *     módulos  cobertura   ahorro/año    inversión   retorno
 *          48       146%      108,800      461,117      4.2
 *          40       122%      108,800      384,264      3.5
 *          30        91%       99,318      288,198      2.9
 *
 * De 48 a 40 el ahorro no cambia ni un peso y la inversión baja 77 000: son ocho módulos que el
 * cliente paga y que no desplazan ninguna compra a CFE. Al ajustar hasta el consumo el ahorro sí
 * baja un poco —97 % de cobertura, no 100 %—, y eso se calcula, no se supone.
 *
 * Por debajo del 100 % el retorno se aplana —ahorro e inversión bajan casi en proporción—, así que
 * quedarse corto no empeora el retorno pero sí reduce el ahorro total. La decisión de bajar del 100 %
 * es de capital disponible, no de eficiencia.
 *
 * Por eso esto INFORMA y no prescribe: un cliente puede querer holgura para un coche eléctrico o
 * para crecer, y ese margen es una decisión suya, no un error de dimensionado.
 *
 * Y se nombra el ARREGLO, no sólo el número. Al medir qué conteos salen encogiendo el área en ese
 * mismo techo aparecieron sólo 24, 27, 30, 40, 44 y 48: el arreglo es un rectángulo, así que el
 * conteo es siempre filas × columnas y 32 no aparecía. Pero 32 sí es un rectángulo —4 filas de 8— y
 * se consigue NO LLENANDO el techo, no encogiéndolo. Decir «32 módulos» sin decir «4 × 8» deja al
 * instalador buscando un área que no existe.
 */

export interface Ajuste {
  /** Módulos colocados en el diseño actual. */
  actual: number;
  /** El mayor número de módulos cuya producción no rebasa el consumo anual. */
  ajustado: number;
  /** Módulos que no desplazan ninguna compra a CFE. Cero si el arreglo no rebasa el consumo. */
  sobrantes: number;
  /** Inversión que se libera al quitarlos, en MXN. */
  ahorroCapex: number;
  /** Retorno con el arreglo ajustado, en años. */
  paybackAjustado: number;
  /** Ahorro anual con el arreglo ajustado, en MXN. Casi igual, no igual: ver la nota de abajo. */
  ahorroAnualAjustado: number;
  /** Verdadero cuando el límite es el techo y no el consumo: no hay nada que recortar. */
  limitaElTecho: boolean;
  /** Filas × columnas del arreglo ajustado, para que se sepa que es construible. */
  arreglo: { filas: number; columnas: number } | null;
}

/**
 * Cuánto del arreglo actual no paga.
 *
 * Se calcula por proporción y no volviendo a colocar módulos: la producción y la inversión escalan
 * con el número de módulos, y reejecutar el trazado daría un número que la geometría de filas mueve
 * a saltos —quitar 10 m² puede costar una fila entera— y eso confundiría el mensaje. Aquí la
 * pregunta es cuántos módulos no pagan, no qué techo hace falta.
 *
 * Devuelve `null` cuando falta el dato que lo hace verificable: sin consumo del cliente no se puede
 * hablar de cobertura, y sin módulos colocados no hay nada que ajustar.
 */
export function ajustarAlConsumo(r: Result): Ajuste | null {
  const actual = r.placement?.count ?? 0;
  if (actual < 1 || r.consumption <= 0 || r.kwh <= 0) return null;

  const porModulo = r.kwh / actual;
  const ajustado = Math.floor(r.consumption / porModulo);

  // El techo manda cuando ni llenándolo se alcanza el consumo. Ahí no hay nada que recortar.
  //
  // Aquí había un `Math.min(actual, ...)` que era código muerto: esta guarda ya trata el caso, y
  // quitarlo no cambiaba ninguna de las siete pruebas. Lo destapó la regresión, no la lectura.
  if (ajustado >= actual) {
    return {
      actual, ajustado: actual, sobrantes: 0, ahorroCapex: 0,
      paybackAjustado: r.payback, ahorroAnualAjustado: r.save,
      limitaElTecho: true, arreglo: null,
    };
  }

  const sobrantes = actual - ajustado;
  const capexAjustado = (r.capex * ajustado) / actual;
  const ahorroCapex = r.capex - capexAjustado;

  /*
   * El ahorro anual apenas cambia, pero NO es idéntico, y decir que lo era era una sobreafirmación
   * mía. Al aplicar el tope y volver a calcular de verdad, la cobertura aterriza en 97 % y no en
   * 100 %: `Math.floor` deja el arreglo un poco por debajo del consumo. Medido en el techo de
   * 200 m² de Ciudad Juárez: $108,800 → $105,939, un 2.6 % menos.
   *
   * Así que aquí se calcula el ahorro que de verdad queda —producción ajustada por tarifa, ya sin
   * tope porque por debajo del consumo todo desplaza compra— en vez de repetir el anterior.
   */
  const produccionAjustada = (r.kwh * ajustado) / actual;
  const ahorroAnualAjustado = Math.min(produccionAjustada, r.consumption) * r.tariff;
  const paybackAjustado = ahorroAnualAjustado > 0 ? capexAjustado / ahorroAnualAjustado : Infinity;

  return {
    actual, ajustado, sobrantes, ahorroCapex, paybackAjustado, ahorroAnualAjustado,
    limitaElTecho: false,
    arreglo: rectangulo(ajustado, r.placement?.rows ?? 0, r.placement?.perRow ?? 0),
  };
}

/**
 * El rectángulo más parejo que quepa dentro del techo actual y no pase del objetivo.
 *
 * Se busca un rectángulo porque así se monta: rieles completos y filas iguales. Quitar módulos
 * dispersos complica el montaje y deja las series desparejas.
 *
 * Se devuelve `null` si no hay ninguno: entonces la interfaz dice el número y calla el arreglo, en
 * vez de inventar una disposición que no cabe.
 *
 * Se exporta para poder probar el contrato directamente. Con los techos reales del catálogo el
 * límite nunca es determinante —un techo de 4×12 ya alcanza el máximo sin salirse—, así que ninguna
 * prueba de integración puede distinguir una búsqueda acotada de una que no lo esté. Probar la
 * función pura con límites sintéticos sí puede.
 */
export function rectangulo(objetivo: number, filasMax: number, colsMax: number) {
  if (filasMax < 1 || colsMax < 1) return null;
  let mejor: { filas: number; columnas: number } | null = null;
  for (let f = 1; f <= filasMax; f++) {
    for (let c = 1; c <= colsMax; c++) {
      if (f * c > objetivo) continue;
      // se prefiere el que más se acerque al objetivo; a igualdad, el de filas más llenas
      if (!mejor || f * c > mejor.filas * mejor.columnas) mejor = { filas: f, columnas: c };
    }
  }
  return mejor;
}
