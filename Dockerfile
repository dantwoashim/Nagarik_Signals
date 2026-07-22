FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV NAGARIK_DATA_DIR=/data

COPY --from=build /app /app
VOLUME ["/data"]
EXPOSE 3001

CMD ["npm", "run", "start", "--workspace", "@nagarik-signal/web", "--", "--hostname", "0.0.0.0", "--port", "3001"]
