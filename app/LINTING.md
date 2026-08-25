# Reglas del linter: qué está encendido y por qué

`npm run build` corre `oxlint` **primero**. Tarda 43 ms sobre 62 archivos y falla temprano.

Se conectó después de que un `useEffect` colocado detrás de un `return` condicional rompiera el
diálogo de nuevo análisis por completo y **pasara con 523 pruebas verdes**, porque ninguna toca
componentes. La regla que lo detecta ya estaba en el proyecto; lo que faltaba era ejecutarla.

JSON no admite comentarios, así que el razonamiento vive aquí.

## Errores: tumban el build

| regla | por qué |
|---|---|
| `react/rules-of-hooks` | Es la clase de defecto que rompió el diálogo. Un hook detrás de un `return` condicional cambia el número de hooks entre renders y React aborta el componente entero. No hay forma de que una prueba de lógica lo vea. |

## Avisos que se conservan

| regla | por qué |
|---|---|
| `vitest/no-conditional-expect` | Un `expect` dentro de un `if` puede no ejecutarse **nunca**, y entonces la prueba pasa sin afirmar nada. Pasó tres veces en una sola sesión: bucles con `if (!c) continue;` que habrían quedado verdes con el catálogo vacío, y comprobaciones de foco que daban «sí» porque el diálogo ni existía. Los bucles que quedan cuentan sus iteraciones y exigen haber corrido. |
| `react/only-export-components` | Exportar algo que no es un componente junto a uno rompe la recarga en caliente. |
| `react/set-state-in-effect` | Reiniciar estado dentro de un efecto provoca un render en cascada. Los tres casos vigentes son correctos y funcionan; se dejan a la vista y no se refactorizan sin pruebas de componente que respalden el cambio. |
| `react/purity` | Llamar algo impuro durante el render. Destapó que `ObstacleCapture` generaba identificadores con `Date.now()`, y dos estorbos agregados en el mismo milisegundo compartían identificador. |

## Reglas apagadas, con su razón

Ninguna se apagó por ruido. Cada una se verificó caso por caso y se apagó porque el linter no puede
ver lo que sí existe.

| regla | por qué se apaga |
|---|---|
| `vitest/valid-expect` | Se queja de `expect(valor, "mensaje")`, y Vitest **sí** acepta un mensaje como segundo argumento; la regla viene de Jest, donde no. Eran 16 falsos positivos sobre mensajes que hacen legible un fallo dentro de un bucle. |
| `vitest/require-mock-type-parameters` | Pide parámetros de tipo en cada `vi.fn()`. Los simulacros de `fetch` de este proyecto ya se tipan con un `as unknown as typeof fetch` en el punto de uso, que es donde importa. |
| `jsx-a11y/click-events-have-key-events` | Los 7 casos son el velo de un modal con «clic afuera para cerrar», que es una comodidad de ratón. Su equivalente de teclado es **Escape**, y se verificó uno por uno que los cuatro modales lo tengan: `CommandPalette` y `NewAnalysisDialog` lo manejan ellos, y el de `CostCapture` lo maneja `Catalog`, que es lo que el linter no alcanza a ver. |
| `jsx-a11y/no-static-element-interactions` | Misma familia y mismos casos que la anterior. |
| `jsx-a11y/no-noninteractive-element-interactions` | Los `li[role="option"]` del autocompletado llevan `onClick`. El teclado se maneja desde el campo con flechas y Enter, y la opción activa se señala con `aria-activedescendant`: ese ES el patrón de combobox, y poner un `<button>` dentro de un `option` sería la anidación inválida que se acaba de quitar. |
| `jsx-a11y/prefer-tag-over-role` | Sugiere `<dialog>`, `<button>` y `<option>` nativos en lugar del atributo `role`. Es la dirección correcta a futuro, pero cambiar cuatro modales a `<dialog>` con axe-core reportando cero violaciones es riesgo sin ganancia medible. Queda anotado como deuda. |
| `jsx-a11y/no-noninteractive-element-to-interactive-role` | Mismo caso del combobox. |

## Lo que el linter NO cubre

Cubre las violaciones de reglas de hooks. **No** cubre «el componente se renderiza mal»: un botón que
no llama a su manejador, un aviso que no aparece, un número que no llega a la pantalla. Eso solo lo
ven pruebas de componente, que siguen pendientes.
