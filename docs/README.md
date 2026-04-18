# Documentación Técnica — safeCareNeo

Este directorio contiene toda la documentación técnica del proyecto **safeCareNeo**.

## Índice

| Recurso | Tipo | Descripción |
|---------|------|-------------|
| [architecture/diagrama_sistema.svg](architecture/diagrama_sistema.svg) | SVG | Diagrama de arquitectura general del sistema |
| [hardware/Esquematico_sensor_bme280.svg](hardware/Esquematico_sensor_bme280.svg) | SVG | Esquemático de conexión del sensor BME280 al ESP32 |
| [hardware/Esquematico_m5go_ESP32.svg](hardware/Esquematico_m5go_ESP32.svg) | SVG | Esquemático del M5GO (ESP32 receptor de datos) |
| [api/README.md](api/README.md) | Markdown | Documentación completa de la API REST |
| [setup/README.md](setup/README.md) | Markdown | Guía de instalación y configuración del sistema |

## Descripción de carpetas

### `architecture/`
Diagramas de alto nivel que describen la arquitectura del sistema: flujo de datos, componentes y sus interacciones.

### `hardware/`
Esquemáticos de conexión eléctrica para los dispositivos IoT que forman parte del sistema:
- **BME280**: sensor de temperatura, humedad y presión.
- **M5GO (M5Stack Core)**: dispositivo ESP32 que actúa como receptor y visualizador.

### `api/`
Documentación detallada de todos los endpoints del backend REST (Node.js/Express).

### `setup/`
Instrucciones paso a paso para instalar, configurar y ejecutar el proyecto en un entorno local o de producción.
