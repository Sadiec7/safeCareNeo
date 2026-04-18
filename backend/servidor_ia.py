from fastapi import FastAPI
from fastapi.responses import FileResponse
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

# ══════════════════════════════════════════════════════════════════════════════
GEMINI_KEY      = ""                          # ← pon tu API key de Gemini
ELEVENLABS_KEY  = ""                          # ← pon tu API key de ElevenLabs
ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL" # "Bella" — voz en español
AUDIO_FILE      = "respuesta.wav"

MONGODB_URI = (
    "mongodb://lpadron07_db_user:XlmNLxXN7XG22B39@"
    "ac-fwwec5o-shard-00-00.gbeobfm.mongodb.net:27017,"
    "ac-fwwec5o-shard-00-01.gbeobfm.mongodb.net:27017,"
    "ac-fwwec5o-shard-00-02.gbeobfm.mongodb.net:27017/"
    "?ssl=true&replicaSet=atlas-gg88zu-shard-0"
    "&authSource=admin&appName=safeCareNeo"
)
DB_NAME         = "safeCareNeo"
COLLECTION      = "sensor_readings"
# ══════════════════════════════════════════════════════════════════════════════

# ── Conexión a MongoDB Atlas ──────────────────────────────────────────────────
_mongo_client: MongoClient | None = None
_mongo_db = None

def get_db():
    """Devuelve la colección sensor_readings. Reconecta si es necesario."""
    global _mongo_client, _mongo_db
    try:
        if _mongo_client is None:
            _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            _mongo_db     = _mongo_client[DB_NAME]
            # Fuerza la conexión para detectar errores temprano
            _mongo_client.admin.command("ping")
            print("[MongoDB] ✓ Conectado a Atlas")
        return _mongo_db[COLLECTION]
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        print(f"[MongoDB] ✗ No se pudo conectar: {e}")
        _mongo_client = None
        _mongo_db     = None
        return None

# Intentar conexión al arrancar (no bloquea si falla)
get_db()

# ── Fallback hardcodeado (se usa si Atlas no responde) ────────────────────────
_FALLBACK = {"temperatura": 36.5, "humedad": 57.0, "presion": 1013}

def _leer_ultimo_atlas():
    """
    Consulta Atlas igual que el server.js /api/dashboard/all-data:
    agrupa por unidad_id y devuelve el documento más reciente de cada sensor.
    Retorna lista de dicts con las claves que espera DataFetcher.cpp,
    o None si hay error / colección vacía.
    """
    col = get_db()
    if col is None:
        return None
    try:
        pipeline = [
            {"$match": {"data_quality.is_valid": True}},
            {"$sort":  {"timestamp": -1}},
            {"$group": {"_id": "$unidad_id", "latest": {"$first": "$$ROOT"}}},
        ]
        docs = list(col.aggregate(pipeline))
        if not docs:
            return None

        sensores = []
        for d in docs:
            doc = d["latest"]
            doc["_id"] = str(doc["_id"])   # ObjectId → str (JSON-serializable)
            sensores.append(doc)
        return sensores

    except Exception as e:
        print(f"[MongoDB] ✗ Error en consulta: {e}")
        return None

genai.configure(api_key=GEMINI_KEY)

# ── Auto-detectar el mejor modelo disponible en tu cuenta ─────────────────────
PREFERRED = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
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
            print(f"[Gemini] Usando primer disponible: {disponibles[0]}")
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
    """Llama a Gemini con 1 reintento si hay error 429."""
    for intento in range(2):
        try:
            model = genai.GenerativeModel(GEMINI_MODEL)
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as e:
            err = str(e)
            if "429" in err and intento == 0:
                wait = 30
                print(f"[Gemini] Cuota temporalmente agotada, esperando {wait}s...")
                time.sleep(wait)
            else:
                print(f"[Gemini] Error: {e}")
                break
    return "Sistema estable. Continuar monitoreo."


# ── TTS: ElevenLabs primero, gTTS de fallback ─────────────────────────────────

def _elevenlabs_a_wav(texto: str) -> bool:
    """
    Intenta generar audio con ElevenLabs.
    Devuelve True y guarda AUDIO_FILE si tiene éxito; False si falla.
    Requiere ELEVENLABS_KEY no vacío.
    """
    if not ELEVENLABS_KEY:
        return False

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": ELEVENLABS_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": texto,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code != 200:
            print(f"[ElevenLabs] Error HTTP {resp.status_code}: {resp.text[:200]}")
            return False

        # MP3 en memoria → WAV 8 kHz 16-bit mono para el ESP32
        mp3_buf = io.BytesIO(resp.content)
        audio = AudioSegment.from_mp3(mp3_buf)
        audio = audio.set_frame_rate(8000).set_channels(1).set_sample_width(2)
        audio.export(AUDIO_FILE, format="wav")

        size = os.path.getsize(AUDIO_FILE)
        print(f"[ElevenLabs] ✓ Audio WAV generado: {size} bytes")
        return True

    except Exception as e:
        print(f"[ElevenLabs] ✗ Excepción: {e}")
        return False


def _gtts_a_wav(texto: str) -> bool:
    """Genera audio con gTTS como fallback. Devuelve True si tiene éxito."""
    try:
        tts = gTTS(text=texto, lang="es", slow=False)
        mp3_buf = io.BytesIO()
        tts.write_to_fp(mp3_buf)
        mp3_buf.seek(0)

        audio = AudioSegment.from_mp3(mp3_buf)
        audio = audio.set_frame_rate(8000).set_channels(1).set_sample_width(2)
        audio.export(AUDIO_FILE, format="wav")

        size = os.path.getsize(AUDIO_FILE)
        print(f"[gTTS] ✓ Audio WAV generado: {size} bytes")
        return True

    except Exception as e:
        print(f"[gTTS] ✗ Error: {e}")
        return False


