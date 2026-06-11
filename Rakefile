# frozen_string_literal: true

begin
  require "rspec/core/rake_task"
  RSpec::Core::RakeTask.new(:spec)
  task default: :spec
rescue LoadError
  # production bundle ships without test gems; only db tasks are available
end

namespace :db do
  desc "Run Sequel migrations against DATABASE_URL"
  task :migrate do
    require "sequel"
    Sequel.extension :migration
    db = Sequel.connect(ENV.fetch("DATABASE_URL"))
    Sequel::Migrator.run(db, File.expand_path("db/migrations", __dir__))
    puts "migrated to version #{db[:schema_info].get(:version)}"
  end
end
