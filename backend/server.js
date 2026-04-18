const express = require('express');
const cors = require('cors');
<<<<<<< HEAD
const SensorValidator = require('./validators');
const SensorMonitor = require('./sensorMonitor');
const AmiraPredictor = require('./amira');
=======
const { connectToDatabase, getDb } = require('./db');
const { generarNotaMedicaEstructurada } = require('./geminiService'); // Importamos IA
>>>>>>> dockcomp

const app = express();
app.use(cors());
app.use(express.json());

// --- LÓGICA DE NEGOCIO (Helpers) ---

<<<<<<< HEAD
// MongoDB Client
const client = new MongoClient(config.MONGODB_URI);
let db;

// Validator, Monitor y Amira
const validator = new SensorValidator(config);
let monitor;
let amira;

// Historial de lecturas por dispositivo (en memoria)
const sensorHistory = new Map();

// === CONEXIÓN A BASE DE DATOS ===
async function connectDB() {
  try {
    await client.connect();
    db = client.db('safeCareNeo');
    
    console.log(' MongoDB Atlas conectado');
    
    // Crear índices
    await createIndexes();
    
    // Iniciar monitor de sensores
    monitor = new SensorMonitor(db, config);
    monitor.start();

    // Iniciar motor predictivo Amira
    amira = new AmiraPredictor(db, config);
    
  } catch (error) {
    console.error('Error conectando MongoDB:', error);
    process.exit(1);
  }
}

async function createIndexes() {
  try {
    // Índices para sensor_readings
    await db.collection('sensor_readings').createIndex({ timestamp: -1 });
    await db.collection('sensor_readings').createIndex({ unidad_id: 1, timestamp: -1 });
    await db.collection('sensor_readings').createIndex({ "data_quality.is_valid": 1 });
    await db.collection('sensor_readings').createIndex({ server_timestamp: -1 });
    
    // Índices para ai_alerts
    await db.collection('ai_alerts').createIndex({ timestamp: -1 });
    await db.collection('ai_alerts').createIndex({ device_id: 1, timestamp: -1 });
    await db.collection('ai_alerts').createIndex({ severity: 1 });
    await db.collection('ai_alerts').createIndex({ resolved_at: 1 });

    // Índices para amira_predictions
    await db.collection('amira_predictions').createIndex({ timestamp: -1 });
    await db.collection('amira_predictions').createIndex({ unidad_id: 1, timestamp: -1 });
    await db.collection('amira_predictions').createIndex({ alert_level: 1, timestamp: -1 });
    await db.collection('amira_predictions').createIndex({ 'blockchain.tx_hash': 1 });
    
    console.log('Índices de MongoDB creados');
  } catch (error) {
    console.error('Error creando índices:', error);
  }
}

// === FUNCIONES AUXILIARES ===

function getOrCreateHistory(unidad_id) {
  if (!sensorHistory.has(unidad_id)) {
    sensorHistory.set(unidad_id, []);
  }
  
  const history = sensorHistory.get(unidad_id);
  
  // Mantener solo las últimas 20 lecturas
  if (history.length > 20) {
    history.shift();
  }
  
  return history;
}

// === ENDPOINTS ===

