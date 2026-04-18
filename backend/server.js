require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const SensorValidator = require('./validators');
const SensorMonitor = require('./sensorMonitor');

const app = express();
app.use(express.json());
app.use(cors());

// Configuración desde .env
const config = {
  MONGODB_URI: process.env.MONGODB_URI,
  PORT: process.env.PORT || 8000,
  MIN_CONFIDENCE_TO_SAVE: parseInt(process.env.MIN_CONFIDENCE_TO_SAVE || 50),
  // Pasar toda la config al validator
  ...process.env
};

// MongoDB Client
const client = new MongoClient(config.MONGODB_URI);
let db;

// Validator y Monitor
const validator = new SensorValidator(config);
let monitor;

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

//  OBTENER ÚLTIMA LECTURA
app.get('/api/sensor-data/latest/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    
    const reading = await db.collection('sensor_readings')
      .findOne(
        { 
          unidad_id,
          "data_quality.is_valid": true 
        },
        { sort: { timestamp: -1 } }
      );
    
    if (!reading) {
      return res.status(404).json({ 
        error: 'No hay datos válidos para este dispositivo' 
      });
    }
    
    reading._id = reading._id.toString();
    res.json(reading);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HISTORIAL DE LECTURAS
app.get('/api/sensor-data/history/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    const { hours = 24, limit = 100 } = req.query;
    
    const startTimestamp = Math.floor(Date.now() / 1000) - (hours * 3600);
    
    const readings = await db.collection('sensor_readings')
      .find({
        unidad_id,
        timestamp: { $gte: startTimestamp },
        "data_quality.is_valid": true
      })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();
    
    res.json({
      unidad_id,
      period_hours: hours,
      count: readings.length,
      readings: readings.map(r => ({
        ...r,
        _id: r._id.toString()
      }))
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ESTADÍSTICAS
app.get('/api/sensor-data/stats/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    const { hours = 24 } = req.query;
    
    const startTimestamp = Math.floor(Date.now() / 1000) - (hours * 3600);
    
    const stats = await db.collection('sensor_readings').aggregate([
      {
        $match: {
          unidad_id,
          timestamp: { $gte: startTimestamp },
          "data_quality.is_valid": true
        }
      },
      {
        $group: {
          _id: null,
          temp_promedio: { $avg: "$datos.temperatura" },
          temp_min: { $min: "$datos.temperatura" },
          temp_max: { $max: "$datos.temperatura" },
          humedad_promedio: { $avg: "$datos.humedad" },
          humedad_min: { $min: "$datos.humedad" },
          humedad_max: { $max: "$datos.humedad" },
          presion_promedio: { $avg: "$datos.presion" },
          presion_min: { $min: "$datos.presion" },
          presion_max: { $max: "$datos.presion" },
          confianza_promedio: { $avg: "$data_quality.confidence" },
          total_lecturas: { $sum: 1 }
        }
      }
    ]).toArray();
    
    if (stats.length === 0) {
      return res.status(404).json({ 
        error: 'No hay datos para calcular estadísticas' 
      });
    }
    
    res.json({
      unidad_id,
      period_hours: hours,
      estadisticas: {
        temperatura: {
          promedio: parseFloat(stats[0].temp_promedio.toFixed(2)),
          minima: stats[0].temp_min,
          maxima: stats[0].temp_max,
          unidad: "°C"
        },
        humedad: {
          promedio: parseFloat(stats[0].humedad_promedio.toFixed(2)),
          minima: stats[0].humedad_min,
          maxima: stats[0].humedad_max,
          unidad: "%"
        },
        presion: {
          promedio: parseFloat(stats[0].presion_promedio.toFixed(2)),
          minima: stats[0].presion_min,
          maxima: stats[0].presion_max,
          unidad: "hPa"
        },
        calidad: {
          confianza_promedio: parseFloat(stats[0].confianza_promedio.toFixed(2)),
          total_lecturas: stats[0].total_lecturas
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SALUD DEL SENSOR
app.get('/api/sensor-health/:unidad_id', async (req, res) => {
  try {
    const { unidad_id } = req.params;
    
    // Últimas 50 lecturas
    const recentReadings = await db.collection('sensor_readings')
      .find({ unidad_id })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
    
    if (recentReadings.length === 0) {
      return res.status(404).json({ error: 'No hay datos para este dispositivo' });
    }
    
    // Métricas de salud
    const validReadings = recentReadings.filter(r => r.data_quality?.is_valid);
    const avgConfidence = validReadings.reduce((sum, r) => 
      sum + (r.data_quality?.confidence || 0), 0) / validReadings.length;
    
    const rejectedCount = recentReadings.length - validReadings.length;
    const rejectionRate = (rejectedCount / recentReadings.length) * 100;
    
    const lastReading = recentReadings[0];
    const now = Math.floor(Date.now() / 1000);
    const timeSince = now - lastReading.timestamp;
    
    // Determinar estado
    let healthStatus = 'healthy';
    let healthIssues = [];
    
    if (timeSince > 60) {
      healthStatus = 'offline';
      healthIssues.push(`Sin datos por ${timeSince} segundos`);
    } else if (rejectionRate > 30) {
      healthStatus = 'critical';
      healthIssues.push(`${rejectionRate.toFixed(1)}% de lecturas rechazadas`);
    } else if (avgConfidence < 70) {
      healthStatus = 'degraded';
      healthIssues.push('Baja confianza promedio en lecturas');
    } else if (rejectionRate > 10) {
      healthStatus = 'warning';
      healthIssues.push(`${rejectionRate.toFixed(1)}% de lecturas rechazadas`);
    }
    
    res.json({
      unidad_id,
      health_status: healthStatus,
      metrics: {
        average_confidence: parseFloat(avgConfidence.toFixed(2)),
        valid_readings: validReadings.length,
        rejected_readings: rejectedCount,
        rejection_rate: parseFloat(rejectionRate.toFixed(2)),
        total_readings_analyzed: recentReadings.length,
        seconds_since_last_reading: timeSince
      },
      issues: healthIssues,
      last_reading: lastReading.data_quality?.is_valid ? {
        temperatura: lastReading.datos.temperatura,
        humedad: lastReading.datos.humedad,
        presion: lastReading.datos.presion,
        timestamp: lastReading.timestamp,
        confidence: lastReading.data_quality.confidence
      } : null
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    timestamp: new Date().toISOString()
  });
});

// === INICIAR SERVIDOR ===
connectDB().then(() => {
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('safeCareNeo Backend ROBUSTO');
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
});