import { useState, useEffect } from "react";
import io from "socket.io-client";
import axios from "axios";
import "./App.css";

// Configuración de URLs (Ajusta según tu .env de backend)
const BACKEND_URL = "http://localhost:5000";
const socket = io(BACKEND_URL);

const MetricCard = ({ label, valor, unidad }) => (
  <div className="metric-card">
    <span className="metric-label">{label}</span>
    <span className="metric-value">{valor} {unidad}</span>
  </div>
);

export default function App() {
  const [datos, setDatos] = useState({
    temperatura: 0,
    humedad: 0,
    presion: 0,
    nivel_riesgo: "normal",
  });
  const [conectado, setConectado] = useState(false);

  // 1. Cargar datos iniciales desde MongoDB
  useEffect(() => {
    const fetchInicial = async () => {
      try {
        const res = await axios.get(`${BACKEND_URL}/api/lecturas`);
        // Asumiendo que el API devuelve un array y tomamos el último
        if (res.data.length > 0) {
          setDatos(res.data[res.data.length - 1]);
        }
      } catch (err) {
        console.error("Error cargando historial:", err);
      }
    };
    fetchInicial();
  }, []);

  // 2. Escuchar cambios en tiempo real vía Sockets
  useEffect(() => {
    socket.on("connect", () => setConectado(true));
    socket.on("disconnect", () => setConectado(false));

    // Escuchar el evento que emita tu backend (ej: "nueva-lectura")
    socket.on("lectura", (nuevaLectura) => {
      setDatos(nuevaLectura);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("lectura");
    };
  }, []);

  const getNivelStyles = () => {
    const n = datos.nivel_riesgo;
    if (n === "critico") return { bg: "#FDEDEC", color: "#922B21", text: "Riesgo crítico" };
    if (n === "precaucion") return { bg: "#FEFDE7", color: "#7D6608", text: "Precaución" };
    return { bg: "#EAF9F0", color: "#1E8449", text: "Estado normal" };
  };

  const config = getNivelStyles();

  return (
    <div className="screen">
      <header className="header">
        SafeCare NEO 
        <span className={`status-dot ${conectado ? "online" : "offline"}`}></span>
      </header>

      <header></header>

      <div className="container">
        <div className="section-header">
          <h2 className="section-title">Estado médico (Real-Time)</h2>
        </div>

        <div className="metrics-grid">
          <MetricCard label="Temperatura" valor={datos.temperatura.toFixed(1)} unidad="°C" />
          <MetricCard label="Humedad" valor={datos.humedad.toFixed(0)} unidad="%" />
          <MetricCard label="Presión" valor={datos.presion.toFixed(0)} unidad="hPa" />
        </div>

        <div className="botones-row">
          <button className="btn">FOTO</button>
          <button className="btn btn-primary">TIEMPO REAL</button>
        </div>

        <div className="camara-container">
          <div className="camara-placeholder">
            Cámara ESP32-CAM<br />
            {conectado ? "Conectado al Servidor" : "Buscando servidor..."}
          </div>
        </div>

        <div className="section-header">
          <h2 className="section-title">Reporte de IA</h2>
        </div>

        <div className="reporte-card">
          <div className="reporte-badge" style={{ backgroundColor: config.bg, color: config.color }}>
            {config.text}
          </div>
          <p className="reporte-desc">
            {datos.nivel_riesgo === "normal" 
              ? "Parámetros estables." 
              : "Atención: Revisar niveles fuera de rango."}
          </p>
        </div>
      </div>
    </div>
  );
}