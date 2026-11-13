FROM node:22-alpine

WORKDIR /app

# Copy package manifests first for caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server code
COPY server.js ./

# Set environment
ENV NODE_ENV=production

# Render automatically injects PORT (default 10000)
EXPOSE 10000 8787

CMD ["node", "server.js"]
