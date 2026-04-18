import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

// ─── Configuración ────────────────────────────────────────────────────────────
const API_BASE = "http://10.215.96.213:3000"; 
const POLL_INTERVAL = 5000;

const RANGES = {
  temperatura: { min: 36.5, max: 37.5, label: "°C" },
  humedad:     { min: 40,   max: 60,   label: "%" },
  presion:     { min: 995,  max: 1025, label: "hPa" },
};

function getEstado(key, val) {
  const r = RANGES[key];
  if (!r || val == null) return "offline";
  if (val < r.min - 1 || val > r.max + 1) return "critico";
  if (val < r.min || val > r.max) return "advertencia";
  return "normal";
}

// ─── Íconos SVG ───────────────────────────────────────────────────────────────
const Icons = {
  Robot: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  ),
  Warning: ({ color }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Critical: ({ color }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  Normal: ({ color }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  ArrowUp: ({ color }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  ),
  ArrowDown: ({ color }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  ),
  FilePdf: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
};

// ─── Componentes de UI ────────────────────────────────────────────────────────
const NIVELES = {
  normal: { border: "#AED6F1", bg: "#EAF4FB", text: "#1A5276", chart: "#3498DB" },
  advertencia: { border: "#F9E79F", bg: "#FEFDE7", text: "#7D6608", chart: "#F39C12" },
  critico: { border: "#F1948A", bg: "#FDEDEC", text: "#922B21", chart: "#E74C3C" },
  offline: { border: "#E5E7EB", bg: "#F9FAFB", text: "#6B7280", chart: "#9CA3AF" }
};

function MetricCard({ label, valor, unidad, estado }) {
  const colores = NIVELES[estado] || NIVELES.offline;

  return (
    <div style={{
      backgroundColor: colores.bg,
      border: `1px solid ${colores.border}`,
      borderRadius: "10px",
      padding: "16px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "12px"
    }}>
      <div>
        <p style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: colores.text }}>{label}</p>
        <p style={{ margin: "4px 0 0", fontSize: "26px", fontWeight: 600, color: colores.text }}>
          {valor !== null && valor !== undefined ? Number(valor).toFixed(1) : "—"}
          <span style={{ fontSize: "14px", fontWeight: 400, marginLeft: "4px" }}>{unidad}</span>
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "12px", color: colores.text, opacity: 0.8 }}>
          Rango: {RANGES[label.toLowerCase()] ? `${RANGES[label.toLowerCase()].min}–${RANGES[label.toLowerCase()].max} ${unidad}` : "—"}
        </p>
      </div>
      <div style={{
        width: "12px", height: "12px", borderRadius: "50%",
        backgroundColor: colores.chart,
        boxShadow: estado === "critico" ? `0 0 0 4px ${colores.chart}33` : "none"
      }} />
    </div>
  );
}

function AlertBanner({ alertas }) {
  if (!alertas.length) return null;
  return (
    <div style={{ backgroundColor: "#FDEDEC", border: "1px solid #F1948A", borderRadius: "8px", padding: "14px 18px", marginBottom: "20px" }}>
      <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: "14px", color: "#922B21", display: "flex", alignItems: "center", gap: "6px" }}>
        <Icons.Warning color="#922B21" /> Alertas activas ({alertas.length})
      </p>
      {alertas.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          {a.critico ? <Icons.Critical color="#E74C3C" /> : <Icons.Warning color="#F39C12" />}
          <p style={{ margin: 0, fontSize: "13px", color: "#641E16", flex: 1 }}>{a.mensaje}</p>
          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>{a.hora}</span>
        </div>
      ))}
    </div>
  );
}

function PosturaCard({ estado }) {
  const esBocaAbajo = estado && estado.includes("Abajo");
  const est = esBocaAbajo ? "critico" : (estado ? "normal" : "offline");
  const colores = NIVELES[est];
  const texto = estado || "Analizando...";

  return (
    <div style={{ backgroundColor: colores.bg, border: `1px solid ${colores.border}`, borderRadius: "10px", padding: "16px 20px" }}>
      <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 500, color: colores.text }}>Postura del bebé (YOLO)</p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {esBocaAbajo ? <Icons.ArrowDown color={colores.chart} /> : <Icons.ArrowUp color={colores.chart} />}
        <p style={{ margin: 0, fontWeight: 600, fontSize: "16px", color: colores.text }}>{texto}</p>
      </div>
    </div>
  );
}

