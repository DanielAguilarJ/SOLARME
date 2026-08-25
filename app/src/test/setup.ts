/**
 * Sustituto de `localStorage` para las pruebas.
 *
 * El entorno de Vitest es Node y no trae almacenamiento del navegador. `storage.ts` lo usa
 * como global —a diferencia de `quotes.ts` y `bos.ts`, que reciben el almacén por parámetro—
 * así que sin esto sus pruebas fallarían por el entorno y no por el código.
 *
 * Se prefiere este sustituto de veinte líneas a traer jsdom: la memoria de esta máquina está
 * justa y jsdom construye un DOM completo para guardar cuatro cadenas.
 */
class MemoriaStorage implements Storage {
  private datos = new Map<string, string>();

  get length(): number {
    return this.datos.size;
  }

  clear(): void {
    this.datos.clear();
  }

  getItem(clave: string): string | null {
    return this.datos.has(clave) ? this.datos.get(clave)! : null;
  }

  key(i: number): string | null {
    return Array.from(this.datos.keys())[i] ?? null;
  }

  removeItem(clave: string): void {
    this.datos.delete(clave);
  }

  setItem(clave: string, valor: string): void {
    this.datos.set(clave, String(valor));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoriaStorage(),
  writable: true,
  configurable: true,
});

/**
 * Sustituto mínimo de `window` y de `StorageEvent`.
 *
 * Misma decisión que con `localStorage`: un sustituto de unas líneas en vez de jsdom, que
 * construiría un DOM completo para despachar un evento. Sólo hace falta lo que usa `contactos.ts`:
 * escuchar y despachar el aviso de que otra pestaña cambió el almacenamiento.
 */
class StorageEventFalso extends Event {
  key: string | null;
  constructor(tipo: string, init: { key?: string | null } = {}) {
    super(tipo);
    this.key = init.key ?? null;
  }
}

if (typeof globalThis.window === "undefined") {
  const bus = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: {
      addEventListener: bus.addEventListener.bind(bus),
      removeEventListener: bus.removeEventListener.bind(bus),
      dispatchEvent: bus.dispatchEvent.bind(bus),
    },
    writable: true,
  });
  Object.defineProperty(globalThis, "StorageEvent", {
    value: StorageEventFalso,
    writable: true,
  });
}
