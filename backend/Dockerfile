FROM node:20-alpine

WORKDIR /app

# Copy package manifests first for caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server code
COPY server.js ./

# Set environment
ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["node", "server.js"]