function MiniChart({ data, color }) {
  if (!data.length) return null;
  const vals = data.map(d => d.valor);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 280, H = 50;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: "12px" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── App principal ────────────────────────────────────────────────────────────
export default function App() {
  const [sensores, setSensores] = useState(null);
  const [postura, setPostura]   = useState(null);
  const [alertas, setAlertas]   = useState([]);
  const [histTemp, setHistTemp] = useState(Array(30).fill({ valor: 0 }));
  const [histHum,  setHistHum]  = useState(Array(30).fill({ valor: 0 }));
  const [iaTexto,  setIaTexto]  = useState(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [conexion, setConexion]  = useState("conectando");
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const audioRef = useRef(new Audio());

  // ── Generador de PDF en Web (Nativo) ──
  const generarReportePDF = useCallback((analisisIA) => {
    if (!sensores) return;

    // Crear un iframe oculto para no bloquear el navegador con popups
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    const fecha = new Date().toLocaleDateString('es-MX');
    const hora = new Date().toLocaleTimeString('es-MX');

    // Plantilla HTML estructurada para imprimir
    const htmlContent = `
      <html>
        <head>
          <title>Reporte_SafeCareNEO_${fecha}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #2C3E50; }
            .logo { text-align: center; font-size: 24px; font-weight: bold; color: #3498DB; margin-bottom: 20px; }
            h1 { color: #1A5276; text-align: center; border-bottom: 2px solid #AED6F1; padding-bottom: 10px; font-size: 22px; }
            .header-info { margin-bottom: 40px; display: flex; justify-content: space-between; font-size: 14px; color: #566573; }
            .metric-container { margin-bottom: 15px; padding: 15px 20px; border: 1px solid #E3EFF8; border-radius: 8px; background-color: #F4F9FD; display: flex; justify-content: space-between; align-items: center; }
            .metric-label { font-size: 16px; font-weight: 500; }
            .metric-value { font-size: 20px; font-weight: bold; color: #2980B9; }
            .ia-box { margin-top: 30px; padding: 20px; border-radius: 8px; border: 1px solid #D6EAF8; background-color: #fff; }
            .ia-title { font-size: 14px; font-weight: bold; color: #1A5276; text-transform: uppercase; margin-bottom: 10px; }
            .footer { margin-top: 50px; font-size: 12px; color: #95A5A6; text-align: center; }
          </style>
        </head>
        <body>
          <div class="logo">+ SafeCare NEO</div>
          <h1>Reporte Médico y Análisis IA</h1>
          
          <div class="header-info">
            <div>
              <p><strong>Paciente:</strong> Neonato Incubadora 001</p>
              <p><strong>Médico Asignado:</strong> Alison Ugalde Arias</p>
            </div>
            <div>
              <p><strong>Fecha:</strong> ${fecha}</p>
              <p><strong>Hora:</strong> ${hora}</p>
            </div>
          </div>

          <div class="metric-container">
            <span class="metric-label">Temperatura Corporal</span>
            <span class="metric-value">${Number(sensores.temperatura).toFixed(1)} °C</span>
          </div>
          <div class="metric-container">
            <span class="metric-label">Humedad Ambiental</span>
            <span class="metric-value">${Number(sensores.humedad).toFixed(0)} %</span>
          </div>
          <div class="metric-container">
            <span class="metric-label">Presión Atmosférica</span>
            <span class="metric-value">${Number(sensores.presion).toFixed(0)} hPa</span>
          </div>
          <div class="metric-container">
            <span class="metric-label">Postura Detectada (YOLO)</span>
            <span class="metric-value">${postura || 'No detectada'}</span>
          </div>

          <div class="ia-box">
            <div class="ia-title">🤖 Análisis Gemini IA</div>
            <p style="line-height: 1.6; color: #34495E;">${analisisIA || 'Sin análisis generado en esta sesión.'}</p>
          </div>

          <div class="footer">
            <p>Este documento fue generado automáticamente por la telemetría del dashboard SafeCare NEO.</p>
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Enfocar e invocar impresión después de que renderice
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // Eliminar el iframe del DOM tras unos segundos para limpiar memoria
      setTimeout(() => { document.body.removeChild(iframe); }, 3000);
    }, 500);
  }, [sensores, postura]);


  const generarAlertas = useCallback((datos, posturaActual) => {
    const nuevas = [];
    const hora = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    if (datos) {
      const campos = { temperatura: datos.temperatura, humedad: datos.humedad, presion: datos.presion };
      for (const [key, val] of Object.entries(campos)) {
        if (val == null) continue;
        const est = getEstado(key, val);
        if (est === "critico") {
          nuevas.push({ mensaje: `${key.charAt(0).toUpperCase()+key.slice(1)} crítica: ${Number(val).toFixed(1)} ${RANGES[key].label}`, critico: true, hora });
        } else if (est === "advertencia") {
          nuevas.push({ mensaje: `${key.charAt(0).toUpperCase()+key.slice(1)} fuera de rango: ${Number(val).toFixed(1)} ${RANGES[key].label}`, critico: false, hora });
        }
      }
    }

    if (posturaActual && posturaActual.includes("Abajo")) {
      nuevas.push({ mensaje: "¡Bebé boca abajo detectado! Requiere atención inmediata.", critico: true, hora });
    }

    setAlertas(nuevas);

    if (nuevas.some(a => a.critico)) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880; 
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch (_) { }
    }
  }, []);

  const fetchDatos = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/dashboard/all-data`, { signal: AbortSignal.timeout(4000) });
      const json = await res.json();

      if (json.sensors && json.sensors.length > 0) {
        const sensor = json.sensors[0];
        const d = sensor.datos_filtrados || sensor.datos || {};
        setSensores(d);
        setConexion(json.fuente === "atlas" ? "en-linea" : "fallback");
        setUltimaActualizacion(new Date().toLocaleTimeString("es-MX"));

        setHistTemp(prev => [...prev.slice(1), { valor: d.temperatura ?? 0 }]);
        setHistHum(prev  => [...prev.slice(1), { valor: d.humedad    ?? 0 }]);
        generarAlertas(d, postura);
      }
    } catch {
      setConexion("offline");
    }
  }, [postura, generarAlertas]);

  const fetchPostura = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/postura`, { signal: AbortSignal.timeout(4000) });
      const json = await res.json();
      if (json.estado) setPostura(json.estado);
    } catch { }
  }, []);

  useEffect(() => {
    fetchDatos();
    fetchPostura();
    const t1 = setInterval(fetchDatos, POLL_INTERVAL);
    const t2 = setInterval(fetchPostura, 3000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchDatos, fetchPostura]);

  const handleIA = async () => {
    if (!sensores) return;
    setIaLoading(true);
    setIaTexto(null);
    try {
      const res  = await fetch(`${API_BASE}/api/gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temp: sensores.temperatura, hum: sensores.humedad, pres: Math.round(sensores.presion) }),
      });
      const json = await res.json();
      setIaTexto(json.respuesta);
      
      // Reproducir audio si existe
      if (json.audio_len > 0) {
        audioRef.current.src = `${API_BASE}/api/audio?t=${Date.now()}`;
        audioRef.current.play().catch(() => {});
      }

      // ── MANDA A IMPRIMIR/GENERAR PDF AUTOMÁTICAMENTE ──
      generarReportePDF(json.respuesta);

    } catch (e) {
      setIaTexto("Error al contactar al asistente de IA.");
    } finally {
      setIaLoading(false);
    }
  };

  const estTemp = getEstado("temperatura", sensores?.temperatura);
  const estHum  = getEstado("humedad",     sensores?.humedad);
  const estPres = getEstado("presion",     sensores?.presion);

  const conexionColor = { "en-linea": "#22c55e", "fallback": "#f59e0b", "offline": "#ef4444", "conectando": "#9ca3af" }[conexion];
  const conexionLabel = { "en-linea": "Atlas (en línea)", "fallback": "Datos de prueba", "offline": "Sin conexión", "conectando": "Conectando..." }[conexion];

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", backgroundColor: "#F4F9FD", minHeight: "100vh" }}>
      
      <header style={{ background: "#fff", borderBottom: "1px solid #E3EFF8", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "42px", height: "42px", borderRadius: "50%", backgroundColor: "#AED6F1", display: "flex", justifyContent: "center", alignItems: "center", color: "#fff", fontSize: "24px", fontWeight: "600" }}>
            +
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "11px", color: "#90A4B0", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>Safecare</p>
            <p style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#2C3E50" }}>NEO</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#2C3E50" }}>Alison Ugalde Arias</p>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: conexionColor }} />
            <span style={{ fontSize: "12px", color: "#90A4B0" }}>{conexionLabel}</span>
          </div>
        </div>
      </header>

      <main style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
        
        <AlertBanner alertas={alertas} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
          
          {/* Columna Izquierda: Sensores Principales */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#1A5276" }}>Estado Médico</p>
            
            <MetricCard label="Temperatura" valor={sensores?.temperatura} unidad="°C" estado={estTemp} />
            <MetricCard label="Humedad"     valor={sensores?.humedad}     unidad="%"  estado={estHum} />
            <MetricCard label="Presión"     valor={sensores?.presion}     unidad="hPa" estado={estPres} />
            
            <div style={{ marginTop: "12px" }}>
              <PosturaCard estado={postura} />
            </div>

            <button
              onClick={handleIA}
              disabled={iaLoading || !sensores}
              style={{
                marginTop: "20px", width: "100%", padding: "16px", borderRadius: "10px",
                backgroundColor: iaLoading ? "#E3EFF8" : "#AED6F1",
                color: iaLoading ? "#90A4B0" : "#1A5276",
                border: "none", fontWeight: 600, fontSize: "14px", cursor: iaLoading || !sensores ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
              }}
            >
              <Icons.Robot />
              {iaLoading ? "Consultando e Imprimiendo..." : "Análisis IA y Generar PDF"}
            </button>

            {/* Opcional: Botón manual por si cerró la ventana del PDF y lo quiere de nuevo */}
            {iaTexto && (
              <div style={{ marginTop: "12px", backgroundColor: "#fff", border: "1px solid #D6EAF8", borderRadius: "10px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <p style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "#90A4B0", textTransform: "uppercase" }}>Reporte IA</p>
                  <button onClick={() => generarReportePDF(iaTexto)} style={{ background: "none", border: "none", color: "#3498DB", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
                    <Icons.FilePdf /> Re-imprimir PDF
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: "14px", color: "#2C3E50", lineHeight: 1.6 }}>{iaTexto}</p>
              </div>
            )}
          </div>

          {/* Columna Derecha: Gráficas y Telemetría */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <p style={{ margin: "0", fontSize: "14px", fontWeight: 600, color: "#1A5276" }}>Telemetría en tiempo real</p>

            {/* Gráfica Temperatura */}
            <div style={{ backgroundColor: "#fff", border: "1px solid #D6EAF8", borderRadius: "12px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#2C3E50" }}>Fluctuación Térmica</p>
                <span style={{ fontSize: "16px", fontWeight: 600, color: NIVELES[estTemp].chart }}>
                  {sensores ? `${Number(sensores.temperatura).toFixed(1)} °C` : "—"}
                </span>
              </div>
              <MiniChart data={histTemp} color={NIVELES[estTemp].chart} />
            </div>

            {/* Gráfica Humedad */}
            <div style={{ backgroundColor: "#fff", border: "1px solid #D6EAF8", borderRadius: "12px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#2C3E50" }}>Humedad Ambiental</p>
                <span style={{ fontSize: "16px", fontWeight: 600, color: NIVELES[estHum].chart }}>
                  {sensores ? `${Number(sensores.humedad).toFixed(0)} %` : "—"}
                </span>
              </div>
              <MiniChart data={histHum} color={NIVELES[estHum].chart} />
            </div>

            {/* Log de alertas nativo */}
            <div style={{ backgroundColor: "#fff", border: "1px solid #D6EAF8", borderRadius: "12px", padding: "20px", flex: 1 }}>
              <p style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 500, color: "#2C3E50" }}>Registro de eventos recientes</p>
              
              {alertas.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#27AE60" }}>
                  <Icons.Normal color="#27AE60" />
                  <p style={{ margin: 0, fontSize: "14px" }}>Todos los parámetros se encuentran estables.</p>
                </div>
              ) : (
                alertas.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 0", borderBottom: i < alertas.length - 1 ? "1px solid #E3EFF8" : "none" }}>
                    <div style={{ marginTop: "2px" }}>
                      {a.critico ? <Icons.Critical color="#E74C3C" /> : <Icons.Warning color="#F39C12" />}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "14px", color: "#2C3E50", fontWeight: 500 }}>{a.mensaje}</p>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#90A4B0" }}>Detectado a las {a.hora}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}