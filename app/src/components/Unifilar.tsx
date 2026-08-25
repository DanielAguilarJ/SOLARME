import { AlertTriangle } from "lucide-react";
import type { Nodo, Simbolo, Desconectador } from "../lib/desconexion";

/**
 * El diagrama unifilar, dibujado.
 *
 * Deliberadamente NO se parece a un lienzo de nodos de producto: un unifilar lo firma un
 * electricista y tiene su propio lenguaje. Los símbolos son los convencionales —módulo con su
 * diagonal, cuchilla abierta, inversor con la marca de continua y alterna, medidor circular— y el
 * trazo es de línea fina monocroma, con las cotas en tipografía pequeña separadas del dibujo.
 *
 * Vertical en teléfono y horizontal en escritorio: las dos son orientaciones válidas de un
 * unifilar, así que no hay que sacrificar nada para que quepa.
 */

const TRAZO = "var(--color-ink)";

/** Cada símbolo dibuja dentro de una caja de 44×44 con el eje del conductor en y=22. */
function Icono({ simbolo }: { simbolo: Simbolo }) {
  const comun = {
    width: 44, height: 44, viewBox: "0 0 44 44", fill: "none",
    stroke: TRAZO, strokeWidth: 1.25, strokeLinecap: "round" as const,
    "aria-hidden": true,
  };

  if (simbolo === "modulos") {
    // Módulo fotovoltaico: rectángulo con la diagonal de la celda.
    return (
      <svg {...comun}>
        <rect x="8" y="10" width="28" height="24" />
        <path d="M8 34 L36 10" />
        <path d="M22 10 L22 34" strokeOpacity={0.35} />
      </svg>
    );
  }

  if (simbolo === "desconectador") {
    // Cuchilla en posición abierta: el punto fijo, el contacto y la hoja levantada.
    return (
      <svg {...comun}>
        <path d="M4 22 L13 22" />
        <path d="M31 22 L40 22" />
        <circle cx="13" cy="22" r="2" fill={TRAZO} stroke="none" />
        <circle cx="31" cy="22" r="2" fill={TRAZO} stroke="none" />
        <path d="M13 22 L29 11" />
      </svg>
    );
  }

  if (simbolo === "inversor") {
    // Inversor: caja con la diagonal, continua a la izquierda y alterna a la derecha.
    return (
      <svg {...comun}>
        <rect x="9" y="9" width="26" height="26" />
        <path d="M35 9 L9 35" />
        <path d="M13 16 L19 16" />
        <path d="M13 20 L19 20" strokeDasharray="2 2" />
        <path d="M25 27 q2.5 -4 5 0 t5 0" transform="translate(-5 0)" />
      </svg>
    );
  }

  if (simbolo === "medidor") {
    // Medidor: círculo con las flechas de los dos sentidos.
    return (
      <svg {...comun}>
        <circle cx="22" cy="22" r="12" />
        <path d="M15 19 L29 19" />
        <path d="M27 16.5 L29 19 L27 21.5" />
        <path d="M29 25 L15 25" />
        <path d="M17 22.5 L15 25 L17 27.5" />
      </svg>
    );
  }

  // Red: el símbolo de la acometida, tres fases sobre la barra.
  return (
    <svg {...comun}>
      <path d="M8 30 L36 30" />
      <path d="M13 30 L13 14" />
      <path d="M22 30 L22 11" />
      <path d="M31 30 L31 14" />
      <path d="M10 34 L16 34 M19 34 L25 34 M28 34 L34 34" strokeOpacity={0.35} />
    </svg>
  );
}

/**
 * En escritorio el dibujo va arriba y los datos abajo, alineados en la misma rejilla: es la
 * disciplina del dibujo técnico —trazo limpio, cotas aparte— y no la del lienzo de nodos, donde el
 * texto invade el dibujo. En teléfono se apilan, que también es un unifilar válido.
 */
