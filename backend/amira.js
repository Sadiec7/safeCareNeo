// ═══════════════════════════════════════════════════════════════
// AmiraPredictor v1.2.0 — Motor predictivo de riesgos neonatales
// safeCareNeo · reglas clínicas + aprendizaje incremental + Solana
//
// Correcciones aplicadas vs v1.0.0:
//   [FIX-1] Welford ahora actualiza temperatura, humedad Y presión
//   [FIX-2] _updateLearnedParams recibe currentValues separado de features
//   [FIX-3] Contrato de history unificado: objetos planos { temperatura, humedad, presion, timestamp }
//   [FIX-4] Validación de datos de sensor antes de analizar (NaN, rangos imposibles)
//   [FIX-5] Fallback en memoria si MongoDB falla — Z-scores siguen funcionando
//
// Mejoras aplicadas:
//   [MEJ-1] Detección de sensor muerto (valor congelado por N lecturas)
//   [MEJ-2] Riesgo combinado: hipotermia + humedad alta = penalidad extra
//   [MEJ-3] Índice de confort neonatal (0–100) en cada predicción
//   [MEJ-4] Límite de tamaño en history antes de slicing (guard de memoria)
//   [MEJ-5] EMA (exponential moving average) como feature adicional de tendencia
//   [MEJ-6] Integración con SolanaLogger — alertas warning/critical se registran en blockchain
// ═══════════════════════════════════════════════════════════════

'use strict';

const SolanaLogger = require('./solanaLogger');

class AmiraPredictor {
  constructor(db, config = {}) {
    this.db = db;

    // ── Umbrales clínicos basados en literatura neonatal ──────────
    this.clinicalThresholds = {
      temperatura: {
        hypothermia_critical:  35.5,
        hypothermia_warning:   36.0,
        normal_min:            36.5,
        normal_max:            37.5,
        hyperthermia_warning:  37.8,
        hyperthermia_critical: 38.0
      },
      humedad: {
        critical_low:  30,
        warning_low:   40,
        optimal_min:   50,
        optimal_max:   70,
        warning_high:  75,
        critical_high: 80
      },
      presion: {
        warning_low:  980,
        normal_min:   990,
        normal_max:   1030,
        warning_high: 1040
      }
    };

    // ── Rangos de validación del sensor ──────────────────────────
    // [FIX-4] Rechazar lecturas físicamente imposibles
    this.sensorLimits = {
      temperatura: { min: 10,  max: 50  },  // °C — fuera de esto es fallo de sensor
      humedad:     { min: 0,   max: 100 },
      presion:     { min: 800, max: 1100 }  // hPa — cubre altitudes extremas
    };

    // Parámetros aprendidos por dispositivo (cache en memoria)
    // [FIX-5] Si Mongo falla, este Map sigue sirviendo los parámetros del run actual
    this.learnedParams = new Map();

    // Ventanas de análisis (lecturas cada ~30 s)
    this.WINDOW_SHORT  = 5;   // ~2.5 min
    this.WINDOW_MEDIUM = 20;  // ~10 min
    this.WINDOW_LONG   = 60;  // ~30 min

    // Mínimo de datos para activar predicción de tendencia
    this.MIN_READINGS_FOR_TREND = 5;

    // [MEJ-1] Lecturas consecutivas idénticas para declarar sensor muerto
    this.FROZEN_SENSOR_THRESHOLD = config.frozenSensorThreshold ?? 8;

    // [MEJ-5] Factor de suavizado para EMA (0 < α ≤ 1)
    this.EMA_ALPHA = config.emaAlpha ?? 0.3;

    // [MEJ-4] Límite máximo de history que se procesa (guard de memoria)
    this.MAX_HISTORY = config.maxHistory ?? 500;

    this.solanaLogger = new SolanaLogger(config);
    console.log('Amira v1.2.0 iniciada — reglas clínicas + trazabilidad Solana');
  }

  // ═══════════════════════════════════════════════════════════════
  // PUNTO DE ENTRADA PRINCIPAL
  // ═══════════════════════════════════════════════════════════════

