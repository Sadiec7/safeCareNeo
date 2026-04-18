# Guía de Instalación y Configuración — safeCareNeo

Esta guía detalla cómo poner en marcha todos los componentes del sistema safeCareNeo en un entorno local o de desarrollo.

---

## Prerrequisitos

| Herramienta | Versión mínima | Uso |
|-------------|---------------|-----|
| Node.js | 18.x | Backend REST |
| npm | 9.x | Gestión de paquetes JS |
| Python | 3.10 | Servidor IA (Gemini/TTS) |
| pip | 22.x | Gestión de paquetes Python |
| PlatformIO CLI | Última | Compilar/subir firmware |
| Docker + Compose | Última | Despliegue contenerizado (opcional) |
| Git | 2.x | Control de versiones |

---

## 1. Clonar el repositorio

```bash
git clone https://github.com/Sadiec7/safeCareNeo.git
cd safeCareNeo
```

---

## 2. Configurar el Backend (Node.js)

### 2.1 Instalar dependencias

```bash
cd backend
npm install
```

### 2.2 Crear el archivo `.env`

Crea el archivo `backend/.env` con el siguiente contenido (ajusta los valores):

```env
# ─── Base de datos ──────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://<usuario>:<password>@cluster.mongodb.net/safeCareNeo

# ─── Servidor ───────────────────────────────────────────────────────────────
PORT=8000

# ─── Validación de datos del sensor ─────────────────────────────────────────
TEMP_MIN=15
TEMP_MAX=35
HUMIDITY_MIN=20
HUMIDITY_MAX=90
PRESSURE_MIN=900
PRESSURE_MAX=1100
MIN_CONFIDENCE_TO_SAVE=50

# Tasa de cambio máxima permitida
MAX_TEMP_CHANGE_PER_SECOND=1.0
MAX_HUMIDITY_CHANGE_PER_SECOND=4.0

# Umbral de sensor congelado (lecturas idénticas consecutivas)
FROZEN_SENSOR_THRESHOLD=10

# ─── Monitor de sensores ─────────────────────────────────────────────────────
SENSOR_TIMEOUT_SECONDS=60
```

> **Nota:** Nunca incluyas el archivo `.env` en el control de versiones (ya está en `.gitignore`).

### 2.3 Iniciar el servidor

```bash
# Modo producción
npm start

# Modo desarrollo (hot-reload con nodemon)
npm run dev
```

El backend quedará disponible en `http://localhost:8000`.

---

## 3. Configurar el Servidor IA (Python + FastAPI)

### 3.1 Instalar dependencias

```bash
cd backend
pip install -r requirements.txt
```

Las dependencias incluyen: `fastapi`, `uvicorn`, `google-generativeai`, `gtts`, `pydub`, `pymongo`, `requests`.

### 3.2 Configurar las claves API

Edita las variables en `backend/servidor_ia.py`:

```python
GEMINI_KEY = "<tu-clave-de-google-gemini>"
```

### 3.3 Iniciar el servidor FastAPI

```bash
uvicorn servidor_ia:app --host 0.0.0.0 --port 3000 --reload
```

El servidor IA quedará disponible en `http://localhost:3000`.

---

## 4. Configurar el Frontend (React + Vite)

### 4.1 Instalar dependencias

```bash
cd frontend/safecare-neo/frontend
npm install
```

### 4.2 Iniciar en modo desarrollo

```bash
npm run dev
```

El frontend quedará disponible en `http://localhost:5173`.

### 4.3 Construir para producción

```bash
npm run build
```

Los archivos estáticos se generan en `dist/`.

---

## 5. Configurar el Firmware (PlatformIO)

### 5.1 Instalar PlatformIO

```bash
pip install platformio
```

O instala la extensión **PlatformIO IDE** en Visual Studio Code.

### 5.2 Configurar credenciales de red

Edita el archivo `firmware/Projects/NeoSense_M5/src/extraccion_datos/DataFetcher.h`:

```cpp
const char* const WIFI_SSID   = "TU_RED_WIFI";
const char* const WIFI_PASS   = "TU_PASSWORD";
const char* const BACKEND_URL = "http://192.168.X.X:8000";
```

### 5.3 Compilar y subir a M5GO

```bash
cd firmware/Projects/NeoSense_M5
pio run --target upload
```

### 5.4 Ver monitor serial

```bash
pio device monitor --baud 115200
```

---

## 6. Despliegue con Docker (opcional)

El archivo `docker-compose.yml` en la raíz del proyecto permite levantar todos los servicios con un solo comando:

```bash
docker-compose up --build
```

Para detener:

```bash
docker-compose down
```

---

## 7. Verificar la instalación

1. Abre `http://localhost:8000/health` → debe responder `{ "status": "ok" }`.
2. Abre `http://localhost:5173` → debe mostrar el dashboard de safeCareNeo.
3. Enciende el M5GO → debe mostrar datos en pantalla tras conectarse al WiFi.
4. Presiona el Botón A en el M5GO → debe reproducirse un diagnóstico de voz.

---

## Solución de Problemas

| Problema | Solución |
|----------|---------|
| Backend no conecta a MongoDB | Verifica `MONGODB_URI` en `.env` y que el IP esté en la lista blanca de Atlas |
| M5GO no muestra datos | Verifica `WIFI_SSID`, `WIFI_PASS` y `BACKEND_URL` en `DataFetcher.h` |
| Error al subir firmware | Asegúrate de tener los drivers USB-UART instalados (CP2104 / CH340) |
| `pip install` falla en pydub | Instala `ffmpeg`: `sudo apt install ffmpeg` (Linux) o `brew install ffmpeg` (macOS) |
| Puerto 8000 ya en uso | Cambia `PORT` en `.env` y actualiza `BACKEND_URL` en el firmware |
