# syntax=docker/dockerfile:1

FROM node:20-slim AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM ruby:3.3-slim AS gateway

# Node/npm are part of the runtime, not just the console build: mcp_stdio
# upstreams are commonly launched via `npx` (see docs/using-amg-with-an-agent.md),
# and AMG spawns those commands itself at request time.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends build-essential libpq-dev curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Gemfile Gemfile.lock ./
RUN bundle config set --local without 'development test' \
    && bundle install --jobs 4 --retry 3

COPY . .
COPY --from=web-builder /web/dist ./web/dist

ENV RACK_ENV=production
EXPOSE 8420

CMD ["bin/amg"]