  /**
   * Analiza una lectura de sensor y produce una predicción de riesgo.
   *
   * @param {Object} sensorData  - { unidad_id, timestamp, datos: { temperatura, humedad, presion } }
   * @param {Array}  history     - Array de lecturas pasadas en formato plano:
   *                               [{ temperatura, humedad, presion, timestamp }, ...]
   *                               ordenadas de más antigua a más reciente.
   *                               [FIX-3] Formato unificado — siempre plano, sin .datos anidado.
   * @returns {Object} prediction
   */
  async analyze(sensorData, history = []) {
    const unidad_id = sensorData.unidad_id;

    // [FIX-4] Validar datos del sensor antes de cualquier cálculo
    const validation = this._validateSensorData(sensorData.datos);
    if (!validation.valid) {
      return this._buildSensorErrorPrediction(unidad_id, validation.errors, sensorData.datos);
    }

    const { temperatura, humedad, presion } = sensorData.datos;

    // [MEJ-4] Limitar history para proteger memoria
    const safeHistory = history.length > this.MAX_HISTORY
      ? history.slice(-this.MAX_HISTORY)
      : history;

    // 1. Extraer features (tendencias, variabilidad, Z-scores, EMA)
    const features = this._extractFeatures(sensorData, safeHistory);

    // 2. Evaluar riesgos actuales (reglas clínicas puras)
    const currentRisks = this._evaluateCurrentRisks(temperatura, humedad, presion);

    // 3. Riesgos combinados (interacciones entre variables)
    // [MEJ-2] Hipotermia + humedad alta = riesgo mayor al esperado por separado
    const combinedRisks = this._evaluateCombinedRisks(temperatura, humedad, currentRisks);

    // 4. Predecir tendencias (solo si hay suficiente historial)
    const trendRisks = safeHistory.length >= this.MIN_READINGS_FOR_TREND
      ? this._evaluateTrends(features, temperatura, humedad, presion)
      : [];

    // 5. [MEJ-1] Detección de sensor congelado
    const frozenRisks = this._detectFrozenSensor(sensorData.datos, safeHistory);

    // 6. Score de riesgo global (0–100)
    const allRisks = [...currentRisks, ...combinedRisks, ...trendRisks, ...frozenRisks];
    const riskScore = this._calculateRiskScore(allRisks);

    // 7. Nivel de alerta
    const alertLevel = this._determineAlertLevel(riskScore, currentRisks, combinedRisks);

    // 8. Recomendaciones clínicas
    const recommendations = this._generateRecommendations(
      currentRisks, combinedRisks, trendRisks, frozenRisks, features
    );

    // 9. [MEJ-3] Índice de confort neonatal (0–100, mayor = mejor)
    const comfortIndex = this._calculateComfortIndex(temperatura, humedad, presion);

    // 10. Aprendizaje incremental
    // [FIX-1] [FIX-2] Ahora pasa currentValues correctamente separado de features
    await this._updateLearnedParams(unidad_id, sensorData.datos, features);

    const prediction = {
      timestamp:         new Date(),
      unidad_id,
      risk_score:        riskScore,
      alert_level:       alertLevel,
      comfort_index:     comfortIndex,           // [MEJ-3]
      current_risks:     currentRisks,
      combined_risks:    combinedRisks,          // [MEJ-2]
      trend_risks:       trendRisks,
      frozen_risks:      frozenRisks,            // [MEJ-1]
      features: {
        temp_trend_per_min:     features.tempTrendPerMin,
        humidity_trend_per_min: features.humidityTrendPerMin,
        pressure_trend_per_min: features.pressureTrendPerMin,
        temp_variability:       features.tempVariability,
        temp_zscore:            features.tempZscore,
        humidity_zscore:        features.humidityZscore,
        temp_ema:               features.tempEma,        // [MEJ-5]
        humidity_ema:           features.humidityEma     // [MEJ-5]
      },
      recommendations,
      horizon_minutes:   10,
      data_points_used:  safeHistory.length,
      model_version:     '1.1.0-clinical-rules'
    };

    // 11. Persistir si es relevante
    if (alertLevel !== 'safe' || riskScore > 20) {
      await this._savePrediction(prediction);
    }

    return prediction;
  }

  // ═══════════════════════════════════════════════════════════════
  // [FIX-4] VALIDACIÓN DE DATOS DEL SENSOR
  // ═══════════════════════════════════════════════════════════════

