# Build stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/attached_assets ./attached_assets
RUN mkdir -p uploads/product-images
EXPOSE 8080
ENV PORT=8080 NODE_ENV=production
CMD ["node", "--max-old-space-size=1536", "dist/index.js"]
