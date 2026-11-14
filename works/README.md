# 作品頻道：新增作品

`works/` 的每個子資料夾是 `v3.html` 作品頻道裡的一台電視。`src/v3/main.js` 用 `import.meta.glob` 讀取所有資料夾，新增作品不用改程式。

電視數量不限：作品區的捲動長度、3D Hero 的輸送帶與最後的轉場都依目前的電視重新計算。電視外框依 console → portable → monitor 循環使用。最後一件作品後面固定有一台獨立的轉場電視，外框接續循環；它先在螢幕上播出下一個場景，再被放大進去，所以新增作品不會改變轉場方式。滑板跑酷（`?game=runner`）的街景也依作品數量，每件作品一棟廣告牌大樓，用同一個預覽檔；預覽畫面的重點放在中間，GIF 在廣告牌上只顯示中間那一格。

街景大樓按門／店面開口校正尺度，新增作品不再把大樓縮窄；占地放不下時，自動延長街道與捲動距離。預覽完整等比放入螢幕，留白為深色；直式長螢幕把預覽放在可見的下段。靠近目前作品時螢幕提亮，遠離時壓暗。專屬日式廣告尚未接入，作品文字與連結仍由這裡的 HTML 電視提供。

## 用 CLI 新增（人與代理都用這個）

在 `resume/` 執行：

```powershell
npm run works -- list
npm run works -- add --title "作品名稱" --preview C:\path\shot.gif --summary "一句話說明" --tags "n8n,LLM" --href https://example.com/ --link-label "開啟作品"
npm test
```

- `add` 用網站本身的 `collectWorks` 驗證欄位，通過後建立下一個編號的 `works/NN-slug/`，把預覽檔複製成 `preview.<副檔名>`，並寫入 `work.json`。新作品排在最後一個頻道，轉場電視仍在它後面。
- 選填 `--frame console|portable|monitor` 指定電視外框，`--slug` 指定資料夾名稱（預設由 title 的英數字產生）。
- 缺少 title、預覽不是 gif／webp／png／jpg、`href` 不安全或 tags 超過 5 個時，指令失敗且不留下資料夾。預覽超過 1.5 MB 時只提出警告。
- 想調整順序時直接改資料夾編號；不要改 `src/v3/` 的程式。

## 手動新增

1. 建立 `works/NN-slug/`。資料夾名稱依字串排序決定頻道順序，`NN` 用兩位數（例如 `06`）；`slug` 只用來辨識。
2. 在資料夾內寫 `work.json`，欄位見下一節。
3. 放一個預覽檔，檔名必須是 `preview.gif`、`preview.webp`、`preview.png` 或 `preview.jpg`（小寫）。每個資料夾只能有一個預覽檔。

完成後在 `resume/` 執行 `npm test`。`src/v3/v3.test.js` 會檢查 `works/` 下的每個資料夾：`work.json` 是合法 JSON、有 `title`、剛好一個預覽檔，以及 `href` 格式正確。

## work.json

```json
{
  "title": "作品名稱",
  "summary": "一句話說明這個作品做了什麼。",
  "tags": ["n8n", "Google Sheets"],
  "href": "https://example.com/",
  "linkLabel": "開啟作品",
  "frame": "monitor"
}
```

| 欄位 | 必填 | 規則（`src/v3/works.js`） |
| --- | --- | --- |
| `title` | 是 | 字串，去掉前後空白後不可為空。缺少 `title` 或預覽檔的資料夾不會顯示 |
| `summary` | 否 | 字串；空字串不顯示 |
| `tags` | 否 | 字串陣列；略過空字串與非字串後取前 5 個，以「 · 」連接 |
| `href` | 否 | 只接受小寫 `https://` 或 `mailto:` 開頭，且不含空白、引號、`<`、`>`。不符合時電視不能點，頁面不報錯，但 `npm test` 會失敗 |
| `linkLabel` | 否 | 連結文字；有有效 `href` 但沒填時顯示「開啟作品」 |
| `frame` | 否 | `console`、`portable` 或 `monitor`。沒填或填其他值時，依排序位置輪流使用 console → portable → monitor；被略過的資料夾也佔一個位置 |

- `https://` 連結在新分頁開啟，並帶 `rel="noopener noreferrer"`；`mailto:` 不另開分頁。
- 所有文字都會經過 HTML escape，欄位裡不能放 HTML。表格以外的欄位會被忽略。

## 預覽檔

- 建議 480×360（4:3），最好 ≤ 1.5 MB。預覽圖以 `object-fit: cover` 填滿電視螢幕，邊緣可能被裁掉，重點放在中間。
- 預覽圖在 HTML 中是 `alt=""` 的裝飾圖；作品名稱、說明與連結都寫在 `work.json`。
- 只有目前頻道的電視（以及滑鼠移上或鍵盤聚焦的電視）顯示完整畫面，其他電視顯示關機線。

### 從影片轉 GIF

擷取 0–4.5 s、每秒 8 格、96 色：

```powershell
ffmpeg -ss 0 -t 4.5 -i demo.mp4 -vf "fps=8,scale=480:360:force_original_aspect_ratio=increase,crop=480:360,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" -loop 0 works/06-demo/preview.gif
```

用 `public/assets/videos/about-n8n-workflow-muted.mp4` 實測輸出 480×360、36 格、約 1.4 MB。超過 1.5 MB 時，先縮短 `-t` 或降低 `fps`，再降低 `max_colors`。

### 從截圖轉 GIF

`scripts/v3-still-to-gif.py` 需要 Python 與 Pillow。輸出固定 480×360、96 色、無 dithering、無限循環。參數依 argparse 定義：

```text
python scripts/v3-still-to-gif.py pan [-h] [--axis {x,y}] [--focus FOCUS] [--zoom ZOOM] image out
python scripts/v3-still-to-gif.py slides [-h] out images [images ...]
```

- `pan`：一張圖沿 `--axis`（預設 `x`）平移，依序停在起點、中間、終點、中間後循環，每處停 1.6 s，再用 3 格（各 90 ms）緩動移到下一處。`--zoom`（預設 1.35）是平移方向的放大餘量；`--focus`（0–1，預設 0.5）是另一方向的裁切位置。
- `slides`：每張圖等比縮小（不放大）並置中在深色畫面上，停 1.7 s，再用 3 格（各 70 ms）交叉淡化到下一張；最後一張接回第一張。

例如：`python scripts/v3-still-to-gif.py pan shot.png works/06-demo/preview.gif --axis y --focus 0.3`。
