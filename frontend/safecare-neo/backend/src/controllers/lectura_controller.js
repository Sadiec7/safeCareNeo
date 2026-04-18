const Lectura = require("../models/lectura.model");
const Alerta = require("../models/alerta.model");
const { evaluarRiesgo } = require("../services/ia.service");

// POST /api/lecturas
// El ESP32 llama a este endpoint cada vez que toma una lectura
const crearLectura = async (req, res) => {
  try {
    const { paciente_id, temperatura, humedad, presion } = req.body;

    // Validar que vengan los tres valores del BME280
    if (temperatura === undefined || humedad === undefined || presion === undefined) {
      return res.status(400).json({ error: "Faltan datos del sensor BME280" });
    }

    // Evaluar riesgo con el servicio de IA
    const { nivel_riesgo, alerta_ia, alertas } = evaluarRiesgo({
      temperatura,
      humedad,
      presion,
    });

    // Guardar lectura en MongoDB
    const lectura = await Lectura.create({
      paciente_id: paciente_id || "neonato_001",
      temperatura,
      humedad,
      presion,
      alerta_ia,
      nivel_riesgo,
    });

    // Si hay alertas, guardarlas y emitir por socket
    const io = req.app.get("io");

    if (alertas.length > 0) {
      for (const alerta of alertas) {
        const nuevaAlerta = await Alerta.create({
          paciente_id: paciente_id || "neonato_001",
          ...alerta,
        });
        // Emitir alerta crítica a todos los clientes conectados
        io.emit("alerta_critica", nuevaAlerta);
      }
    }

    // Emitir la lectura en tiempo real a todos los clientes
    io.emit("nueva_lectura", lectura);

    res.status(201).json({ ok: true, lectura });
  } catch (error) {
    console.error("Error al crear lectura:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// GET /api/lecturas
// Retorna las últimas 50 lecturas para poblar las gráficas
const obtenerLecturas = async (req, res) => {
  try {
    const { paciente_id = "neonato_001", limite = 50 } = req.query;

    const lecturas = await Lectura.find({ paciente_id })
      .sort({ createdAt: -1 })
      .limit(Number(limite));

    res.json(lecturas.reverse()); // más antiguo primero para las gráficas
  } catch (error) {
    res.status(500).json({ error: "Error al obtener lecturas" });
  }
};

// GET /api/lecturas/ultima
// Retorna solo la lectura más reciente
const obtenerUltimaLectura = async (req, res) => {
  try {
    const { paciente_id = "neonato_001" } = req.query;

    const lectura = await Lectura.findOne({ paciente_id }).sort({ createdAt: -1 });

    if (!lectura) {
      return res.status(404).json({ error: "No hay lecturas registradas" });
    }

    res.json(lectura);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener la última lectura" });
  }
};

module.exports = { crearLectura, obtenerLecturas, obtenerUltimaLectura };