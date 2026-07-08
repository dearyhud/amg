## Summary

<!-- What does this PR do, and why? Link any related issue. -->

## Changes

<!-- Bullet the key changes. Call out anything that touches the policy
     engine, audit log, or crypto — these need extra scrutiny. -->

-

## Testing

<!-- How did you verify this? Paste relevant command output if useful. -->

- [ ] `bundle exec rake test` passes (RE2-ban check + RSpec + policy coverage gate)
- [ ] `bundle exec rubocop` passes
- [ ] `(cd web && npm run build && npm run lint)` passes, if the console changed

## Checklist

- [ ] I've added/updated tests for the behavior changed
- [ ] I've updated relevant docs (`README.md`, `amg-spec/`, `DECISIONS.log`) if behavior or decisions changed
- [ ] No real secrets, credentials, or upstream tokens are included in this diff
