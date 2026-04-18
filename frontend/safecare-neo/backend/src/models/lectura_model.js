const mongoose = require("mongoose");

const lecturaSchema = new mongoose.Schema(
  {
    paciente_id: {
      type: String,
      required: true,
      default: "neonato_001",
    },
    temperatura: {
      type: Number,
      required: true,
    },
    humedad: {
      type: Number,
      required: true,
    },
    presion: {
      type: Number,
      required: true,
    },
    alerta_ia: {
      type: Boolean,
      default: false,
    },
    nivel_riesgo: {
      type: String,
      enum: ["normal", "precaucion", "critico"],
      default: "normal",
    },
  },
  {
    timestamps: true, // agrega createdAt y updatedAt automáticamente
  }
);

module.exports = mongoose.model("Lectura", lecturaSchema);