# safeCareNeo

> Sistema de Monitoreo Neonatal Inteligente con IoT y Análisis Predictivo.

**safeCareNeo** es una solución integral que fusiona IoT y Machine Learning para la supervisión constante de neonatos. Captura signos vitales en tiempo real y emplea IA para generar reportes personalizados para médicos, cuidadores y padres, optimizando la respuesta ante anomalías y humanizando el cuidado médico tanto en UCI como en el hogar.

---

## Índice

- [Descripción General](#descripción-general)
- [Arquitectura del Sistema](#arquitectura-del-sistema)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Hardware](#hardware)
- [Firmware](#firmware)
- [Backend](#backend)
- [Frontend](#frontend)
- [API REST](#api-rest)
- [Motor de IA — Amira](#motor-de-ia--amira)
- [Base de Datos](#base-de-datos)
- [Instalación y Configuración](#instalación-y-configuración)
- [Variables de Entorno](#variables-de-entorno)
- [Docker](#docker)
- [Tecnologías Utilizadas](#tecnologías-utilizadas)
- [Documentación Técnica](#documentación-técnica)

---

## Descripción General

safeCareNeo monitorea en tiempo real las condiciones ambientales del espacio de un neonato (temperatura, humedad y presión barométrica) mediante sensores IoT. Los datos son procesados por un backend inteligente que aplica reglas clínicas y aprendizaje incremental para detectar anomalías y generar alertas antes de que se conviertan en emergencias.

**Flujo principal:**

```
Sensor BME280 (ESP32) ──► Backend Node.js ──► MongoDB Atlas
                                │
                         Motor Amira (IA)
                                │
                    ┌───────────┴────────────┐
                 Dashboard Web           M5GO Display
               (React + Gemini)      (Diagnóstico por voz)
```

---

## Arquitectura del Sistema

| Capa | Tecnología | Función |
|------|-----------|---------|
| Sensores | ESP32 + BME280 | Captura temperatura, humedad y presión |
| Receptor | M5GO (ESP32) | Muestra datos en pantalla y reproduce diagnóstico de voz |
| Backend | Node.js + Express | API REST, validación, análisis predictivo |
| Base de datos | MongoDB Atlas | Almacenamiento de lecturas, alertas y predicciones |
| IA predictiva | Amira (JS) | Reglas clínicas + Z-scores + EMA para detección de riesgos |
| IA generativa | Google Gemini | Generación de diagnósticos textuales y de audio |
| Frontend | React + Vite | Dashboard de visualización en tiempo real |
| Blockchain | Solana | Registro inmutable de alertas críticas |

Consulta el [diagrama de arquitectura](docs/architecture/diagrama_sistema.svg) para una vista visual completa.

---

## Estructura del Proyecto

```text
safeCareNeo/
├── firmware/                     # Código para dispositivos ESP32 / M5Stack
│   ├── Projects/
│   │   ├── NeoSense_M5/          # Código del M5GO (pantalla + voz + IA)
│   │   │   ├── src/
│   │   │   │   ├── main.cpp
│   │   │   │   ├── extraccion_datos/   # Comunicación con backend
│   │   │   │   └── monitoreo/          # UI y visualización
│   │   │   ├── platformio.ini
│   │   │   └── lib/
│   │   ├── ESP_WS/               # ESP32 con servidor web básico
│   │   │   ├── src/
│   │   │   └── platformio.ini
│   │   └── Sistema_Botones/      # Control por botones
│   └── ComputerVision/           # Visión computacional (YOLO)
├── backend/                      # API REST (Node.js)
│   ├── server.js                 # Punto de entrada y rutas
│   ├── amira.js                  # Motor predictivo de riesgos
│   ├── validators.js             # Validación robusta de datos del sensor
│   ├── sensorMonitor.js          # Monitor de desconexión de sensores
│   ├── solanaLogger.js           # Registro de alertas en blockchain
│   ├── servidor_ia.py            # Servidor FastAPI para Gemini + TTS
│   └── package.json
├── frontend/
│   └── safecare-neo/
│       └── frontend/             # Aplicación React + Vite
│           ├── src/
│           │   ├── App.jsx
│           │   ├── components/   # Header, MetricCard, LiveMonitor
│           │   └── services/     # Consumo de APIs
│           └── package.json
├── docs/                         # Documentación técnica e imágenes
│   ├── README.md                 # Índice de documentación
│   ├── architecture/
│   │   └── diagrama_sistema.svg
│   ├── hardware/
│   │   ├── Esquematico_sensor_bme280.svg
│   │   └── Esquematico_m5go_ESP32.svg
│   ├── api/
│   │   └── README.md             # Documentación de endpoints
│   └── setup/
│       └── README.md             # Guía de instalación
├── scripts/                      # Scripts auxiliares
├── shared/                       # Código compartido
├── docker-compose.yml
└── .gitignore
```

---

## Hardware

### Sensor BME280 (nodo transmisor)

El sensor **Bosch BME280** mide temperatura, humedad relativa y presión barométrica. Se conecta a un ESP32 genérico vía I²C y envía las lecturas al backend cada 5 segundos.

| Pin BME280 | Pin ESP32 | Descripción |
|-----------|-----------|-------------|
| VCC       | 3.3 V     | Alimentación |
| GND       | GND       | Tierra |
| SDA       | GPIO 21   | Datos I²C |
| SCL       | GPIO 22   | Reloj I²C |

Consulta el [esquemático del BME280](docs/hardware/Esquematico_sensor_bme280.svg) para ver el diagrama de conexión completo.

### M5GO / M5Stack Core (nodo receptor y visualizador)

El **M5GO** es un ESP32 con pantalla IPS de 2", altavoz, batería integrada y tres botones físicos. Actúa como terminal de visualización: obtiene los datos del backend y puede reproducir diagnósticos de voz generados por Gemini.

| Botón | Función |
|-------|---------|
| A     | Consultar IA (diagnóstico de voz) |
| B / C | Volver al dashboard |

Consulta el [esquemático del M5GO](docs/hardware/Esquematico_m5go_ESP32.svg) para ver el diagrama de conexión completo.

---

## Firmware

El firmware se desarrolla con **PlatformIO** sobre el framework Arduino.

### NeoSense_M5

Ejecuta en el M5Stack Core. Cada 5 segundos consulta el backend para obtener la última lectura válida y la muestra en pantalla. Al presionar el botón A, consulta a Gemini y reproduce la respuesta como audio.

**Librerías clave:**

| Librería | Versión | Uso |
|----------|---------|-----|
| M5Unified | ^0.1.12 | Pantalla, botones, speaker |
| ArduinoJson | ^6.21.3 | Parseo de respuestas JSON |

### ESP_WS

ESP32 con servidor web simple (puerto 80) para control de GPIOs desde el navegador. Sirve como prototipo de control remoto.

---

## Backend

El backend está construido con **Node.js + Express** y se conecta a **MongoDB Atlas**.

### Archivos principales

| Archivo | Descripción |
|---------|-------------|
| `server.js` | Servidor Express con todos los endpoints REST |
| `amira.js` | Motor predictivo `AmiraPredictor` |
| `validators.js` | Validación de rangos, timestamps y sensores congelados |
| `sensorMonitor.js` | Monitorea la conectividad de los dispositivos |
| `solanaLogger.js` | Registra alertas críticas en la blockchain Solana |
| `servidor_ia.py` | Servidor FastAPI para integración con Gemini y gTTS |

### Inicio rápido

```bash
cd backend
npm install
npm run dev     # Modo desarrollo con nodemon
npm start       # Modo producción
```

---

## Frontend

Aplicación **React + Vite** que muestra las métricas del neonato en tiempo real.

### Componentes

| Componente | Descripción |
|-----------|-------------|
| `Header` | Cabecera con nombre del sistema |
| `MetricCard` | Tarjeta de métrica individual (temperatura, humedad, presión) |
| `LiveMonitor` | Gráfica de telemetría en tiempo real |

### Inicio rápido

```bash
cd frontend/safecare-neo/frontend
npm install
npm run dev
```

---

## API REST

El servidor escucha en el puerto `8000` por defecto.

### Endpoints principales

#### `POST /api/sensor-data`
Recibe y persiste una lectura del sensor ESP32.

**Body (JSON):**
```json
{
  "unidad_id": "NEO-001",
  "timestamp": 1713456789,
  "datos": {
    "temperatura": 36.8,
    "humedad": 55.2,
    "presion": 1013
  }
}
```

**Respuesta exitosa:**
```json
{
  "status": "success",
  "id": "<ObjectId>",
  "confidence": 95
}
```

#### `GET /api/sensor-data/latest/:unidad_id`
Devuelve la última lectura válida de un dispositivo.

#### `GET /api/sensor-data/history/:unidad_id`
Devuelve el historial de lecturas. Parámetros opcionales:
- `hours` — horas hacia atrás (por defecto: 24)
- `limit` — máximo de documentos (por defecto: 100)

Consulta la [documentación completa de la API](docs/api/README.md) para el resto de endpoints.

---

## Motor de IA — Amira

**`AmiraPredictor`** (v1.2.0) es el motor de análisis predictivo de riesgos neonatales integrado en el backend.

### Umbrales clínicos

| Variable | Hipotermia Crítica | Hipotermia Aviso | Normal | Hipertermia Aviso | Hipertermia Crítica |
|----------|-------------------|-----------------|--------|-------------------|---------------------|
| Temperatura (°C) | < 35.5 | < 36.0 | 36.5–37.5 | > 37.8 | > 38.0 |

| Variable | Crítico Bajo | Aviso Bajo | Óptimo | Aviso Alto | Crítico Alto |
|----------|-------------|-----------|--------|-----------|-------------|
| Humedad (%) | < 30 | < 40 | 50–70 | > 75 | > 80 |
| Presión (hPa) | — | < 980 | 990–1030 | > 1040 | — |

### Características del motor

- **Reglas clínicas**: basadas en literatura neonatal.
- **Z-scores (Welford)**: detección de anomalías estadísticas en tiempo real.
- **EMA (Exponential Moving Average)**: análisis de tendencias.
- **Riesgo combinado**: hipotermia + humedad alta genera penalidad extra.
- **Índice de confort neonatal**: escala 0–100 en cada predicción.
- **Detección de sensor muerto**: identifica valores congelados.
- **Registro en Solana**: alertas `warning`/`critical` se registran en blockchain.

---

## Base de Datos

Se usa **MongoDB Atlas** con tres colecciones principales:

| Colección | Descripción |
|-----------|-------------|
| `sensor_readings` | Lecturas crudas y filtradas del sensor |
| `ai_alerts` | Alertas generadas por el monitor de sensores |
| `amira_predictions` | Predicciones y análisis de riesgo de Amira |

---

## Instalación y Configuración

### Prerrequisitos

- Node.js ≥ 18.0.0
- Python ≥ 3.10 (para `servidor_ia.py`)
- PlatformIO CLI (para el firmware)
- Cuenta en MongoDB Atlas
- Clave de API de Google Gemini

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/Sadiec7/safeCareNeo.git
cd safeCareNeo

# 2. Instalar dependencias del backend
cd backend
npm install

# 3. Instalar dependencias Python (servidor IA)
pip install -r requirements.txt

# 4. Configurar variables de entorno
cp .env.example .env    # editar con tus credenciales

# 5. Iniciar el backend
npm run dev

# 6. En otra terminal, iniciar el servidor IA
uvicorn servidor_ia:app --host 0.0.0.0 --port 3000 --reload

# 7. Iniciar el frontend
cd ../frontend/safecare-neo/frontend
npm install
npm run dev
```

---

## Variables de Entorno

Crea un archivo `.env` en la carpeta `backend/` con las siguientes variables:

```env
# Base de datos
MONGODB_URI=mongodb+srv://<usuario>:<password>@cluster.mongodb.net/safeCareNeo

# Servidor
PORT=8000

# Validación de datos del sensor
TEMP_MIN=15
TEMP_MAX=35
HUMIDITY_MIN=20
HUMIDITY_MAX=90
PRESSURE_MIN=900
PRESSURE_MAX=1100
MIN_CONFIDENCE_TO_SAVE=50

# Umbrales de cambio máximo por segundo
MAX_TEMP_CHANGE_PER_SECOND=1.0
MAX_HUMIDITY_CHANGE_PER_SECOND=4.0

# Monitor de sensores
SENSOR_TIMEOUT_SECONDS=60
```

---

## Docker

El proyecto incluye un `docker-compose.yml` para levantar todos los servicios con un solo comando:

```bash
docker-compose up --build
```

---

## Tecnologías Utilizadas

| Área | Tecnologías |
|------|------------|
| Hardware | ESP32, M5GO, Sensor BME280 |
| Firmware | C++ (Arduino / PlatformIO), M5Unified |
| Backend | Node.js, Express, MongoDB, Solana Web3.js |
| IA / ML | Google Gemini API, gTTS, Amira (motor propio) |
| Frontend | React, Vite |
| DevOps | Docker, Docker Compose |

---

## Documentación Técnica

La carpeta [`docs/`](docs/) contiene toda la documentación técnica del proyecto:

| Documento | Descripción |
|-----------|-------------|
| [docs/README.md](docs/README.md) | Índice de documentación |
| [docs/architecture/diagrama_sistema.svg](docs/architecture/diagrama_sistema.svg) | Diagrama de arquitectura del sistema |
| [docs/hardware/Esquematico_sensor_bme280.svg](docs/hardware/Esquematico_sensor_bme280.svg) | Esquemático de conexión del sensor BME280 |
| [docs/hardware/Esquematico_m5go_ESP32.svg](docs/hardware/Esquematico_m5go_ESP32.svg) | Esquemático del M5GO (ESP32 receptor) |
| [docs/api/README.md](docs/api/README.md) | Documentación completa de la API REST |
| [docs/setup/README.md](docs/setup/README.md) | Guía de instalación y configuración |

---

## Licencia

Este proyecto está bajo la licencia especificada en el archivo [LICENSE](LICENSE).