module AMG
  module Policy
    # Matches a policy rule's `target` against the request's target (SPEC §8.1).
    # MCP: exact tool name or "*". REST: "METHOD /path/glob" where "*" matches
    # one path segment and "**" matches any suffix; method may be "*".
    module TargetMatcher
      def self.match?(rule_target, request_target, kind:)
        case kind
        when :mcp then mcp_match?(rule_target, request_target)
        when :rest then rest_match?(rule_target, request_target)
        else
          false
        end
      end

      def self.mcp_match?(rule_target, request_target)
        rule_target == "*" || rule_target == request_target
      end
      private_class_method :mcp_match?

      def self.rest_match?(rule_target, request_target)
        rule_method, rule_path = split_target(rule_target)
        req_method, req_path = split_target(request_target)
        return false unless rule_method && rule_path && req_method && req_path

        (rule_method == "*" || rule_method == req_method) && path_match?(rule_path, req_path)
      end
      private_class_method :rest_match?

      def self.split_target(target)
        method, path = target.split(" ", 2)
        return [nil, nil] unless method && path

        [method, path]
      end
      private_class_method :split_target

      # Segment-wise glob match: "*" matches exactly one segment, "**" matches
      # any number of remaining segments (must be the rule's final segment).
      def self.path_match?(rule_path, request_path)
        rule_segments = rule_path.split("/")
        request_segments = request_path.split("/")
        match_segments?(rule_segments, request_segments)
      end
      private_class_method :path_match?

      def self.match_segments?(rule_segments, request_segments)
        return true if rule_segments.empty? && request_segments.empty?
        return false if rule_segments.empty?

        head, *rule_rest = rule_segments
        return !request_segments.empty? if head == "**"
        return false if request_segments.empty?

        req_head, *req_rest = request_segments
        return false unless segment_matches?(head, req_head)

        match_segments?(rule_rest, req_rest)
      end
      private_class_method :match_segments?

      def self.segment_matches?(rule_segment, request_segment)
        rule_segment == "*" || rule_segment == request_segment
      end
      private_class_method :segment_matches?
    end
  end
end
