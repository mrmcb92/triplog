FROM node:20-slim

# The official node image already includes a 'node' user with UID 1000,
# which is required by Hugging Face Spaces.
WORKDIR /app

# Install dependencies first for better layer caching
COPY --chown=node:node package*.json ./
RUN npm install

# Copy the rest of the application
COPY --chown=node:node . /app

# Build server bundle to dist/server.cjs
RUN npm run build

# Remove development dependencies
RUN npm prune --omit=dev

USER node

ENV HF_PORT=7860 \
    PORT=7860 \
    NODE_ENV=production

EXPOSE 7860

CMD ["node", "dist/server.cjs"]
