import { defineConfig } from 'vitest/config'

/**
 * Configuración de pruebas aparte de `vite.config.ts` a propósito.
 *
 * Meter la sección `test` en la configuración de Vite hace chocar los tipos de Vite que trae
 * vitest con los del proyecto, y un archivo separado es además la forma que documenta vitest.
 *
 * Tampoco hace falta el plugin de React para las pruebas de componente: lo único que aporta
 * sobre lo que ya hace esbuild es Fast Refresh, que en una prueba no sirve de nada. Basta
 * declarar la transformación de JSX aquí abajo. El de Tailwind sí sobra: ninguna prueba
 * comprueba estilos calculados, y para eso haría falta un navegador de verdad.
 */
export default defineConfig({
  // Las pruebas de componente son `.tsx`. Se declara explícitamente en vez de confiar en que
  // esbuild encuentre el `jsx` de `tsconfig.app.json`, que está detrás de una referencia de
  // proyecto y no siempre se resuelve.
  esbuild: { jsx: 'automatic' },
  test: {
    // Node no trae almacenamiento del navegador y `storage.ts` lo usa como global. Se le pone
    // un sustituto en memoria en vez de traer jsdom, que construiría un DOM completo para
    // guardar cuatro cadenas.
    setupFiles: ['./src/test/setup.ts'],

    // El entorno por defecto sigue siendo Node, que es la decisión correcta para las ~730
    // pruebas de cálculo: montar un DOM para todas las haría más lentas sin comprobar nada
    // nuevo. Las pruebas de componente piden `happy-dom` una por una con el comentario
    // `@vitest-environment` en su primera línea.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