// RECIBIR DATOS DEL ESP32
app.post('/api/sensor-data', async (req, res) => {
  try {
    const data = req.body;
    
    console.log('\nDatos recibidos de:', data.unidad_id);
    console.log(JSON.stringify(data, null, 2));
    
    // Obtener historial del dispositivo
    const history = getOrCreateHistory(data.unidad_id);
    
    // VALIDACIÓN ROBUSTA
    const validation = validator.validate(data, history);
    
    console.log(`Confianza: ${validation.confidence}% | Válido: ${validation.isValid}`);
    
    if (validation.errors.length > 0) {
      console.log('Errores:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.log('Advertencias:', validation.warnings);
    }
    
    // RECHAZAR si no es válido
    if (!validation.isValid) {
      return res.status(400).json({
        status: 'rejected',
        confidence: validation.confidence,
        errors: validation.errors,
        warnings: validation.warnings
      });
    }
    
    // Aplicar filtro de mediana (si hay suficiente historial)
    if (history.length >= 5) {
      const tempFiltered = validator.applyMedianFilter(history, 'temperatura');
      const humFiltered = validator.applyMedianFilter(history, 'humedad');
      const pressFiltered = validator.applyMedianFilter(history, 'presion');
      
      data.datos_filtrados = {
        temperatura: tempFiltered,
        humedad: humFiltered,
        presion: pressFiltered
      };
    }
    
    // Agregar metadatos de calidad
    data.server_timestamp = new Date();
    data.data_quality = {
      is_valid: validation.isValid,
      confidence: validation.confidence,
      errors: validation.errors,
      warnings: validation.warnings
    };
    
    // Guardar en MongoDB
    const result = await db.collection('sensor_readings').insertOne(data);
    
    console.log(`Guardado: ${result.insertedId} (${validation.confidence}% confianza)`);
    
    // Actualizar historial en memoria
    history.push({
      temperatura: data.datos.temperatura,
      presion: data.datos.presion,
      humedad: data.datos.humedad,
      timestamp: data.timestamp
    });

    // Análisis predictivo de Amira (no-blocking)
    if (amira && history.length >= 1) {
      amira.analyze(data, history).then(prediction => {
        if (prediction.alert_level !== 'safe') {
          console.log(`\nAMIRA [${data.unidad_id}] Riesgo: ${prediction.risk_score}% (${prediction.alert_level.toUpperCase()}) | Confort: ${prediction.comfort_index}/100`);
          prediction.current_risks.forEach(r => console.log(`  ! ${r.message}`));
          prediction.trend_risks.forEach(r => console.log(`  ~ ${r.message}`));
        }
      }).catch(err => console.error('Amira error:', err.message));
    }

    res.json({
      status: 'success',
      id: result.insertedId.toString(),
      confidence: validation.confidence,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    });
    
  } catch (error) {
    console.error('Error guardando datos:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});
=======
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
>>>>>>> dockcomp

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

<<<<<<< HEAD
// ESTADO DE TODOS LOS SENSORES
app.get('/api/sensors/status', async (req, res) => {
  try {
    const statusList = await monitor.getSensorStatus();
    res.json({
      total_sensors: statusList.length,
      sensors: statusList
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//  ALERTAS ACTIVAS
app.get('/api/alerts/active', async (req, res) => {
  try {
    const activeAlerts = await db.collection('ai_alerts')
      .find({ resolved_at: null })
      .sort({ timestamp: -1 })
      .toArray();
    
    res.json({
      count: activeAlerts.length,
      alerts: activeAlerts.map(a => ({
        ...a,
        _id: a._id.toString()
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// api para enviar cada 5 seg endpoint
app.get('/api/dashboard/all-data', async (req, res) => {
  try {
    // Obtener últimos datos de lecturas
    const latestReadings = await db.collection('sensor_readings')
      .aggregate([
        { $match: { "data_quality.is_valid": true } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$unidad_id",
            latest: { $first: "$$ROOT" }
          }
        }
      ]).toArray();

    // Obtener estado de todos los sensores
    const statusList = await monitor.getSensorStatus();
    
    // Obtener alertas activas
    const activeAlerts = await db.collection('ai_alerts')
      .find({ resolved_at: null })
      .sort({ timestamp: -1 })
      .toArray();

    res.json({
      timestamp: new Date().toISOString(),
      sensors: latestReadings.map(r => r.latest),
      status: statusList,
      alerts: activeAlerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: db ? 'connected' : 'disconnected',
    monitor: monitor ? 'running' : 'stopped',
    amira: amira ? 'running' : 'stopped',
    timestamp: new Date().toISOString()
  });
});

// ── ENDPOINTS DE AMIRA ────────────────────────────────────────────

// Riesgo actual de un dispositivo
app.get('/api/amira/risk/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    let prediction = await amira.getLatestRisk(unidad_id);

    if (!prediction) {
      const latestReading = await db.collection('sensor_readings')
        .findOne({ unidad_id, 'data_quality.is_valid': true }, { sort: { timestamp: -1 } });

      if (!latestReading) {
        return res.status(404).json({ error: 'No hay datos para este dispositivo' });
      }

      const history = await db.collection('sensor_readings')
        .find({ unidad_id, 'data_quality.is_valid': true })
        .sort({ timestamp: -1 }).limit(60).toArray();

      const historyFormatted = history.reverse().map(r => AmiraPredictor.flattenReading(r));
      prediction = await amira.analyze(latestReading, historyFormatted);
    }

    if (prediction._id) prediction._id = prediction._id.toString();
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Historial de predicciones
app.get('/api/amira/history/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    const { hours = 24 } = req.query;
    const history = await amira.getRiskHistory(unidad_id, parseInt(hours));
    res.json({
      unidad_id,
      period_hours: hours,
      count: history.length,
      predictions: history.map(p => ({ ...p, _id: p._id?.toString() }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alertas activas de Amira
app.get('/api/amira/alerts', async (req, res) => {
  try {
    const alerts = await amira.getActiveAlerts();
    res.json({
      total: alerts.length,
      critical_count: alerts.filter(a => a.alert_level === 'critical').length,
      warning_count:  alerts.filter(a => a.alert_level === 'warning').length,
      alerts: alerts.map(a => ({ ...a, _id: a._id?.toString() }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alertas con hash de blockchain
app.get('/api/amira/alerts/blockchain', async (req, res) => {
  try {
    const alerts = await db.collection('amira_predictions')
      .find({
        alert_level: { $in: ['warning', 'critical'] },
        'blockchain.tx_hash': { $exists: true }
      })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    res.json({
      count: alerts.length,
      alerts: alerts.map(a => ({
        _id:          a._id.toString(),
        unidad_id:    a.unidad_id,
        alert_level:  a.alert_level,
        risk_score:   a.risk_score,
        comfort_index: a.comfort_index,
        timestamp:    a.timestamp,
        tx_hash:      a.blockchain?.tx_hash,
        explorer_url: a.blockchain?.explorer_url,
        network:      a.blockchain?.network
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estado del modelo Amira para un dispositivo
app.get('/api/amira/status/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    const status = await amira.getModelStatus(unidad_id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Forzar análisis manual (útil para debug)
app.post('/api/amira/analyze/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    const latestReading = await db.collection('sensor_readings')
      .findOne({ unidad_id, 'data_quality.is_valid': true }, { sort: { timestamp: -1 } });

    if (!latestReading) {
      return res.status(404).json({ error: 'No hay datos válidos para analizar' });
    }

    const history = await db.collection('sensor_readings')
      .find({ unidad_id, 'data_quality.is_valid': true })
      .sort({ timestamp: -1 }).limit(60).toArray();

    const historyFormatted = history.reverse().map(r => AmiraPredictor.flattenReading(r));
    const prediction = await amira.analyze(latestReading, historyFormatted);

    res.json({ status: 'analyzed', prediction: { ...prediction, _id: undefined } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── ENDPOINTS DE SOLANA ───────────────────────────────────────────

// Info de la wallet del backend
app.get('/api/solana/wallet', async (req, res) => {
  try {
    const info = await amira.solanaLogger.getWalletInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verificar transacción en blockchain
app.get('/api/solana/verify/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    const result = await amira.solanaLogger.verifyTransaction(txHash);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === INICIAR SERVIDOR ===
connectDB().then(() => {
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('safeCareNeo Backend v1.2.0 — Amira + Solana');
    console.log('='.repeat(60));
    console.log(`Puerto: ${config.PORT}`);
    console.log(`Confianza mínima: ${config.MIN_CONFIDENCE_TO_SAVE}%`);
    console.log(`Timeout de sensor: ${process.env.SENSOR_TIMEOUT_SECONDS}s`);
    console.log('\nEndpoints disponibles:');
    console.log('   POST   /api/sensor-data');
    console.log('   GET    /api/sensor-data/latest/:unidad_id');
    console.log('   GET    /api/sensor-data/history/:unidad_id');
    console.log('   GET    /api/sensor-data/stats/:unidad_id');
    console.log('   GET    /api/sensor-health/:unidad_id');
    console.log('   GET    /api/sensors/status');
    console.log('   GET    /api/alerts/active');
    console.log('   GET    /api/dashboard/all-data');
    console.log('   --- Amira ---');
    console.log('   GET    /api/amira/risk/:unidad_id');
    console.log('   GET    /api/amira/history/:unidad_id');
    console.log('   GET    /api/amira/alerts');
    console.log('   GET    /api/amira/alerts/blockchain');
    console.log('   GET    /api/amira/status/:unidad_id');
    console.log('   POST   /api/amira/analyze/:unidad_id');
    console.log('   --- Solana ---');
    console.log('   GET    /api/solana/wallet');
    console.log('   GET    /api/solana/verify/:txHash');
    console.log('   GET    /health');
    console.log('='.repeat(60) + '\n');
  });
});

// Cerrar conexiones al terminar
process.on('SIGINT', async () => {
  console.log('\nCerrando servidor...');
  
  if (monitor) {
    monitor.stop();
  }
  
  await client.close();
  console.log('MongoDB desconectado');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (monitor) {
    monitor.stop();
  }
  await client.close();
  process.exit(0);
=======
// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 8000;
connectToDatabase().then(() => {
    app.listen(PORT, () => console.log(`SafeCareNeo Backend en puerto ${PORT}`));
>>>>>>> dockcomp
});