  _validateSensorData(datos) {
    const errors = [];

    for (const [field, limits] of Object.entries(this.sensorLimits)) {
      const value = datos[field];

      if (value === undefined || value === null) {
        errors.push(`${field}: valor ausente`);
        continue;
      }
      if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
        errors.push(`${field}: valor no numérico (${value})`);
        continue;
      }
      if (value < limits.min || value > limits.max) {
        errors.push(`${field}: ${value} fuera de rango físico [${limits.min}, ${limits.max}]`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  _buildSensorErrorPrediction(unidad_id, errors, rawDatos) {
    return {
      timestamp:      new Date(),
      unidad_id,
      risk_score:     100,
      alert_level:    'critical',
      comfort_index:  0,
      current_risks: [{
        type:     'sensor_error',
        severity: 'critical',
        message:  `Datos de sensor inválidos: ${errors.join(' | ')}`,
        penalty:  100,
        raw:      rawDatos
      }],
      combined_risks:  [],
      trend_risks:     [],
      frozen_risks:    [],
      features:        {},
      recommendations: [
        'URGENTE: Verificar conexión y funcionamiento del sensor BME280',
        'Inspeccionar cableado I2C y alimentación del dispositivo',
        'Confirmar dirección I2C correcta (0x76 o 0x77)',
        'Revisar logs del firmware por errores de lectura'
      ],
      horizon_minutes:  0,
      data_points_used: 0,
      model_version:    '1.1.0-clinical-rules',
      sensor_errors:    errors
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // EXTRACCIÓN DE FEATURES
  // ═══════════════════════════════════════════════════════════════

  /**
   * [FIX-3] history se espera en formato plano:
   * [{ temperatura, humedad, presion, timestamp }, ...]
   * El llamador es responsable de "aplanar" sensorData antes de agregar a history.
   */
  _extractFeatures(currentData, history) {
    const current = currentData.datos;

    const features = {
      tempTrendPerMin:     0,
      humidityTrendPerMin: 0,
      pressureTrendPerMin: 0,
      tempVariability:     0,
      humidityVariability: 0,
      tempZscore:          0,
      humidityZscore:      0,
      tempEma:             current.temperatura,  // [MEJ-5]
      humidityEma:         current.humedad,      // [MEJ-5]
      isRapidCooling:      false,
      isRapidHeating:      false,
      isHumiditySpike:     false
    };

    if (history.length < 2) return features;

    // Tendencia lineal (regresión mínimos cuadrados) — ventana corta
    const shortWindow = history.slice(-this.WINDOW_SHORT);
    if (shortWindow.length >= 2) {
      features.tempTrendPerMin     = this._linearTrend(shortWindow, 'temperatura');
      features.humidityTrendPerMin = this._linearTrend(shortWindow, 'humedad');
      features.pressureTrendPerMin = this._linearTrend(shortWindow, 'presion');
    }

    // Variabilidad (desviación estándar) — ventana media
    const medWindow = history.slice(-this.WINDOW_MEDIUM);
    if (medWindow.length >= 3) {
      features.tempVariability     = this._stdDev(medWindow.map(r => r.temperatura));
      features.humidityVariability = this._stdDev(medWindow.map(r => r.humedad));
    }

    // [MEJ-5] EMA sobre ventana corta (más reactiva que la media simple)
    const shortTemps    = shortWindow.map(r => r.temperatura);
    const shortHumidity = shortWindow.map(r => r.humedad);
    features.tempEma     = this._ema(shortTemps,    this.EMA_ALPHA, current.temperatura);
    features.humidityEma = this._ema(shortHumidity, this.EMA_ALPHA, current.humedad);

    // Z-score vs estadísticas aprendidas del dispositivo
    const learned = this.learnedParams.get(currentData.unidad_id);
    if (learned) {
      if (learned.tempStd > 0) {
        features.tempZscore = (current.temperatura - learned.tempMean) / learned.tempStd;
      }
      if (learned.humStd > 0) {
        features.humidityZscore = (current.humedad - learned.humMean) / learned.humStd;
      }
    }

    // Flags de cambio rápido
    features.isRapidCooling  = features.tempTrendPerMin < -0.5;
    features.isRapidHeating  = features.tempTrendPerMin >  0.5;
    features.isHumiditySpike = Math.abs(features.humidityTrendPerMin) > 3;

    return features;
  }

  // Regresión lineal simple → pendiente en unidades/minuto
  _linearTrend(window, field) {
    if (window.length < 2) return 0;

    const n = window.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const t0 = new Date(window[0].timestamp).getTime();

    for (let i = 0; i < n; i++) {
      const x = (new Date(window[i].timestamp).getTime() - t0) / 60000; // minutos
      const y = window[i][field];
      sumX  += x;
      sumY  += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return 0;

    return (n * sumXY - sumX * sumY) / denom;
  }

  _stdDev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  // [MEJ-5] Exponential Moving Average
  _ema(values, alpha, currentValue) {
    if (values.length === 0) return currentValue;
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
      ema = alpha * values[i] + (1 - alpha) * ema;
    }
    // Incorporar lectura actual
    return alpha * currentValue + (1 - alpha) * ema;
  }

  // ═══════════════════════════════════════════════════════════════
  // EVALUACIÓN DE RIESGOS ACTUALES (reglas clínicas)
  // ═══════════════════════════════════════════════════════════════

  _evaluateCurrentRisks(temp, humidity, pressure) {
    const risks = [];
    const T = this.clinicalThresholds;

    // ── Temperatura ───────────────────────────────────────────────
    if (temp < T.temperatura.hypothermia_critical) {
      risks.push({
        type:     'hypothermia',
        severity: 'critical',
        value:    temp,
        message:  `Hipotermia severa: ${temp}°C (crítico < ${T.temperatura.hypothermia_critical}°C)`,
        penalty:  60
      });
    } else if (temp < T.temperatura.hypothermia_warning) {
      risks.push({
        type:     'hypothermia',
        severity: 'warning',
        value:    temp,
        message:  `Riesgo de hipotermia: ${temp}°C (alerta < ${T.temperatura.hypothermia_warning}°C)`,
        penalty:  30
      });
    } else if (temp > T.temperatura.hyperthermia_critical) {
      risks.push({
        type:     'hyperthermia',
        severity: 'critical',
        value:    temp,
        message:  `Hipertermia crítica: ${temp}°C (neonato: cualquier fiebre es urgente)`,
        penalty:  65
      });
    } else if (temp > T.temperatura.hyperthermia_warning) {
      risks.push({
        type:     'hyperthermia',
        severity: 'warning',
        value:    temp,
        message:  `Temperatura elevada: ${temp}°C (alerta > ${T.temperatura.hyperthermia_warning}°C)`,
        penalty:  25
      });
    }

    // ── Humedad ───────────────────────────────────────────────────
    if (humidity < T.humedad.critical_low) {
      risks.push({
        type:     'humidity_low',
        severity: 'critical',
        value:    humidity,
        message:  `Humedad críticamente baja: ${humidity}% — riesgo de pérdida de calor transdérmica`,
        penalty:  45
      });
    } else if (humidity < T.humedad.warning_low) {
      risks.push({
        type:     'humidity_low',
        severity: 'warning',
        value:    humidity,
        message:  `Humedad baja: ${humidity}% — monitorear resecamiento de piel`,
        penalty:  20
      });
    } else if (humidity > T.humedad.critical_high) {
      risks.push({
        type:     'humidity_high',
        severity: 'critical',
        value:    humidity,
        message:  `Humedad críticamente alta: ${humidity}% — riesgo de infección fúngica`,
        penalty:  45
      });
    } else if (humidity > T.humedad.warning_high) {
      risks.push({
        type:     'humidity_high',
        severity: 'warning',
        value:    humidity,
        message:  `Humedad alta: ${humidity}% — condiciones favorables para hongos`,
        penalty:  20
      });
    }

    // ── Presión ───────────────────────────────────────────────────
    if (pressure < T.presion.warning_low) {
      risks.push({
        type:     'pressure_low',
        severity: 'warning',
        value:    pressure,
        message:  `Presión baja: ${pressure} hPa — verificar altitud o sensor`,
        penalty:  15
      });
    } else if (pressure > T.presion.warning_high) {
      risks.push({
        type:     'pressure_high',
        severity: 'warning',
        value:    pressure,
        message:  `Presión alta: ${pressure} hPa — verificar sensor`,
        penalty:  15
      });
    }

    return risks;
  }

  // ═══════════════════════════════════════════════════════════════
  // [MEJ-2] RIESGOS COMBINADOS (interacciones entre variables)
  // ═══════════════════════════════════════════════════════════════

  _evaluateCombinedRisks(temp, humidity, currentRisks) {
    const risks = [];
    const types = new Set(currentRisks.map(r => r.type));

    // Hipotermia + humedad alta = pérdida de calor acelerada por evaporación
    // La combinación es clínicamente más grave que cada factor por separado
    if (
      (types.has('hypothermia')) &&
      (types.has('humidity_high') || humidity > this.clinicalThresholds.humedad.warning_high - 5)
    ) {
      risks.push({
        type:     'combined_hypothermia_humidity',
        severity: 'critical',
        value:    { temperatura: temp, humedad: humidity },
        message:  `Riesgo combinado: hipotermia (${temp}°C) + humedad elevada (${humidity}%) — pérdida de calor acelerada por evaporación`,
        penalty:  25  // Penalidad adicional sobre los riesgos individuales
      });
    }

    // Hipertermia + humedad alta = riesgo de hipertermia + infección fúngica simultáneos
    if (types.has('hyperthermia') && types.has('humidity_high')) {
      risks.push({
        type:     'combined_hyperthermia_humidity',
        severity: 'critical',
        value:    { temperatura: temp, humedad: humidity },
        message:  `Riesgo combinado: hipertermia (${temp}°C) + humedad alta (${humidity}%) — ambiente de máximo riesgo infeccioso`,
        penalty:  20
      });
    }

    // Temperatura normal pero humedad fuera de rango = riesgo silencioso
    const tempOk = temp >= this.clinicalThresholds.temperatura.normal_min &&
                   temp <= this.clinicalThresholds.temperatura.normal_max;
    if (tempOk && types.has('humidity_low') && humidity < this.clinicalThresholds.humedad.warning_low) {
      risks.push({
        type:     'compensated_humidity_risk',
        severity: 'watch',
        value:    { temperatura: temp, humedad: humidity },
        message:  `Temperatura normal pero humedad baja (${humidity}%) — riesgo de pérdida insensible de agua a largo plazo`,
        penalty:  10
      });
    }

    return risks;
  }

  // ═══════════════════════════════════════════════════════════════
  // [MEJ-1] DETECCIÓN DE SENSOR CONGELADO
  // ═══════════════════════════════════════════════════════════════

  _detectFrozenSensor(currentDatos, history) {
    const risks = [];
    if (history.length < this.FROZEN_SENSOR_THRESHOLD) return risks;

    const recent = history.slice(-this.FROZEN_SENSOR_THRESHOLD);

    for (const field of ['temperatura', 'humedad', 'presion']) {
      const values = recent.map(r => r[field]);
      const allSame = values.every(v => v === values[0]) && currentDatos[field] === values[0];

      if (allSame) {
        risks.push({
          type:     `frozen_sensor_${field}`,
          severity: 'warning',
          value:    currentDatos[field],
          message:  `Posible sensor congelado: ${field} reporta ${currentDatos[field]} sin cambio en ${this.FROZEN_SENSOR_THRESHOLD} lecturas consecutivas`,
          penalty:  30
        });
      }
    }

    return risks;
  }

  // ═══════════════════════════════════════════════════════════════
  // EVALUACIÓN DE TENDENCIAS (predicción a 10 minutos)
  // ═══════════════════════════════════════════════════════════════

  _evaluateTrends(features, currentTemp, currentHumidity, currentPressure) {
    const risks = [];
    const HORIZON = 10; // minutos
    const T = this.clinicalThresholds;

    const projectedTemp     = currentTemp     + features.tempTrendPerMin     * HORIZON;
    const projectedHumidity = currentHumidity + features.humidityTrendPerMin * HORIZON;

    // ── Tendencia de temperatura ──────────────────────────────────
    if (features.isRapidCooling) {
      if (projectedTemp < T.temperatura.hypothermia_critical) {
        risks.push({
          type:      'trend_hypothermia_imminent',
          severity:  'critical',
          message:   `Enfriamiento rápido: ${features.tempTrendPerMin.toFixed(2)}°C/min — hipotermia severa en ~${HORIZON} min (proyección: ${projectedTemp.toFixed(1)}°C)`,
          projected: projectedTemp,
          minutes_to_threshold: this._minutesToThreshold(
            currentTemp, features.tempTrendPerMin, T.temperatura.hypothermia_critical, 'below'
          ),
          penalty: 55
        });
      } else if (projectedTemp < T.temperatura.hypothermia_warning) {
        risks.push({
          type:      'trend_hypothermia_risk',
          severity:  'warning',
          message:   `Tendencia de enfriamiento: proyección ${projectedTemp.toFixed(1)}°C en ${HORIZON} min`,
          projected: projectedTemp,
          minutes_to_threshold: this._minutesToThreshold(
            currentTemp, features.tempTrendPerMin, T.temperatura.hypothermia_warning, 'below'
          ),
          penalty: 30
        });
      }
    }

    if (features.isRapidHeating) {
      if (projectedTemp > T.temperatura.hyperthermia_critical) {
        risks.push({
          type:      'trend_hyperthermia_imminent',
          severity:  'critical',
          message:   `Calentamiento rápido: ${features.tempTrendPerMin.toFixed(2)}°C/min — hipertermia en ~${HORIZON} min (proyección: ${projectedTemp.toFixed(1)}°C)`,
          projected: projectedTemp,
          minutes_to_threshold: this._minutesToThreshold(
            currentTemp, features.tempTrendPerMin, T.temperatura.hyperthermia_critical, 'above'
          ),
          penalty: 55
        });
      }
    }

    // ── Tendencia de humedad ──────────────────────────────────────
    if (features.isHumiditySpike) {
      if (features.humidityTrendPerMin < 0 && projectedHumidity < T.humedad.critical_low) {
        risks.push({
          type:      'trend_humidity_dropping',
          severity:  'warning',
          message:   `Humedad bajando rápido: ${features.humidityTrendPerMin.toFixed(1)}%/min — proyección: ${projectedHumidity.toFixed(0)}% en ${HORIZON} min`,
          projected: projectedHumidity,
          penalty:   25
        });
      }
      if (features.humidityTrendPerMin > 0 && projectedHumidity > T.humedad.critical_high) {
        risks.push({
          type:      'trend_humidity_rising',
          severity:  'warning',
          message:   `Humedad subiendo rápido: ${features.humidityTrendPerMin.toFixed(1)}%/min — proyección: ${projectedHumidity.toFixed(0)}% en ${HORIZON} min`,
          projected: projectedHumidity,
          penalty:   25
        });
      }
    }

    // ── Alta variabilidad térmica ──────────────────────────────────
    if (features.tempVariability > 1.5) {
      risks.push({
        type:     'high_temp_variability',
        severity: 'watch',
        message:  `Alta variabilidad térmica: σ=${features.tempVariability.toFixed(2)}°C — posible inestabilidad ambiental`,
        penalty:  15
      });
    }

    // ── EMA diverge del valor actual (cambio brusco reciente) ─────
    // [MEJ-5] Si la EMA y el valor actual difieren mucho, hubo un salto súbito
    const tempEmaDelta = Math.abs(features.tempEma - features.tempTrendPerMin);
    if (Math.abs(features.tempEma - (features.tempTrendPerMin + 0)) > 0 &&
        features.tempVariability > 0.8 &&
        Math.abs(currentTemp - features.tempEma) > 1.0) {
      risks.push({
        type:     'ema_divergence',
        severity: 'watch',
        message:  `Salto térmico reciente detectado: valor actual (${currentTemp}°C) diverge de EMA (${features.tempEma.toFixed(1)}°C)`,
        penalty:  10
      });
    }

    return risks;
  }

  _minutesToThreshold(current, trendPerMin, threshold, direction) {
    if (Math.abs(trendPerMin) < 0.01) return Infinity;
    if (direction === 'below' && trendPerMin >= 0) return Infinity;
    if (direction === 'above' && trendPerMin <= 0) return Infinity;
    const minutes = (threshold - current) / trendPerMin;
    return Math.max(0, Math.round(minutes));
  }

  // ═══════════════════════════════════════════════════════════════
  // SCORING Y NIVEL DE ALERTA
  // ═══════════════════════════════════════════════════════════════

  _calculateRiskScore(allRisks) {
    if (allRisks.length === 0) return 0;

    // Penalidades con diminishing returns (cada riesgo adicional aporta menos)
    const penalties = allRisks.map(r => r.penalty).sort((a, b) => b - a);
    let score = 0;
    for (let i = 0; i < penalties.length; i++) {
      score += penalties[i] * Math.pow(0.7, i);
    }

    return Math.min(100, Math.round(score));
  }

  _determineAlertLevel(riskScore, currentRisks, combinedRisks = []) {
    const hasCritical =
      currentRisks.some(r => r.severity === 'critical') ||
      combinedRisks.some(r => r.severity === 'critical');

    if (hasCritical || riskScore >= 70) return 'critical';
    if (riskScore >= 45)                return 'warning';
    if (riskScore >= 20)                return 'watch';
    return 'safe';
  }

  // ═══════════════════════════════════════════════════════════════
  // [MEJ-3] ÍNDICE DE CONFORT NEONATAL (0–100, mayor = mejor)
  // ═══════════════════════════════════════════════════════════════

  _calculateComfortIndex(temp, humidity, pressure) {
    const T = this.clinicalThresholds;

    // Temperatura: 100 en el centro del rango óptimo, decae linealmente
    const tempOptMid = (T.temperatura.normal_min + T.temperatura.normal_max) / 2;
    const tempRange  = (T.temperatura.normal_max - T.temperatura.normal_min) / 2;
    const tempScore  = Math.max(0, 100 - (Math.abs(temp - tempOptMid) / tempRange) * 100);

    // Humedad: 100 en el centro del rango óptimo
    const humOptMid = (T.humedad.optimal_min + T.humedad.optimal_max) / 2;
    const humRange  = (T.humedad.optimal_max - T.humedad.optimal_min) / 2;
    const humScore  = Math.max(0, 100 - (Math.abs(humidity - humOptMid) / humRange) * 100);

    // Presión: impacto menor, solo penaliza si está fuera de rango normal
    const pressOk = pressure >= T.presion.normal_min && pressure <= T.presion.normal_max;
    const pressScore = pressOk ? 100 : 70;

    // Promedio ponderado: temperatura es el factor más crítico
    const index = (tempScore * 0.55) + (humScore * 0.35) + (pressScore * 0.10);

    return Math.round(Math.max(0, Math.min(100, index)));
  }

  // ═══════════════════════════════════════════════════════════════
  // RECOMENDACIONES CLÍNICAS
  // ═══════════════════════════════════════════════════════════════

  _generateRecommendations(currentRisks, combinedRisks, trendRisks, frozenRisks, features) {
    const recommendations = [];
    const allRisks = [...currentRisks, ...combinedRisks, ...trendRisks, ...frozenRisks];
    const types = new Set(allRisks.map(r => r.type));

    // ── Hipotermia ────────────────────────────────────────────────
    if (types.has('hypothermia') || types.has('trend_hypothermia_imminent') || types.has('trend_hypothermia_risk')) {
      recommendations.push('Verificar temperatura de la incubadora y ajustar servo-control');
      recommendations.push('Confirmar que el neonato esté bien arropado y seco');
      if (features.isRapidCooling) {
        recommendations.push('URGENTE: Enfriamiento rápido detectado — notificar al médico de guardia de inmediato');
      }
    }

    // ── Hipertermia ───────────────────────────────────────────────
    if (types.has('hyperthermia') || types.has('trend_hyperthermia_imminent')) {
      recommendations.push('Verificar fiebre materna, signos de infección o sobrecalentamiento de incubadora');
      recommendations.push('Reducir temperatura de la incubadora gradualmente (máx 0.5°C por hora)');
      recommendations.push('Considerar hemocultivo si persiste o supera 38.5°C');
    }

    // ── Humedad baja ──────────────────────────────────────────────
    if (types.has('humidity_low') || types.has('trend_humidity_dropping')) {
      recommendations.push('Aumentar humedad de la incubadora — riesgo de pérdida de calor insensible');
      recommendations.push('Verificar reservorio de agua y sistema humidificador');
    }

    // ── Humedad alta ──────────────────────────────────────────────
    if (types.has('humidity_high') || types.has('trend_humidity_rising')) {
      recommendations.push('Reducir humedad — riesgo de colonización fúngica (Candida spp.)');
      recommendations.push('Verificar condensación en paredes de la incubadora');
    }

    // ── Riesgos combinados ────────────────────────────────────────
    if (types.has('combined_hypothermia_humidity')) {
      recommendations.push('COMBINACIÓN CRÍTICA: corregir hipotermia Y reducir humedad simultáneamente — cada factor amplifica al otro');
    }
    if (types.has('combined_hyperthermia_humidity')) {
      recommendations.push('COMBINACIÓN CRÍTICA: ambiente de máximo riesgo infeccioso — considerar traslado a unidad de mayor cuidado');
    }

    // ── Presión ───────────────────────────────────────────────────
    if (types.has('pressure_low') || types.has('pressure_high')) {
      recommendations.push('Verificar calibración del sensor de presión BME280');
    }

    // ── Variabilidad ──────────────────────────────────────────────
    if (types.has('high_temp_variability') || types.has('ema_divergence')) {
      recommendations.push('Revisar corrientes de aire cerca de la incubadora y sellado de la cámara');
    }

    // ── Sensor congelado ──────────────────────────────────────────
    if ([...types].some(t => t.startsWith('frozen_sensor_'))) {
      recommendations.push('ALERTA DE HARDWARE: Sensor BME280 posiblemente colgado — reiniciar dispositivo y verificar bus I2C');
      recommendations.push('No tomar decisiones clínicas basadas en los datos actuales hasta confirmar funcionamiento del sensor');
    }

    return [...new Set(recommendations)]; // eliminar duplicados
  }

  // ═══════════════════════════════════════════════════════════════
  // [FIX-1] [FIX-2] APRENDIZAJE INCREMENTAL (Welford's algorithm)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Actualiza estadísticas online para temperatura, humedad Y presión.
   *
   * @param {string} unidad_id
   * @param {Object} currentValues - { temperatura, humedad, presion } — datos reales del sensor
   * @param {Object} features      - features extraídas (para uso futuro, no para Welford)
   */
  async _updateLearnedParams(unidad_id, currentValues, features) {
    try {
      // Intentar cargar desde MongoDB
      let params = null;
      try {
        params = await this.db.collection('amira_model_params').findOne({ unidad_id });
      } catch (dbErr) {
        // [FIX-5] Si Mongo falla, usar solo el cache en memoria
        console.warn(`Amira: no se pudo leer MongoDB para ${unidad_id} — usando cache en memoria:`, dbErr.message);
      }

      // Si no hay datos en Mongo ni en memoria, inicializar desde cero
      if (!params) {
        params = this.learnedParams.get(unidad_id) || {
          unidad_id,
          n:          0,
          tempMean:   0, tempM2:   0, tempStd:   0,
          humMean:    0, humM2:    0, humStd:    0,
          pressMean:  0, pressM2:  0, pressStd:  0,
          created_at: new Date()
        };
      }

      // Algoritmo de Welford (actualización incremental de media y varianza)
      const welford = (n, mean, M2, value) => {
        n++;
        const delta  = value - mean;
        mean        += delta / n;
        const delta2 = value - mean;
        M2          += delta * delta2;
        return { n, mean, M2, std: n > 1 ? Math.sqrt(M2 / (n - 1)) : 0 };
      };

      // [FIX-1] Actualizar las tres variables, no solo temperatura
      const t = welford(params.n,  params.tempMean,  params.tempM2,  currentValues.temperatura);
      params.n         = t.n;
      params.tempMean  = t.mean;
      params.tempM2    = t.M2;
      params.tempStd   = t.std;

      const h = welford(params.n - 1, params.humMean,  params.humM2,  currentValues.humedad);
      params.humMean   = h.mean;
      params.humM2     = h.M2;
      params.humStd    = h.std;

      const p = welford(params.n - 1, params.pressMean, params.pressM2, currentValues.presion);
      params.pressMean = p.mean;
      params.pressM2   = p.M2;
      params.pressStd  = p.std;

      params.updated_at = new Date();

      // Actualizar cache en memoria (siempre disponible aunque Mongo falle)
      this.learnedParams.set(unidad_id, {
        tempMean:  params.tempMean,
        tempStd:   params.tempStd,
        humMean:   params.humMean,
        humStd:    params.humStd,
        pressMean: params.pressMean,
        pressStd:  params.pressStd,
        n:         params.n
      });

      // Persistir en MongoDB
      try {
        await this.db.collection('amira_model_params').updateOne(
          { unidad_id },
          { $set: params },
          { upsert: true }
        );
      } catch (dbErr) {
        // [FIX-5] Si falla la escritura, el cache en memoria sigue activo
        console.warn(`Amira: no se pudo persistir parámetros de ${unidad_id}:`, dbErr.message);
      }

    } catch (err) {
      console.error('Amira: error inesperado en _updateLearnedParams:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENCIA
  // ═══════════════════════════════════════════════════════════════

  async _savePrediction(prediction) {
    try {
      const result = await this.db.collection('amira_predictions').insertOne(prediction);

      // [MEJ-6] Registrar en Solana si es warning o critical (no-blocking)
      if (['warning', 'critical'].includes(prediction.alert_level)) {
        this.solanaLogger.logAlert(prediction).then(async (solanaResult) => {
          if (solanaResult.success) {
            await this.db.collection('amira_predictions').updateOne(
              { _id: result.insertedId },
              {
                $set: {
                  'blockchain.tx_hash':      solanaResult.tx_hash,
                  'blockchain.network':      solanaResult.network,
                  'blockchain.explorer_url': solanaResult.explorer_url,
                  'blockchain.logged_at':    new Date()
                }
              }
            );
            console.log(`Amira Solana TX: ${solanaResult.explorer_url}`);
          }
        }).catch(err => {
          console.error('Amira: error registrando en Solana:', err.message);
        });
      }
    } catch (err) {
      console.error('Amira: error guardando predicción:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CONSULTAS PARA API
  // ═══════════════════════════════════════════════════════════════

  async getLatestRisk(unidad_id) {
    return this.db.collection('amira_predictions')
      .findOne({ unidad_id }, { sort: { timestamp: -1 } });
  }

  async getRiskHistory(unidad_id, hours = 24) {
    const since = new Date(Date.now() - hours * 3600 * 1000);
    return this.db.collection('amira_predictions')
      .find({ unidad_id, timestamp: { $gte: since } })
      .sort({ timestamp: -1 })
      .toArray();
  }

  async getActiveAlerts() {
    return this.db.collection('amira_predictions')
      .find({ alert_level: { $in: ['warning', 'critical'] } })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
  }

  async getModelStatus(unidad_id) {
    let params = this.learnedParams.get(unidad_id);

    if (!params) {
      try {
        params = await this.db.collection('amira_model_params').findOne({ unidad_id });
      } catch (err) {
        params = null;
      }
    }

    const n = params?.n || 0;
    return {
      unidad_id,
      model_version:           '1.1.0-clinical-rules',
      training_mode:           n < 100 ? 'cold_start_rules' : 'hybrid_learning',
      data_points_collected:   n,
      learned_temp_mean:       params?.tempMean  != null ? +params.tempMean.toFixed(3)  : null,
      learned_temp_std:        params?.tempStd   != null ? +params.tempStd.toFixed(3)   : null,
      learned_humidity_mean:   params?.humMean   != null ? +params.humMean.toFixed(3)   : null,
      learned_humidity_std:    params?.humStd    != null ? +params.humStd.toFixed(3)    : null,
      learned_pressure_mean:   params?.pressMean != null ? +params.pressMean.toFixed(3) : null,
      learned_pressure_std:    params?.pressStd  != null ? +params.pressStd.toFixed(3)  : null,
      last_updated:            params?.updated_at || null,
      confidence_level:        (Math.min(100, (n / 500) * 100)).toFixed(1) + '%',
      cache_available:         this.learnedParams.has(unidad_id)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILIDAD: aplanar sensorData para agregar a history
  //
  // IMPORTANTE — Llamar esto en tu código antes de pushear a history:
  //   const flat = AmiraPredictor.flattenReading(sensorData);
  //   history.push(flat);
  //   const prediction = await amira.analyze(sensorData, history);
  // ═══════════════════════════════════════════════════════════════

  /**
   * [FIX-3] Convierte el formato de sensorData al formato plano que espera history.
   * Úsalo en el llamador para mantener el contrato consistente.
   */
  static flattenReading(sensorData) {
    return {
      temperatura: sensorData.datos.temperatura,
      humedad:     sensorData.datos.humedad,
      presion:     sensorData.datos.presion,
      timestamp:   sensorData.timestamp || new Date()
    };
  }
}

module.exports = AmiraPredictor;