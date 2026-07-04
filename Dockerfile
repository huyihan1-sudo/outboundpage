FROM gosom/google-maps-scraper:latest AS gosom-runtime

FROM node:24-bookworm-slim

WORKDIR /app

ENV HOME=/app
ENV XDG_CACHE_HOME=/app/.cache
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright
ENV PLAYWRIGHT_DRIVER_PATH=/app/.cache

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

RUN mkdir -p /app/tools/gosom /app/.cache
COPY --from=gosom-runtime /usr/bin/google-maps-scraper /app/tools/gosom/google-maps-scraper
COPY --from=gosom-runtime /opt/browsers /app/.cache/ms-playwright
COPY --from=gosom-runtime /opt/ms-playwright-go /app/.cache/ms-playwright-go
RUN chmod +x /app/tools/gosom/google-maps-scraper \
  && chmod -R 755 /app/.cache/ms-playwright /app/.cache/ms-playwright-go

ENV NODE_ENV=production
ENV PORT=3000
ENV GOSOM_BINARY=/app/tools/gosom/google-maps-scraper

EXPOSE 3000

CMD ["node", "server.js"]
