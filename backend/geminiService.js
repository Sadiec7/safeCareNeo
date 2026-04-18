async function detectarModeloDisponible(apiKey) {
  const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  
  const response = await fetch(listUrl);
  const data = await response.json();

  if (data.error) {
    throw new Error(`No se pudo listar modelos: ${data.error.message}`);
  }

  const modelosPrioridad = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-pro",
  ];

  const modelosDisponibles = data.models
    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
    .map(m => m.name.replace("models/", ""));

  console.log("Modelos disponibles en tu cuenta:", modelosDisponibles);

  for (const preferido of modelosPrioridad) {
    if (modelosDisponibles.includes(preferido)) {
      console.log(`Modelo seleccionado: ${preferido}`);
      return preferido;
    }
  }

  if (modelosDisponibles.length > 0) {
    console.log(`Usando primer modelo disponible: ${modelosDisponibles[0]}`);
    return modelosDisponibles[0];
  }

  throw new Error("No se encontró ningún modelo compatible con generateContent.");
}

let modeloCacheado = null;

// Errores que NO deben limpiar el cache (el modelo sigue siendo válido)
const ERRORES_DE_CUOTA = ["RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED", "RATE_LIMIT_EXCEEDED"];

async function generarNotaMedicaEstructurada(datosSensor, dictadoVoz) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      error: true,
      mensaje: "API Key de Gemini no configurada",
      detalles: "La variable de entorno GEMINI_API_KEY no está definida."
    };
  }

  try {
    if (!modeloCacheado) {
      modeloCacheado = await detectarModeloDisponible(apiKey);
    }

    const url = `https://generativelanguage.googleapis.com/v1/models/${modeloCacheado}:generateContent?key=${apiKey}`;

    const prompt = `Actúa como pediatra neonatólogo. 
    DATOS: Temperatura ${datosSensor.temp}C, Humedad ${datosSensor.hum}%. 
    DICTADO: ${dictadoVoz}. 
    Responde UNICAMENTE con un objeto JSON (sin markdown) que tenga: subjetivo, objetivo, analisis, plan, formato_nota, alerta_critica.`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    if (data.error) {
      const esErrorDeCuota = ERRORES_DE_CUOTA.includes(data.error.status);

      if (esErrorDeCuota) {
        // NO limpiar cache — el modelo es válido, solo hay límite de requests
        const waitMatch = data.error.message.match(/retry in ([\d.]+)s/);
        const waitSeg = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : "unos segundos";
        throw new Error(`Cuota excedida. Reintenta en ${waitSeg} segundos.`);
      }

      // Solo limpiar cache si el modelo en sí es inválido (NOT_FOUND, etc.)
      console.error("Modelo inválido, limpiando cache...", data.error.message);
      modeloCacheado = null;
      throw new Error(data.error.message);
    }

    if (!data.candidates || !data.candidates[0]?.content) {
      throw new Error("La IA no devolvió una respuesta válida.");
    }

    let text = data.candidates[0].content.parts[0].text;
    const cleanJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);

  } catch (error) {
    console.error("Fallo en Gemini:", error.message);
    return {
      error: true,
      mensaje: "Error en comunicación con Gemini",
      detalles: error.message
    };
  }
}

module.exports = { generarNotaMedicaEstructurada };