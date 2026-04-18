import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Header({ nombre = "Alison Ugalde Arias", fecha = "07.03.2026" }) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>+</Text>
          </View>
          <View>
            <Text style={styles.logoSub}>Safecare</Text>
            <Text style={styles.logoNeo}>NEO</Text>
          </View>
        </View>
        <View style={styles.userArea}>
          <Text style={styles.userName}>{nombre}</Text>
          <Text style={styles.userDate}>{fecha}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: "#fff",
  },
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E3EFF8",
  },
  logoArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#AED6F1",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "500",
  },
  logoSub: {
    fontSize: 10,
    color: "#90A4B0",
  },
  logoNeo: {
    fontSize: 16,
    fontWeight: "500",
    color: "#2C3E50",
  },
  userArea: {
    alignItems: "flex-end",
  },
  userName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#2C3E50",
  },
  userDate: {
    fontSize: 12,
    color: "#90A4B0",
  },
});