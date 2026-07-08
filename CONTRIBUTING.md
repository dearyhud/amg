# Contributing to AMG

Thanks for your interest in contributing to AMG (Agentic MCP Gateway). This
document covers how to set up the project, the expectations for a PR, and
where to find the context behind non-obvious decisions.

## Before you start

- For anything beyond a small fix, please open an issue first to discuss the
  change. This is especially true for anything touching the policy engine,
  auth/crypto, or the audit log — these are the security-critical core of the
  gateway.
- Full requirements, architecture, and the ADRs behind every non-obvious
  decision live in [`amg-spec/`](amg-spec/). Read the relevant ADR before
  changing behavior it governs.
- Implementation findings and fail-closed resolutions to spec ambiguities are
  recorded in [`DECISIONS.log`](DECISIONS.log). Add an entry there if your
  change resolves a new ambiguity or introduces a fail-closed default.

## Development setup

Requires Ruby 3.3+, Postgres 16, and Node 20 (for the console).

```bash
bundle install
(cd web && npm install)

export AMG_DATABASE_URL=postgres://localhost/amg_dev
export AMG_MASTER_KEY=$(openssl rand -base64 32)
bundle exec rake db:migrate
```

See the [README Quickstart](README.md#quickstart) for running the full stack
via docker-compose.

## Running checks

```bash
bundle exec rake test    # RE2-ban check + RSpec + policy coverage gate
bundle exec rubocop
(cd web && npm run build && npm run lint)
```

`rake test` requires a running Postgres reachable at `AMG_DATABASE_URL`
(defaults to `AMG_TEST_DATABASE_URL`, falling back to
`postgres://postgres:amg@127.0.0.1:55432/amg_test` — see
`spec/support/database.rb`).

All of the above must pass before a PR will be merged.

## Code expectations

- `lib/amg/policy/` is a pure decision engine: no I/O, RE2-only regex
  (the RE2-ban check enforces this), and must maintain ≥95% test coverage.
- New behavior needs tests. Prefer adding to the existing RSpec suite
  (`spec/`) in the same style as neighboring specs; end-to-end behavior
  belongs in `spec/acceptance/agent_e2e_spec.rb`.
- Follow the existing rubocop configuration rather than introducing new
  style exceptions.
- Never commit real secrets, credentials, or upstream tokens — including in
  test fixtures or specs.

## Submitting a pull request

1. Fork the repo and create a branch off `main`.
2. Make your change, with tests, following the layout in the
   [README's repository layout](README.md#repository-layout).
3. Run the checks above locally.
4. Open a PR against `main` and fill out the PR template — it will be
   pre-populated automatically.
5. Be responsive to review feedback; security-sensitive paths (policy engine,
   crypto, audit log) may get closer scrutiny and take longer to merge.

## License

AMG is licensed under the [Business Source License 1.1](LICENSE), not a
traditional OSI open-source license — it converts to Apache 2.0 four years
after each release. By submitting a contribution, you agree it will be
distributed under these same terms.

## Reporting security issues

Please do not open a public issue for a suspected security vulnerability.
Instead, contact the maintainers directly so a fix can be prepared before
disclosure.
