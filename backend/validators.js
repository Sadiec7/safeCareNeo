// validators.js
class SensorValidator {
  constructor(config = {}) {
    // Configuración de rangos (desde .env o defaults)
    this.ranges = {
      temperature: {
        min: config.TEMP_MIN || 15,
        max: config.TEMP_MAX || 35,
        idealMin: config.TEMP_IDEAL_MIN || 18,
        idealMax: config.TEMP_IDEAL_MAX || 28
      },
      humidity: {
        min: config.HUMIDITY_MIN || 20,
        max: config.HUMIDITY_MAX || 90,
        idealMin: config.HUMIDITY_IDEAL_MIN || 30,
        idealMax: config.HUMIDITY_IDEAL_MAX || 70
      },
      pressure: {
        min: config.PRESSURE_MIN || 900,
        max: config.PRESSURE_MAX || 1100
      }
    };
    
    this.maxTempChangePerSec = parseFloat(config.MAX_TEMP_CHANGE_PER_SECOND || 1.0);
    this.maxHumidityChangePerSec = parseFloat(config.MAX_HUMIDITY_CHANGE_PER_SECOND || 4.0);
    this.frozenThreshold = parseInt(config.FROZEN_SENSOR_THRESHOLD || 10);
  }
  
  // VALIDACIÓN PRINCIPAL
  validate(data, history = []) {
    const errors = [];
    const warnings = [];
    let confidence = 100;
    
    // 1. Validación estructural
    const structCheck = this.validateStructure(data);
    if (!structCheck.isValid) {
      return { isValid: false, errors: structCheck.errors, warnings, confidence: 0 };
    }
    
    const { temperatura, presion, humedad } = data.datos;
    
    // 2. Validación de rangos físicos
    const rangeValidation = this.validateRanges(temperatura, presion, humedad);
    confidence -= rangeValidation.penaltyPoints;
    errors.push(...rangeValidation.errors);
    warnings.push(...rangeValidation.warnings);
    
    // 3. Validación de timestamp
    const timeValidation = this.validateTimestamp(data.timestamp);
    confidence -= timeValidation.penaltyPoints;
    errors.push(...timeValidation.errors);
    
    // 4. Detección de sensor bloqueado/congelado
    if (history.length >= this.frozenThreshold) {
      const frozenCheck = this.detectFrozenSensor(history);
      if (frozenCheck.isFrozen) {
        errors.push('CRÍTICO: Sensor bloqueado - valores idénticos detectados');
        confidence -= 60;
      }
    }
    
    // 5. Detección de cambios bruscos
    if (history.length >= 2) {
      const spikeCheck = this.detectSpikes(data, history);
      confidence -= spikeCheck.penaltyPoints;
      errors.push(...spikeCheck.errors);
      warnings.push(...spikeCheck.warnings);
    }
    
    // 6. Correlación entre variables (física)
    const correlationCheck = this.validateCorrelation(temperatura, humedad);
    confidence -= correlationCheck.penaltyPoints;
    warnings.push(...correlationCheck.warnings);
    
    // 7. Decisión final
    confidence = Math.max(0, confidence);
    const hascritical = errors.some(e => e.includes('CRÍTICO') || e.includes('imposible'));
    
    return {
      isValid,
      confidence,
      errors,
      warnings
    };
  }
  
  // === VALIDACIONES ESPECÍFICAS ===
  
