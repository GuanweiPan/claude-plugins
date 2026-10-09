# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `agent.spawn` hook that classifies each delegated brief into light, small, mid or top and fills the subagent model from a configurable table.
- Safeguards: respects a model set by the caller, inherits below the confidence threshold, never assigns top or a model at or above the parent's family, and fails open on any classifier error.
- `/tier-router` command showing the decision log, and `/tier-router clear`.
- `userConfig` options for models, threshold, routed agent types, announce and timeout.
- Tests covering routing, safeguards and the command.
