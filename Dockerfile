FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./server.mjs
COPY public ./public

CMD ["npm","start"]
