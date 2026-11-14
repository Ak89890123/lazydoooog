// Facts are sourced from legacy/github-io-v1/index.html. Counts are historical,
// not a claim that a live service is being monitored by this website.
export const featuredProjects = [
  {
    id: 'content',
    title: '社群自動化內容工廠',
    category: '內容營運 / 多平台發布',
    summary: '從主題、AI 文案到多平台發布與成效回收，讓內容生產形成一條完整的工作流。',
    color: '#c8ff35',
    tools: ['n8n', 'OpenAI', 'Webhook', 'Social APIs'],
    details: [
      ['面對的問題', '多主題、多帳號的內容營運，需要反覆製作文案、安排發布並回收數據。'],
      ['我的做法', '以 n8n 串接 ChatGPT／Gemini、熱門話題來源與社群 API，加入排程、圖片處理及 Google Sheets 數據回收。'],
      ['專案範圍', '原履歷記錄管理 8 個以上帳號，涵蓋服飾、搞笑、韓流等不同主題；以下為既有 n8n 工作流展示影片。'],
    ],
  },
  {
    id: 'knowledge',
    title: 'RAG 知識庫助手',
    category: 'AI 應用 / 知識檢索',
    summary: '把散落的文件，變成能查詢的知識。從資料載入、向量化，到 AI Agent 的檢索與回答。',
    color: '#53a8ff',
    tools: ['n8n', 'Supabase', 'Embeddings', 'AI Agent'],
    details: [
      ['面對的問題', '知識散落在文件中，單靠模型本身無法取得特定組織或專案的資訊。'],
      ['我的做法', '文件經 Data Loader 載入與分塊後，以 OpenAI Embeddings 向量化，儲存於 Supabase Vector Store，再由 AI Agent 進行語意檢索與問答。'],
      ['系統組成', '整合 OpenAI Chat Model 作為推理引擎，並使用 Query Data Tool 查詢結構化資料。'],
    ],
  },
  {
    id: 'operations',
    title: '讓非技術團隊，也能操作。',
    category: '系統交付 / No-code UI',
    summary: '把自動化能力放進業務熟悉的表單，讓觸發流程、輸入資料與查看結果，都有清楚的入口。',
    color: '#ff7a2f',
    tools: ['n8n Forms', 'Webhook', 'No-code UI'],
    details: [
      ['面對的問題', '流程已經能執行，但非技術使用者仍需要一個容易操作的前端。'],
      ['我的做法', '使用 n8n Form Trigger 建立操作表單，讓業務人員透過表單觸發自動化流程。'],
      ['交付重點', '把資料輸入與流程觸發整合在可理解的介面，降低團隊使用自動化的門檻。'],
    ],
  },
];
