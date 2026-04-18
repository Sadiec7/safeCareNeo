const Alerta = require("../models/alerta.model");

// GET /api/alertas
const obtenerAlertas = async (req, res) => {
  try {
    const { paciente_id = "neonato_001", resuelta } = req.query;

    const filtro = { paciente_id };
    if (resuelta !== undefined) filtro.resuelta = resuelta === "true";

    const alertas = await Alerta.find(filtro).sort({ createdAt: -1 }).limit(20);

    res.json(alertas);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener alertas" });
  }
};

// PATCH /api/alertas/:id/resolver
const resolverAlerta = async (req, res) => {
  try {
    const alerta = await Alerta.findByIdAndUpdate(
      req.params.id,
      { resuelta: true },
      { new: true }
    );

    if (!alerta) return res.status(404).json({ error: "Alerta no encontrada" });

    res.json({ ok: true, alerta });
  } catch (error) {
    res.status(500).json({ error: "Error al resolver alerta" });
  }
};

module.exports = { obtenerAlertas, resolverAlerta };