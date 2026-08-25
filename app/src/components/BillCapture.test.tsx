// @vitest-environment happy-dom
/**
 * La captura del recibo y la revisión de lo capturado.
 *
 * De estos dos números sale el dinero de toda la propuesta: el consumo anual del cliente y el precio
 * que paga de verdad por kWh. Los dos campos están juntos en la pantalla y confundirlos con el
 * recibo en la mano, de pie en la casa del cliente, es facilísimo. Nada fallaba: con 3200 kWh y $900
 * el precio efectivo sale en $0.28/kWh y el ahorro anual queda en la décima parte del real. La
 * propuesta se entregaba con una cifra que hunde el proyecto, sin un aviso.
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BillCapture from "./BillCapture";
import { PRECIO_MAXIMO, PRECIO_MINIMO, revisarRecibo } from "../lib/recibo";
import type { Bill } from "../lib/solar";

afterEach(cleanup);

const recibo = (kwh: number, amount: number, period: Bill["period"] = "bim"): Bill => ({
  kwh, amount, period,
});

describe("revisarRecibo", () => {
  it("un recibo normal pasa sin ruido", () => {
    const r = revisarRecibo(recibo(900, 3200));
    expect(r?.fueraDeRango).toBe(false);
    expect(r?.precio).toBeCloseTo(3.56, 2);
  });

  it("caza los campos invertidos y dice cuál sería el precio bueno", () => {
    const r = revisarRecibo(recibo(3200, 900));
    expect(r?.fueraDeRango).toBe(true);
    expect(r?.precio).toBeCloseTo(0.28, 2);
    expect(r?.precioSiSeInvierten).toBeCloseTo(3.56, 2);
  });

  it("un precio altísimo también se marca", () => {
    // 900 kWh por 30 000 pesos: no existe esa tarifa, algo está mal capturado
    const r = revisarRecibo(recibo(900, 30000));
    expect(r?.fueraDeRango).toBe(true);
  });

  it("cuando invertirlos tampoco da un precio creíble, no lo sugiere", () => {
    // 1 kWh por 1 peso invertido sigue siendo 1: aquí no hay nada que proponer
    const r = revisarRecibo(recibo(100000, 100));
    expect(r?.fueraDeRango).toBe(true);
    expect(r?.precioSiSeInvierten).toBeUndefined();
  });

  it("respeta los límites declarados, sin marcar lo que está justo dentro", () => {
    expect(revisarRecibo(recibo(100, 100 * PRECIO_MINIMO))?.fueraDeRango).toBe(false);
    expect(revisarRecibo(recibo(100, 100 * PRECIO_MAXIMO))?.fueraDeRango).toBe(false);
    expect(revisarRecibo(recibo(100, 100 * (PRECIO_MINIMO - 0.01)))?.fueraDeRango).toBe(true);
    expect(revisarRecibo(recibo(100, 100 * (PRECIO_MAXIMO + 0.01)))?.fueraDeRango).toBe(true);
  });

  it("sin los dos datos no dice nada: aún se está capturando", () => {
    expect(revisarRecibo(undefined)).toBeNull();
    expect(revisarRecibo(recibo(900, 0))).toBeNull();
    expect(revisarRecibo(recibo(0, 3200))).toBeNull();
  });
});

describe("la pantalla del recibo", () => {
  it("con un recibo normal muestra el consumo anual y el precio efectivo", () => {
    render(<BillCapture bill={recibo(900, 3200)} onChange={vi.fn()} fallback={6000} />);
    expect(screen.getByText(/Consumo anual real/)).toBeTruthy();
    expect(screen.getByText("5,400 kWh")).toBeTruthy(); // bimestral × 6
    expect(screen.getByText("$3.56 / kWh")).toBeTruthy();
  });

  it("en mensual el anual se multiplica por doce", () => {
    render(<BillCapture bill={recibo(900, 3200, "mes")} onChange={vi.fn()} fallback={6000} />);
    expect(screen.getByText("10,800 kWh")).toBeTruthy();
  });

  it("avisa de los campos invertidos con la cifra correcta", () => {
    render(<BillCapture bill={recibo(3200, 900)} onChange={vi.fn()} fallback={6000} />);
    expect(screen.getByText(/\$0.28 por kWh no corresponde a ninguna tarifa/)).toBeTruthy();
    expect(screen.getByText(/saldría \$3.56/)).toBeTruthy();
  });

  it("con el recibo mal capturado no habla además de tarifa DAC", () => {
    // dos avisos a la vez sobre el mismo número se contradicen: primero hay que arreglar la captura
    render(<BillCapture bill={recibo(900, 30000)} onChange={vi.fn()} fallback={6000} />);
    expect(screen.queryByText(/DAC/)).toBeNull();
  });

  it("un precio alto pero real sí menciona la tarifa DAC", () => {
    render(<BillCapture bill={recibo(900, 5400)} onChange={vi.fn()} fallback={6000} />);
    expect(screen.getByText(/DAC/)).toBeTruthy();
  });

  it("sin recibo declara que el promedio es una hipótesis, no un dato del cliente", () => {
    render(<BillCapture bill={undefined} onChange={vi.fn()} fallback={6000} />);
    expect(screen.getByText(/hipótesis de arranque y no un dato del cliente/)).toBeTruthy();
  });

  it("borrar los dos campos vuelve al promedio en vez de dejar ceros", () => {
    // Hace falta un padre con estado: el componente es controlado, y con un espía suelto el valor
    // nunca cambia, así que la prueba mediría el primer cambio dos veces en vez del resultado.
    const visto: (Bill | undefined)[] = [];
    function Contenedor() {
      const [bill, setBill] = useState<Bill | undefined>(recibo(900, 3200));
      return (
        <BillCapture
          bill={bill}
          onChange={(b) => {
            visto.push(b);
            setBill(b);
          }}
          fallback={6000}
        />
      );
    }
    render(<Contenedor />);
    // los campos se localizan por su etiqueta: van dentro de un <label>, así que un lector de
    // pantalla los anuncia con su nombre y su unidad («Consumo del periodo kWh»)
    fireEvent.change(screen.getByLabelText(/Consumo del periodo/), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/Importe del periodo/), { target: { value: "0" } });
    expect(visto.at(-1)).toBeUndefined();
    // y con el recibo borrado vuelve a declarar que usa el promedio
    expect(screen.getByText(/hipótesis de arranque/)).toBeTruthy();
  });
});
