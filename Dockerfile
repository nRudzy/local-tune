FROM node:20-alpine

# Install python3, ffmpeg, and yt-dlp
RUN apk add --no-cache python3 ffmpeg curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY backend/ ./

# Copy frontend as static files
COPY frontend/ ./public/

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
