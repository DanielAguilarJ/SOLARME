import { Satellite, KeyRound, MapPinOff, TriangleAlert } from "lucide-react";
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
      <Aviso icon={<MapPinOff size={15} />} tone="warn" titulo="Sin cobertura satelital aquí.">
        Google no tiene imagen suficiente de este domicilio. La cobertura en México es parcial.
        Los números siguen saliendo del modelo físico con la superficie que captures a mano, y
        eso hay que confirmarlo en la visita técnica.
      </Aviso>
    );
  }

  if (lookup.status === "no-key") {
    return (
      <Aviso icon={<KeyRound size={15} />} tone="info" titulo="Modo estimado.">
        No hay clave de Google Solar API configurada, así que el techo es una simulación y la
        superficie la capturas tú. Con la clave puesta en <code className="rounded bg-paper px-1">
        .env.local</code> se mide el techo real, sus segmentos y su orientación.
      </Aviso>
    );
  }

  return (
    <Aviso icon={<TriangleAlert size={15} />} tone="warn" titulo="No se pudo consultar el satélite.">
      {lookup.message}. Se sigue con el modelo estimado; vuelve a intentarlo y si persiste
      revisa que la clave siga válida y con la Solar API habilitada.
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
