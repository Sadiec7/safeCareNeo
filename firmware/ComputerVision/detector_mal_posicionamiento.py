import cv2
from ultralytics import YOLO
import os
from pymongo import MongoClient
from datetime import datetime

# --- CONFIGURACIÓN DE MONGODB ---
# Reemplaza esto con tu URI de MongoDB (Atlas o tu VPS en Vultr)
MONGO_URI = "mongodb+srv://lpadron07_db_user:XlmNLxXN7XG22B39@safecareneo.gbeobfm.mongodb.net/?appName=safeCareNeo"
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client['safeCareNeo']
    coleccion_historial = db['historial_posturas']
    # Prueba la conexión
    client.server_info()
    print("Conectado a MongoDB exitosamente.")
except Exception as e:
    print(f"Error conectando a MongoDB: {e}")
    # Si no quieres que el programa se caiga sin internet, maneja esto adecuadamente.

# 1. Silenciar logs innecesarios de la IA
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

# 2. Cargar el modelo
model = YOLO('yolov8n-pose.pt')

# 3. Iniciar Cámara
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("--- SafeCareNeo Vision Activo ---")
print("Presiona 'q' para salir.")

# Variables de control para MongoDB
estado_anterior = "Desconocido"

while cap.isOpened():
    success, frame = cap.read()
    if not success: break

    frame = cv2.flip(frame, 1)
    results = model(frame, stream=True, verbose=False)

    estado = "Buscando paciente..."
    color_texto = (255, 255, 0) 

    for r in results:
        if r.keypoints is not None and len(r.keypoints.conf) > 0:
            frame = r.plot()
            confianza_nariz = r.keypoints.conf[0][0].item()

            if confianza_nariz > 0.5:
                estado = "POSTURA OK: Boca Arriba"
                color_texto = (0, 255, 0)
            else:
                estado = "ALERTA: Boca Abajo"
                color_texto = (0, 0, 255)

    # --- LÓGICA DE BASE DE DATOS ---
    # Solo guardamos en MongoDB si el estado ha cambiado
    # Esto evita llenar la base de datos con basura repetida
    if estado != estado_anterior and estado != "Buscando paciente...":
        print(f"Cambio detectado: {estado}. Guardando en la nube...")
        
        # Crear el documento (JSON) para guardar
        registro = {
            "estado": estado,
            "timestamp": datetime.now(),
            "alerta_critica": True if "ALERTA" in estado else False
        }
        
        # Intentar insertar en segundo plano (para no congelar el video)
        try:
            coleccion_historial.insert_one(registro)
        except Exception as e:
            print(f"No se pudo guardar en Mongo: {e}")
            
        # Actualizar el estado anterior
        estado_anterior = estado

    # 5. Interfaz
    cv2.rectangle(frame, (0, 0), (480, 75), (0, 0, 0), -1)
    cv2.putText(frame, estado, (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, color_texto, 3)

    cv2.imshow('SafeCareNeo - Monitor', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()