require "securerandom"
require "digest"

module AMG
  module Admin
    # Admin session lifecycle (SPEC §11): email+argon2id password, HttpOnly
    # session cookie, double-submit CSRF cookie. Sessions are DB rows keyed
    # by sha256(token) so a stolen DB backup never yields usable tokens.
    module Session
      TOKEN_BYTES = 32
      TTL_SECONDS = 7 * 24 * 60 * 60

      Admin = Struct.new(:id, :workspace_id, :email, :role, keyword_init: true)

      def self.authenticate(db, email, password)
        admin = db[:admins].where(email: email).first
        return nil unless admin
        return nil unless Crypto::Password.verify?(password, admin[:password_hash])

        Admin.new(id: admin[:id], workspace_id: admin[:workspace_id], email: admin[:email], role: admin[:role])
      end

      def self.create(db, admin_id)
        token = SecureRandom.urlsafe_base64(TOKEN_BYTES)
        db[:admin_sessions].insert(
          admin_id: admin_id,
          token_hash: Sequel.blob(hash_token(token)),
          expires_at: Time.now + TTL_SECONDS
        )
        { token: token, csrf_token: SecureRandom.urlsafe_base64(TOKEN_BYTES) }
      end

      def self.destroy(db, token)
        return unless token

        db[:admin_sessions].where(token_hash: Sequel.blob(hash_token(token))).delete
      end

      # Returns the current Admin for a session token, or nil if missing,
      # unknown, or expired. Fails closed: any lookup miss is "not logged in".
      def self.current_admin(db, token)
        return nil unless token

        row = db[:admin_sessions]
              .join(:admins, id: :admin_id)
              .where(Sequel[:admin_sessions][:token_hash] => Sequel.blob(hash_token(token)))
              .where { Sequel[:admin_sessions][:expires_at] > Time.now }
              .select(
                Sequel[:admins][:id], Sequel[:admins][:workspace_id], Sequel[:admins][:email], Sequel[:admins][:role]
              )
              .first
        return nil unless row

        Admin.new(**row)
      end

      def self.hash_token(token)
        Digest::SHA256.digest(token)
      end
      private_class_method :hash_token
    end
  end
end
