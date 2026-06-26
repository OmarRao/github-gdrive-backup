FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
RUN mkdir -p credentials
ENV NODE_ENV=production
ENTRYPOINT ["node", "src/cli.js"]
CMD ["help"]
