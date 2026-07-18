# A plain Node box — works on Render, Railway, Fly, Cloud Run, anywhere.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/index.js"]
