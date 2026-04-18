const express = require('express');
const cors = require('cors');
const { connectToDatabase, getDb } = require('./db');
const { generarNotaMedicaEstructurada } = require('./geminiService'); // Importamos IA

const app = express();
app.use(cors());
app.use(express.json());

// --- LÓGICA DE NEGOCIO (Helpers) ---

function evaluarAlarmas(data) {
    const alertas = [];
    // Las alertas ahora incluyen un nivel de severidad para la UI
    if (data.temp > 38) alertas.push({ nivel: "critico", msj: "Fiebre detectada" });
    if (data.temp < 36) alertas.push({ nivel: "critico", msj: "Posible hipotermia" });
    if (data.hum < 30 || data.hum > 70) alertas.push({ nivel: "advertencia", msj: "Humedad fuera de rango" });
    
    return {
        hayAlerta: alertas.length > 0,
        detalles: alertas
    };
}

// --- ENDPOINTS ---

// 1. Telemetría Única (IoT -> DB -> Alerta)
app.post('/api/telemetry', async (req, res) => {
    try {
        const db = getDb();
        const { temp, hum, presion, pacienteId } = req.body;

        const lectura = {
            pacienteId,
            temp,
            hum,
            presion,
            timestamp: new Date(),
            // Agregamos el color de estado para que el Dashboard no tenga que calcularlo
            status_color: (temp > 38 || temp < 36) ? "red" : "green" 
        };

        await db.collection('dispositivo_logs').insertOne(lectura);
        
        const diagnostico = evaluarAlarmas(req.body);

        res.status(201).json({
            status: "success",
            data_saved: true,
            alertas: diagnostico.hayAlerta ? diagnostico.detalles : null
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Copiloto Médico (IA + Contexto de Sensores)
app.post('/api/generate-report', async (req, res) => {
    try {
        const { dictado, pacienteId } = req.body;
        const db = getDb();

        // Obtener contexto real de los sensores
        const ultimaLectura = await db.collection('dispositivo_logs')
            .find({ pacienteId })
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray();

        if (!ultimaLectura[0]) {
            return res.status(404).json({ error: "No hay datos previos del sensor" });
        }

        // LLAMADA REAL A GEMINI
        const notaIA = await generarNotaMedicaEstructurada(ultimaLectura[0], dictado);

        const reporteFinal = {
            pacienteId,
            fecha: new Date(),
            sensores_contexto: ultimaLectura[0],
            dictado_medico: dictado,
            reporte_estructurado: notaIA // Aquí viene el JSON de Gemini
        };

        await db.collection('expedientes_clinicos').insertOne(reporteFinal);
        res.json(reporteFinal);
    } catch (e) {
        res.status(500).json({ error: "Error procesando IA: " + e.message });
    }
});

// 3. Endpoint para Dashboards (Obtener último estado rápido)
app.get('/api/status/:pacienteId', async (req, res) => {
    const db = getDb();
    const status = await db.collection('dispositivo_logs')
        .find({ pacienteId: req.params.pacienteId })
        .sort({ timestamp: -1 })
        .limit(1)
        .next();
    
    const ultimoReporte = await db.collection('expedientes_clinicos')
        .find({ pacienteId: req.params.pacienteId })
        .sort({ fecha: -1 })
        .limit(1)
        .next();

    res.json({ telemetria: status, ultimo_reporte: ultimoReporte });
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 8000;
connectToDatabase().then(() => {
    app.listen(PORT, () => console.log(`SafeCareNeo Backend en puerto ${PORT}`));
});