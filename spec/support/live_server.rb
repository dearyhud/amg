require "puma"
require "puma/server"
require "socket"
require "timeout"

module AMG
  module Spec
    # Runs the real AMG::Server::App Roda app on a real TCP listener, so
    # acceptance tests can drive it with a real MCP client (streamable HTTP)
    # instead of Rack::Test simulation.
    class LiveServer
      attr_reader :port

      def self.start(app)
        new.tap { |s| s.start(app) }
      end

      def start(app)
        @port = pick_port
        events = Puma::Events.new
        @server = Puma::Server.new(app, events)
        @server.add_tcp_listener("127.0.0.1", @port)
        @thread = Thread.new { @server.run.join }
        wait_until_listening
        self
      end

      def base_url
        "http://127.0.0.1:#{@port}"
      end

      def stop
        @server&.stop(true)
        @thread&.join(2)
      end

      private

      def pick_port
        server = TCPServer.new("127.0.0.1", 0)
        port = server.addr[1]
        server.close
        port
      end

      def wait_until_listening
        Timeout.timeout(2) do
          loop do
            TCPSocket.new("127.0.0.1", @port).close
            break
          rescue Errno::ECONNREFUSED
            sleep 0.01
          end
        end
      end
    end
  end
end