def texto_a_pcm(texto: str) -> int:
    """
    Intenta ElevenLabs primero; si falla usa gTTS.
    Retorna el tamaño en bytes del WAV generado (0 si ambos fallan).
    """
    if _elevenlabs_a_wav(texto):
        motor = "ElevenLabs"
    elif _gtts_a_wav(texto):
        motor = "gTTS (fallback)"
    else:
        print("[TTS] ✗ Ambos motores fallaron.")
        return 0

    size = os.path.getsize(AUDIO_FILE)
    print(f"[TTS] Motor usado: {motor} — {size} bytes")
    return size


@app.post("/api/gemini")
def consultar_ia(datos: DatosNeonato):
    print(f"[Gemini] Temp={datos.temp}°C  Hum={datos.hum}%  Pres={datos.pres}hPa")

    prompt = (
        f"Eres asistente médico neonatal. "
        f"Bebé: {datos.temp}°C, {datos.hum}% humedad, {datos.pres}hPa. "
        f"En máximo 15 palabras en español: ¿estable? Acción clave."
    )
    respuesta = llamar_gemini(prompt)
    print(f"[Gemini] Respuesta: {respuesta}")

    audio_len = texto_a_pcm(respuesta)

    return {"respuesta": respuesta, "audio_len": audio_len}


@app.get("/api/audio")
def get_audio():
    if os.path.exists(AUDIO_FILE):
        return FileResponse(AUDIO_FILE, media_type="application/octet-stream")
    return {"error": "No hay audio — llama primero a /api/gemini"}


@app.get("/api/status")
def status():
    """Última lectura del primer sensor disponible (compatibilidad legacy)."""
    sensores = _leer_ultimo_atlas()
    if sensores:
        d = sensores[0]
        src = d.get("datos_filtrados") or d.get("datos") or _FALLBACK
        return {
            "temperatura": src.get("temperatura", _FALLBACK["temperatura"]),
            "humedad":     src.get("humedad",     _FALLBACK["humedad"]),
            "presion":     src.get("presion",     _FALLBACK["presion"]),
            "fuente": "atlas"
        }
    return {**_FALLBACK, "fuente": "fallback_hardcodeado"}


# ── /api/dashboard/all-data — mismo formato que server.js ────────────────────
# El DataFetcher.cpp del M5Stack llama a este endpoint cada 5 s.
# Primero intenta leer de Atlas; si falla devuelve datos hardcodeados con
# pequeña variación para que la gráfica de tendencia se mueva.
@app.get("/api/dashboard/all-data")
def dashboard_all_data():
    sensores = _leer_ultimo_atlas()

    if sensores:
        # ── Datos reales de Atlas ─────────────────────────────────────────────
        print(f"[Dashboard] ✓ Sirviendo {len(sensores)} sensor(es) desde Atlas")
        return {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sensors":  sensores,
            "status":   [],
            "alerts":   [],
            "fuente":   "atlas"
        }

    # ── Fallback: datos hardcodeados con variación suave ─────────────────────
    print("[Dashboard] ⚠ Atlas sin datos — usando fallback hardcodeado")
    temp = round(_FALLBACK["temperatura"] + _rnd.uniform(-0.4, 0.6), 1)
    hum  = round(_FALLBACK["humedad"]     + _rnd.uniform(-2.0, 3.0), 1)
    pres = _FALLBACK["presion"]           + _rnd.randint(-1, 2)
    ts   = int(time.time())

    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sensors": [
            {
                "unidad_id": "incubadora-01",
                "timestamp": ts,
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
                }
            }
        ],
        "status":  [],
        "alerts":  [],
        "fuente":  "fallback_hardcodeado"
    }


@app.get("/api/test")
def test():
    """Diagnóstico — abre http://TU_IP:3000/api/test en el navegador"""
    resultado = {}

    # Test MongoDB Atlas
    try:
        col = get_db()
        if col is not None:
            count = col.count_documents({"data_quality.is_valid": True})
            resultado["mongodb"] = f"✓ Atlas conectado — {count} lecturas válidas en '{COLLECTION}'"
        else:
            resultado["mongodb"] = "✗ No se pudo conectar a Atlas"
    except Exception as e:
        resultado["mongodb"] = f"✗ {e}"

    # Test Gemini
    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        r = model.generate_content("Responde solo: OK")
        resultado["gemini"] = f"✓ modelo={GEMINI_MODEL}  respuesta={r.text.strip()}"
    except Exception as e:
        resultado["gemini"] = f"✗ {e}"

    # Test ElevenLabs
    if ELEVENLABS_KEY:
        ok = _elevenlabs_a_wav("Prueba de voz ElevenLabs.")
        resultado["elevenlabs"] = "✓ OK" if ok else "✗ Falló — revisa ELEVENLABS_KEY o ELEVENLABS_VOICE_ID"
    else:
        resultado["elevenlabs"] = "⚠ ELEVENLABS_KEY vacío — se usará gTTS"

    # Test gTTS (fallback)
    try:
        n = _gtts_a_wav("Sistema estable.")
        resultado["gtts_fallback"] = f"✓ gTTS OK — {os.path.getsize(AUDIO_FILE)} bytes WAV generados" if n else "✗ gTTS falló"
    except Exception as e:
        resultado["gtts_fallback"] = f"✗ {e}"

    return resultado