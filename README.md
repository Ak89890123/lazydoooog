# Lazydoooog 互動履歷

網站：https://ak89890123.github.io/lazydoooog/

首頁為最新 v3：Three.js 工作室、電視作品牆、滑板街景、星球經歷與聯絡手機。
手機與減少動態模式保留完整 HTML 履歷。`v3.html?hero=3d&game=runner` 亦可直接開啟；前版保留於 `studio.html` 與 `prototype.html`。

## 本機開發

需要 Node.js 22.12 以上。

```sh
npm ci
npm run dev
npm test
npm run build
```

作品位於 `works/<folder>/work.json`，預覽檔為 `preview.gif`、`preview.webp`、`preview.png` 或 `preview.jpg`。使用 `npm run works -- add --title ... --preview ...` 新增。
正式素材位於 `public/assets`；影片及海報分別放在 `public/assets/videos` 與 `public/assets/posters`。

推送 main 後，GitHub Actions 執行測試、建置與 GitHub Pages 部署；建置路徑為 `/lazydoooog/`。
此公開儲存庫只包含網站原始碼、正式素材、必要測試與部署設定。

更新日期：2026-11-14。同步最新 v3 電視轉台、經歷排版與標籤簡化，品牌名稱為 LazyDoooog。
