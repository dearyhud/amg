# AMG Console — Vite build served by nginx at /admin, with /admin/api and
# /mcp proxied to the backend services.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# VITE_MOCK=0 (default) talks to the real admin plane through nginx;
# VITE_MOCK=1 ships the console with its MSW mock API instead
# (see console/README.md "Backend gaps").
ARG VITE_MOCK=0
ENV VITE_MOCK=$VITE_MOCK
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/admin
