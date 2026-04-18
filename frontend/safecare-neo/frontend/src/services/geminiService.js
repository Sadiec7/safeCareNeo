// src/services/geminiService.js
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export const getGeminiResponse = async (userPrompt) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.error(" Gemini API key no encontrada en .env");
    return "Lo siento, no se ha configurado la clave de Gemini.";
  }

  const systemPrompt = `Actúa como un asistente experto en monitoreo neonatal. 
  Los datos actuales del bebé son:
  - Temperatura: 37.1°C
  - Humedad: 58%
  - Presión: 1013 hPa
  - Nivel de riesgo: normal
  Responde de forma clara, breve y tranquilizadora (máximo 3 oraciones).`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\nUsuario pregunta: ${userPrompt}` }]
      }
    ]
  };

  try {
    console.log(" Enviando prompt a Gemini:", userPrompt);
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Error Gemini:", response.status, errorText);
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const respuesta = data.candidates[0].content.parts[0].text;
    console.log(" Respuesta de Gemini:", respuesta);
    return respuesta;
  } catch (error) {
    console.error("❌ Error en getGeminiResponse:", error);
    return "Hubo un problema al consultar el estado del bebé. Inténtalo de nuevo.";
  }
};