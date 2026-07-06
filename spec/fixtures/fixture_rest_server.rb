require "puma"
require "puma/server"
require "rack"
require "json"
require "socket"
require "timeout"

module AMG
  module Spec
    # A tiny in-process HTTP fixture upstream for REST proxy tests. Exposes
    # POST /book and GET /accounts/:id. Every request it receives (method,
    # path, Authorization header) is recorded in #requests_received, so
    # tests can assert on injected-credential behavior without the fixture
    # echoing secrets back into its own response body.
    class FixtureRestServer
      attr_reader :port, :requests_received

      def self.start
        new.tap(&:start)
      end

      def start
        @port = pick_port
        @requests_received = []
        @mutex = Mutex.new
        events = Puma::Events.new
        @server = Puma::Server.new(method(:call), events)
        @server.add_tcp_listener("127.0.0.1", @port)
        @thread = Thread.new { @server.run.join }
        wait_until_listening
        self
      end

      def stop
        @server&.stop(true)
        @thread&.join(2)
      end

      def call(env)
        request = Rack::Request.new(env)
        @mutex.synchronize do
          @requests_received << { method: request.request_method, path: request.path,
                                  authorization: request.get_header("HTTP_AUTHORIZATION") }
        end

        if request.request_method == "POST" && request.path == "/book"
          book(request)
        elsif request.request_method == "GET" && request.path.start_with?("/accounts/")
          [200, { "Content-Type" => "application/json" }, [{ "account" => request.path.split("/").last }.to_json]]
        else
          [404, {}, ["not found"]]
        end
      end

      private

      def book(request)
        body = JSON.parse(request.body.read)
        [200, { "Content-Type" => "application/json" }, [{
          "booked" => true,
          "amount" => body["amount"],
          "currency" => body["currency"]
        }.to_json]]
      end

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
