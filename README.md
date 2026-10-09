# tier-router

English | [繁體中文](README.zh-TW.md)

A Claude Code mod that routes each delegated subagent to the cheapest model tier that can do the job.
The orchestrator keeps running on your session model (Fable, Opus, ...) and writes the brief; before
the subagent starts, a cheap classifier reads the brief, picks a tier, and the mod fills the model.

| Tier  | Default model | When                                                   |
| ----- | ------------- | ------------------------------------------------------ |
| light | `haiku`       | Mechanical, checked at a glance                        |
| small | `sonnet`      | Needs reading, specified well enough to check          |
| mid   | `opus`        | Implementation with tests, diagnosis, measurement      |
| top   | (inherit)     | Cross-system design, conflicting evidence; stays as is |

## Rules

- Fills the model only when the Agent call left it unset; a model the orchestrator chose is kept.
- Below `minConfidence` (default 0.5) the spawn inherits the session model.
- Never raises cost: `top` is never assigned, and a tier whose model is not cheaper than the
  parent's family (e.g. `opus` under an Opus session) inherits instead.
- Fails open: a classifier error, timeout or unparseable answer leaves the spawn as written.
- Only routes agent types with no model of their own (default `general-purpose,claude,Explore,Plan`).
  Forks, workflow agents and teammates are never touched.

Each decision costs one small classifier call (default `haiku`, `effort: low`, 64 output tokens).

## Install

At a Claude Code terminal prompt:

```
/plugin install tier-router --marketplace GuanweiPan/tier-router
```

Answer `y` to add the marketplace, then pick a scope (user makes it available in every project).

Or run it from the folder for one session:

```
claude --plugin-dir /path/to/tier-router
```

## Use

- `/tier-router` shows counts per tier and outcome, plus the last 10 decisions with their reasons.
- `/tier-router clear` empties the log (kept in the mod store, last 500 decisions, shared across sessions).
- With `announce` on, the chosen tier shows as a line under the Agent call while it starts.

## Options

Set in `/config` or under `pluginConfigs` in settings:

| Option            | Default                               | Meaning                                   |
| ----------------- | ------------------------------------- | ----------------------------------------- |
| `enabled`         | `true`                                | Turn routing on or off                    |
| `classifierModel` | `haiku`                               | Model that judges each brief              |
| `lightModel`      | `haiku`                               | Model for the light tier                  |
| `smallModel`      | `sonnet`                              | Model for the small tier                  |
| `midModel`        | `opus`                                | Model for the mid tier                    |
| `minConfidence`   | `0.5`                                 | Below this, inherit                       |
| `agentTypes`      | `general-purpose,claude,Explore,Plan` | Comma-separated types to route            |
| `announce`        | `true`                                | Show the chosen tier under the Agent call |
| `timeoutMs`       | `8000`                                | Classifier time limit before failing open |

## Develop

```
claude plugin validate .
claude plugin test .
```

The brief is passed to the classifier as data. A brief crafted to steer the classifier can at most
pick a cheaper tier for its own subagent; it can never raise the model above the session's.

Built against Claude Code 2.1.294. Mods are an early-access surface and may change between releases.
