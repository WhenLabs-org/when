FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY dist/ ./dist/
COPY action/ ./action/

ENTRYPOINT ["node", "/app/dist/action/index.js"]
