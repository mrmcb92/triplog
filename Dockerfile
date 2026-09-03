FROM node:20-slim

# Hugging Face Spaces runs as user with UID 1000
RUN useradd -m -u 1000 user

WORKDIR /app

# Install dependencies first for better layer caching
COPY --chown=user package*.json ./
RUN npm install

# Copy the rest of the application
COPY --chown=user . /app

# Build server bundle to dist/server.cjs
RUN npm run build

# Remove development dependencies
RUN npm prune --omit=dev

USER user

ENV HF_PORT=7860 \
    PORT=7860 \
    NODE_ENV=production

EXPOSE 7860

CMD ["node", "dist/server.cjs"]
