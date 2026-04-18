import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TouchableOpacity, 
  ScrollView, 
  Animated,
  Vibration 
} from "react-native";
import { Audio } from "expo-av"; 
import * as Print from 'expo-print'; // <-- Importamos para crear PDF
import * as Sharing from 'expo-sharing'; // <-- Importamos para compartir el PDF
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { registerRootComponent } from 'expo';

// ─── Configuración Global y API ───────────────────────────────────────────────
const API_BASE = "http://10.215.96.213:3000"; 
const STREAM_URL = "http://192.168.1.100/stream"; 
const POLL_INTERVAL = 4000; 

const RANGES = {
  temperatura: { min: 36.5, max: 37.5, label: "°C" },
  humedad:     { min: 40,   max: 60,   label: "%" },
  presion:     { min: 995,  max: 1025, label: "hPa" },
};

function getEstado(key, val) {
  const r = RANGES[key];
  if (!r || val == null || val === 0) return "normal";
  if (val < r.min - 1 || val > r.max + 1) return "critico";
  if (val < r.min || val > r.max) return "precaucion"; 
  return "normal";
}

// ─── Componente: Header ───────────────────────────────────────────────────────
function Header({ nombre = "Alison Ugalde Arias", fecha = "07.03.2026" }) {
  return (
    <SafeAreaView edges={["top"]} style={headerStyles.safe}>
      <View style={headerStyles.container}>
        <View style={headerStyles.logoArea}>
          <View style={headerStyles.logoCircle}>
            <Text style={headerStyles.logoText}>+</Text>
          </View>
          <View>
            <Text style={headerStyles.logoSub}>Safecare</Text>
            <Text style={headerStyles.logoNeo}>NEO</Text>
          </View>
        </View>
        <View style={headerStyles.userArea}>
          <Text style={headerStyles.userName}>{nombre}</Text>
          <Text style={headerStyles.userDate}>{fecha}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Componente: MiniChart ────────────────────────────────────────────────────
function MiniChart({ data, color, minVal, maxVal }) {
  const chartHeight = 35; 
  
  return (
    <View style={chartStyles.container}>
      {data.map((val, i) => {
        const normalized = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
        const barHeight = Math.max(4, normalized * chartHeight); 

        return (
          <View key={i} style={chartStyles.barContainer}>
            <View 
              style={[
                chartStyles.bar, 
                { height: barHeight, backgroundColor: color, opacity: i === data.length - 1 ? 1 : 0.4 }
              ]} 
            />
          </View>
        );
      })}
    </View>
  );
}

// ─── Componente: MetricCard ───────────────────────────────────────────────────
const NIVELES = {
  normal: { border: "#AED6F1", bg: "#EAF4FB", text: "#1A5276", chart: "#3498DB" },
  precaucion: { border: "#F9E79F", bg: "#FEFDE7", text: "#7D6608", chart: "#F39C12" },
  critico: { border: "#F1948A", bg: "#FDEDEC", text: "#922B21", chart: "#E74C3C" },
};

function MetricCard({ label, valor, unidad, nivel = "normal", showDivider = true, children }) {
  const colores = NIVELES[nivel] || NIVELES.normal;

  return (
    <View style={[metricStyles.card, { borderColor: colores.border, backgroundColor: colores.bg }]}>
      <Text style={[metricStyles.label, { color: colores.text }]}>{label}</Text>
      <View style={metricStyles.valorRow}>
        <Text style={[metricStyles.valor, { color: colores.text }]}>{valor}</Text>
        {unidad ? (
          <Text style={[metricStyles.unidad, { color: colores.text }]}> {unidad}</Text>
        ) : null}
      </View>
      {children}
      {showDivider && <View style={[metricStyles.divider, { backgroundColor: colores.border }]} />}
    </View>
  );
}

// ─── Pantalla: DashboardScreen ────────────────────────────────────────────────
function DashboardScreen({ navigation }) {
  const [datos, setDatos] = useState({ temperatura: 36.8, humedad: 50, presion: 1010 });
  const [histTemp, setHistTemp] = useState(Array(15).fill(36.8)); 
  const [histHum, setHistHum] = useState(Array(15).fill(50));
  
  const [postura, setPostura] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [soundObject, setSoundObject] = useState(null); 
  
  const alertaAnim = useRef(new Animated.Value(0)).current;

  // ── Generador de PDF ──
  const generarPDF = async () => {
    try {
      const colorEstado = nivelGlobal === "critico" ? "#922B21" : nivelGlobal === "precaucion" ? "#7D6608" : "#1E8449";
      const bgEstado = nivelGlobal === "critico" ? "#FDEDEC" : nivelGlobal === "precaucion" ? "#FEFDE7" : "#EAF9F0";

      // Plantilla HTML del documento PDF
      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #2C3E50; }
              .logo { text-align: center; font-size: 24px; font-weight: bold; color: #3498DB; margin-bottom: 20px; }
              h1 { color: #1A5276; text-align: center; border-bottom: 2px solid #AED6F1; padding-bottom: 10px; font-size: 22px; }
              .header-info { margin-bottom: 40px; display: flex; justify-content: space-between; font-size: 14px; color: #566573; }
              .metric-container { margin-bottom: 15px; padding: 15px 20px; border: 1px solid #E3EFF8; border-radius: 8px; background-color: #F4F9FD; display: flex; justify-content: space-between; align-items: center; }
              .metric-label { font-size: 16px; font-weight: 500; }
              .metric-value { font-size: 20px; font-weight: bold; color: #2980B9; }
              .status-box { margin-top: 40px; padding: 20px; border-radius: 8px; text-align: center; font-weight: bold; font-size: 18px; border: 2px solid ${colorEstado}; background-color: ${bgEstado}; color: ${colorEstado}; }
              .footer { margin-top: 50px; font-size: 12px; color: #95A5A6; text-align: center; }
            </style>
          </head>
          <body>
            <div class="logo">+ SafeCare NEO</div>
            <h1>Reporte Médico Generado por el Sistema</h1>
            
            <div class="header-info">
              <div>
                <p><strong>Paciente:</strong> Neonato Incubadora 001</p>
                <p><strong>Médico Asignado:</strong> Dr. Alison Ugalde Arias</p>
              </div>
              <div>
                <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-MX')}</p>
                <p><strong>Hora:</strong> ${new Date().toLocaleTimeString('es-MX')}</p>
              </div>
            </div>

            <div class="metric-container">
              <span class="metric-label">Temperatura Corporal</span>
              <span class="metric-value">${datos.temperatura.toFixed(1)} °C</span>
            </div>
            <div class="metric-container">
              <span class="metric-label">Humedad Ambiental</span>
              <span class="metric-value">${datos.humedad.toFixed(0)} %</span>
            </div>
            <div class="metric-container">
              <span class="metric-label">Presión Atmosférica</span>
              <span class="metric-value">${datos.presion.toFixed(0)} hPa</span>
            </div>
            <div class="metric-container">
              <span class="metric-label">Postura Detectada (IA)</span>
              <span class="metric-value">${postura || 'No detectada'}</span>
            </div>

            <div class="status-box">
              DIAGNÓSTICO AUTOMÁTICO: ESTADO ${nivelGlobal.toUpperCase()}
            </div>

            <div class="footer">
              <p>Este documento fue generado automáticamente por la telemetría de la incubadora SafeCare NEO. No reemplaza la evaluación clínica directa.</p>
            </div>
          </body>
        </html>
      `;

      // Crea el archivo PDF
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      console.log('PDF generado en:', uri);

      // Abre el menú nativo para compartir (WhatsApp, Guardar en Archivos, Email, etc)
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });

    } catch (error) {
      console.error("Error al generar el PDF: ", error);
      alert("Hubo un error al generar el reporte.");
    }
  };

  const triggerAlarm = async () => {
    try {
      Vibration.vibrate([0, 500, 200, 500]);
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' } 
      );
      setSoundObject(sound);
      await sound.playAsync();
    } catch (error) {
      console.log("Error reproduciendo alarma:", error);
    }
  };

  useEffect(() => {
    return soundObject ? () => { soundObject.unloadAsync(); } : undefined;
  }, [soundObject]);

  const simularDatos = useCallback(() => {
    setDatos(prev => {
      const newTemp = prev.temperatura + (Math.random() * 0.4 - 0.2); 
      const newHum = prev.humedad + (Math.random() * 4 - 2); 
      const newPres = prev.presion + (Math.random() * 2 - 1);

      setHistTemp(h => [...h.slice(1), newTemp]);
      setHistHum(h => [...h.slice(1), newHum]);

      return { temperatura: newTemp, humedad: newHum, presion: newPres };
    });
  }, []);

  const fetchDatos = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const res  = await fetch(`${API_BASE}/api/dashboard/all-data`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const json = await res.json();

      if (json.sensors && json.sensors.length > 0) {
        const sensor = json.sensors[0];
        const d = sensor.datos_filtrados || sensor.datos || {};
        
        const currentTemp = d.temperatura ?? 36.8;
        const currentHum = d.humedad ?? 50;

        setDatos({
          temperatura: currentTemp,
          humedad: currentHum,
          presion: d.presion ?? 1010
        });

        setHistTemp(h => [...h.slice(1), currentTemp]);
        setHistHum(h => [...h.slice(1), currentHum]);
      } else {
        simularDatos(); 
      }
    } catch (e) {
      simularDatos();
    }
  }, [simularDatos]);

  const fetchPostura = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/postura`);
      const json = await res.json();
      if (json.estado) setPostura(json.estado);
    } catch (e) { }
  }, []);

  useEffect(() => {
    fetchDatos();
    fetchPostura();
    const t1 = setInterval(fetchDatos, POLL_INTERVAL);
    const t2 = setInterval(fetchPostura, 3000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchDatos, fetchPostura]);

  const estTemp = getEstado("temperatura", datos.temperatura);
  const estHum = getEstado("humedad", datos.humedad);
  const estPres = getEstado("presion", datos.presion);

  const getNivelGeneral = () => {
    if (estTemp === "critico" || estHum === "critico" || estPres === "critico" || (postura && postura.includes("Abajo"))) return "critico";
    if (estTemp === "precaucion" || estHum === "precaucion" || estPres === "precaucion") return "precaucion";
    return "normal";
  };

  const nivelGlobal = getNivelGeneral();

  useEffect(() => {
    if (nivelGlobal === "critico") {
      let mensaje = "Valores fuera del rango seguro detectados.";
      if (postura && postura.includes("Abajo")) mensaje = "¡Bebé boca abajo detectado!";
      setAlerta({ mensaje });
      triggerAlarm();
      Animated.timing(alertaAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.timing(alertaAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setAlerta(null));
    }
  }, [nivelGlobal, postura]);

  const getColorBadge = () => {
    if (nivelGlobal === "critico") return { bg: "#FDEDEC", color: "#922B21" };
    if (nivelGlobal === "precaucion") return { bg: "#FEFDE7", color: "#7D6608" };
    return { bg: "#EAF9F0", color: "#1E8449" };
  };

  const getTextoIA = () => {
    if (nivelGlobal === "critico") return "Se detectaron valores críticos. Contacte al médico de inmediato.";
    if (nivelGlobal === "precaucion") return "Valores cerca de los límites. Se recomienda monitoreo continuo.";
    return "Todos los parámetros del neonato se encuentran dentro del rango normal.";
  };

  const colores = getColorBadge();

  return (
    <View style={dashStyles.screen}>
      <Header />

      {alerta && (
        <Animated.View style={[dashStyles.alertBanner, { opacity: alertaAnim }]}>
          <Text style={dashStyles.alertText}>Alerta: {alerta.mensaje}</Text>
        </Animated.View>
      )}

      <ScrollView contentContainerStyle={dashStyles.scroll} showsVerticalScrollIndicator={false}>
        <View style={dashStyles.sectionHeader}>
          <Text style={dashStyles.sectionTitle}>Estado médico en tiempo real</Text>
        </View>

        <MetricCard label="Temperatura" valor={datos.temperatura.toFixed(1)} unidad="°C" nivel={estTemp}>
          <MiniChart data={histTemp} color={NIVELES[estTemp].chart} minVal={35} maxVal={39} />
        </MetricCard>

        <MetricCard label="Humedad" valor={datos.humedad.toFixed(0)} unidad="%" nivel={estHum}>
          <MiniChart data={histHum} color={NIVELES[estHum].chart} minVal={30} maxVal={70} />
        </MetricCard>

        <MetricCard label="Presión Atmosférica" valor={datos.presion.toFixed(0)} unidad="hPa" nivel={estPres} showDivider={false} />

        <View style={dashStyles.botonesRow}>
          <TouchableOpacity style={dashStyles.boton}>
            <Text style={dashStyles.botonText}>Postura: {postura || "Analizando..."}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[dashStyles.boton, dashStyles.botonPrimario]}
            onPress={() => navigation && navigation.navigate("Camara")}
          >
            <Text style={[dashStyles.botonText, dashStyles.botonTextPrimario]}>VER CÁMARA</Text>
          </TouchableOpacity>
        </View>

        {/* ── Botón Nuevo de PDF ── */}
        <TouchableOpacity style={dashStyles.botonPDF} onPress={generarPDF}>
          <Text style={dashStyles.botonPDFText}>📄 GENERAR REPORTE PDF</Text>
        </TouchableOpacity>

        <View style={dashStyles.sectionHeader}>
          <Text style={dashStyles.sectionTitle}>Análisis de Riesgo</Text>
        </View>

        <View style={dashStyles.reporteCard}>
          <View style={[dashStyles.reporteBadge, { backgroundColor: colores.bg }]}>
            <Text style={[dashStyles.reporteNivel, { color: colores.color }]}>
              {nivelGlobal === "critico" ? "Riesgo crítico" : nivelGlobal === "precaucion" ? "Precaución" : "Estado normal"}
            </Text>
          </View>
          <Text style={dashStyles.reporteDesc}>{getTextoIA()}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Pantalla: CamaraScreen ───────────────────────────────────────────────────
function CamaraScreen() {
  return (
    <View style={camaraStyles.screen}>
      <Header />

      <View style={camaraStyles.sectionHeader}>
        <Text style={camaraStyles.sectionTitle}>Cámara en tiempo real</Text>
      </View>

      <View style={camaraStyles.streamContainer}>
        <Image
          source={{ uri: STREAM_URL }}
          style={camaraStyles.stream}
          resizeMode="cover"
        />
        <View style={camaraStyles.liveBadge}>
          <View style={camaraStyles.liveDot} />
          <Text style={camaraStyles.liveText}>EN VIVO</Text>
        </View>
      </View>

      <View style={camaraStyles.infoCard}>
        <Text style={camaraStyles.infoTitle}>Incubadora — Neonato 001</Text>
        <Text style={camaraStyles.infoSub}>
          Transmisión directa desde la cámara ESP32-CAM instalada en la incubadora. (Asegúrate de estar en la misma red Wi-Fi si la IP es local).
        </Text>
      </View>
    </View>
  );
}

// ─── App Principal y Navegación ───────────────────────────────────────────────
const Tab = createBottomTabNavigator();

const TabIcon = ({ label, focused }) => (
  <View style={[appStyles.tabIcon, focused && appStyles.tabIconActive]}>
    <Text style={[appStyles.tabLabel, focused && appStyles.tabLabelActive]}>
      {label}
    </Text>
  </View>
);

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: appStyles.tabBar,
            tabBarShowLabel: false,
          }}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="Estado" focused={focused} /> }}
          />
          <Tab.Screen
            name="Camara"
            component={CamaraScreen}
            options={{ tabBarIcon: ({ focused }) => <TabIcon label="Cámara" focused={focused} /> }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const headerStyles = StyleSheet.create({
  safe: { backgroundColor: "#fff" },
  container: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E3EFF8" },
  logoArea: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#AED6F1", justifyContent: "center", alignItems: "center" },
  logoText: { fontSize: 20, color: "#fff", fontWeight: "500" },
  logoSub: { fontSize: 10, color: "#90A4B0" },
  logoNeo: { fontSize: 16, fontWeight: "500", color: "#2C3E50" },
  userArea: { alignItems: "flex-end" },
  userName: { fontSize: 13, fontWeight: "500", color: "#2C3E50" },
  userDate: { fontSize: 12, color: "#90A4B0" },
});

const metricStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: "500", marginBottom: 2, textAlign: "center" },
  valorRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center" },
  valor: { fontSize: 28, fontWeight: "500" },
  unidad: { fontSize: 14 },
  divider: { width: "80%", height: 1, marginTop: 14, opacity: 0.4, alignSelf: "center" },
});

const chartStyles = StyleSheet.create({
  container: { flexDirection: "row", height: 35, alignItems: "flex-end", justifyContent: "space-between", marginTop: 12, paddingHorizontal: 20 },
  barContainer: { flex: 1, alignItems: "center" },
  bar: { width: "70%", borderRadius: 2 },
});

const dashStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F9FD" },
  scroll: { paddingHorizontal: 16, paddingBottom: 30 },
  alertBanner: { backgroundColor: "#E74C3C", paddingVertical: 10, paddingHorizontal: 16 },
  alertText: { color: "#fff", fontSize: 13, fontWeight: "500", textAlign: "center" },
  sectionHeader: { backgroundColor: "#AED6F1", borderRadius: 8, paddingVertical: 8, marginTop: 16, marginBottom: 12, alignItems: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "500", color: "#1A5276" },
  botonesRow: { flexDirection: "row", gap: 12, marginTop: 4, marginBottom: 12 },
  boton: { flex: 1, borderWidth: 1, borderColor: "#AED6F1", borderRadius: 8, paddingVertical: 12, alignItems: "center", backgroundColor: "#fff" },
  botonPrimario: { backgroundColor: "#AED6F1", borderColor: "#AED6F1" },
  botonText: { fontSize: 13, fontWeight: "500", color: "#2980B9" },
  botonTextPrimario: { color: "#1A5276" },
  botonPDF: { backgroundColor: "#1A5276", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginBottom: 16 },
  botonPDFText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  camaraContainer: { borderRadius: 12, overflow: "hidden", height: 140, backgroundColor: "#1C2833", justifyContent: "center", alignItems: "center" },
  camaraPlaceholder: { alignItems: "center" },
  camaraPlaceholderText: { color: "#7F8C8D", fontSize: 14, textAlign: "center", lineHeight: 22 },
  reporteCard: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#D6EAF8", padding: 16, marginTop: 8, gap: 10, alignItems: "center" },
  reporteBadge: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  reporteNivel: { fontSize: 13, fontWeight: "500" },
  reporteDesc: { fontSize: 13, color: "#566573", textAlign: "center", lineHeight: 20 },
});

const camaraStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F9FD" },
  sectionHeader: { backgroundColor: "#AED6F1", borderRadius: 8, marginHorizontal: 16, marginTop: 16, paddingVertical: 8, alignItems: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "500", color: "#1A5276" },
  streamContainer: { margin: 16, borderRadius: 14, overflow: "hidden", height: 280, backgroundColor: "#1C2833", position: "relative" },
  stream: { width: "100%", height: "100%" },
  liveBadge: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#E74C3C" },
  liveText: { color: "#fff", fontSize: 11, fontWeight: "500" },
  infoCard: { marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#D6EAF8", padding: 14, gap: 4 },
  infoTitle: { fontSize: 14, fontWeight: "500", color: "#1A5276" },
  infoSub: { fontSize: 12, color: "#7F8C8D", lineHeight: 18 },
});

const appStyles = StyleSheet.create({
  tabBar: { backgroundColor: "#fff", borderTopColor: "#E3EFF8", borderTopWidth: 1, height: 60, paddingBottom: 6, paddingTop: 6 },
  tabIcon: { paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20 },
  tabIconActive: { backgroundColor: "#D6EAF8" },
  tabLabel: { fontSize: 13, color: "#90A4B0", fontWeight: "500" },
  tabLabelActive: { color: "#2980B9" },
});

registerRootComponent(App);