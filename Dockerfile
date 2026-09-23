FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85

# SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Commercial
LABEL org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.authors="Omar Rao <omarsrao@gmail.com>" \
      org.opencontainers.image.title="github-gdrive-backup" \
      org.opencontainers.image.source="https://github.com/OmarRao/github-gdrive-backup"

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts
COPY src/ ./src/
RUN mkdir -p credentials
ENV NODE_ENV=production
ENTRYPOINT ["node", "src/cli.js"]
CMD ["help"]
