FROM node:24-bookworm-slim

ARG GOSOM_VERSION=1.12.1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/tools/gosom \
  && curl -L \
    "https://github.com/gosom/google-maps-scraper/releases/download/v${GOSOM_VERSION}/google_maps_scraper-${GOSOM_VERSION}-linux-amd64" \
    -o /app/tools/gosom/google-maps-scraper \
  && chmod +x /app/tools/gosom/google-maps-scraper

ENV NODE_ENV=production
ENV PORT=3000
ENV GOSOM_BINARY=/app/tools/gosom/google-maps-scraper

EXPOSE 3000

CMD ["node", "server.js"]
