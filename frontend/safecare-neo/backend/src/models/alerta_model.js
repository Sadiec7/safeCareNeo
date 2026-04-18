const mongoose = require("mongoose");

const alertaSchema = new mongoose.Schema(
  {
    paciente_id: {
      type: String,
      required: true,
      default: "neonato_001",
    },
    tipo: {
      type: String,
      enum: ["temperatura_alta", "temperatura_baja", "humedad", "presion", "ia"],
      required: true,
    },
    mensaje: {
      type: String,
      required: true,
    },
    valor_detectado: {
      type: Number,
    },
    nivel: {
      type: String,
      enum: ["precaucion", "critico"],
      default: "precaucion",
    },
    resuelta: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Alerta", alertaSchema);