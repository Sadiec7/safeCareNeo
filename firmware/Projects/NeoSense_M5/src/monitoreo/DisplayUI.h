#pragma once
#include <Arduino.h>

#define GRAPH_POINTS 40

extern float tempHistory[GRAPH_POINTS];
extern int   historyIndex;

void setupVisuals();
void pushTempHistory(float t);
void dibujarDashboard(float temp, float hum, int pres);
void mostrarCargando();

// Muestra la pantalla de IA con la carita chibi en reposo.
// Guarda internamente el texto para el subtítulo.
void mostrarPantallaIA(String respuesta);

// Anima la carita chibi pantalla completa.
//   hablando=true  → boca abierta animada + ondas de sonido
//   hablando=false → boca cerrada, sonrisa, parpadeo suave
// Llama en bucle mientras M5.Speaker.isPlaying()
void animarCaritaHablando(bool hablando);