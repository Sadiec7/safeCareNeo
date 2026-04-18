#pragma once
#include <Arduino.h>

// ── Configuración de red ──────────────────────────────────────────────────────
// Cambia estos valores por los de tu red / IP del servidor
const char* const WIFI_SSID    = "realmeChav";
const char* const WIFI_PASS    = "11111111";
// Puerto 3000 = servidor_ia.py (FastAPI/uvicorn)
// Cuando uses el server.js en su lugar, cambia a :80015
const char* const BACKEND_URL  = "http://10.215.96.213:3000";

// ── Prototipos ────────────────────────────────────────────────────────────────
void   conectarWiFi();
bool   obtenerDatosDeMongo(float &temp, float &hum, int &pres);
String consultarAsistenteIA(float t, float h, int p);

// Descarga y reproduce el PCM devuelto por el servidor usando el speaker M5Stack
void reproducirAudioIA();