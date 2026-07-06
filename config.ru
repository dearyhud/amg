require_relative "lib/amg/boot"
require_relative "lib/amg/server/app"

AMG::Boot.call

run AMG::Server::App.app
