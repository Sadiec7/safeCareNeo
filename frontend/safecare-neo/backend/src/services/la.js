// Servicio de evaluación de riesgo para neonatos en incubadora
// Umbrales basados en rangos clínicos estándar para neonatos

const UMBRALES = {
  temperatura: {
    critico_bajo: 35.5,
    precaucion_bajo: 36.0,
    precaucion_alto: 37.5,
    critico_alto: 38.0,
  },
  humedad: {
    critico_bajo: 30,
    precaucion_bajo: 40,
    precaucion_alto: 70,
    critico_alto: 80,
  },
  presion: {
    critico_bajo: 980,
    precaucion_bajo: 990,
    precaucion_alto: 1020,
    critico_alto: 1030,
  },
};

const evaluarRiesgo = ({ temperatura, humedad, presion }) => {
  const alertas = [];
  let nivel_riesgo = "normal";

  // ── Temperatura ──────────────────────────────────────────
  if (temperatura <= UMBRALES.temperatura.critico_bajo || temperatura >= UMBRALES.temperatura.critico_alto) {
    alertas.push({
      tipo: "temperatura_alta",
      mensaje: `Temperatura crítica detectada: ${temperatura}°C`,
      valor_detectado: temperatura,
      nivel: "critico",
    });
    nivel_riesgo = "critico";
  } else if (temperatura <= UMBRALES.temperatura.precaucion_bajo || temperatura >= UMBRALES.temperatura.precaucion_alto) {
    alertas.push({
      tipo: "temperatura_alta",
      mensaje: `Temperatura fuera de rango normal: ${temperatura}°C`,
      valor_detectado: temperatura,
      nivel: "precaucion",
    });
    if (nivel_riesgo === "normal") nivel_riesgo = "precaucion";
  }

  // ── Humedad ──────────────────────────────────────────────
  if (humedad <= UMBRALES.humedad.critico_bajo || humedad >= UMBRALES.humedad.critico_alto) {
    alertas.push({
      tipo: "humedad",
      mensaje: `Humedad crítica detectada: ${humedad}%`,
      valor_detectado: humedad,
      nivel: "critico",
    });
    nivel_riesgo = "critico";
  } else if (humedad <= UMBRALES.humedad.precaucion_bajo || humedad >= UMBRALES.humedad.precaucion_alto) {
    alertas.push({
      tipo: "humedad",
      mensaje: `Humedad fuera de rango normal: ${humedad}%`,
      valor_detectado: humedad,
      nivel: "precaucion",
    });
    if (nivel_riesgo === "normal") nivel_riesgo = "precaucion";
  }

  // ── Presión ──────────────────────────────────────────────
  if (presion <= UMBRALES.presion.critico_bajo || presion >= UMBRALES.presion.critico_alto) {
    alertas.push({
      tipo: "presion",
      mensaje: `Presión crítica detectada: ${presion} hPa`,
      valor_detectado: presion,
      nivel: "critico",
    });
    nivel_riesgo = "critico";
  } else if (presion <= UMBRALES.presion.precaucion_bajo || presion >= UMBRALES.presion.precaucion_alto) {
    alertas.push({
      tipo: "presion",
      mensaje: `Presión fuera de rango normal: ${presion} hPa`,
      valor_detectado: presion,
      nivel: "precaucion",
    });
    if (nivel_riesgo === "normal") nivel_riesgo = "precaucion";
  }

  return {
    nivel_riesgo,
    alerta_ia: alertas.length > 0,
    alertas,
  };
};

module.exports = { evaluarRiesgo, UMBRALES };