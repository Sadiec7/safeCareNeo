import { useState, useEffect } from "react";
import Header from "./components/Header";
import MetricCard from "./components/MetricCard";
import LiveMonitor from "./components/LiveMonitor";
import { getGeminiResponse } from "./services/geminiService";
// ❌ Se eliminó ElevenLabsService
import "./App.css";

function App() {
  // Inicializamos valores en 0 a la espera de los sensores reales
  const [datos, setDatos] = useState({ 
    temperatura: 0, 
    humedad: 0, 
    presion: 0, 
    nivel_riesgo: "esperando datos..." 
  });

  const [isAsistenteCargando, setIsAsistenteCargando] = useState(false);
  const [historial, setHistorial] = useState(Array(30).fill({ valor: 0 }));

  /* 💡 CONEXIÓN A MONGO (Paso a paso):
    1. Una vez tengas la URI de MongoDB, crea una API en Express (Node.js).
    2. En el Backend, usa Mongoose para consultar la colección de sensores.
    3. Para tiempo real, te recomiendo usar Socket.io.
    4. Sustituye el useEffect de abajo por una escucha de socket:
       
       socket.on("nuevosDatos", (data) => {
         setDatos(data);
         setHistorial(prev => [...prev.slice(1), { valor: data.temperatura }]);
       });
  */

  useEffect(() => {
    // Si los datos son 0, la gráfica se mantiene plana
    const interval = setInterval(() => {
      setHistorial(prev => {
        const nuevoDato = { valor: datos.temperatura };
        return [...prev.slice(1), nuevoDato];
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [datos.temperatura]);

  const handleIA = async () => {
    setIsAsistenteCargando(true);
    try {
      // Ahora solo obtenemos el texto de Gemini sin intentar convertirlo a voz
      const txt = await getGeminiResponse("Genera un reporte basado en datos actuales.");
      console.log("Análisis de IA:", txt);
      alert("Análisis de IA recibido: " + txt); 
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsAsistenteCargando(false); 
    }
  };

  return (
    <div className="app-container">
      <Header />
      
      <main className="dashboard-grid">
        <section className="sidebar">
          <div className="section-header"><h3>📊 Datos de Sensores (Offline)</h3></div>
          <MetricCard label="Temperatura" valor={datos.temperatura} unidad="°C" />
          <MetricCard label="Humedad Amb." valor={datos.humedad} unidad="%" />
          <MetricCard label="Presión" valor={datos.presion} unidad="hPa" />
          
          <button className="btn btn-primary" style={{marginTop: '20px', width: '100%'}} onClick={handleIA}>
            {isAsistenteCargando ? "Analizando..." : "🤖 Consultar IA"}
          </button>
        </section>

        <section className="main-content">
          <div className="section-header"><h3>📡 Monitor de Telemetría</h3></div>
          <div className="monitor-container">
            <LiveMonitor title="Datos registrados" data={historial} color="#4ade80" />
          </div>
          <div className="camara-container">
            <p>🔴 ESP32-CAM: Esperando flujo de video...</p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;