  validateStructure(data) {
    const errors = [];
    
    if (!data.unidad_id) errors.push('Falta unidad_id');
    if (!data.timestamp) errors.push('Falta timestamp');
    if (!data.datos) errors.push('Falta objeto datos');
    if (data.datos) {
      if (data.datos.temperatura === undefined || data.datos.temperatura === null) {
        errors.push('Falta temperatura');
      }
      if (data.datos.presion === undefined || data.datos.presion === null) {
        errors.push('Falta presión');
      }
      if (data.datos.humedad === undefined || data.datos.humedad === null) {
        errors.push('Falta humedad');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  validateRanges(temp, pressure, humidity) {
    const errors = [];
    const warnings = [];
    let penaltyPoints = 0;
    
    // Temperatura
    if (temp < this.ranges.temperature.min || temp > this.ranges.temperature.max) {
      errors.push(`CRÍTICO: Temperatura imposible: ${temp}°C (rango: ${this.ranges.temperature.min}-${this.ranges.temperature.max}°C)`);
      penaltyPoints += 50;
    } else if (temp < this.ranges.temperature.idealMin || temp > this.ranges.temperature.idealMax) {
      warnings.push(`Temperatura fuera del rango ideal: ${temp}°C (ideal: ${this.ranges.temperature.idealMin}-${this.ranges.temperature.idealMax}°C)`);
      penaltyPoints += 10;
    }
    
    // Humedad
    if (humidity < 0 || humidity > 100) {
      errors.push(`CRÍTICO: Humedad imposible: ${humidity}% (debe estar entre 0-100%)`);
      penaltyPoints += 50;
    } else if (humidity < this.ranges.humidity.min || humidity > this.ranges.humidity.max) {
      errors.push(`Humedad fuera de rango: ${humidity}% (rango: ${this.ranges.humidity.min}-${this.ranges.humidity.max}%)`);
      penaltyPoints += 30;
    } else if (humidity < this.ranges.humidity.idealMin || humidity > this.ranges.humidity.idealMax) {
      warnings.push(`Humedad fuera del rango ideal: ${humidity}% (ideal: ${this.ranges.humidity.idealMin}-${this.ranges.humidity.idealMax}%)`);
      penaltyPoints += 10;
    }
    
    // Presión
    if (pressure < this.ranges.pressure.min || pressure > this.ranges.pressure.max) {
      errors.push(`Presión fuera de rango: ${pressure} hPa (rango: ${this.ranges.pressure.min}-${this.ranges.pressure.max} hPa)`);
      penaltyPoints += 30;
    }
    
    return { errors, warnings, penaltyPoints };
  }
  
  validateTimestamp(timestamp) {
    const errors = [];
    let penaltyPoints = 0;
    
    const now = Math.floor(Date.now() / 1000);
    const timeDiff = timestamp - now;
    const absTimeDiff = Math.abs(timeDiff);
    
    // Timestamp del futuro
    if (timeDiff > 60) {
      errors.push(`CRÍTICO: Timestamp del futuro: ${timeDiff}s adelantado`);
      penaltyPoints += 40;
    }
    // Timestamp muy antiguo
    else if (absTimeDiff > 3600) {
      errors.push(`Timestamp muy antiguo: ${absTimeDiff}s de diferencia`);
      penaltyPoints += 25;
    }
    // Pequeña diferencia (aceptable, solo advertencia)
    else if (absTimeDiff > 300) {
      penaltyPoints += 5;
    }
    
    return { errors, penaltyPoints };
  }
  
  detectFrozenSensor(history) {
    // Tomar las últimas N lecturas según threshold
    const recent = history.slice(-this.frozenThreshold);
    
    if (recent.length < this.frozenThreshold) {
      return { isFrozen: false };
    }
    
    const first = recent[0];
    
    // Verificar si TODAS las lecturas son EXACTAMENTE iguales
    const allIdentical = recent.every(reading =>
      reading.temperatura === first.temperatura &&
      reading.presion === first.presion &&
      reading.humedad === first.humedad
    );
    
    return { isFrozen: allIdentical };
  }
  
  detectSpikes(currentData, history) {
    const errors = [];
    const warnings = [];
    let penaltyPoints = 0;
    
    const current = currentData.datos;
    const previous = history[history.length - 1];
    
    // Calcular diferencia de tiempo
    const timeDelta = currentData.timestamp - previous.timestamp;
    
    if (timeDelta <= 0) {
      errors.push('CRÍTICO: Timestamp no avanza - posible reloj del ESP32 roto');
      return { errors, warnings, penaltyPoints: 50 };
    }
    
    // Cambio de temperatura
    const tempChange = Math.abs(current.temperatura - previous.temperatura);
    const maxTempChange = this.maxTempChangePerSec * timeDelta;
    
    if (tempChange > maxTempChange && timeDelta < 30) {
      errors.push(`CRÍTICO: Cambio brusco de temperatura: ${tempChange.toFixed(2)}°C en ${timeDelta}s (máx permitido: ${maxTempChange.toFixed(2)}°C)`);
      penaltyPoints += 40;
    }
    
    // Cambio de humedad
    const humidityChange = Math.abs(current.humedad - previous.humedad);
    const maxHumidityChange = this.maxHumidityChangePerSec * timeDelta;
    
    if (humidityChange > maxHumidityChange && timeDelta < 30) {
      errors.push(`CRÍTICO: Cambio brusco de humedad: ${humidityChange.toFixed(2)}% en ${timeDelta}s (máx permitido: ${maxHumidityChange.toFixed(2)}%)`);
      penaltyPoints += 35;
    }
    
    // Cambio de presión (más lento que temp/humedad)
    const pressureChange = Math.abs(current.presion - previous.presion);
    if (pressureChange > 10 && timeDelta < 60) {
      warnings.push(`Cambio rápido de presión: ${pressureChange.toFixed(2)} hPa en ${timeDelta}s`);
      penaltyPoints += 10;
    }
    
    return { errors, warnings, penaltyPoints };
  }
  
  validateCorrelation(temp, humidity) {
    const warnings = [];
    let penaltyPoints = 0;
    
    // Temperatura muy baja + humedad muy alta = condensación (sospechoso en interior)
    if (temp < 16 && humidity > 85) {
      warnings.push('Combinación sospechosa: temperatura muy baja con humedad muy alta (posible condensación)');
      penaltyPoints += 15;
    }
    
    // Temperatura muy alta + humedad muy alta (poco común en interiores)
    if (temp > 30 && humidity > 80) {
      warnings.push('Combinación inusual: temperatura y humedad muy altas simultáneamente');
      penaltyPoints += 10;
    }
    
    // Temperatura muy alta + humedad muy baja (ambiente muy seco)
    if (temp > 28 && humidity < 25) {
      warnings.push('Ambiente muy seco: considerar humidificador');
      penaltyPoints += 5;
    }
    
    return { warnings, penaltyPoints };
  }
  
  // FILTRO DE MEDIANA MÓVIL
  applyMedianFilter(history, field) {
    if (history.length < 5) return null;
    
    const values = history.slice(-5).map(r => r[field]);
    values.sort((a, b) => a - b);
    
    return values[2]; // Valor mediano (posición 2 de 5 elementos)
  }
}

module.exports = SensorValidator;