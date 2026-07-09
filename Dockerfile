# NSE Toolkit — zero-dependency Node server (server.js).
FROM node:20-slim

WORKDIR /app

# Copy the app (no npm install needed — the app has no dependencies).
COPY . .

# Fly routes to 8080; the server reads process.env.PORT.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
