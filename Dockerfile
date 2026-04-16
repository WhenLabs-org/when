FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY dist/ dist/
COPY templates/ templates/

ENTRYPOINT ["node", "dist/mcp.js"]
