# Usamos una versión ligera de Node.js (Alpine es ideal para contenedores pequeños)
FROM node:18-alpine

# Definimos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos los archivos de gestión de dependencias
# Se copian primero para aprovechar el sistema de capas de Docker (cache)
COPY package*.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto del código de la aplicación
COPY . .

# Puerto en el que corre el API (se define en el yaml)
EXPOSE 8000

# Comando para arrancar la aplicación
CMD ["node", "server.js"]