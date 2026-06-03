# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first — Docker layer caches this unless dependencies change
COPY package*.json ./
RUN npm ci --only=production

# ---- Runtime stage ----
FROM node:18-alpine

WORKDIR /app

# Copy only what we need — no devDependencies, no source maps
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./

# Don't run as root inside the container
USER node

EXPOSE 3000

CMD ["node", "src/index.js"]
