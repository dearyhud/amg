require_relative "../crypto/password"

module AMG
  module Store
    # Idempotent first-boot setup: exactly one workspace (ADR-0010), and an
    # owner admin from AMG_BOOTSTRAP_EMAIL / AMG_BOOTSTRAP_PASSWORD if given.
    module Bootstrap
      def self.run(db, config, logger: nil)
        workspace_id = ensure_workspace(db)
        ensure_owner_admin(db, workspace_id, config, logger: logger)
        workspace_id
      end

      def self.ensure_workspace(db)
        workspaces = db[:workspaces]
        existing = workspaces.first
        return existing[:id] if existing

        workspaces.returning(:id).insert(name: "default").first[:id]
      end

      def self.ensure_owner_admin(db, workspace_id, config, logger: nil)
        admins = db[:admins]
        return if admins.where(workspace_id: workspace_id).any?

        unless config.bootstrap_email && config.bootstrap_password
          logger&.warn(
            "amg: no admin exists and AMG_BOOTSTRAP_EMAIL/AMG_BOOTSTRAP_PASSWORD are unset; " \
            "set them and restart to create the owner account"
          )
          return
        end

        admins.insert(
          workspace_id: workspace_id,
          email: config.bootstrap_email,
          password_hash: AMG::Crypto::Password.hash(config.bootstrap_password),
          role: "owner"
        )
      end
    end
  end
end