function Trazo({ nodos }: { nodos: Nodo[] }) {
  return (
    <div aria-hidden className="hidden sm:grid sm:grid-cols-6 sm:gap-3">
      {nodos.map((n, i) => (
        <div key={n.titulo} className="flex items-center">
          <div
            className={`grid size-11 shrink-0 place-items-center rounded border ${
              n.incompleto ? "border-dashed border-solar-600" : "border-line"
            }`}
          >
            <Icono simbolo={n.simbolo} />
          </div>
          {/* El trazo sale de la celda y cruza la separación: así el símbolo queda sobre su
              columna de datos, en la misma rejilla, y no a la deriva. */}
          {i < nodos.length - 1 && (
            <div className="h-px flex-1" style={{ background: "var(--color-line)", marginRight: -12 }} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Los datos de un elemento. Sin el símbolo: en escritorio ya está dibujado arriba. */
function Datos({ nodo }: { nodo: Nodo }) {
  return (
    <div className="flex gap-3 sm:block">
      <div
        className={`grid size-11 shrink-0 place-items-center self-start rounded border sm:hidden ${
          nodo.incompleto ? "border-dashed border-solar-600" : "border-line"
        }`}
      >
        <Icono simbolo={nodo.simbolo} />
      </div>
      <div className="min-w-0">
        <h4 className="txt-mini font-medium">
          {nodo.titulo}
          {nodo.incompleto && (
            <AlertTriangle
              size={11}
              className="ml-1 inline-block shrink-0 align-baseline text-solar-600"
              aria-hidden
            />
          )}
        </h4>
        <ul className="mt-1 space-y-0.5">
          {nodo.detalle.map((d, i) => (
            <li key={i} className="txt-micro text-faint">{d}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Unifilar({
  nodos, faltan, cc, ca,
}: {
  nodos: Nodo[];
  faltan: Nodo[];
  cc: Desconectador;
  ca: Desconectador;
}) {
  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="txt-mini font-medium">Diagrama unifilar</h3>
        <p className="txt-micro text-faint">
          {faltan.length === 0
            ? "Cadena completa"
            : `${faltan.length} ${faltan.length === 1 ? "elemento" : "elementos"} por definir`}
        </p>
      </div>

      <div className="mt-4">
        <Trazo nodos={nodos} />
        <ol className="space-y-4 sm:mt-3 sm:grid sm:grid-cols-6 sm:gap-3 sm:space-y-0 [&>*]:min-w-0">
          {nodos.map((n) => (
            <li key={n.titulo}>
              <Datos nodo={n} />
            </li>
          ))}
        </ol>
      </div>

      {faltan.length > 0 && (
        <p className="mt-1 border-t border-line pt-3 txt-micro text-faint">
          El plano no se puede presentar hasta cerrar{" "}
          {faltan.map((n) => n.titulo).join(", ")}.
        </p>
      )}

      <div className="mt-3 space-y-3 border-t border-line pt-3">
        {[cc, ca].map((d) => (
          <div key={d.lado}>
            <h4 className="txt-mini font-medium">
              Desconectador {d.lado === "cc" ? "de continua" : "de alterna"}
              {d.vNominal && d.aNominal && (
                <span className="ml-1.5 font-normal text-faint">
                  {d.vNominal} V · {d.aNominal} A
                </span>
              )}
            </h4>
            <ul className="mt-1 space-y-0.5">
              {d.requisitos.map((r) => (
                <li key={r} className="txt-micro text-faint">— {r}</li>
              ))}
            </ul>
            {d.falta && <p className="mt-1 txt-micro text-solar-700">{d.falta}</p>}
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-line pt-3 txt-micro text-faint">
        Criterios de NEC Art. 690 y 705, corroborados en cuatro fuentes independientes. El texto de
        la NOM-001-SEDE no se pudo consultar directamente: confírmalo antes de firmar un plano.
      </p>
    </section>
  );
}
