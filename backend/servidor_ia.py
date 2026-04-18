from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from gtts import gTTS
from pydub import AudioSegment
import time
import io
import os
import requests
import random as _rnd
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════════════════
GEMINI_KEY          = "AQ.Ab8RN6KX0BwaDNzA5xKp6sTzL9ebnNcYU5-MuK4TEvVTB7q7Ew"
ELEVENLABS_KEY      = ""                          # ← pon tu key de ElevenLabs
ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"     # "Bella" — español
AUDIO_FILE          = "respuesta.wav"

MONGODB_URI = (
    "mongodb://lpadron07_db_user:XlmNLxXN7XG22B39@"
    "ac-fwwec5o-shard-00-00.gbeobfm.mongodb.net:27017,"
    "ac-fwwec5o-shard-00-01.gbeobfm.mongodb.net:27017,"
    "ac-fwwec5o-shard-00-02.gbeobfm.mongodb.net:27017/"
    "?ssl=true&replicaSet=atlas-gg88zu-shard-0"
    "&authSource=admin&appName=safeCareNeo"
)
DB_NAME = "safeCareNeo"

# ── Colecciones reales que usa el server.js ───────────────────────────────────
#   dispositivo_logs     → telemetría del ESP32
#     campos: temp, hum, presion, pacienteId, timestamp, status_color
#   historial_posturas   → posturas YOLO
COL_TELEMETRIA = "dispositivo_logs"
COL_POSTURAS   = "historial_posturas"
# ══════════════════════════════════════════════════════════════════════════════

# ── Conexión a MongoDB Atlas ──────────────────────────────────────────────────
_mongo_client: MongoClient | None = None
_mongo_db = None

def get_mongo():
    """Devuelve (client, db). Reconecta si es necesario. Nunca lanza excepción."""
    global _mongo_client, _mongo_db
    try:
        if _mongo_client is None:
            _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            _mongo_db     = _mongo_client[DB_NAME]
            _mongo_client.admin.command("ping")
            print("[MongoDB] ✓ Conectado a Atlas")
        return _mongo_client, _mongo_db
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        print(f"[MongoDB] ✗ No se pudo conectar: {e}")
        _mongo_client = None
        _mongo_db     = None
        return None, None

# Intentar conexión al arrancar
get_mongo()

# ── Fallback cuando Atlas no tiene datos ──────────────────────────────────────
_FALLBACK = {"temp": 36.5, "hum": 57.0, "presion": 1013}

def _leer_ultimo_atlas(paciente_id: str | None = None):
    """
    Lee la última lectura de dispositivo_logs.
    Documentos tienen: { temp, hum, presion, pacienteId, timestamp, status_color }
    Devuelve el doc (dict) o None.
    """
    _, db = get_mongo()
    if db is None:
        return None
    try:
        filtro = {"pacienteId": paciente_id} if paciente_id else {}
        doc    = db[COL_TELEMETRIA].find_one(filtro, sort=[("timestamp", -1)])
        if doc:
            doc["_id"] = str(doc["_id"])
            print(f"[MongoDB] ✓ T={doc.get('temp')} H={doc.get('hum')} "
                  f"P={doc.get('presion')} paciente={doc.get('pacienteId')}")
        return doc
    except Exception as e:
        print(f"[MongoDB] ✗ Error leyendo {COL_TELEMETRIA}: {e}")
        return None

def _leer_todos_atlas():
    """Última lectura de CADA paciente para el dashboard."""
    _, db = get_mongo()
    if db is None:
        return None
    try:
        pipeline = [
            {"$sort":  {"timestamp": -1}},
            {"$group": {"_id": "$pacienteId", "latest": {"$first": "$$ROOT"}}},
        ]
        docs = list(db[COL_TELEMETRIA].aggregate(pipeline))
        if not docs:
            return None
        result = []
        for d in docs:
            doc = d["latest"]
            doc["_id"] = str(doc["_id"])
            result.append(doc)
        return result
    except Exception as e:
        print(f"[MongoDB] ✗ Error en agregación: {e}")
        return None

def _doc_a_sensor_item(doc: dict) -> dict:
    """
    Convierte un doc de dispositivo_logs al formato que espera DataFetcher.cpp.
    El M5Stack busca: sensor["datos"]["temperatura"], sensor["datos_filtrados"], etc.
    """
    temp = doc.get("temp",    _FALLBACK["temp"])
    hum  = doc.get("hum",     _FALLBACK["hum"])
    pres = doc.get("presion", _FALLBACK["presion"])
    ts   = doc.get("timestamp")
    ts_unix = int(ts.timestamp()) if hasattr(ts, "timestamp") else int(time.time())

    return {
        "unidad_id":  doc.get("pacienteId", "desconocido"),
        "timestamp":  ts_unix,
        "datos": {
            "temperatura": temp,
            "humedad":     hum,
            "presion":     pres
        },
        "datos_filtrados": {
            "temperatura": temp,
            "humedad":     hum,
            "presion":     pres
        },
        "data_quality": {
            "is_valid":   True,
            "confidence": 95,
            "errors":     [],
            "warnings":   []
        },
        "status_color": doc.get("status_color", "green")
    }

