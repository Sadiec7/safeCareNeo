#include <Arduino.h>
#include <M5Unified.h>
#include "extraccion_datos/DataFetcher.h"
#include "monitoreo/DisplayUI.h"

float t = 0, h = 0;
int p = 0;

unsigned long lastFetch = 0;
const int timerDelay = 5000;

void setup() {
    setupVisuals();
    conectarWiFi();

    // Tono de arranque
    M5.Speaker.tone(1000, 300);
    delay(350);
    M5.Speaker.tone(1500, 300);
    delay(350);
    M5.Speaker.tone(2000, 200);
    delay(300);

    // Primera lectura inmediata
    if (obtenerDatosDeMongo(t, h, p)) {
        pushTempHistory(t);
        dibujarDashboard(t, h, p);
    }
    lastFetch = millis();
}

void loop() {
    M5.update();

    // Actualizar datos cada 5 s
    if (millis() - lastFetch > timerDelay) {
        if (obtenerDatosDeMongo(t, h, p)) {
            pushTempHistory(t);
            dibujarDashboard(t, h, p);
        }
        lastFetch = millis();
    }

    // Botón A → Consultar IA + reproducir audio con carita animada
    if (M5.BtnA.wasPressed()) {
        mostrarCargando();

        // 1. Obtener diagnóstico de Gemini (o fallback offline)
        String r = consultarAsistenteIA(t, h, p);

        // 2. Mostrar pantalla con texto + carita inicial (boca cerrada)
        mostrarPantallaIA(r);

        // 3. Reproducir audio WAV mientras la carita se mueve
        //    (dentro de reproducirAudioIA se llama animarCaritaHablando)
        reproducirAudioIA();

        // 4. Boca cerrada al terminar
        animarCaritaHablando(false);

        // 5. Esperar botón para volver
        while (true) {
            M5.update();
            if (M5.BtnA.wasPressed() || M5.BtnB.wasPressed() || M5.BtnC.wasPressed())
                break;
            // Anima la carita en reposo mientras espera
            animarCaritaHablando(false);
            delay(10);
        }

        dibujarDashboard(t, h, p);
    }
}