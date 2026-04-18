const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
 
const lecturasRoutes = require("./routes/lecturas.routes");
const alertasRoutes = require("./routes/alertas.routes");
 
const app = express();
const server = http.createServer(app);
 
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});
 
// ── Middlewares ──────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());
 
// ── Compartir io con el resto de la app ─────────────────────
app.set("io", io);
 
// ── Rutas ────────────────────────────────────────────────────
app.use("/api/lecturas", lecturasRoutes);
app.use("/api/alertas", alertasRoutes);
 
app.get("/", (req, res) => {
  res.json({ status: "SafeCare NEO API corriendo" });
});
 
// ── Conexión a MongoDB ───────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(" MongoDB conectado");
    server.listen(process.env.PORT || 5000, () => {
      console.log(` Servidor corriendo en puerto ${process.env.PORT || 5000}`);
    });
  })
  .catch((err) => {
    console.error(" Error conectando a MongoDB:", err.message);
    process.exit(1);
  });
 
// ── Eventos de Socket.IO ─────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`📱 Cliente conectado: ${socket.id}`);
 
  socket.on("disconnect", () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});