# ─────────────────────────────────────────────────────────────────────────────
# Gemini
# ─────────────────────────────────────────────────────────────────────────────
genai.configure(api_key=GEMINI_KEY)

PREFERRED = [
    "gemini-2.5-flash", "gemini-2.5-flash-lite",
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-1.5-flash", "gemini-1.5-flash-8b",
]

def encontrar_modelo() -> str:
    try:
        disponibles = [m.name.replace("models/", "") for m in genai.list_models()
                       if "generateContent" in m.supported_generation_methods]
        print(f"[Gemini] Modelos disponibles: {disponibles}")
        for p in PREFERRED:
            if p in disponibles:
                print(f"[Gemini] Usando modelo: {p}")
                return p
        if disponibles:
            return disponibles[0]
    except Exception as e:
        print(f"[Gemini] Error listando modelos: {e}")
    return "gemini-2.0-flash"

GEMINI_MODEL = encontrar_modelo()


class DatosNeonato(BaseModel):
    temp: float
    hum:  float
    pres: int


def llamar_gemini(prompt: str) -> str:
    for intento in range(2):
        try:
            response = genai.GenerativeModel(GEMINI_MODEL).generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            if "429" in str(e) and intento == 0:
                print("[Gemini] Cuota agotada, esperando 30 s...")
                time.sleep(30)
            else:
                print(f"[Gemini] Error: {e}")
                break
    return "Sistema estable. Continuar monitoreo."

# ─────────────────────────────────────────────────────────────────────────────
# TTS: ElevenLabs → gTTS fallback
# ─────────────────────────────────────────────────────────────────────────────
def _elevenlabs_a_wav(texto: str) -> bool:
    if not ELEVENLABS_KEY:
        return False
    try:
        resp = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
            headers={"xi-api-key": ELEVENLABS_KEY,
                     "Content-Type": "application/json", "Accept": "audio/mpeg"},
            json={"text": texto, "model_id": "eleven_multilingual_v2",
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
            timeout=15
        )
        if resp.status_code != 200:
            print(f"[ElevenLabs] HTTP {resp.status_code}: {resp.text[:200]}")
            return False
        audio = AudioSegment.from_mp3(io.BytesIO(resp.content))
        audio = audio.set_frame_rate(8000).set_channels(1).set_sample_width(2)
        audio.export(AUDIO_FILE, format="wav")
        print(f"[ElevenLabs] ✓ {os.path.getsize(AUDIO_FILE)} bytes")
        return True
    except Exception as e:
        print(f"[ElevenLabs] ✗ {e}")
        return False


def _gtts_a_wav(texto: str) -> bool:
    try:
        mp3 = io.BytesIO()
        gTTS(text=texto, lang="es", slow=False).write_to_fp(mp3)
        mp3.seek(0)
        audio = AudioSegment.from_mp3(mp3)
        audio = audio.set_frame_rate(8000).set_channels(1).set_sample_width(2)
        audio.export(AUDIO_FILE, format="wav")
        print(f"[gTTS] ✓ {os.path.getsize(AUDIO_FILE)} bytes")
        return True
    except Exception as e:
        print(f"[gTTS] ✗ {e}")
        return False


def texto_a_pcm(texto: str) -> int:
    if _elevenlabs_a_wav(texto):
        motor = "ElevenLabs"
    elif _gtts_a_wav(texto):
        motor = "gTTS (fallback)"
    else:
        print("[TTS] ✗ Ambos motores fallaron.")
        return 0
    size = os.path.getsize(AUDIO_FILE)
    print(f"[TTS] {motor} — {size} bytes")
    return size

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/gemini")
def consultar_ia(datos: DatosNeonato):
    print(f"[Gemini] T={datos.temp}°C  H={datos.hum}%  P={datos.pres}hPa")
    prompt = (
        f"Eres asistente médico neonatal. "
        f"Bebé: {datos.temp}°C, {datos.hum}% humedad, {datos.pres}hPa. "
        f"En máximo 15 palabras en español: ¿estable? Acción clave."
    )
    respuesta = llamar_gemini(prompt)
    print(f"[Gemini] → {respuesta}")
    return {"respuesta": respuesta, "audio_len": texto_a_pcm(respuesta)}


@app.get("/api/audio")
def get_audio():
    if os.path.exists(AUDIO_FILE):
        return FileResponse(AUDIO_FILE, media_type="application/octet-stream")
    return {"error": "Sin audio — llama primero a /api/gemini"}


