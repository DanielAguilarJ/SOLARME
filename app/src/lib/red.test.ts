import { describe, expect, it } from "vitest";
import { fetchConLimite, TIEMPO_LIMITE_MS } from "./red";

/**
 * El defecto que estas pruebas impiden repetir: ninguna llamada de la app tenía límite de tiempo.
 * En una azotea con señal intermitente una respuesta que se queda a medias no falla, se queda
 * COLGADA, y la interfaz mostraba «Buscando las coordenadas del domicilio…» indefinidamente
 * mientras la física se quedaba en el promedio nacional sin decir por qué.
 */

/** `fetch` que nunca contesta, pero que sí respeta el aborto, como hace el de verdad. */
function nuncaContesta(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolver, rechazar) => {
      init?.signal?.addEventListener("abort", () =>
        rechazar(new DOMException("cancelado", "AbortError"))
      );
    })) as unknown as typeof fetch;
}

describe("una petición que no termina no puede colgar la app", () => {
  it("se corta al pasar el límite en vez de esperar para siempre", async () => {
    const inicio = Date.now();
    await expect(fetchConLimite(nuncaContesta(), "https://ejemplo.test/x", {}, 40)).rejects.toThrow(
      /cancelado/
    );
    // Se comprueba que cortó por el límite y no por otra razón instantánea.
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(30);
  });

  it("una respuesta a tiempo pasa intacta", async () => {
    const ok = (async () => ({ ok: true, status: 200 }) as unknown as Response) as unknown as typeof fetch;
    const r = await fetchConLimite(ok, "https://ejemplo.test/x", {}, 500);
    expect(r.ok).toBe(true);
  });

  it("pasa la señal de aborto al fetch, que es lo que permite cortar", async () => {
    let vista: AbortSignal | null | undefined;
    const espia = (async (_u: string, init?: RequestInit) => {
      vista = init?.signal;
      return { ok: true, status: 200 } as unknown as Response;
    }) as unknown as typeof fetch;

    await fetchConLimite(espia, "https://ejemplo.test/x", {}, 500);
    expect(vista).toBeInstanceOf(AbortSignal);
    expect(vista!.aborted).toBe(false);
  });

  it("conserva las cabeceras que le pasan", async () => {
    let init: RequestInit | undefined;
    const espia = (async (_u: string, i?: RequestInit) => {
      init = i;
      return { ok: true, status: 200 } as unknown as Response;
    }) as unknown as typeof fetch;

    await fetchConLimite(espia, "https://ejemplo.test/x", {
      headers: { Accept: "application/json" },
    }, 500);
    expect((init?.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("no deja el temporizador corriendo cuando la respuesta llegó", async () => {
    // Si se dejara vivo, cada petición mantendría un temporizador pendiente. Se comprueba de la
    // única forma observable sin espiar el reloj: la señal no acaba abortada después.
    let vista: AbortSignal | undefined;
    const ok = (async (_u: string, i?: RequestInit) => {
      vista = i?.signal ?? undefined;
      return { ok: true, status: 200 } as unknown as Response;
    }) as unknown as typeof fetch;

    await fetchConLimite(ok, "https://ejemplo.test/x", {}, 20);
    await new Promise((r) => setTimeout(r, 60));
    expect(vista!.aborted, "el temporizador siguió vivo y abortó una petición ya terminada").toBe(
      false
    );
  });

  it("el límite por omisión es razonable para datos móviles", () => {
    // Ni tan corto que falle en una red lenta, ni tan largo que deje esperando al instalador.
    expect(TIEMPO_LIMITE_MS).toBeGreaterThanOrEqual(5000);
    expect(TIEMPO_LIMITE_MS).toBeLessThanOrEqual(15000);
  });
});
