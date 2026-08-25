import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, ArrowRight, X, Search, TriangleAlert, Sun } from "lucide-react";
import { citySuggestions, matchCity, optTiltFor, type City } from "../lib/solar";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (address: string) => void;
}

/**
 * Entrada por dirección con autocompletado.
 *
 * El patrón (lista de sugerencias bajo el campo, cada fila con un dato secundario) viene de
 * las búsquedas por dirección de Zillow y de los diálogos de creación de Square. Lo que
 * cambia aquí es el contenido: cada sugerencia muestra el rendimiento solar y la inclinación
 * óptima que se aplicarán, para que el instalador vea la física antes de correr el análisis.
 *
 * Y cuando el texto no corresponde a ninguna ciudad con datos, se dice: el cálculo usará una
 * latitud media del país. Antes eso pasaba en silencio.
 */
export default function NewAnalysisDialog({ open, onClose, onSubmit }: Props) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // La consulta para autocompletar es la última parte de la dirección: quien escribe
  // "Av. Vasconcelos 800, Monterrey" espera que reconozca "Monterrey", no la calle.
  const tail = value.includes(",") ? value.slice(value.lastIndexOf(",") + 1) : value;
  const list = useMemo(() => citySuggestions(tail, 6), [tail]);
  const match = useMemo(() => matchCity(value), [value]);
  // El aviso solo aparece cuando además no hay ninguna sugerencia que ofrecer. Si la lista
  // ya muestra la ciudad, contradecirla con "sin datos locales" confunde: ahí basta el pie,
  // que dice qué hacer ("elige una ciudad de la lista").
  const showFallback = value.trim().length > 2 && !match.matched && list.length === 0;

  useEffect(() => {
    if (!open) return;
    setValue("");
    setCursor(-1);
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  /** Devuelve el foco a donde estaba al abrir.
   *
   * Sin esto, cerrar con Escape dejaba el foco en el `body`: quien navega con teclado queda
   * tirado al inicio del documento y tiene que volver a tabular hasta donde estaba. El botón
   * que abrió el diálogo es el lugar correcto, y es lo que espera un lector de pantalla. */
  useEffect(() => {
    if (!open) return;
    const disparador = document.activeElement as HTMLElement | null;
    return () => {
      if (disparador && document.body.contains(disparador)) disparador.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const caja = cajaRef.current;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !caja) return;
      const focos = caja.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focos.length === 0) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      } else if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (v: string) => {
    const addr = v.trim();
    if (!addr) return;
    onSubmit(addr);
    onClose();
  };

  /** Al elegir una ciudad se conserva la calle ya escrita y solo se reemplaza el final. */
  const pick = (c: City) => {
    const head = value.includes(",") ? value.slice(0, value.lastIndexOf(",")).trim() : "";
    submit(head ? `${head}, ${c.name}` : c.name);
  };

  /** Escape y el foco atrapado viven en el diálogo entero, no en el campo.
   *
   * Estaban solo en `onKeyDown` del campo, así que en cuanto el foco se movía —tabulando a una
   * sugerencia o al botón— Escape dejaba de cerrar. Y sin atrapar el foco, tabular sacaba a
   * quien usa teclado al contenido que está DETRÁS del velo: sigue leyéndose con un lector de
   * pantalla aunque visualmente esté tapado. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor >= 0 && list[cursor]) pick(list[cursor]);
      else submit(value);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      ref={cajaRef}
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo análisis"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_70px_-20px_rgba(0,0,0,.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-medium">Nuevo análisis</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-11 w-11 place-items-center rounded text-faint transition hover:bg-paper hover:text-ink sm:h-7 sm:w-7"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pt-5">
          <label htmlFor="addr" className="mb-2 block text-xs font-medium text-muted">
            Dirección del domicilio o negocio
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 focus-within:border-ink">
            <Search size={16} className="shrink-0 text-faint" />
            <input
              id="addr"
              ref={inputRef}
              value={value}
              onChange={(e) => { setValue(e.target.value); setCursor(-1); }}
              onKeyDown={onKeyDown}
              // solo cuando hay una opción activa: con el cursor en -1 apuntaba a `ciudad--1`,
              // un identificador inexistente, o sea una referencia ARIA inválida
              aria-activedescendant={cursor >= 0 && cursor < list.length ? `ciudad-${cursor}` : undefined}
              placeholder="Av. Vasconcelos 800, Monterrey"
              autoComplete="off"
              role="combobox"
              aria-expanded={list.length > 0}
              aria-controls="ciudades"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            {value && (
              <button
                onClick={() => { setValue(""); inputRef.current?.focus(); }}
                aria-label="Limpiar"
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-faint transition hover:bg-line hover:text-ink"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {list.length > 0 && (
          <>
            <p className="px-5 pb-1.5 pt-4 txt-mini font-semibold tracking-wider text-faint">
              CIUDADES CON DATOS DE IRRADIACIÓN
            </p>
            <ul id="ciudades" role="listbox" className="max-h-[42vh] overflow-y-auto border-t border-line">
              {/* La opción NO lleva un botón dentro: un `role="option"` con descendientes
                  enfocables es una anidación inválida y desorienta a un lector de pantalla. El
                  foco se queda en el campo y se apunta la opción activa con
                  `aria-activedescendant`, que es el patrón de combobox. */}
              {list.map((c, i) => (
                <li
                  key={c.name}
                  id={`ciudad-${i}`}
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(c)}
                  className={`cursor-pointer border-b border-line last:border-0 ${
                    i === cursor ? "bg-paper" : "hover:bg-paper"
                  }`}
                >
                  <span className="flex w-full items-center gap-3 px-5 py-2.5 text-left">
                    <MapPin size={14} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-faint tabular-nums">
                        latitud {c.lat.toFixed(2)}° · inclinación óptima {optTiltFor(c)}°
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium tabular-nums">{c.yield}</span>
                      <span className="block txt-mini text-faint">kWh/kWp año</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {showFallback && (
          <div className="mx-5 mt-4 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-3">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-600" strokeWidth={2} />
            <p className="text-xs leading-relaxed text-amber-900">
              <b className="font-semibold">Sin datos locales para esa ubicación.</b> El análisis usará una
              latitud media del país (22°) y un rendimiento promedio de 1,760 kWh/kWp. La inclinación
              óptima y la producción serán aproximadas: puedes seguir, pero corrige la inclinación a mano
              si conoces la latitud real del sitio.
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-line bg-paper/60 px-5 py-3.5">
          <p className="flex items-center gap-1.5 txt-mini text-faint">
            <Sun size={12} />
            {match.matched
              ? `Se usará ${match.city.name}: ${match.city.yield} kWh/kWp año`
              : "Elige una ciudad de la lista para usar datos medidos"}
          </p>
          <button
            onClick={() => submit(value)}
            disabled={!value.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-30"
          >
            Analizar <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
