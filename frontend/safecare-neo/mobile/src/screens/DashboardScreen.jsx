import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import Header from "../components/Header";
import MetricCard from "../components/MetricCard";

const DATOS_DEMO = {
  temperatura: 37.1,
  humedad: 58,
  presion: 1013,
  nivel_riesgo: "normal",
  alerta_ia: false,
};

export default function DashboardScreen({ navigation }) {
  const [datos, setDatos] = useState(DATOS_DEMO);
  const [alerta, setAlerta] = useState(null);
  const alertaAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (alerta) {
      Animated.timing(alertaAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(alertaAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [alerta]);

  const getNivel = () => datos?.nivel_riesgo || "normal";

  const getColorBadge = () => {
    const n = getNivel();
    if (n === "critico") return { bg: "#FDEDEC", color: "#922B21" };
    if (n === "precaucion") return { bg: "#FEFDE7", color: "#7D6608" };
    return { bg: "#EAF9F0", color: "#1E8449" };
  };

  const getTextoIA = () => {
    const n = getNivel();
    if (n === "critico") return "Se detectaron valores fuera del rango seguro. Contacte al médico de inmediato.";
    if (n === "precaucion") return "Algunos valores están cerca de los límites. Se recomienda monitoreo continuo.";
    return "Todos los parámetros del neonato se encuentran dentro del rango normal.";
  };

  const getNivelTexto = () => {
    const n = getNivel();
    if (n === "critico") return "Riesgo crítico";
    if (n === "precaucion") return "Precaución";
    return "Estado normal";
  };

  const colores = getColorBadge();

  return (
    <View style={styles.screen}>
      <Header />

      {alerta && (
        <Animated.View style={[styles.alertBanner, { opacity: alertaAnim }]}>
          <Text style={styles.alertText}>Alerta: {alerta.mensaje}</Text>
        </Animated.View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Estado médico</Text>
        </View>

        <MetricCard
          label="Temperatura"
          valor={datos.temperatura.toFixed(1)}
          unidad="°C"
          nivel={getNivel()}
        />
        <MetricCard
          label="Humedad"
          valor={datos.humedad.toFixed(0)}
          unidad="%"
          nivel={getNivel()}
        />
        <MetricCard
          label="Presión"
          valor={datos.presion.toFixed(0)}
          unidad="hPa"
          nivel={getNivel()}
          showDivider={false}
        />

        <View style={styles.botonesRow}>
          <TouchableOpacity style={styles.boton}>
            <Text style={styles.botonText}>FOTO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.boton, styles.botonPrimario]}
            onPress={() => navigation && navigation.navigate("Camara")}
          >
            <Text style={[styles.botonText, styles.botonTextPrimario]}>
              TIEMPO REAL
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.camaraContainer}>
          <View style={styles.camaraPlaceholder}>
            <Text style={styles.camaraPlaceholderText}>
              Cámara ESP32-CAM{"\n"}Sin conexión
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Reporte según la IA</Text>
        </View>

        <View style={styles.reporteCard}>
          <View style={[styles.reporteBadge, { backgroundColor: colores.bg }]}>
            <Text style={[styles.reporteNivel, { color: colores.color }]}>
              {getNivelTexto()}
            </Text>
          </View>
          <Text style={styles.reporteDesc}>{getTextoIA()}</Text>
        </View>
      </ScrollView>
    </View>


    
    
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F9FD",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  alertBanner: {
    backgroundColor: "#E74C3C",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  alertText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  sectionHeader: {
    backgroundColor: "#AED6F1",
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 16,
    marginBottom: 12,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1A5276",
  },
  botonesRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    marginBottom: 14,
  },
  boton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#AED6F1",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  botonPrimario: {
    backgroundColor: "#AED6F1",
    borderColor: "#AED6F1",
  },
  botonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#2980B9",
  },
  botonTextPrimario: {
    color: "#1A5276",
  },
  camaraContainer: {
    borderRadius: 12,
    overflow: "hidden",
    height: 220,
    backgroundColor: "#1C2833",
    justifyContent: "center",
    alignItems: "center",
  },
  camaraPlaceholder: {
    alignItems: "center",
  },
  camaraPlaceholderText: {
    color: "#7F8C8D",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  reporteCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6EAF8",
    padding: 16,
    marginTop: 8,
    gap: 10,
    alignItems: "center",
  },
  reporteBadge: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  reporteNivel: {
    fontSize: 13,
    fontWeight: "500",
  },
  reporteDesc: {
    fontSize: 13,
    color: "#566573",
    textAlign: "center",
    lineHeight: 20,
  },
});