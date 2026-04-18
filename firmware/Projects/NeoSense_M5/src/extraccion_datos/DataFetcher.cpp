#include "DataFetcher.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>   // DynamicJsonDocument para respuestas grandes
#include <M5Unified.h>
#include "monitoreo/DisplayUI.h"  // para animarCaritaHablando()

// ── conectarWiFi ──────────────────────────────────────────────────────────────
void conectarWiFi() {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    int intentos = 0;
    while (WiFi.status() != WL_CONNECTED && intentos < 20) {
        delay(500);
        Serial.print(".");
        intentos++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi Conectado! IP: " + WiFi.localIP().toString());
    } else {
        Serial.println("\nError de WiFi. Iniciando en MODO OFFLINE.");
    }
}

// ── obtenerDatosDeMongo ───────────────────────────────────────────────────────
// Consume /api/dashboard/all-data (mismo endpoint que usa el server.js para el
// dashboard web). La respuesta tiene la forma:
//   { "sensors": [ { "unidad_id":"...", "datos": { "temperatura", "humedad",
//                     "presion" }, "datos_filtrados": {...} }, ... ] }
// Se usa datos_filtrados si existe (filtro de mediana del backend), si no,
// se cae a datos crudos. Si hay varios sensores se toma el primero válido.
bool obtenerDatosDeMongo(float &temp, float &hum, int &pres) {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(BACKEND_URL) + "/api/dashboard/all-data");
        http.setTimeout(5000);
        int httpCode = http.GET();

        if (httpCode == HTTP_CODE_OK) {
            String payload = http.getString();

            // El JSON puede ser grande; usar DynamicJsonDocument
            DynamicJsonDocument doc(2048);
            DeserializationError err = deserializeJson(doc, payload);
            http.end();

            if (!err) {
                JsonArray sensors = doc["sensors"].as<JsonArray>();

                for (JsonObject sensor : sensors) {
                    // Preferir datos_filtrados (si el backend ya aplicó mediana)
                    JsonObject fuente = sensor["datos_filtrados"].as<JsonObject>();
                    bool tieneF = fuente && fuente.containsKey("temperatura");
                    if (!tieneF) fuente = sensor["datos"].as<JsonObject>();

                    float t = fuente["temperatura"] | -999.0f;
                    float h = fuente["humedad"]     | -999.0f;
                    int   p = fuente["presion"]     | -1;

                    // Validar rango mínimo antes de aceptar
                    if (t > 30.0f && t < 45.0f && h > 0.0f && p > 900) {
                        temp = t;
                        hum  = h;
                        pres = p;
                        Serial.printf("[Datos] %s → T:%.1f H:%.1f P:%d\n",
                            sensor["unidad_id"] | "?", temp, hum, pres);
                        return true;
                    }
                }
                Serial.println("[Datos] Ningún sensor con datos válidos en la respuesta.");
            } else {
                Serial.printf("[Datos] JSON parse error: %s\n", err.c_str());
            }
        } else {
            Serial.printf("[Datos] HTTP error %d en /api/dashboard/all-data\n", httpCode);
            http.end();
        }

        Serial.println("[Datos] Falla en servidor, usando datos dummy...");
    }

    // Fallback offline: valores sintéticos realistas
    temp = 36.5f + random(-5, 6) / 10.0f;
    hum  = 55.0f + random(-5, 11);
    pres = 1012  + random(-2, 3);
    return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MODO OFFLINE — VOCALIZACIÓN CON TONOS MUSICALES ──────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// En lugar de un beep genérico, el dispositivo reproduce una melodía corta
// que indica el estado clínico de forma intuitiva:
//   - Estable  → melodía ascendente suave (do-mi-sol)
//   - Hipotermia → tono grave lento y repetitivo (señal de alarma fría)
//   - Fiebre   → tono agudo rápido escalado (señal de urgencia)
//   - Humedad  → silbido corto (parámetro secundario)
//
// La función también anima la carita mientras "suena".

struct Nota { uint32_t freq; uint32_t durMs; };

static void tocarMelodia(const Nota* melodia, int n) {
    for (int i = 0; i < n; i++) {
        M5.Speaker.tone(melodia[i].freq, melodia[i].durMs);
        animarCaritaHablando(true);
        delay(melodia[i].durMs + 30);
        animarCaritaHablando(true);
    }
    M5.Speaker.stop();
    animarCaritaHablando(false);
}

void reproducirAlertaOffline(float temp, float hum) {
    M5.Speaker.setVolume(220);

    if (temp < 35.5f) {
        // ── Hipotermia severa: SOL grave lento x4 ────────────────────────────
        static const Nota mel[] = {
            {392, 600}, {0, 200}, {392, 600}, {0, 200},
            {392, 600}, {0, 200}, {330, 900}
        };
        tocarMelodia(mel, 7);

    } else if (temp < 36.0f) {
        // ── Hipotermia leve: MI-DO descendente ───────────────────────────────
        static const Nota mel[] = {
            {659, 400}, {523, 400}, {440, 600}
        };
        tocarMelodia(mel, 3);

    } else if (temp > 38.5f) {
        // ── Fiebre alta: DO agudo escalado rápido x3 ─────────────────────────
        static const Nota mel[] = {
            {1047,150},{1175,150},{1319,150},{1047,150},
            {1175,150},{1319,150},{1047,150},{1175,150},{1568,400}
        };
        tocarMelodia(mel, 9);

    } else if (temp > 37.5f) {
        // ── Fiebre leve: LA-SI-DO ascendente x2 ──────────────────────────────
        static const Nota mel[] = {
            {880, 300}, {988, 300}, {1047, 500},
            {0,   100},
            {880, 300}, {988, 300}, {1047, 700}
        };
        tocarMelodia(mel, 7);

    } else {
        // ── Estable: DO-MI-SOL arpegio suave ─────────────────────────────────
        static const Nota mel[] = {
            {523, 200}, {659, 200}, {784, 300}, {1047, 500}
        };
        tocarMelodia(mel, 4);
    }

    // Alerta adicional si la humedad está fuera de rango (50-65%)
    if (hum < 50.0f || hum > 65.0f) {
        delay(200);
        static const Nota hmel[] = { {1200, 150}, {0, 80}, {1200, 150} };
        tocarMelodia(hmel, 3);
    }
}

