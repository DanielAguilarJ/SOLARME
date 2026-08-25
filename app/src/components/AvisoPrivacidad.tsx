import { useEffect, useSyncExternalStore } from "react";
import { X, AlertTriangle } from "lucide-react";
import { faltaParaAviso, leerNegocio, suscribirNegocio } from "../lib/negocio";

/**
 * Aviso de privacidad.
 *
 * Existe porque la app guarda datos personales —domicilios de clientes y los contactos de la
 * libreta de obra— y en México la Ley Federal de Protección de Datos Personales en Posesión de
 * los Particulares exige un aviso de privacidad a quien los trata. La app no tenía ninguno.
 *
 * TODO EL CONTENIDO FACTUAL de este aviso es verificable en el código: qué se guarda, dónde vive,
 * qué sale del dispositivo y qué no. Lo único que NO puede saber la app es la identidad legal de
 * quien opera el negocio, y eso ahora se pide una vez en «Mi negocio» y se rellena aquí. Mientras
 * falte algo, el hueco se marca y la franja de arriba lo dice: nunca se inventa una razón social,
 * y nunca se afirma que el aviso está listo cuando no lo está.
 *
 * Usa la misma convención de modal que el resto de la app: cierra con Escape, con el fondo y con
 * la X, y se anuncia como diálogo.
 */
export default function AvisoPrivacidad({ onClose }: { onClose: () => void }) {
  // Se suscribe en vez de leer al montar: si el instalador acaba de rellenar sus datos en la otra
  // pantalla, este aviso tiene que reflejarlo sin recargar la aplicación.
  const negocio = useSyncExternalStore(suscribirNegocio, leerNegocio, () => leerNegocio());
  const falta = faltaParaAviso(negocio);

  /** Un dato del negocio, o el hueco marcado si todavía no está. */
  const dato = (v: string, hueco: string) => (v ? v : `[${hueco}]`);

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Aviso de privacidad"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-[0_24px_60px_rgba(0,0,0,.16)] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-serif text-xl tracking-tight">Aviso de privacidad</h2>
            <p className="mt-0.5 text-xs text-muted">
              Cómo se tratan los datos que capturas en SolarMe.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar el aviso"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted transition hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-ink">
          {/* Aviso al propio instalador: los huecos legales son suyos, no de la app. Desaparece
              cuando ya están puestos, porque entonces la advertencia sería falsa. */}
          {falta.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-solar-500/40 bg-solar-500/10 px-4 py-3 text-xs leading-relaxed">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-solar-600" />
              <span>
                <b className="font-semibold">Borrador para completar.</b> Falta{" "}
                {falta.join(", ")} de tu negocio; se rellena en «Mi negocio» y aparece aquí solo.
                Revisa además el texto con quien lleve tus temas legales antes de entregar este
                aviso a un cliente. Lo demás describe lo que la aplicación hace de verdad con la
                información.
              </span>
            </div>
          )}

          <section>
            <h3 className="font-semibold">Quién es responsable de tus datos</h3>
            <p className="mt-1 text-muted">
              <b className="text-ink">{dato(negocio.nombre, "RAZÓN SOCIAL O NOMBRE DEL INSTALADOR")}</b>,
              con domicilio en{" "}
              <b className="text-ink">{dato(negocio.domicilio, "DOMICILIO")}</b>, es responsable del
              tratamiento de los datos personales que se capturan en esta herramienta. Para
              cualquier asunto sobre ellos:{" "}
              <b className="text-ink">{dato(contacto(negocio), "CORREO O TELÉFONO DE CONTACTO")}</b>.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Qué datos se guardan</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
              <li>El domicilio del inmueble que analizas y su consumo eléctrico.</li>
              <li>
                Los contactos de tu libreta de obra: nombre, teléfono, correo y registro
                profesional de electricistas, cuadrillas y proveedores que tú anotes.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold">Dónde viven y quién los ve</h3>
            <p className="mt-1 text-muted">
              Se guardan <b className="text-ink">únicamente en este navegador</b>, en tu propio
              dispositivo. SolarMe no tiene servidor ni cuenta: nadie más los ve, no se suben a
              ningún lado y no se comparten ni se venden. Los respaldos que exportas son archivos
              que quedan bajo tu control. Si borras los datos del navegador, se pierden.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Qué sale del dispositivo, y solo eso</h3>
            <p className="mt-1 text-muted">
              Para ubicar un domicilio en el mapa, la dirección que escribes se envía a servicios de
              geolocalización de terceros —OpenStreetMap (Nominatim) y Open-Meteo— que la usan para
              devolver sus coordenadas. Si está activado el servicio de imágenes aéreas de Google (Google Solar), el domicilio
              también se consulta con Google para medir el techo. Ningún otro dato —ni los contactos
              de tu libreta, ni el consumo, ni las cotizaciones— se transmite a nadie.
            </p>
          </section>

          <section>
            <h3 className="font-semibold">Tus derechos</h3>
            <p className="mt-1 text-muted">
              Como los datos viven en tu dispositivo, los controlas directamente: puedes verlos,
              corregirlos o borrarlos desde la propia aplicación y desde tus respaldos, cuando
              quieras. Si un cliente cuyo domicilio anotaste pide acceder a sus datos, corregirlos,
              cancelarlos u oponerse a su uso (derechos ARCO), la solicitud se atiende en{" "}
              <b className="text-ink">{dato(contacto(negocio), "CORREO O TELÉFONO DE CONTACTO")}</b>.
            </p>
          </section>

          <p className="border-t border-line pt-3 txt-mini text-faint">
            Consultado el {hoy()}. Este aviso puede cambiar si cambia lo que la herramienta
            hace con los datos; la versión vigente es la que se muestra aquí.
          </p>
        </div>
      </div>
    </div>
  );
}

/** El medio de contacto que haya, con el teléfono primero porque es como se llama a un instalador. */
function contacto(n: { telefono: string; correo: string }): string {
  return [n.telefono, n.correo].filter(Boolean).join(" · ");
}

/**
 * La fecha de hoy en formato largo.
 *
 * Antes decía «Última actualización: [FECHA]», un hueco que nadie iba a rellenar cada vez que
 * cambiara el texto. Y decir «última actualización» sería una afirmación sobre el historial del
 * documento que la aplicación no tiene: lo que sí es cierto es el día en que se está leyendo.
 */
function hoy(): string {
  return new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}
