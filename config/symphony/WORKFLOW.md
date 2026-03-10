---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: $SYMPHONY_LINEAR_PROJECT_SLUG
  active_states:
    - Todo
    - In Progress
    - In Review
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: $SYMPHONY_WORKSPACE_ROOT
hooks:
  after_create: |
    set -euo pipefail

    if [ -n "${SYMPHONY_SOURCE_REPO_URL:-}" ]; then
      SOURCE_REPO="$SYMPHONY_SOURCE_REPO_URL"
    else
      SOURCE_REPO="$SYMPHONY_REPO_ROOT"
    fi

    case "$SOURCE_REPO" in
      http://*|https://*|ssh://*|git@*|file://*)
        git clone --depth 1 "$SOURCE_REPO" .
        ;;
      *)
        git clone "$SOURCE_REPO" .
        ;;
    esac

    if [ -d "${SYMPHONY_REPO_ROOT:-}/scripts/symphony" ]; then
      mkdir -p scripts config docs
      rm -rf scripts/symphony config/symphony
      cp -R "${SYMPHONY_REPO_ROOT}/scripts/symphony" scripts/
      cp -R "${SYMPHONY_REPO_ROOT}/config/symphony" config/
      if [ -f "${SYMPHONY_REPO_ROOT}/docs/symphony.md" ]; then
        cp "${SYMPHONY_REPO_ROOT}/docs/symphony.md" docs/symphony.md
      fi
    fi

    bash scripts/symphony/bootstrap-workspace.sh
  before_remove: |
    true
agent:
  max_concurrent_agents: 4
  max_turns: 20
codex:
  command: "$CODEX_BIN app-server"
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
---

You are working on a Linear ticket `{{ issue.identifier }}` inside an isolated Symphony workspace for the Fueki Tokenization Platform.

{% if attempt %}
Continuation context:
- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from current workspace state instead of restarting investigation.
- Do not repeat completed validation unless new code changes require it.
{% endif %}

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Read before doing anything:
1. `AGENTS.md`
2. `AGENTS.override.md`
3. `README.md`
4. any deeper `AGENTS.md` files in the paths you touch

## Available repo-local skills

- `linear`: use Symphony's `linear_graphql` tool for issue comments and state transitions.
- `pull`: sync with latest `origin/main` before implementation and when the branch drifts.
- `commit`: create a clean local commit after validation passes.
- `push`: publish the branch and create/update the PR.
- `land`: finish merge flow once the issue reaches `Merging`.

## Required workflow states in Linear

This workflow expects these states to exist on the team/project:
- `Todo`
- `In Progress`
- `In Review`
- terminal states such as `Done`, `Closed`, `Cancelled`, `Duplicate`

This repo is configured to use your existing Linear workflow instead of requiring extra custom states.

## Operating contract

1. This is an unattended orchestration session. Operate end-to-end unless blocked by missing auth, missing secrets, or missing project workflow states.
2. Never fabricate progress, tests, logs, or results.
3. Ship real production code only. No placeholders or TODO implementations in shipped paths.
4. Reproduce the issue or capture a concrete missing-behavior signal before changing code.
5. Keep changes minimal, secure, and maintainable.
6. Treat auth, KYC, admin/RBAC, approval, wallet, RPC, and on-chain flows as security-sensitive.
7. Run the relevant validation from `AGENTS.override.md` and report exact commands/results.
8. If blocked, stop and state the exact blocker and impact.

## Workpad protocol

Maintain a single Linear comment titled `## Codex Workpad` as the source of truth.

The workpad must contain:
- an environment stamp: `<host>:<abs-workdir>@<short-sha>`
- a checklist plan
- acceptance criteria
- validation checklist
- reproduction notes
- blocker notes when applicable

Always update the existing workpad comment instead of creating multiple status comments.
Use the `linear` skill to create or update the comment.

## State machine

- `Todo` -> immediately move to `In Progress`, then create/update the workpad.
- `In Progress` -> implement, validate, commit, and push.
- `In Review` -> monitor PR feedback/checks, address review updates if needed, and merge when approved.
- `Done` -> no further action.

## Execution flow

1. Determine issue state using the `linear` skill.
2. Find or create the `## Codex Workpad` comment.
3. Record reproduction evidence before editing code.
4. Run the `pull` skill before implementation.
5. Implement the fix or feature.
6. Run the required validation commands for the touched surfaces.
7. If validation passes, use the `commit` skill and then the `push` skill.
8. Update the workpad with commands, outcomes, and residual risks.
9. Move the issue to `In Review` only after the relevant checks pass and the PR exists.

## Validation floor

At minimum:
- `src/**` runtime changes: `npm run lint && npm run typecheck && npm run test:unit && npm run build`
- wallet / RPC / chain changes: also run `npx vitest run tests/unit/walletHardening.test.ts tests/unit/rpcEndpoints.test.ts tests/unit/networkRegistry.test.ts tests/unit/txExecution.test.ts --config vitest.config.ts`
- `backend/src/**` changes: `cd backend && npm run test && npm run build`
- contract changes: `npm run contracts:build` and relevant contract tests

## Final response contract

Every final Codex message for the ticket must include:
1. What changed
2. Why it is correct
3. Validation performed (commands/tests/results)
4. Security considerations
5. Residual risks / next steps
