# Symphony Setup

This repo now includes a full local setup path for the OpenAI Symphony Elixir reference implementation.

## What is included

Tracked repo assets:
- `config/symphony/WORKFLOW.md`: full repo-specific Symphony workflow contract.
- `config/symphony/codex.config.toml`: baseline Codex workspace config that gets copied into Symphony issue workspaces when a local `.codex/config.toml` is not already present.
- `config/symphony/AGENTS.override.md`: tracked workspace override policy for Symphony clones.
- `scripts/symphony/setup.sh`: installs/builds Symphony under `tools/symphony`, installs local Codex templates, and syncs upstream Symphony skills.
- `scripts/symphony/doctor.sh`: validates runtime prerequisites, auth, and required environment.
- `scripts/symphony/run.sh`: starts Symphony with the Fueki workflow and Phoenix dashboard.
- `scripts/symphony/bootstrap-workspace.sh`: bootstrap hook executed inside each Symphony workspace after clone.

Local runtime assets created by setup:
- `tools/symphony/`: upstream Symphony checkout and built Elixir runtime.
- `.codex/skills/{linear,pull,commit,push,land}`: upstream Symphony skills synced locally for workspace use.
- `.codex/config.toml`: installed from `config/symphony/codex.config.toml` if you do not already have one.

## Required external dependencies

The full setup expects:
- Codex CLI available as `codex`
- GitHub CLI (`gh`) installed and authenticated
- Linear personal API token
- a Linear project configured with the workflow states listed below

The setup script will install `mise`, `gh`, and `jq` via Homebrew if they are missing. It does not create GitHub or Linear credentials for you.

## Required Linear workflow states

This workflow expects these states to exist for the Linear project/team you point Symphony at:
- `Todo`
- `In Progress`
- `In Review`
- terminal states such as `Done`, `Closed`, `Cancelled`, `Duplicate`

This repo is configured for your current Linear workflow and does not require extra custom review states.

## Required environment

```bash
export LINEAR_API_KEY=your_linear_personal_api_key
export SYMPHONY_LINEAR_PROJECT_SLUG=your_linear_project_slug
```

Useful overrides:

```bash
export SYMPHONY_SOURCE_REPO_URL=/absolute/path/to/local/repo
export SYMPHONY_WORKSPACE_ROOT="$HOME/.local/share/fueki-tokenization-platform/symphony-workspaces"
export SYMPHONY_LOGS_ROOT="$HOME/.local/state/fueki-tokenization-platform/symphony"
export SYMPHONY_PORT=4177
export CODEX_BIN="$(command -v codex)"
```

Default behavior:
- `SYMPHONY_SOURCE_REPO_URL` defaults to the current repo root path.
- issue workspaces install both root and `backend/` Node dependencies.
- the Phoenix observability UI starts on `http://localhost:4177` unless overridden.
- `scripts/symphony/run.sh` renders a runtime workflow file under the logs directory so the tracked workflow can stay generic while `project_slug` is injected at launch.
- the repo workflow defaults to `4` concurrent orchestrators. CPU and memory can support more, but this host's current disk headroom cannot sustain additional cloned workspaces and dependency installs reliably.

## Install and build

```bash
npm run symphony:setup
```

What that does:
1. clones or updates `https://github.com/openai/symphony` into `tools/symphony`
2. installs the upstream-pinned Elixir/Erlang runtime via `mise`
3. runs `mix setup` and `mix build`
4. installs local Codex templates
5. syncs the upstream Symphony skills into local `.codex/skills`

## Readiness check

```bash
npm run symphony:doctor
```

The doctor command fails if any of these are missing:
- `codex`
- `git`
- `gh`
- authenticated `gh auth status`
- `mise`
- `LINEAR_API_KEY`
- `SYMPHONY_LINEAR_PROJECT_SLUG`
- built Symphony binary
- repo workflow/bootstrap/template files

## Run Symphony

```bash
npm run symphony:run
```

## Scope and limitations

- This is still based on the upstream Symphony engineering preview. It is not a hardened production orchestration service.
- The upstream implementation is Linear-only. This setup does not add GitHub Issues or a custom tracker adapter.
- The workflow is configured for full issue lifecycle management using Linear comments/states plus GitHub PR automation, so `gh auth` is treated as required for the full path.
- `tools/symphony/` is local runtime state and should not be committed.
