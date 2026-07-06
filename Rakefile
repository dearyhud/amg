require "rake"

task default: :test

desc "Run the full test suite (policy no-Regexp check + RSpec + policy coverage gate)"
task test: ["lint:no_native_regexp", "spec", "coverage:policy_gate"]

require "rspec/core/rake_task"
RSpec::Core::RakeTask.new(:spec)

namespace :coverage do
  desc "Fail unless lib/amg/policy line coverage is >= 95% (SPEC §16.1)"
  task :policy_gate do
    require "json"

    resultset_path = File.join(__dir__, "coverage", ".resultset.json")
    unless File.exist?(resultset_path)
      warn "No coverage/.resultset.json found; run rake spec first"
      exit 1
    end

    resultset = JSON.parse(File.read(resultset_path))
    policy_dir = File.join(__dir__, "lib", "amg", "policy")

    covered = 0
    total = 0
    resultset.each_value do |suite|
      (suite["coverage"] || {}).each do |file, data|
        next unless file.start_with?(policy_dir)

        lines = data.is_a?(Hash) ? data["lines"] : data
        lines.compact.each do |hits|
          total += 1
          covered += 1 if hits.positive?
        end
      end
    end

    if total.zero?
      puts "coverage:policy_gate: no lib/amg/policy files yet, skipping"
      next
    end

    pct = (covered.to_f / total * 100)
    puts format("coverage:policy_gate: lib/amg/policy line coverage %<pct>.2f%% (%<covered>d/%<total>d)",
                pct: pct, covered: covered, total: total)
    if pct < 95
      warn format("lib/amg/policy coverage %.2f%% is below the required 95%%", pct)
      exit 1
    end
  end
end

namespace :lint do
  desc "Fail if lib/amg/policy uses native Regexp (RE2 only, SPEC §16.1)"
  task :no_native_regexp do
    offenders = []
    Dir.glob(File.join(__dir__, "lib", "amg", "policy", "**", "*.rb")).each do |file|
      File.readlines(file).each_with_index do |line, idx|
        next if line.strip.start_with?("#")

        if line =~ /(?<!RE2::)\bRegexp\b/ || line =~ %r{(?<![a-zA-Z0-9_])/[^/\s][^/]*/[a-zA-Z]*(?=\s|$|[,).])}
          offenders << "#{file}:#{idx + 1}: #{line.strip}"
        end
      end
    end
    unless offenders.empty?
      warn "Native Regexp usage banned in lib/amg/policy (use RE2):\n#{offenders.join("\n")}"
      exit 1
    end
  end
end

desc "Run RuboCop"
task :rubocop do
  sh "bundle exec rubocop"
end

namespace :db do
  desc "Run pending migrations"
  task :migrate do
    require_relative "lib/amg/config"
    require_relative "lib/amg/store/db"
    config = AMG::Config.load
    AMG::Store::DB.migrate(config.database_url)
  end
end

desc "Run the dev server"
task :dev do
  sh "bundle exec puma -C config/puma.rb"
end
