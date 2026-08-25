import { describe, it, expect } from "vitest";
import {
  SITES, siteFor, interp, monthlyWeights, seasonalSwing, RESUMEN,
  azimuthLossEstimated, azimuthLossMeasured, azimuthLossMin, tiltLossMeasured,
  AZ_TILT_COEF, AZ_SHAPE_EXP,
} from "./site";
import { climaDe } from "./termico";
import {
  CITIES, DEFAULT_CITY, optTiltFor, optAzFor, azPenalty, orientationFactor,
} from "./solar";

const claves = Object.keys(SITES);

describe("catálogo de sitios medidos", () => {
  it("cubre los 32 estados con física completa en cada sitio", () => {
    expect(claves.length).toBeGreaterThanOrEqual(90);
    expect(new Set(Object.values(SITES).map((s) => s.estado)).size).toBe(32);
    for (const s of Object.values(SITES)) {
      expect(s.mensual).toHaveLength(12);
      expect(s.tiltOptimo).toBeGreaterThan(0);
      // La malla completa solo la trae la primera capa. La segunda mide rendimiento y
      // óptimo del punto y usa la curva ajustada, que es la degradación correcta: vale
      // más medir el rendimiento donde vive el cliente que la malla en pocas ciudades.
      if (s.mallaCompleta) {
        expect(Object.keys(s.perdidaAzimut!).length).toBeGreaterThanOrEqual(11);
        expect(Object.keys(s.perdidaTilt!).length).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("todo sitio trae la temperatura que la app consume, no solo los primeros", () => {
    // Esta prueba existe por un defecto real: al añadir 9 sitios se corrió el script que mide
    // los EXTREMOS (para dimensionar strings) pero no el que mide la temperatura media ponderada
    // por producción (para clasificar el clima). Los 9 quedaron sin `tMediaSol`, así que
    // `climaDe` los daba por «templado» y el recomendador dejaba de priorizar el coeficiente
    // térmico justo donde más importa: Felipe Carrillo Puerto mide 26.7 °C y Ciudad Valles 25.5.
    //
    // Nada falló. La suite estaba verde porque ninguna prueba exigía el campo, y el hueco solo
    // se vio al medir el reparto de climas sobre el catálogo entero.
    for (const [alias, s] of Object.entries(SITES)) {
      expect(s.tMinAbs, `${alias} sin mínima absoluta`).toBeDefined();
      expect(s.tMaxAbs, `${alias} sin máxima absoluta`).toBeDefined();
      expect(s.tMediaSol, `${alias} sin temperatura media de operación`).toBeDefined();
      // Rango físicamente posible en México para una media ponderada por producción.
      expect(s.tMediaSol!, alias).toBeGreaterThan(5);
      expect(s.tMediaSol!, alias).toBeLessThan(35);
      // La media de operación tiene que caer entre los extremos medidos del mismo sitio.
      expect(s.tMediaSol!, `${alias} incoherente con sus extremos`).toBeGreaterThan(s.tMinAbs!);
      expect(s.tMediaSol!, `${alias} incoherente con sus extremos`).toBeLessThan(s.tMaxAbs!);
    }
  });

  it("los tres climas del recomendador se reparten el catálogo de verdad", () => {
    // Un clima que no le toca a ninguna ciudad es un perfil de pesos que nunca se aplica.
    const climas = Object.values(SITES).map((s) => climaDe(s).clima);
    for (const c of ["calido", "templado", "fresco"] as const) {
      expect(climas.filter((x) => x === c).length, `ninguna ciudad es ${c}`).toBeGreaterThan(5);
    }
    // Y ninguna debe caer en el valor por omisión por falta de dato.
    expect(Object.values(SITES).every((s) => climaDe(s).medido)).toBe(true);
  });

  it("los pesos mensuales de cada sitio suman uno", () => {
    for (const s of Object.values(SITES)) {
      expect(s.mensual.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    }
  });

  it("el rendimiento cae en el rango físicamente posible de México", () => {
    for (const s of Object.values(SITES)) {
      // Cotas FÍSICAS, no empíricas: el mínimo medido del país está en 1533 y el máximo
      // en 2244. Se deja holgura para que medir más ciudades no rompa la prueba sin
      // motivo, pero fuera de 1400–2400 sí sería imposible en México.
      expect(s.rendimiento).toBeGreaterThan(1400);
      expect(s.rendimiento).toBeLessThan(2400);
    }
  });

  it("la pérdida por inclinación es cero en el óptimo del sitio", () => {
    for (const s of Object.values(SITES)) {
      expect(tiltLossMeasured(s, s.tiltOptimo)).toBeCloseTo(0, 6);
    }
  });
});

/** El defecto que este dataset corrige: las constantes inventadas ordenaban mal las
 * ciudades. Se asumía Mérida (1820) por encima de CDMX (1760) y lo medido es lo
 * contrario, porque el altiplano alto y seco supera al trópico húmedo. */
describe("el rendimiento medido corrige el orden, no solo la magnitud", () => {
  it("Ciudad de México rinde más que Mérida", () => {
    expect(SITES.cdmx.rendimiento).toBeGreaterThan(SITES.merida.rendimiento);
  });

  it("las ciudades de altiplano superan a las del trópico húmedo", () => {
    const altiplano = [SITES.cdmx, SITES.puebla];
    const tropico = [SITES.merida, SITES.cancun];
    for (const a of altiplano) {
      for (const t of tropico) expect(a.rendimiento).toBeGreaterThan(t.rendimiento);
    }
  });

  it("la altitud queda registrada y CDMX está por encima de 2000 m", () => {
    expect(SITES.cdmx.elevacion).toBeGreaterThan(2000);
    expect(SITES.cancun.elevacion).toBeLessThan(100);
  });
});

/** Donde dos fuentes independientes discrepan, el producto no elige en silencio: se
 * queda con la menor. Sobreestimar la producción produce una propuesta que no cumple. */
describe("degradación por desacuerdo entre fuentes", () => {
  it("los sitios marcados menor-de-dos rinden menos que la cifra de PVGIS", () => {
    const degradados = Object.values(SITES).filter((s) => s.fuenteRendimiento === "menor-de-dos");
    expect(degradados.length).toBeGreaterThan(0);
    for (const s of degradados) expect(s.rendimiento).toBeLessThan(s.rendimientoPvgis);
  });

  it("los sitios donde las fuentes concuerdan conservan la cifra de PVGIS", () => {
    for (const s of Object.values(SITES)) {
      if (s.fuenteRendimiento === "concuerdan") {
        expect(s.rendimiento).toBeCloseTo(s.rendimientoPvgis, 0);
      }
    }
  });

  it("cuando la segunda fuente lee más alto no se degrada: ya es la conservadora", () => {
    const alRevés = Object.values(SITES).filter((s) => s.discrepanciaFuentes < -3);
    expect(alRevés.length).toBeGreaterThan(0);
    for (const s of alRevés) {
      expect(s.fuenteRendimiento, s.nombre).toBe("concuerdan");
      expect(s.rendimiento, s.nombre).toBeCloseTo(s.rendimientoPvgis, 0);
    }
  });

  it("nunca degrada hacia arriba: la cifra usada jamás supera la de PVGIS", () => {
    for (const s of Object.values(SITES)) {
      expect(s.rendimiento).toBeLessThanOrEqual(s.rendimientoPvgis + 0.05);
    }
  });

  /** No se nombra la ciudad: al ampliar la medición el peor caso cambió de Tijuana a
   * Pachuca. La propiedad que importa es que el peor caso SIEMPRE quede degradado, sea
   * cual sea la ciudad. */
  it("el sitio con mayor discrepancia siempre queda degradado", () => {
    const peor = Object.values(SITES).reduce((a, b) =>
      Math.abs(b.discrepanciaFuentes) > Math.abs(a.discrepanciaFuentes) ? b : a,
    );
    expect(Math.abs(peor.discrepanciaFuentes)).toBeGreaterThan(3);
    expect(peor.fuenteRendimiento).toBe("menor-de-dos");
  });

  /** El dataset tiene que ser AUDITABLE: la decisión de degradar debe poder reproducirse
   * desde los números guardados. Dos sitios guardaban la discrepancia redondeada a un
   * decimal ("3.0") mientras la decisión se tomó con el valor real (3.03), así que la
   * bandera no se podía justificar con el dato. */
  it("la decisión de degradar se reproduce desde la discrepancia guardada", () => {
    for (const s of Object.values(SITES)) {
      // La regla es UNIDIRECCIONAL a propósito: solo se degrada cuando PVGIS lee más alto
      // que NASA. Al contrario, PVGIS ya es la fuente conservadora y no hay nada que
      // corregir; bajar también en ese caso sería castigar al sitio dos veces.
      const debeDegradar = s.discrepanciaFuentes > 3;
      if (debeDegradar) {
        expect(s.fuenteRendimiento, s.nombre).toBe("menor-de-dos");
        expect(s.rendimiento, s.nombre).toBeLessThan(s.rendimientoPvgis);
      } else {
        expect(s.fuenteRendimiento, s.nombre).toBe("concuerdan");
        expect(s.rendimiento, s.nombre).toBeCloseTo(s.rendimientoPvgis, 0);
      }
    }
  });
});

/** La forma mensual fija era estructuralmente imposible: CDMX y Tijuana tienen
 * estaciones opuestas y ninguna curva única describe las dos. */
describe("estacionalidad medida por sitio", () => {
  /** Se consulta por `monthlyWeights`, no leyendo el JSON: el dato puede ser correcto y
   * la función seguir ignorándolo, que es justamente el defecto que había. */
  it("CDMX produce más en diciembre que en septiembre", () => {
    const { pesos } = monthlyWeights(SITES.cdmx);
    expect(pesos[11]).toBeGreaterThan(pesos[8]);
  });

  it("Tijuana produce menos en diciembre que en agosto: la estación opuesta", () => {
    const { pesos } = monthlyWeights(SITES.tijuana);
    expect(pesos[11]).toBeLessThan(pesos[7]);
  });

  it("dos ciudades distintas no pueden salir con la misma curva", () => {
    const a = monthlyWeights(SITES.cdmx).pesos;
    const b = monthlyWeights(SITES.tijuana).pesos;
    const dif = a.reduce((acc, x, i) => acc + Math.abs(x - b[i]), 0);
    expect(dif).toBeGreaterThan(0.1);
  });

  it("ninguna pareja de sitios comparte curva: una forma fija global las igualaría", () => {
    const todos = Object.values(SITES);
    for (let i = 0; i < todos.length; i++) {
      for (let j = i + 1; j < todos.length; j++) {
        const a = monthlyWeights(todos[i]).pesos;
        const b = monthlyWeights(todos[j]).pesos;
        expect(a).not.toEqual(b);
      }
    }
  });

  it("diciembre difiere más de 30 % en términos relativos entre las dos ciudades", () => {
    const rel = monthlyWeights(SITES.cdmx).pesos[11] / monthlyWeights(SITES.tijuana).pesos[11];
    expect(rel).toBeGreaterThan(1.3);
  });

  it("la amplitud estacional no es la misma en todas: Monterrey es más parejo que Tijuana", () => {
    expect(seasonalSwing(SITES.monterrey.mensual)).toBeLessThan(
      seasonalSwing(SITES.tijuana.mensual),
    );
  });

  it("sin sitio devuelve el promedio de los siete y lo declara estimado", () => {
    const { pesos, origen } = monthlyWeights(undefined);
    expect(origen).toBe("estimado");
    expect(pesos).toHaveLength(12);
    expect(pesos.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  });

  it("con sitio devuelve su forma real y la declara medida", () => {
    const { pesos, origen } = monthlyWeights(SITES.tijuana);
    expect(origen).toBe("medido");
    expect(pesos).toEqual(SITES.tijuana.mensual);
  });
});

/** El óptimo de inclinación no es función de la latitud. Es la refutación más limpia del
 * atajo `latitud × 0.87` que usan todas las guías. */
describe("la inclinación óptima no se deduce de la latitud", () => {
  it("Mérida y Guadalajara distan menos de medio grado y difieren en el óptimo", () => {
    expect(Math.abs(SITES.merida.lat - SITES.guadalajara.lat)).toBeLessThan(0.5);
    expect(SITES.merida.tiltOptimo).not.toBe(SITES.guadalajara.tiltOptimo);
    expect(Math.abs(SITES.merida.tiltOptimo - SITES.guadalajara.tiltOptimo)).toBeGreaterThanOrEqual(3);
  });

  /** Con 41 sitios la fórmula se quedaba corta en TODOS. Con 93 la afirmación absoluta ya
   * no se sostiene: hay tres donde coincide. Lo que sí se sostiene, y es lo importante, es
   * que NUNCA se pasa: el sesgo tiene una sola dirección. */
  it("la fórmula de respaldo nunca se pasa del óptimo medido", () => {
    for (const s of Object.values(SITES)) {
      const formula = Math.round(Math.max(10, Math.min(35, s.lat * 0.87)));
      expect(s.tiltOptimo, s.nombre).toBeGreaterThanOrEqual(formula);
    }
  });

  /** Cubre la CONEXIÓN, no el dato: si `optTiltFor` volviera a la fórmula, todos los
   * sitios medidos devolverían el valor corto y esta prueba caería siete veces. */
  it("toda ciudad medida devuelve por función su óptimo medido, no el de la fórmula", () => {
    let distintos = 0;
    let revisados = 0;
    for (const clave of Object.keys(SITES)) {
      const ciudad = CITIES[clave] ?? CITIES[SITES[clave].nombre.toLowerCase()];
      if (!ciudad) continue;
      revisados++;
      expect(optTiltFor(ciudad)).toBe(SITES[clave].tiltOptimo);
      if (optTiltFor(ciudad) !== Math.round(Math.max(10, Math.min(35, ciudad.lat * 0.87)))) {
        distintos++;
      }
    }
    // Que no se haya SALTADO ninguna clave por el `continue`. Ojo: esta línea sola no prueba que
    // el bucle corriera —con el catálogo vacío queda 0 === 0—; eso lo prueba el `distintos > 80`
    // de abajo, que exige al menos 81 sitios.
    expect(revisados).toBe(Object.keys(SITES).length);
    // si `optTiltFor` volviera a la fórmula, ninguno diferiría y esto caería
    expect(distintos).toBeGreaterThan(80);
  });

  it("una ciudad medida usa su óptimo medido y no la fórmula", () => {
    expect(optTiltFor(CITIES.cdmx)).toBe(SITES.cdmx.tiltOptimo);
    expect(optTiltFor(CITIES.cdmx)).not.toBe(17);
  });

  it("sin sitio cae en la fórmula, que es el único camino disponible", () => {
    expect(optTiltFor(DEFAULT_CITY)).toBe(Math.round(DEFAULT_CITY.lat * 0.87));
  });
});

/** El error más grave del modelo anterior: 29.4 % predicho contra 6.4 % medido. */
describe("pérdida por azimut", () => {
  it("es cero al sur exacto, con cualquier inclinación", () => {
    for (const t of [0, 10, 24, 30, 40]) expect(azimuthLossEstimated(0, t)).toBe(0);
  });

  it("con la mesa horizontal el azimut no cuesta nada", () => {
    for (const d of [-90, -45, 30, 90]) expect(azimuthLossEstimated(d, 0)).toBe(0);
  });

  it("crece con la inclinación: el término que faltaba en el modelo anterior", () => {
    const a = azimuthLossEstimated(90, 20);
    const b = azimuthLossEstimated(90, 30);
    expect(b).toBeGreaterThan(a * 1.5);
  });

  it("el modelo viejo sobreestimaba a 90°: lo medido en CDMX está por debajo de 8 %", () => {
    expect(azimuthLossMeasured(SITES.cdmx, -90)).toBeLessThan(0.08);
    expect(azimuthLossMeasured(SITES.cdmx, -90)).toBeGreaterThan(0.04);
  });

  it("Tijuana pierde mucho más que CDMX por la misma desviación", () => {
    expect(azimuthLossMeasured(SITES.tijuana, -90)).toBeGreaterThan(
      azimuthLossMeasured(SITES.cdmx, -90) * 2,
    );
  });

  it("conserva la asimetría real: en el centro el oriente rinde más que el poniente", () => {
    for (const clave of ["cdmx", "puebla", "monterrey", "merida", "guadalajara"]) {
      const s = SITES[clave];
      expect(azimuthLossMeasured(s, -45)).toBeLessThan(azimuthLossMeasured(s, 45));
    }
  });

  it("en Tijuana la asimetría se invierte, y el modelo lo respeta", () => {
    expect(azimuthLossMeasured(SITES.tijuana, -45)).toBeGreaterThan(
      azimuthLossMeasured(SITES.tijuana, 45),
    );
  });

  it("apuntar unos grados al oriente del sur puede ser mejor que el sur", () => {
    expect(azimuthLossMeasured(SITES.cdmx, -15)).toBeLessThan(0);
  });

  /** La especificación real del respaldo: reproducir la malla medida. Si alguien cambia
   * los coeficientes ajustados, esta prueba cae. */
  it("la fórmula estimada reproduce la malla medida dentro de 4 puntos", () => {
    for (const s of Object.values(SITES)) {
      for (const d of [15, 30, 45, 60, 75, 90]) {
        const medidoProm =
          (azimuthLossMeasured(s, -d) + azimuthLossMeasured(s, d)) / 2;
        const estimado = azimuthLossEstimated(d, s.tiltOptimo);
        expect(Math.abs(estimado - medidoProm)).toBeLessThan(0.04);
      }
    }
  });

  it("los coeficientes ajustados están en el rango medido", () => {
    expect(AZ_TILT_COEF).toBeGreaterThan(0.0177);
    expect(AZ_TILT_COEF).toBeLessThan(0.0204);
    expect(AZ_SHAPE_EXP).toBeCloseTo(1.8, 5);
  });

  it("se satura y nunca devuelve una pérdida absurda", () => {
    expect(azimuthLossEstimated(90, 90)).toBeLessThanOrEqual(0.3);
  });
});

describe("interpolación de tablas medidas", () => {
  const tabla = { "-90": 10, "0": 0, "90": 20 };

  it("devuelve el valor exacto en un punto medido", () => {
    expect(interp(tabla, 0)).toBe(0);
    expect(interp(tabla, 90)).toBe(20);
  });

  it("interpola linealmente entre dos puntos medidos", () => {
    expect(interp(tabla, 45)).toBeCloseTo(10, 6);
    expect(interp(tabla, -45)).toBeCloseTo(5, 6);
  });

  it("no extrapola nunca: fuera del rango devuelve el extremo", () => {
    expect(interp(tabla, 500)).toBe(20);
    expect(interp(tabla, -500)).toBe(10);
  });

  it("una tabla vacía devuelve cero en vez de NaN", () => {
    expect(interp({}, 30)).toBe(0);
  });
});

describe("factor de orientación con física medida", () => {
  it("vale uno al sur con la inclinación óptima del sitio", () => {
    const c = CITIES.guadalajara;
    expect(orientationFactor(c.site!.tiltOptimo, 180, c.lat, c.site)).toBeCloseTo(1, 4);
  });

  it("puede superar uno al oriente en CDMX, porque medido rinde más", () => {
    const c = CITIES.cdmx;
    const f = orientationFactor(c.site!.tiltOptimo, 180 - 15, c.lat, c.site);
    expect(f).toBeGreaterThan(1);
    expect(f).toBeLessThan(1.02);
  });

  it("sin sitio sigue funcionando con las fórmulas de respaldo", () => {
    const f = orientationFactor(20, 180, DEFAULT_CITY.lat, undefined);
    expect(f).toBeGreaterThan(0.9);
    expect(f).toBeLessThanOrEqual(1);
  });

  it("un techo al poniente en CDMX pierde más que uno al oriente", () => {
    const c = CITIES.cdmx;
    const oriente = orientationFactor(c.site!.tiltOptimo, 90, c.lat, c.site);
    const poniente = orientationFactor(c.site!.tiltOptimo, 270, c.lat, c.site);
    expect(oriente).toBeGreaterThan(poniente);
  });
});

/** Mismo blindaje que se le puso al precio del módulo: nombrar los valores viejos
 * explícitamente para que no puedan reaparecer. Aquellas constantes además traían las
 * pérdidas de sistema ya incluidas, así que el modelo las descontaba dos veces y
 * subestimaba la producción alrededor de 12 %. */
describe("las constantes inventadas no pueden regresar", () => {
  const VIEJAS = [1760, 1880, 1710, 1820, 1770, 1800, 1830];

  it("ningún sitio medido conserva uno de los valores inventados", () => {
    for (const s of Object.values(SITES)) {
      for (const v of VIEJAS) expect(Math.round(s.rendimiento)).not.toBe(v);
    }
  });

  it("el respaldo tampoco es uno de ellos", () => {
    for (const v of VIEJAS) expect(DEFAULT_CITY.yield).not.toBe(v);
  });

  it("toda ciudad del catálogo trae su sitio medido enlazado", () => {
    for (const [alias, c] of Object.entries(CITIES)) {
      expect(c.site, `${alias} sin física medida`).toBeDefined();
      expect(c.yield).toBe(c.site!.rendimiento);
    }
  });

  it("el respaldo es el promedio real de los medidos, no una cifra elegida", () => {
    const todos = Object.values(SITES);
    const prom = todos.reduce((a, s) => a + s.rendimiento, 0) / todos.length;
    expect(DEFAULT_CITY.yield).toBe(Math.round(prom));
  });

  it("el respaldo no lleva sitio, para que la interfaz pueda declararlo estimado", () => {
    expect(DEFAULT_CITY.site).toBeUndefined();
  });
});

/** La interfaz afirmaba "Sur = óptimo" con el valor escrito a mano mientras la cabecera
 * decía que el óptimo de CDMX está 21° al oriente: dos afirmaciones contradictorias en la
 * misma pantalla. `azPenalty` no afirma cuál es el óptimo, mide la distancia a él. */
describe("penalización de azimut contra el mejor del sitio", () => {
  it("es cero en el azimut óptimo medido, con malla propia o sin ella", () => {
    let revisados = 0;
    for (const clave of Object.keys(SITES)) {
      const c = CITIES[clave];
      if (!c) continue;
      revisados++;
      expect(azPenalty(optAzFor(c), c), c.name).toBeLessThan(0.002);
    }
    // El mensaje decía «el bucle no revisó ninguna ciudad» y la comparación no lo comprobaba:
    // contra la longitud de la propia colección, un catálogo vacío da 0 === 0 y pasa. Hacen falta
    // las dos: el suelo prueba que hubo trabajo, la igualdad que no se saltó nada.
    expect(revisados, "el bucle no revisó ninguna ciudad").toBeGreaterThanOrEqual(90);
    expect(revisados, "el bucle se saltó alguna ciudad").toBe(Object.keys(SITES).length);
  });

  /** El anclaje del modelo: `rendimiento` está medido al sur, así que la pérdida por
   * azimut tiene que valer exactamente cero ahí o se descontaría dos veces. */
  it("la pérdida por azimut es cero en el sur exacto en todos los sitios", () => {
    for (const s of Object.values(SITES)) {
      expect(azimuthLossMeasured(s, 0), s.nombre).toBeCloseTo(0, 6);
    }
  });

  /** Tolerancia de 0.2 %: el azimut óptimo lo calcula el optimizador continuo de PVGIS
   * mientras la malla se midió en pasos de 15°, así que las dos pueden discrepar una
   * fracción de punto. En Tijuana el optimizador dice 3° al poniente y su malla dice sur:
   * 0.078 % de diferencia. Lo que importa es que esa discrepancia esté ACOTADA. */
  it("el óptimo medido rinde igual o más que el sur, salvo ruido de resolución", () => {
    for (const s of Object.values(SITES)) {
      expect(azimuthLossMeasured(s, s.azimutOptimo), s.nombre).toBeLessThan(0.002);
    }
  });

  it("ningún sitio se aparta más de 0.2 % entre su óptimo continuo y su malla", () => {
    const conMalla = Object.values(SITES).filter((s) => s.mallaCompleta);
    expect(conMalla.length).toBeGreaterThan(40);
    for (const s of conMalla) {
      const enOptimo = azimuthLossMeasured(s, s.azimutOptimo);
      expect(Math.abs(enOptimo - azimuthLossMin(s)), s.nombre).toBeLessThan(0.002);
    }
  });

  it("nunca es negativa: una penalización negativa sería una ganancia disfrazada", () => {
    let afirmaciones = 0;
    for (const clave of Object.keys(SITES)) {
      const c = CITIES[clave];
      if (!c) continue;
      for (const az of [90, 135, 159, 180, 200, 240, 270]) {
        expect(azPenalty(az, c)).toBeGreaterThanOrEqual(0);
        afirmaciones++;
      }
    }
    // Suelo primero: contra `length * 7` a secas, un catálogo vacío da 0 === 0.
    expect(afirmaciones).toBeGreaterThanOrEqual(90 * 7);
    expect(afirmaciones).toBe(Object.keys(SITES).length * 7);
  });

  it("el sur exacto en CDMX tiene una penalización pequeña pero no nula", () => {
    const p = azPenalty(180, CITIES.cdmx);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.01);
  });

  it("el óptimo de CDMX no es el sur, y queda al oriente", () => {
    expect(optAzFor(CITIES.cdmx)).toBeLessThan(180);
  });

  it("sin sitio el óptimo es el sur, que es lo único deducible sin medición", () => {
    expect(optAzFor(DEFAULT_CITY)).toBe(180);
    expect(azPenalty(180, DEFAULT_CITY)).toBe(0);
  });

  it("un techo al poniente penaliza más que el mismo desvío al oriente en el centro", () => {
    const c = CITIES.puebla;
    expect(azPenalty(225, c)).toBeGreaterThan(azPenalty(135, c));
  });
});

/** Lo que el dataset nacional demuestra, y que ninguna constante ni fórmula puede dar. */
describe("hallazgos de la medición nacional", () => {
  it("el rango del país es tan ancho que una constante única no puede servir", () => {
    expect(RESUMEN.mayor.valor / RESUMEN.menor.valor).toBeGreaterThan(1.35);
    expect(RESUMEN.errorDelPromedio).toBeGreaterThan(15);
  });

  it("la regla latitud × 0.87 se queda corta en la enorme mayoría del país", () => {
    const todos = Object.values(SITES);
    const formula = (s: (typeof todos)[number]) =>
      Math.round(Math.max(10, Math.min(35, s.lat * 0.87)));
    const cortos = todos.filter((s) => s.tiltOptimo > formula(s));
    const pasados = todos.filter((s) => s.tiltOptimo < formula(s));
    expect(cortos.length / todos.length).toBeGreaterThan(0.9);
    expect(pasados.length, "el sesgo tiene una sola dirección").toBe(0);
  });

  it("la mayoría del país tiene su óptimo al oriente del sur, no al sur", () => {
    const todos = Object.values(SITES);
    const oriente = todos.filter((s) => s.azimutOptimo < -2);
    expect(oriente.length / todos.length).toBeGreaterThan(0.7);
  });

  it("generalizar por estado tampoco sirve: dentro de uno hay 15 % de diferencia", () => {
    const porEstado = new Map<string, number[]>();
    for (const s of Object.values(SITES)) {
      porEstado.set(s.estado, [...(porEstado.get(s.estado) ?? []), s.rendimiento]);
    }
    const conVarias = [...porEstado.values()].filter((v) => v.length > 1);
    expect(conVarias.length).toBeGreaterThan(0);
    const peor = Math.max(...conVarias.map((v) => Math.max(...v) / Math.min(...v)));
    expect(peor).toBeGreaterThan(1.15);
  });

  it("el resumen se calcula del dato: coincide con recorrer el catálogo", () => {
    const todos = Object.values(SITES);
    expect(RESUMEN.sitios).toBe(todos.length);
    expect(RESUMEN.mayor.valor).toBe(
      Math.round(Math.max(...todos.map((s) => s.rendimiento))),
    );
    expect(RESUMEN.menor.valor).toBe(
      Math.round(Math.min(...todos.map((s) => s.rendimiento))),
    );
    expect(RESUMEN.estados).toBe(32);
  });

  it("cada sitio declara su estado, sin cadenas vacías", () => {
    for (const s of Object.values(SITES)) {
      expect(s.estado.length, s.nombre).toBeGreaterThan(3);
    }
  });
});

describe("siteFor", () => {
  it("encuentra un sitio por clave", () => {
    expect(siteFor("cdmx")?.nombre).toBe("Ciudad de México");
  });

  it("devuelve indefinido para una clave desconocida, sin inventar un sitio", () => {
    expect(siteFor("atlantida")).toBeUndefined();
    expect(siteFor("penjamo")).toBeUndefined();
    expect(siteFor("")).toBeUndefined();
  });
});
