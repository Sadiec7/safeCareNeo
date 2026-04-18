import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Cambia esta IP por la IP local de tu computadora cuando pruebes en físico
// En emulador Android usa: http://10.0.2.2:5000
// En tu teléfono real usa: http://192.168.X.X:5000
const BACKEND_URL = "http://10.0.2.2:5000";

const DATOS_DEMO = {
  temperatura: 37.1,
  humedad: 58,
  presion: 1013,
  nivel_riesgo: "normal",
  alerta_ia: false,
};

export default function useSensores() {
  const [datos, setDatos] = useState(DATOS_DEMO);
  const [conectado, setConectado] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ["websocket"],
      timeout: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConectado(true);
    });

    socket.on("disconnect", () => {
      setConectado(false);
    });

    socket.on("nueva_lectura", (lectura) => {
      setDatos(lectura);
    });

    socket.on("alerta_critica", (nuevaAlerta) => {
      setAlerta(nuevaAlerta);
      // Limpiar alerta después de 8 segundos
      setTimeout(() => setAlerta(null), 8000);
    });

    socket.on("connect_error", () => {
      setConectado(false);
      // Si no hay conexión, mantener datos demo
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { datos, conectado, alerta };
}