# Documentación de la API REST — safeCareNeo

El backend expone una API REST construida con **Node.js + Express** que escucha en el puerto `8000` por defecto.

---

## Base URL

```
http://<host>:8000
```

---

## Autenticación

La API actualmente no requiere autenticación. Se recomienda agregar un API Key o JWT para entornos de producción.

---

## Endpoints

### 1. `POST /api/sensor-data`

Recibe y persiste una nueva lectura del sensor ESP32.

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

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `unidad_id` | string | Identificador único del dispositivo |
| `timestamp` | number | Marca de tiempo Unix (segundos) |
| `datos.temperatura` | number | Temperatura en °C |
| `datos.humedad` | number | Humedad relativa en % |
| `datos.presion` | number | Presión barométrica en hPa |

**Respuesta 200 — Éxito:**

```json
{
  "status": "success",
  "id": "64f3a1b2c9e12d0001a2b3c4",
  "confidence": 95,
  "warnings": ["Temperatura ligeramente baja"]
}
```

**Respuesta 400 — Datos rechazados:**

```json
{
  "status": "rejected",
  "confidence": 10,
  "errors": ["CRÍTICO: Temperatura fuera de rango físico"],
  "warnings": []
}
```

---

### 2. `GET /api/sensor-data/latest/:unidad_id`

Devuelve la última lectura válida de un dispositivo.

**Parámetros de ruta:**

| Parámetro | Descripción |
|-----------|-------------|
| `unidad_id` | Identificador del dispositivo |

**Respuesta 200:**

```json
{
  "_id": "64f3a1b2c9e12d0001a2b3c4",
  "unidad_id": "NEO-001",
  "timestamp": 1713456789,
  "datos": {
    "temperatura": 36.8,
    "humedad": 55.2,
    "presion": 1013
  },
  "datos_filtrados": {
    "temperatura": 36.75,
    "humedad": 55.1,
    "presion": 1013
  },
  "data_quality": {
    "is_valid": true,
    "confidence": 95,
    "errors": [],
    "warnings": []
  },
  "server_timestamp": "2024-04-18T15:12:00.000Z"
}
```

**Respuesta 404:**

```json
{
  "error": "No hay datos válidos para este dispositivo"
}
```

---

### 3. `GET /api/sensor-data/history/:unidad_id`

Devuelve el historial de lecturas válidas de un dispositivo.

**Parámetros de ruta:**

| Parámetro | Descripción |
|-----------|-------------|
| `unidad_id` | Identificador del dispositivo |

**Parámetros de consulta (query):**

| Parámetro | Tipo | Por defecto | Descripción |
|-----------|------|-------------|-------------|
| `hours` | number | `24` | Número de horas hacia atrás |
| `limit` | number | `100` | Máximo de documentos a retornar |

**Ejemplo:**

```
GET /api/sensor-data/history/NEO-001?hours=6&limit=50
```

**Respuesta 200:**

```json
{
  "unidad_id": "NEO-001",
  "period_hours": "6",
  "count": 43,
  "readings": [ ... ]
}
```

---

### 4. `GET /api/alerts`

Devuelve las alertas de desconexión y anomalías activas.

**Respuesta 200:**

```json
[
  {
    "_id": "...",
    "device_id": "NEO-001",
    "type": "disconnection",
    "severity": "warning",
    "message": "Sensor sin datos por 75 segundos",
    "timestamp": "2024-04-18T15:00:00.000Z",
    "resolved_at": null
  }
]
```

---

### 5. `GET /api/predictions/:unidad_id`

Devuelve las predicciones de riesgo generadas por **Amira** para un dispositivo.

**Parámetros de consulta:**

| Parámetro | Por defecto | Descripción |
|-----------|-------------|-------------|
| `limit` | `20` | Número de predicciones a retornar |

**Respuesta 200:**

```json
[
  {
    "_id": "...",
    "unidad_id": "NEO-001",
    "timestamp": "2024-04-18T15:10:00.000Z",
    "alert_level": "warning",
    "risk_score": 62,
    "comfort_index": 45,
    "current_risks": [
      { "type": "hypothermia_warning", "message": "Temperatura levemente baja (36.1°C)" }
    ],
    "trend_risks": [],
    "blockchain": {
      "tx_hash": "5RvKx...",
      "logged_at": "2024-04-18T15:10:01.000Z"
    }
  }
]
```

---

### 6. `GET /health`

Endpoint de salud del servidor.

**Respuesta 200:**

```json
{
  "status": "ok",
  "uptime": 3600,
  "database": "connected"
}
```

---

## Servidor FastAPI (Python) — Puerto 3000

El servidor `servidor_ia.py` provee los siguientes endpoints adicionales para integración con IA generativa:

### `POST /analyze`

Genera un diagnóstico en texto a partir de los valores del sensor.

**Body:**

```json
{
  "temperatura": 36.8,
  "humedad": 55.2,
  "presion": 1013
}
```

**Respuesta:**

```json
{
  "diagnostico": "Los valores del neonato se encuentran dentro del rango normal..."
}
```

### `GET /audio`

Descarga el último archivo de audio WAV generado con gTTS.

---

## Códigos de Estado

| Código | Significado |
|--------|-------------|
| `200` | Operación exitosa |
| `400` | Datos del sensor rechazados (fuera de rango o inválidos) |
| `404` | Recurso no encontrado |
| `500` | Error interno del servidor |

---

## Modelos de Datos — MongoDB

### Colección `sensor_readings`

```json
{
  "_id": "ObjectId",
  "unidad_id": "string",
  "timestamp": "number (Unix)",
  "datos": {
    "temperatura": "number",
    "humedad": "number",
    "presion": "number"
  },
  "datos_filtrados": {
    "temperatura": "number",
    "humedad": "number",
    "presion": "number"
  },
  "data_quality": {
    "is_valid": "boolean",
    "confidence": "number (0-100)",
    "errors": ["string"],
    "warnings": ["string"]
  },
  "server_timestamp": "Date"
}
```

### Colección `amira_predictions`

```json
{
  "_id": "ObjectId",
  "unidad_id": "string",
  "timestamp": "Date",
  "alert_level": "safe | warning | critical",
  "risk_score": "number (0-100)",
  "comfort_index": "number (0-100)",
  "current_risks": [{ "type": "string", "message": "string" }],
  "trend_risks": [{ "type": "string", "message": "string" }],
  "blockchain": {
    "tx_hash": "string",
    "logged_at": "Date"
  }
}
```