// ── consultarAsistenteIA ──────────────────────────────────────────────────────
String consultarAsistenteIA(float t, float h, int p) {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(String(BACKEND_URL) + "/api/gemini");
        http.addHeader("Content-Type", "application/json");
        http.setTimeout(15000);

        String jsonBody = "{\"temp\":" + String(t, 1) +
                          ",\"hum\":"  + String(h, 1) +
                          ",\"pres\":" + String(p)    + "}";

        int httpCode = http.POST(jsonBody);
        if (httpCode == HTTP_CODE_OK) {
            String payload = http.getString();
            http.end();
            StaticJsonDocument<512> doc;
            DeserializationError err = deserializeJson(doc, payload);
            if (!err && doc.containsKey("respuesta")) {
                return doc["respuesta"].as<String>();
            }
        } else {
            Serial.printf("Error HTTP /api/gemini: %d\n", httpCode);
        }
        http.end();
    }

    // ── FALLBACK OFFLINE — diagnóstico clínico detallado ──────────────────────
    Serial.println("[Offline] Ejecutando diagnostico local...");

    String estado, accion, nivel;

    // Temperatura
    if (t < 35.5f) {
        estado = "HIPOTERMIA SEVERA";
        accion = "Calor inmediato. Notificar urgencia.";
        nivel  = "CRITICO";
    } else if (t < 36.0f) {
        estado = "HIPOTERMIA LEVE";
        accion = "Ajustar incubadora. Monitorear cada 5 min.";
        nivel  = "ALERTA";
    } else if (t > 38.5f) {
        estado = "FIEBRE ALTA";
        accion = "Reducir temp. Notificar medico de inmediato.";
        nivel  = "CRITICO";
    } else if (t > 37.5f) {
        estado = "FIEBRE LEVE";
        accion = "Reducir temperatura de incubadora. Vigilar.";
        nivel  = "ALERTA";
    } else {
        estado = "TEMP. NORMAL";
        accion = "Continuar monitoreo estandar.";
        nivel  = "ESTABLE";
    }

    // Humedad
    String humStr = "";
    if (h < 50.0f)      humStr = " | Humedad BAJA: aumentar vaporizador.";
    else if (h > 65.0f) humStr = " | Humedad ALTA: revisar condensacion.";

    // Presion
    String presStr = "";
    if (p < 1008)       presStr = " | Presion BAJA.";
    else if (p > 1018)  presStr = " | Presion ALTA.";

    // Reproducir alerta sonora offline (anima la carita)
    reproducirAlertaOffline(t, h);

    String resultado = "[" + nivel + "] " + estado + "\n";
    resultado += "T:" + String(t,1) + "C  H:" + String(h,0) + "%  P:" + String(p) + "hPa\n";
    resultado += accion + humStr + presStr;
    return resultado;
}

// ── reproducirAudioIA ─────────────────────────────────────────────────────────
// Descarga el WAV del servidor y lo reproduce animando la carita en tiempo real.
void reproducirAudioIA() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("Sin WiFi — alerta local ya reproducida.");
        return;
    }

    HTTPClient http;
    http.begin(String(BACKEND_URL) + "/api/audio");
    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("Error HTTP /api/audio: %d\n", httpCode);
        http.end();
        return;
    }

    int contentLen = http.getSize();
    WiFiClient* stream = http.getStreamPtr();

    const int MAX_AUDIO_BYTES = 256 * 1024;
    int allocLen = (contentLen > 0 && contentLen <= MAX_AUDIO_BYTES)
                   ? contentLen : MAX_AUDIO_BYTES;

    uint8_t* buf = (uint8_t*)ps_malloc(allocLen);
    if (!buf) buf = (uint8_t*)malloc(allocLen);
    if (!buf) {
        Serial.println("Sin memoria para audio.");
        http.end();
        return;
    }

    int received = 0;
    while (http.connected() && stream->available() == 0) { delay(1); }
    while (http.connected() || stream->available() > 0) {
        if (received >= allocLen) break;
        int avail = stream->available();
        if (avail > 0) {
            int chunk = stream->readBytes(buf + received,
                                          min(avail, allocLen - received));
            if (chunk > 0) received += chunk;
        } else { delay(2); }
    }
    http.end();

    if (received < 100) {
        Serial.println("Audio vacío.");
        free(buf);
        return;
    }

    Serial.printf("Audio WAV descargado: %d bytes\n", received);

    M5.Speaker.setVolume(255);
    int repOK = M5.Speaker.playWav(buf, received);
    Serial.printf("WAV aceptado: %s\n", repOK > 0 ? "SI" : "NO");

    delay(200); // dar tiempo al I2S para arrancar

    // ── Animar carita mientras suena ─────────────────────────────────────────
    uint32_t tEnd = millis() + 25000;
    while (M5.Speaker.isPlaying() && millis() < tEnd) {
        M5.update();
        animarCaritaHablando(true);   // boca animada en sincronía
    }
    // Boca cerrada al terminar
    animarCaritaHablando(false);

    free(buf);
    Serial.println("Reproduccion finalizada.");
}