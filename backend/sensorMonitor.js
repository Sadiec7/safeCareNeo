// sensorMonitor.js
class SensorMonitor {
  constructor(db, config = {}) {
    this.db = db;
    this.timeout = parseInt(config.SENSOR_TIMEOUT_SECONDS || 60);
    this.alerts = new Map(); // Almacenar alertas activas
    this.checkInterval = null;
  }
  
  // Iniciar monitoreo continuo
  start() {
    console.log(`Monitor de sensores iniciado (timeout: ${this.timeout}s)`);
    
    // Verificar cada 15 segundos
    this.checkInterval = setInterval(() => {
      this.checkAllSensors();
    }, 15000);
  }
  
  // Detener monitoreo
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      console.log('Monitor de sensores detenido');
    }
  }
  
  // Verificar todos los sensores registrados
  async checkAllSensors() {
    try {
      // Obtener lista de dispositivos únicos
      const devices = await this.db.collection('sensor_readings')
        .distinct('unidad_id');
      
      const now = Math.floor(Date.now() / 1000);
      
      for (const device of devices) {
        // Obtener última lectura
        const lastReading = await this.db.collection('sensor_readings')
          .findOne(
            { unidad_id: device },
            { sort: { timestamp: -1 } }
          );
        
        if (lastReading) {
          const timeSinceLastReading = now - lastReading.timestamp;
          
          // Si no hay datos recientes
          if (timeSinceLastReading > this.timeout) {
            await this.raiseDisconnectionAlert(device, timeSinceLastReading);
          } else {
            await this.clearDisconnectionAlert(device);
          }
        }
      }
    } catch (error) {
      console.error('Error en monitoreo de sensores:', error);
    }
  }
  
  // Generar alerta de desconexión
  async raiseDisconnectionAlert(deviceId, secondsOffline) {
    const alertKey = `disconnection_${deviceId}`;
    
    // Si ya hay una alerta activa, no duplicar
    if (this.alerts.has(alertKey)) {
      return;
    }
    
    console.log(`ALERTA: Sensor ${deviceId} sin datos por ${secondsOffline}s`);
    
    this.alerts.set(alertKey, {
      device_id: deviceId,
      type: 'sensor_disconnection',
      raised_at: new Date(),
      seconds_offline: secondsOffline
    });
    
    // Guardar en base de datos
    await this.db.collection('ai_alerts').insertOne({
      timestamp: new Date(),
      device_id: deviceId,
      alert_type: 'sensor_disconnection',
      severity: 'high',
      detection: {
        seconds_offline: secondsOffline,
        threshold: this.timeout
      },
      notification_sent: false,
      resolved_at: null
    });
  }
  
  // Limpiar alerta cuando el sensor vuelve
  async clearDisconnectionAlert(deviceId) {
    const alertKey = `disconnection_${deviceId}`;
    
    if (this.alerts.has(alertKey)) {
      console.log(`Sensor ${deviceId} reconectado`);
      this.alerts.delete(alertKey);
      
      // Marcar alertas como resueltas en BD
      await this.db.collection('ai_alerts').updateMany(
        {
          device_id: deviceId,
          alert_type: 'sensor_disconnection',
          resolved_at: null
        },
        {
          $set: { resolved_at: new Date() }
        }
      );
    }
  }
  
  // Obtener estado de todos los sensores
  async getSensorStatus() {
    const devices = await this.db.collection('sensor_readings')
      .distinct('unidad_id');
    
    const now = Math.floor(Date.now() / 1000);
    const statusList = [];
    
    for (const device of devices) {
      const lastReading = await this.db.collection('sensor_readings')
        .findOne(
          { unidad_id: device },
          { sort: { timestamp: -1 } }
        );
      
      if (lastReading) {
        const timeSince = now - lastReading.timestamp;
        
        statusList.push({
          device_id: device,
          status: timeSince <= this.timeout ? 'online' : 'offline',
          seconds_since_last_reading: timeSince,
          last_reading_timestamp: lastReading.timestamp
        });
      }
    }
    
    return statusList;
  }
}

module.exports = SensorMonitor;