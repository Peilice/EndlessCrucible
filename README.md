# 無盡坩堝 Endless Crucible

從水、火、土、風開始，把 2～3 個元素放進練成台、按下「練成」，不停發現新元素的煉金網頁遊戲。

- 支援桌機與手機，可安裝為 PWA 離線遊玩
- 進度存在瀏覽器，可用存檔碼在裝置間搬移

## 開發

```sh
npm install
npm run dev        # 開發伺服器
npm run check      # 型別檢查 + 內容驗證 + 測試
npm run build      # 正式建置（輸出到 dist/）
npm run validate   # 只跑內容驗證，並印出內容統計
```

## 新增或修改內容

內容全部在 `content/` 底下，改 YAML 即可，不需要動程式：

| 檔案 | 內容 |
|---|---|
| `content/game.yaml` | 元素框數、配方材料數上下限、提示參數、啟用的內容包 |
| `content/packs/<包>/pack.yaml` | 起始元素、分類 |
| `content/packs/<包>/elements.yaml` | 元素（id、名稱、emoji、分類、描述） |
| `content/packs/<包>/recipes.yaml` | 配方，一行一組：`water + fire = steam` |
| `content/packs/<包>/achievements.yaml` | 成就 |
| `content/locales/zh-TW.yaml` | 介面文字 |

改完後執行 `npm run validate`，它會檢查重複配方、引用錯誤、無法合成出來的元素等問題。CI 會在驗證失敗時停止部署。

## 架構

- `src/core/`：遊戲規則（配方、存檔、提示、成就、驗證），不碰 DOM，可獨立測試
- `src/ui/`：畫面與輸入
- `src/content/`：建置期載入 YAML

完整設計決策見 [docs/DESIGN.md](docs/DESIGN.md)。

## 部署

推送到 `main` 後，GitHub Actions 會自動檢查並部署到 GitHub Pages（需在 repo 的 Settings → Pages 把 Source 設為 GitHub Actions）。
