# claude-plugins

[English](README.md) | 繁體中文

GuanweiPan 的 Claude Code plugin marketplace（`gwpan-plugins`）。

| Plugin                             | 說明                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| [tier-router](plugins/tier-router) | 將每個委派出去的子代理任務，交給能勝任的最便宜模型等級 |

## 安裝

在 Claude Code 終端機輸入：

```
/plugin marketplace add GuanweiPan/claude-plugins
/plugin install <plugin>@gwpan-plugins
```

## 目錄結構

每個 plugin 放在 `plugins/<name>/`，各自有 `.claude-plugin/plugin.json`、README 與 CHANGELOG，
並列在 `.claude-plugin/marketplace.json` 中。發布新版時請調高該 plugin `plugin.json` 的 `version`，
已安裝的使用者才會收到更新。

## 開發

```
claude plugin validate .                     # marketplace
claude plugin validate plugins/<name>        # 單一 plugin
claude plugin test plugins/<name>
```
