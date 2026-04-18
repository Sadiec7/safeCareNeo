import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import Header from "../components/Header";

// El ESP32-CAM expone un stream MJPEG en esta ruta
// Cambia la IP por la de tu ESP32 en la red local
const STREAM_URL = "http://192.168.1.100/stream";

export default function CamaraScreen() {
  return (
    <View style={styles.screen}>
      <Header />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Cámara en tiempo real</Text>
      </View>

      <View style={styles.streamContainer}>
        {/* 
          El componente Image de React Native puede mostrar un MJPEG
          directamente usando la URL del stream del ESP32-CAM.
          Si no hay conexión mostrará el placeholder.
        */}
        <Image
          source={{ uri: STREAM_URL }}
          style={styles.stream}
          resizeMode="cover"
        />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>EN VIVO</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Incubadora — Neonato 001</Text>
        <Text style={styles.infoSub}>
          Transmisión directa desde la cámara ESP32-CAM instalada en la incubadora.
        </Text>
      </View>

      <TouchableOpacity style={styles.fotoBtn}>
        <Text style={styles.fotoBtnText}>TOMAR FOTO</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F9FD",
  },
  sectionHeader: {
    backgroundColor: "#AED6F1",
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 8,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1A5276",
  },
  streamContainer: {
    margin: 16,
    borderRadius: 14,
    overflow: "hidden",
    height: 280,
    backgroundColor: "#1C2833",
    position: "relative",
  },
  stream: {
    width: "100%",
    height: "100%",
  },
  liveBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E74C3C",
  },
  liveText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
  },
  infoCard: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6EAF8",
    padding: 14,
    gap: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A5276",
  },
  infoSub: {
    fontSize: 12,
    color: "#7F8C8D",
    lineHeight: 18,
  },
  fotoBtn: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#AED6F1",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  fotoBtnText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A5276",
  },
});