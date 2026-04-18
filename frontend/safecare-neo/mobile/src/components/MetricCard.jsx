import { View, Text, StyleSheet } from "react-native";

const NIVELES = {
  normal: { border: "#AED6F1", bg: "#EAF4FB", text: "#1A5276" },
  precaucion: { border: "#F9E79F", bg: "#FEFDE7", text: "#7D6608" },
  critico: { border: "#F1948A", bg: "#FDEDEC", text: "#922B21" },
};

export default function MetricCard({
  label,
  valor,
  unidad,
  nivel = "normal",
  showDivider = true,
}) {
  const colores = NIVELES[nivel] || NIVELES.normal;

  return (
    <View style={[styles.card, { borderColor: colores.border, backgroundColor: colores.bg }]}>
      <Text style={[styles.label, { color: colores.text }]}>{label}</Text>
      <View style={styles.valorRow}>
        <Text style={[styles.valor, { color: colores.text }]}>{valor}</Text>
        {unidad ? (
          <Text style={[styles.unidad, { color: colores.text }]}> {unidad}</Text>
        ) : null}
      </View>
      {showDivider && <View style={[styles.divider, { backgroundColor: colores.border }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 6,
  },
  valorRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  valor: {
    fontSize: 22,
    fontWeight: "500",
  },
  unidad: {
    fontSize: 13,
  },
  divider: {
    width: "80%",
    height: 1,
    marginTop: 12,
    opacity: 0.4,
  },
});