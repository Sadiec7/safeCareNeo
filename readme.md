# safeCareNeo
> Sistema de Monitoreo Neonatal Inteligente con IoT y Análisis Predictivo.

**safeCareNeo** es una solución integral que fusiona IoT y Machine Learning para la supervisión constante de neonatos. Captura signos vitales en tiempo real y emplea IA para generar reportes personalizados para médicos, cuidadores y padres, optimizando la respuesta ante anomalías y humanizando el cuidado médico tanto en UCI como en el hogar.

---

## Estructura del Proyecto

Para mantener un estándar de arquitectura profesional y escalable, el repositorio se organiza de la siguiente manera:

```text
neosense-ai/
├── firmware/              # Código para M5Stack (ESP32) / Sensores
│   ├── src/               # Código fuente (.ino o .cpp)
│   ├── include/           # Cabeceras y definiciones de pines
│   └── lib/               # Librerías específicas para sensores médicos
├── backend/               # API REST y Procesamiento de Datos (Node.js)
│   ├── src/
│   │   ├── controllers/   # Lógica de las rutas
│   │   ├── models/        # Esquemas de MongoDB (Mongoose)
│   │   ├── services/      # Lógica de negocio y procesamiento de IA
│   │   └── routes/        # Definición de endpoints
│   └── tests/             # Pruebas unitarias e integración
├── frontend/              # Interfaz de usuario (React)
│   ├── public/
│   └── src/
│       ├── components/    # Componentes reutilizables
│       ├── hooks/         # Lógica de estado personalizada
│       ├── pages/         # Vistas principales (Padres/Médicos)
│       └── services/      # Consumo de la API del Backend
├── docs/                  # Documentación técnica y diagramas
│   ├── architecture/      # Diagramas de flujo y de red
│   └── hardware/          # Esquemas de conexión del M5Stack
└── .gitignore             # Configuración de archivos excluidos