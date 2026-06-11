# frozen_string_literal: true

module AMG
  # Namespaced tool names: "<server>__<tool>". The server segment may not
  # contain consecutive underscores, so the first "__" is an unambiguous
  # separator and names like "notion__../stripe__x" are rejected outright.
  module Tool
    NAME = /\A[a-z0-9]+(?:_[a-z0-9]+)*__[a-z0-9_]+\z/
    SEGMENT = /\A[a-z0-9]+(?:_[a-z0-9]+)*\z/

    module_function

    def valid?(name)
      name.is_a?(String) && NAME.match?(name)
    end

    def split(name)
      raise Error, "malformed tool name: #{name.inspect}" unless valid?(name)

      name.split("__", 2)
    end

    def join(server, tool)
      "#{server}__#{tool}"
    end
  end
end