@app.get("/api/status")
def status_endpoint():
    """Última lectura de cualquier paciente (legacy)."""
    doc = _leer_ultimo_atlas()
    if doc:
        return {
            "temperatura": doc.get("temp",    _FALLBACK["temp"]),
            "humedad":     doc.get("hum",     _FALLBACK["hum"]),
            "presion":     doc.get("presion", _FALLBACK["presion"]),
            "pacienteId":  doc.get("pacienteId"),
            "timestamp":   str(doc.get("timestamp")),
            "fuente":      "atlas"
        }
    return {
        "temperatura": _FALLBACK["temp"],
        "humedad":     _FALLBACK["hum"],
        "presion":     _FALLBACK["presion"],
        "fuente":      "fallback_hardcodeado"
    }


@app.get("/api/dashboard/all-data")
def dashboard_all_data():
    """
    Endpoint que consume el M5Stack cada 5 s.
    Devuelve la última lectura de cada paciente en el formato
    que espera DataFetcher.cpp (campos datos.temperatura, etc.).
    """
    docs = _leer_todos_atlas()

    if docs:
        sensores = [_doc_a_sensor_item(d) for d in docs]
        print(f"[Dashboard] ✓ {len(sensores)} paciente(s) desde Atlas")
        return {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sensors":   sensores,
            "status":    [],
            "alerts":    [],
            "fuente":    "atlas"
        }

    # Fallback con variación suave para que la gráfica del M5Stack se mueva
    print("[Dashboard] ⚠ Sin datos en Atlas — fallback hardcodeado")
    temp = round(_FALLBACK["temp"]    + _rnd.uniform(-0.4, 0.6), 1)
    hum  = round(_FALLBACK["hum"]     + _rnd.uniform(-2.0, 3.0), 1)
    pres = int(  _FALLBACK["presion"] + _rnd.randint(-1, 2))
    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sensors": [{
            "unidad_id": "incubadora-01",
            "timestamp": int(time.time()),
            "datos":           {"temperatura": temp, "humedad": hum, "presion": pres},
            "datos_filtrados": {"temperatura": temp, "humedad": hum, "presion": pres},
            "data_quality": {"is_valid": True, "confidence": 95,
                             "errors": [], "warnings": []}
        }],
        "status":  [],
        "alerts":  [],
        "fuente":  "fallback_hardcodeado"
    }


@app.get("/api/postura")
def get_postura():
    """Última postura detectada por YOLO."""
    _, db = get_mongo()
    if db is None:
        return {"estado": None, "alerta_critica": False, "fuente": "sin_conexion"}
    try:
        doc = db[COL_POSTURAS].find_one(sort=[("timestamp", -1)])
        if not doc:
            return {"estado": None, "alerta_critica": False, "fuente": "coleccion_vacia"}
        ts = doc.get("timestamp")
        return {
            "estado":         doc.get("estado", "Desconocido"),
            "alerta_critica": doc.get("alerta_critica", False),
            "timestamp":      ts.strftime("%Y-%m-%dT%H:%M:%SZ") if hasattr(ts, "strftime") else None,
            "fuente":         "atlas"
        }
    except Exception as e:
        print(f"[Postura] ✗ {e}")
        return {"estado": None, "alerta_critica": False, "fuente": "error"}


@app.get("/api/test")
def test():
    """Diagnóstico completo — abre http://TU_IP:3000/api/test en el navegador."""
    resultado = {}

    # MongoDB
    _, db = get_mongo()
    if db is not None:
        try:
            count  = db[COL_TELEMETRIA].count_documents({})
            ultimo = db[COL_TELEMETRIA].find_one(sort=[("timestamp", -1)])
            if ultimo:
                resultado["mongodb"] = (
                    f"✓ Atlas OK — {count} docs en '{COL_TELEMETRIA}' | "
                    f"último → T={ultimo.get('temp')} H={ultimo.get('hum')} "
                    f"P={ultimo.get('presion')} paciente={ultimo.get('pacienteId')}"
                )
            else:
                resultado["mongodb"] = f"✓ Atlas OK — colección '{COL_TELEMETRIA}' vacía (aún no hay datos del ESP32)"
        except Exception as e:
            resultado["mongodb"] = f"✗ {e}"
    else:
        resultado["mongodb"] = "✗ No se pudo conectar a Atlas"

    # Gemini
    try:
        r = genai.GenerativeModel(GEMINI_MODEL).generate_content("Responde solo: OK")
        resultado["gemini"] = f"✓ modelo={GEMINI_MODEL}  resp={r.text.strip()}"
    except Exception as e:
        resultado["gemini"] = f"✗ {e}"

    # ElevenLabs
    resultado["elevenlabs"] = (
        "⚠ ELEVENLABS_KEY vacío — se usará gTTS" if not ELEVENLABS_KEY
        else ("✓ OK" if _elevenlabs_a_wav("Prueba.") else "✗ Falló — revisa la key")
    )

    # gTTS
    try:
        ok = _gtts_a_wav("Sistema estable.")
        resultado["gtts"] = f"✓ OK — {os.path.getsize(AUDIO_FILE)} bytes" if ok else "✗ Falló"
    except Exception as e:
        resultado["gtts"] = f"✗ {e}"

    return resultado