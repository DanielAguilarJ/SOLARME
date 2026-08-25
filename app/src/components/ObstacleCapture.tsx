import { useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { newId } from "../lib/storage";
import {
  ALTURA_TIPICA, ETIQUETA_OBSTACULO, MAX_ALTURA, MIN_ALTURA,
  type Obstacle, type ObstacleKind, type ShadingResult,
} from "../lib/shading";

/**
 * Captura de obstáculos de azotea.
 *
 * Sustituye al deslizador de sombra, que pedía adivinar un porcentaje. El mismo defecto que
 * tenían el precio del módulo y el consumo del cliente: pedir una conclusión en lugar del
 * dato que la persona sí conoce.
 *
 * La posición se pide por ZONA y no en metros, a propósito. Un instalador sabe que el tinaco
 * está en la esquina noreste; no trae un plano acotado. Nueve zonas capturan lo que decide el
 * cálculo —qué tan al sur está el estorbo, porque la sombra corre hacia el norte— sin exigir
 * un levantamiento que nadie va a hacer parado en una azotea.
 */

type Fila = "sur" | "centro" | "norte";
type Col = "oriente" | "centro" | "poniente";

const FILAS: Fila[] = ["norte", "centro", "sur"];
const COLS: Col[] = ["oriente", "centro", "poniente"];

/** Fracción del lado donde cae el centro de cada zona. */
const FRACCION: Record<string, number> = { sur: 0.15, centro: 0.5, norte: 0.85, oriente: 0.15, poniente: 0.85 };

function aCoordenadas(fila: Fila, col: Col, lado: number) {
  return { x: FRACCION[col] * lado, y: FRACCION[fila] * lado };
}

function zonaDe(o: Obstacle, lado: number): { fila: Fila; col: Col } {
  const cerca = (v: number, opciones: string[]): string =>
    opciones.reduce((a, b) =>
      Math.abs(FRACCION[a] * lado - v) <= Math.abs(FRACCION[b] * lado - v) ? a : b,
    );
  return {
    fila: cerca(o.y, ["sur", "centro", "norte"]) as Fila,
    col: cerca(o.x, ["oriente", "centro", "poniente"]) as Col,
  };
}

export default function ObstacleCapture({
  obstacles, areaM2, shading, onChange,
}: {
  obstacles: Obstacle[];
  areaM2: number;
  shading?: ShadingResult;
  onChange: (o: Obstacle[]) => void;
}) {
  const lado = Math.sqrt(Math.max(0, areaM2));
  const [kind, setKind] = useState<ObstacleKind>("tinaco");
  const [fila, setFila] = useState<Fila>("centro");
  const [col, setCol] = useState<Col>("centro");
  const [alto, setAlto] = useState(String(ALTURA_TIPICA.tinaco.height));

  const elegirTipo = (k: ObstacleKind) => {
    setKind(k);
    setAlto(String(ALTURA_TIPICA[k].height));
  };

  /*
   * La altura se interpreta aceptando coma decimal.
   *
   * El campo no es `type="number"`, así que acepta cualquier texto, y «2,5» —como se escribe a mano
   * en media hispanoamérica— daba NaN. El botón entonces no hacía NADA: ni agregaba el estorbo ni
   * decía por qué, que es el mismo fallo silencioso que tenía la propuesta cuando el navegador
   * bloqueaba la ventana. Es el mismo criterio que usa el campo del costo por watt.
   */
  const altura = Number(alto.replace(",", "."));
  const alturaValida = Number.isFinite(altura) && altura >= MIN_ALTURA && altura <= MAX_ALTURA;

  const agregar = () => {
    const h = altura;
    if (!alturaValida) return;
    const tipico = ALTURA_TIPICA[kind];
    const { x, y } = aCoordenadas(fila, col, lado);
    onChange([
      ...obstacles,
      {
        // `newId` en vez de `Date.now()`: dos estorbos agregados en el mismo milisegundo
        // compartirían identificador, y el identificador es lo que usa la lista para borrar y
        // el plano para saber cuál se está arrastrando.
        id: `${kind}-${newId()}`,
        kind, height: h, x, y,
        width: Math.min(tipico.width, lado),
        depth: Math.min(tipico.depth, lado),
      },
    ]);
  };

  const perdida = shading ? shading.loss * 100 : 0;
  const areaPerdida = shading ? areaM2 - shading.areaUtil : 0;

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Estorbos en la azotea</h3>
          <p className="mt-0.5 text-xs text-muted">
            Lo que ya está arriba: tinaco, pretil, ducto, un árbol o el vecino.
          </p>
        </div>
        {shading && (
          <div className="shrink-0 text-right">
            <div className="text-lg font-medium tabular-nums">{perdida.toFixed(1)}%</div>
            <div className="text-xs text-faint">
              pérdida
              <span className="ml-1.5 rounded bg-leaf-600/10 px-1.5 py-px font-medium text-leaf-600">
                calculada
              </span>
            </div>
          </div>
        )}
      </div>

      {obstacles.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {obstacles.map((o) => {
            const z = zonaDe(o, lado);
            return (
              <li key={o.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {ETIQUETA_OBSTACULO[o.kind]}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{o.height} m</span>
                <span className="shrink-0 text-xs text-faint">
                  {z.fila === "centro" && z.col === "centro" ? "al centro" : `${z.fila} ${z.col}`}
                </span>
                <button
                  onClick={() => onChange(obstacles.filter((x) => x.id !== o.id))}
                  aria-label={`Quitar ${ETIQUETA_OBSTACULO[o.kind]}`}
                  className="shrink-0 rounded p-2.5 text-faint transition hover:bg-line hover:text-ink"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <span className="mb-1.5 block text-xs text-muted">Qué es</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ETIQUETA_OBSTACULO) as ObstacleKind[]).map((k) => (
              <button
                key={k}
                onClick={() => elegirTipo(k)}
                className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-medium transition sm:min-h-0 sm:py-1.5 ${
                  kind === k
                    ? "border-ink bg-ink text-white"
                    : "border-line text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {ETIQUETA_OBSTACULO[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1.5 block text-xs text-muted">Dónde está</span>
            <div className="inline-grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
              {FILAS.map((f) =>
                COLS.map((c) => {
                  const activo = f === fila && c === col;
                  return (
                    <button
                      key={`${f}-${c}`}
                      onClick={() => { setFila(f); setCol(c); }}
                      aria-label={`${f} ${c}`}
                      title={`${f} ${c}`}
                      className={`h-11 w-11 txt-mini transition sm:h-9 sm:w-11 ${
                        activo ? "bg-ink text-white" : "bg-card text-faint hover:bg-paper"
                      }`}
                    >
                      {f === "centro" && c === "centro" ? "·" : ""}
                    </button>
                  );
                }),
              )}
            </div>
            <p className="mt-1 txt-micro text-faint">Arriba es el norte</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="alto-obs">
              Qué tan alto
            </label>
            <div className="fld">
              <input
                id="alto-obs"
                inputMode="decimal"
                value={alto}
                onChange={(e) => setAlto(e.target.value)}
                aria-label="Altura del estorbo en metros"
                className="min-h-11 w-full bg-transparent text-sm tabular-nums outline-none sm:min-h-0"
              />
              <span className="shrink-0 text-xs text-faint">m</span>
            </div>
            <p className="mt-1 txt-micro text-faint">
              Sobre el plano donde irán los módulos
            </p>
          </div>
        </div>

        <button
          onClick={agregar}
          disabled={!alturaValida}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium transition hover:border-ink disabled:cursor-not-allowed disabled:border-line disabled:text-faint disabled:hover:border-line"
        >
          {alturaValida ? (
            <>
              <Plus size={14} /> Agregar
            </>
          ) : (
            <>Escribe una altura entre {MIN_ALTURA} y {MAX_ALTURA} m</>
          )}
        </button>
      </div>

      {shading && areaPerdida > 0.5 && (
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-muted">
          <TriangleAlert size={13} className="mt-px shrink-0 text-solar-600" />
          <span>
            <span className="font-medium text-ink">{areaPerdida.toFixed(1)} m²</span> quedan
            inservibles para montar. No es que produzcan menos: un módulo sombreado parte del
            día arrastra a toda su cadena, así que colocarlo ahí resta en vez de sumar.
          </span>
        </p>
      )}

      {obstacles.length === 0 && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
          Sin estorbos capturados se usa el porcentaje estimado del deslizador. Capturar el
          tinaco y el pretil toma menos de un minuto y cambia cuántos módulos caben de verdad.
        </p>
      )}
    </div>
  );
}
