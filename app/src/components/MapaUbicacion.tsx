import { useRef, useState } from "react";
import { MapPin, Check, ImageOff } from "lucide-react";
import { vistaPara, urlDeMosaico, desplazar } from "../lib/mosaico";
import { fuenteMosaico } from "../lib/tiles";

/**
 * Confirmar el punto del techo sobre un mapa.
 *
 * Por qué existe: al resolver una dirección, solo 2 de cada 8 direcciones mexicanas caen en el
 * número exacto (medido); el resto quedan en la calle o la colonia. Como de ese punto salen la
 * física y —el día que haya imagen satelital— el trazado del techo, el instalador tiene que poder
 * corregirlo. Arrastra el mapa bajo un pin fijo y el centro pasa a ser el domicilio nuevo.
 *
 * Es AGNÓSTICO del proveedor: la imagen sale de `fuenteMosaico()`, que se configura por variable
 * de entorno. Sin proveedor configurado no pinta en blanco ni usa mosaicos que no se pueden
 * distribuir: lo dice, y deja igualmente ajustar el punto sobre una cuadrícula de referencia,
 * porque la corrección de coordenadas no depende de ver la foto.
 */
const ANCHO = 320;
const ALTO = 260;

export default function MapaUbicacion({
  lat,
  lon,
  zoom = 18,
  onConfirm,
  onCancel,
}: {
  lat: number;
  lon: number;
  zoom?: number;
  onConfirm: (lat: number, lon: number) => void;
  onCancel: () => void;
}) {
  const fuente = fuenteMosaico();
  const z = fuente ? Math.min(zoom, fuente.zoomMax) : zoom;
  const [centro, setCentro] = useState({ lat, lon });
  const arrastre = useRef<{ x: number; y: number } | null>(null);

  const vista = vistaPara(centro.lat, centro.lon, z, ANCHO, ALTO);

  const alSoltar = () => {
    arrastre.current = null;
  };

  const alMover = (clientX: number, clientY: number) => {
    if (!arrastre.current) return;
    const dpx = clientX - arrastre.current.x;
    const dpy = clientY - arrastre.current.y;
    if (dpx === 0 && dpy === 0) return;
    // Arrastrar la imagen hacia la derecha revela lo que está a la IZQUIERDA: el centro se mueve
    // en sentido contrario al gesto, por eso el signo negativo.
    setCentro((c) => desplazar(c.lat, c.lon, z, -dpx, -dpy));
    arrastre.current = { x: clientX, y: clientY };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar el punto del techo"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-3 rounded-t-2xl border border-line bg-card p-5 shadow-[0_24px_60px_rgba(0,0,0,.16)] sm:rounded-2xl"
      >
        <div>
          <h2 className="font-serif text-lg tracking-tight">Ajusta el punto del techo</h2>
          <p className="mt-0.5 text-xs text-muted">
            Arrastra el mapa hasta que el pin quede sobre el techo del inmueble. De este punto sale
            el cálculo.
          </p>
        </div>

        {/* Lienzo: mosaicos si hay proveedor, cuadrícula de referencia si no. El pin va fijo en el
            centro y lo que se mueve es el mapa; el centro ES el domicilio. */}
        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-xl border border-line bg-paper"
          style={{ width: ANCHO, height: ALTO }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            arrastre.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => alMover(e.clientX, e.clientY)}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          {fuente ? (
            vista.mosaicos.map((m) => (
              <img
                key={`${m.z}/${m.x}/${m.y}`}
                src={urlDeMosaico(fuente, m)}
                alt=""
                draggable={false}
                className="pointer-events-none absolute"
                style={{ left: m.izquierda, top: m.arriba, width: 256, height: 256 }}
              />
            ))
          ) : (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center [background-image:linear-gradient(var(--color-line,#e7e2da)_1px,transparent_1px),linear-gradient(90deg,var(--color-line,#e7e2da)_1px,transparent_1px)] [background-size:24px_24px]">
              <ImageOff size={18} className="text-faint" />
              <p className="txt-mini text-muted">
                Sin imagen de mapa configurada. Puedes ajustar el punto igual; la foto aparece
                cuando el operador conecta un proveedor.
              </p>
            </div>
          )}

          {/* El pin, fijo en el centro del lienzo. */}
          <MapPin
            size={28}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-solar-600 drop-shadow"
            style={{ left: ANCHO / 2, top: ALTO / 2 }}
            aria-hidden
          />
        </div>

        <p className="text-center txt-micro tabular-nums text-faint">
          {centro.lat.toFixed(5)}, {centro.lon.toFixed(5)}
          {fuente && <span className="ml-1">· {fuente.credito}</span>}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-paper"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(centro.lat, centro.lon)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Check size={14} /> Usar este punto
          </button>
        </div>
      </div>
    </div>
  );
}
