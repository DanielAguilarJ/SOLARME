import { Satellite, PencilRuler, MapPinOff, TriangleAlert } from "lucide-react";
import { QUALITY_NOTE, type SolarLookup } from "../lib/solarApi";

/**
 * Franja de estado de los datos satelitales.
 *
 * Su único trabajo es que el instalador nunca confunda un techo medido con uno estimado.
 * Cada estado dice qué pasó y qué implica para el número que está viendo.
 */
export default function SatelliteStatus({ lookup }: { lookup: SolarLookup }) {
  if (lookup.status === "ok") {
    const q = lookup.data.imageryQuality;
    const fecha = lookup.data.imageryDate;
    const tono =
      q === "HIGH"
        ? "border-leaf-600/25 bg-leaf-600/5"
        : "border-solar-500/30 bg-solar-500/5";

    return (
      <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${tono}`}>
        <Satellite size={15} className="mt-0.5 shrink-0 text-muted" />
        <div className="text-xs leading-relaxed">
          <b className="font-semibold">Techo medido por satélite · calidad {q}.</b>{" "}
          {QUALITY_NOTE[q]}
          {fecha && (
            <span className="text-muted">
              {" "}Imagen de {fecha.year}-{String(fecha.month).padStart(2, "0")}.
            </span>
          )}
          <span className="mt-1 block text-muted">
            {lookup.data.segments.length} segmentos de techo ·{" "}
            {Math.round(lookup.data.roofAreaMeters2)} m² totales ·{" "}
            {Math.round(lookup.data.maxSunshineHoursPerYear)} h de sol al año
          </span>
        </div>
      </div>
    );
  }

  if (lookup.status === "no-coverage") {
    return (
      <Aviso icon={<MapPinOff size={15} />} tone="warn" titulo="Sin imagen aérea de este techo.">
        No hay imagen suficiente de este domicilio; la cobertura en México es parcial. Los números
        siguen saliendo del modelo físico con la superficie que captures a mano, y eso hay que
        confirmarlo en la visita técnica.
      </Aviso>
    );
  }

  /*
   * Lo que esta franja decía antes: «No hay clave de Google Solar API configurada […] con la clave
   * puesta en .env.local se mide el techo real». Eso es una nota para quien programa asomando en la
   * pantalla de quien instala: nombra un archivo del código y le pide una acción que no está a su
   * alcance ni le corresponde. Y no contestaba lo único que él necesita saber, que es de dónde sale
   * la superficie con la que están hechos los números que tiene delante.
   */
  if (lookup.status === "no-key") {
    return (
      <Aviso icon={<PencilRuler size={15} />} tone="info" titulo="El techo lo trazas tú.">
        Todavía no hay imagen aérea del techo, así que la superficie sale del contorno que dibujes
        abajo sobre el plano a escala. Todo lo demás —producción, series, conductor— se calcula con
        la física medida de la ciudad. Confirma las medidas en la visita técnica.
      </Aviso>
    );
  }

  return (
    <Aviso icon={<TriangleAlert size={15} />} tone="warn" titulo="No se pudo ver el techo.">
      {lookup.message}. Se sigue con la superficie que captures a mano sobre el plano; vuelve a
      intentarlo más tarde.
    </Aviso>
  );
}

function Aviso({
  icon, titulo, children, tone,
}: {
  icon: React.ReactNode; titulo: string; children: React.ReactNode;
  tone: "warn" | "info";
}) {
  const tono =
    tone === "warn"
      ? "border-solar-500/30 bg-solar-500/5"
      : "border-line bg-card";
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${tono}`}>
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <div className="text-xs leading-relaxed">
        <b className="font-semibold">{titulo}</b> {children}
      </div>
    </div>
  );
}
