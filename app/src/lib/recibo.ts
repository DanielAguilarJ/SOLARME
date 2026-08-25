import type { Bill } from "./solar";

/**
 * Revisión del recibo capturado.
 *
 * Existe por un error de dedo con consecuencias grandes: en la pantalla del recibo hay dos campos
 * juntos —consumo e importe— y meter uno donde va el otro es facilísimo con el recibo en la mano,
 * de pie en la casa del cliente. Y no falla nada: la aplicación calcula con lo que le den. Con 3200
 * kWh y $900, el precio efectivo sale en $0.28/kWh y el ahorro anual queda en la décima parte del
 * real. La propuesta se entrega con una cifra que hunde el proyecto, sin un solo aviso.
 *
 * Lo que hace detectable el error es que el precio de la electricidad en México tiene suelo y techo
 * conocidos. La tarifa 1 doméstica con subsidio arranca cerca de 1 MXN/kWh en el escalón básico y la
 * DAC, sin subsidio, ronda los 6 o 7. Los límites de abajo se ponen amplios a propósito —0.5 y 15—
 * para no molestar a un caso legítimo raro: lo que se busca es cazar el error de un orden de
 * magnitud, no discutirle al instalador su recibo.
 */

/** Por debajo de esto no hay electricidad en México ni con el subsidio más alto. */
export const PRECIO_MINIMO = 0.5;

/** Por encima de esto no hay tarifa, ni la DAC en verano. */
export const PRECIO_MAXIMO = 15;

export interface RevisionRecibo {
  /** El precio efectivo que sale de lo capturado, en MXN/kWh. */
  precio: number;
  /** True si ese precio no corresponde a ninguna tarifa real. */
  fueraDeRango: boolean;
  /**
   * El precio que saldría con los dos campos intercambiados, cuando ESE sí es creíble. Es la
   * prueba de que lo que pasó fue un cambio de campos y no un recibo exótico, y permite decirlo
   * con una cifra en vez de con una sospecha.
   */
  precioSiSeInvierten?: number;
}

/** Revisa lo capturado. Devuelve null cuando aún no hay los dos datos. */
export function revisarRecibo(b: Bill | undefined): RevisionRecibo | null {
  if (!b || b.kwh <= 0 || b.amount <= 0) return null;

  const precio = b.amount / b.kwh;
  const fueraDeRango = precio < PRECIO_MINIMO || precio > PRECIO_MAXIMO;
  if (!fueraDeRango) return { precio, fueraDeRango: false };

  const invertido = b.kwh / b.amount;
  const creible = invertido >= PRECIO_MINIMO && invertido <= PRECIO_MAXIMO;
  return {
    precio,
    fueraDeRango: true,
    ...(creible ? { precioSiSeInvierten: invertido } : {}),
  };
}
