// src/services/elevenLabsService.js
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM';

export const textToSpeech = async (text) => {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.error("❌ ElevenLabs API key no encontrada en .env");
    return null;
  }

  const requestBody = {
    text: text,
      _id: "eleven_turbo_v2",   // ← Cambiado: modelo más nuevo y compatible con free tier
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5,
    },
  };

  try {
    console.log("🎤 Enviando texto a ElevenLabs...");
    const response = await fetch(ELEVENLABS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Error HTTP ElevenLabs:", response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    console.log("✅ Audio generado correctamente");
    return audioUrl;
  } catch (error) {
    console.error("❌ Error en textToSpeech:", error);
    return null;
  }
};