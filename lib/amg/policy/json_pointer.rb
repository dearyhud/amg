module AMG
  module Policy
    # Minimal RFC 6901 JSON Pointer resolver over plain Hash/Array structures.
    # No native Regexp: token splitting and unescaping are plain String ops.
    module JsonPointer
      MISSING = Object.new.freeze

      # Resolves `pointer` (e.g. "/body/amount", "/path/0") against `document`.
      # Returns MISSING if any segment is absent, out of range, or the
      # document shape doesn't support indexing at that segment (fail closed).
      def self.resolve(document, pointer)
        return MISSING unless pointer.is_a?(String)
        return document if pointer.empty?
        return MISSING unless pointer.start_with?("/")

        tokens = pointer[1..].split("/", -1).map { |t| unescape(t) }
        tokens.reduce(document) do |node, token|
          return MISSING if node == MISSING

          fetch(node, token)
        end
      end

      def self.fetch(node, token)
        case node
        when Hash
          node.key?(token) ? node[token] : MISSING
        when Array
          index = integer_index(token)
          return MISSING unless index

          index >= 0 && index < node.length ? node[index] : MISSING
        else
          MISSING
        end
      end
      private_class_method :fetch

      def self.integer_index(token)
        Integer(token, 10)
      rescue ArgumentError, TypeError
        nil
      end
      private_class_method :integer_index

      def self.unescape(token)
        token.gsub("~1", "/").gsub("~0", "~")
      end
      private_class_method :unescape
    end
  end
end
