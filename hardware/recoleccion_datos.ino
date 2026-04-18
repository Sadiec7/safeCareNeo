#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <BME280I2C.h>
#include <vector>
#include <numeric>
#include <algorithm>

// --- CONFIGURACIÓN ---
const char* ssid = "TuRedWiFi"; 
const char* password = "TuContrasenaWiFi";
const char* url = "http://10.215.96.19:8000/api/telemetry";

// --- PARÁMETROS DE TOLERANCIA ---
const int VENTANA_MEDIANA = 5;      // Para filtro de mediana móvil
std::vector<float> lecturasTemp;
float ultimaTempValida = -1.0;
unsigned long ultimoEnvioExitoso = 0;

BME280I2C bme;
bool sensorPresent = false;

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 20);
  
  WiFi.begin(ssid, password);
  Serial.println("Iniciando SafeCareNeo Node...");
  if (bme.begin()) sensorPresent = true;
}

// FILTRO DE MEDIANA MÓVIL (Suavizado de ruido)
float obtenerMediana(float nuevaLectura) {
  lecturasTemp.push_back(nuevaLectura);
  if (lecturasTemp.size() > VENTANA_MEDIANA) lecturasTemp.erase(lecturasTemp.begin());
  
  std::vector<float> ordenadas = lecturasTemp;
  std::sort(ordenadas.begin(), ordenadas.end());
  return ordenadas[ordenadas.size() / 2];
}

void loop() {
  float t_raw = sensorPresent ? bme.temp() : random(22, 38);
  float h = sensorPresent ? bme.hum() : random(30, 85);
  float p = sensorPresent ? bme.pres()/100.0 : 1013.25;

  float t = obtenerMediana(t_raw);
  bool datosValidos = true;
  String advertencia = "";

  // DETECCIÓN DE CAMBIOS BRUSCOS (Salto > 10°C)
  if (ultimaTempValida != -1.0 && abs(t - ultimaTempValida) > 10.0) {
    datosValidos = false;
    advertencia = "SENSOR_DEFECTUOSO_SALTO_TERMICO";
  }

  // CORRELACIÓN ENTRE VARIABLES (Humedad alta + Temp baja sospechosa)
  if (h > 90.0 && t < 18.0) {
    advertencia = "POSIBLE_ERROR_CORRELACION_H_T";
  }

  // PREPARAR JSON
  String jsonPayload = "{\"pacienteId\":\"bebe_hackaton_01\",\"temp\":" + String(t) + 
                       ",\"hum\":" + String(h) + ",\"presion\":" + String(p) + 
                       ",\"status\":\"" + (datosValidos ? "OK" : advertencia) + "\"}";

  //  ENVÍO POR SERIAL (LOCAL) SI NO HAY RED O  VALIDACIÓN TEMPORAL (>1 min)
  if (WiFi.status() != WL_CONNECTED || (millis() - ultimoEnvioExitoso > 60000)) {
    // Si no hay red o pasó más de un minuto, forzamos salida por Serial
    Serial.print("DATA_LOCAL_BACKUP:"); 
    Serial.println(jsonPayload); 
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("ALERTA: Desconectado de WiFi - Modo Local Activo");
    }
  }

  // ENVÍO POR HTTP
  if (WiFi.status() == WL_CONNECTED && datosValidos) {
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    int httpCode = http.POST(jsonPayload);
    if (httpCode == 201 || httpCode == 200) {
      ultimoEnvioExitoso = millis();
      ultimaTempValida = t;
      Serial.println("Datos enviados a Docker");
    } else {
      Serial.println("Error en Back: " + String(httpCode));
    }
    http.end();
  }

  delay(10000); // Muestreo cada 5 segundos
}