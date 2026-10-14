# claude-plugins

English | [繁體中文](README.zh-TW.md)

GuanweiPan's Claude Code plugin marketplace (`gwpan-plugins`).

| Plugin                             | Description                                                             |
| ---------------------------------- | ----------------------------------------------------------------------- |
| [tier-router](plugins/tier-router) | Routes each delegated subagent brief to the cheapest capable model tier |

## Install

At a Claude Code terminal prompt:

```
/plugin marketplace add GuanweiPan/claude-plugins
/plugin install <plugin>@gwpan-plugins
```

## Layout

Each plugin lives in `plugins/<name>/` with its own `.claude-plugin/plugin.json`, README and
CHANGELOG, and is listed in `.claude-plugin/marketplace.json`. Bump a plugin's `version` in its
`plugin.json` when releasing so installed copies pick up the update.

## Develop

```
claude plugin validate .                     # marketplace
claude plugin validate plugins/<name>        # one plugin
claude plugin test plugins/<name>
```
