# AMG backend image — shared by the data plane (config.ru) and the admin
# plane (admin.ru); docker-compose picks the command per service.
FROM ruby:3.4-slim

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends build-essential libpq-dev libyaml-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Gemfile Gemfile.lock ./
RUN bundle config set --local without "development test" && \
    bundle install --jobs 4 --retry 3

COPY Rakefile config.ru admin.ru ./
COPY db/ db/
COPY lib/ lib/

EXPOSE 9292 9293

CMD ["bundle", "exec", "puma", "-b", "tcp://0.0.0.0:9292", "config.ru"]
