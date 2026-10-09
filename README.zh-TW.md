# tier-router

[English](README.md) | 繁體中文

這是一個 Claude Code mod，會替每個委派出去的子代理挑選「做得好這件事的最便宜模型等級」。
主控代理繼續用你工作階段的模型（Fable、Opus 等）撰寫任務說明；子代理啟動前，由一個便宜的分類模型讀過任務說明、判斷等級，再由 mod 填入對應的模型。

| 等級  | 預設模型 | 適用情境                                 |
| ----- | -------- | ---------------------------------------- |
| light | `haiku`  | 機械性工作，一眼就能檢查結果             |
| small | `sonnet` | 需要閱讀理解，但規格明確、結果容易驗證   |
| mid   | `opus`   | 含測試的實作、除錯診斷、效能量測         |
| top   | （沿用） | 跨系統設計、證據互相矛盾，維持原本的模型 |

## 規則

- 只在 Agent 呼叫沒有指定模型時才填入；主控代理自己選的模型一律保留。
- 信心低於 `minConfidence`（預設 0.5）時，沿用工作階段的模型。
- 只降不升：絕不指派 `top`；若某等級的模型不比主模型便宜（例如主模型是 Opus 時的 `opus`），也改為沿用。
- 失敗時放行：分類模型出錯、逾時或回答無法解析，子代理照原樣啟動。
- 只處理本身沒有指定模型的代理類型（預設 `general-purpose,claude,Explore,Plan`）。
  fork、workflow 代理與 teammate 一律不動。

每次判斷只多一次小型分類呼叫（預設 `haiku`、`effort: low`、最多 64 個輸出 token）。

## 安裝

在 Claude Code 終端機輸入：

```
/plugin install tier-router --marketplace GuanweiPan/tier-router
```

出現是否加入 marketplace 時回答 `y`，再選安裝範圍（建議 user，所有專案都能用）。

或者只在單一工作階段從資料夾載入：

```
claude --plugin-dir /path/to/tier-router
```

## 使用方式

- `/tier-router`：顯示各等級與各結果的次數，以及最近 10 筆決策和原因。
- `/tier-router clear`：清空紀錄（存在 mod 的 store 中，保留最近 500 筆，跨工作階段共用）。
- 開啟 `announce` 時，子代理啟動期間會在 Agent 呼叫下方顯示一行所選的等級。

## 設定選項

可在 `/config` 調整，或寫在設定檔的 `pluginConfigs` 底下：

| 選項              | 預設值                                | 說明                           |
| ----------------- | ------------------------------------- | ------------------------------ |
| `enabled`         | `true`                                | 開啟或關閉路由                 |
| `classifierModel` | `haiku`                               | 負責判斷任務說明的模型         |
| `lightModel`      | `haiku`                               | light 等級使用的模型           |
| `smallModel`      | `sonnet`                              | small 等級使用的模型           |
| `midModel`        | `opus`                                | mid 等級使用的模型             |
| `minConfidence`   | `0.5`                                 | 低於此信心值就沿用主模型       |
| `agentTypes`      | `general-purpose,claude,Explore,Plan` | 要路由的代理類型，以逗號分隔   |
| `announce`        | `true`                                | 在 Agent 呼叫下方顯示所選等級  |
| `timeoutMs`       | `8000`                                | 分類模型的時間上限，逾時即放行 |

## 開發

```
claude plugin validate .
claude plugin test .
```

分級標準（rubric）寫在 `hooks/route.ts`，可依 `/tier-router` 的紀錄調整。

任務說明是以「資料」的形式交給分類模型。即使有人刻意撰寫任務說明來影響分類，最多只能讓自己的子代理用更便宜的等級，永遠無法把模型調高到超過工作階段的模型。

以 Claude Code 2.1.294 開發。mods 目前是搶先體驗（early access）功能，API 可能隨版本變動。
