export const skillGroups = [
  {
    title: 'AI 與自動化',
    skills: ['n8n', 'LLM', 'Prompt Engineering', 'AI Agent'],
    description: '把 LLM、Prompt 與 Agent 接成可執行的自動化工作流。',
  },
  {
    title: '系統整合',
    skills: ['Webhook', 'OAuth', 'JSON Data Processing'],
    description: '把 Webhook、OAuth 與 JSON 資料接成可靠的系統流程。',
  },
  {
    title: '資料與工具',
    skills: ['Google Sheets', 'GCS'],
    description: '把 Google Sheets 與 GCS 組成可追蹤、可協作的資料層。',
  },
  {
    title: '成長與內容',
    skills: ['Lead Generation', '社群自動化'],
    description: '把 Lead Generation 與社群自動化變成可持續的成長流程。',
  },
];

export const resumeSections = [
  {
    id: 'hero',
    label: '首頁',
    eyebrow: 'AI WORKFLOW / AUTOMATION / PRODUCT',
    title: '<span>把流程</span><span>變成作品</span>',
    summary: '專注 n8n、LLM 與 API 整合，將內容、營運與資料工作拆成可維護、可交付的自動化系統。',
    detail: `
      <div class="hero-stats resume-metrics" data-reveal>
        <span><strong>5,136+</strong> 每週自動化執行</span>
        <span><strong>11</strong> 已部署 Workflows</span>
        <span><strong>15</strong> 完成專案</span>
        <span><strong>130%</strong> 最高生產效率</span>
      </div>
      <div class="hero-actions action-row" data-reveal>
        <a class="button button--primary" href="#experience">查看經歷</a>
        <a class="button button--ghost" href="mailto:a89890123@gmail.com">聯絡我</a>
      </div>
    `,
  },
  {
    id: 'about',
    label: '關於我',
    eyebrow: '01 / ABOUT',
    title: '<span>把複雜流程</span><span>變成可操作系統</span>',
    summary: '我從需求、資料流與日常操作出發，讓 AI 不只是一段示範，而是能被團隊穩定使用的工作方式。',
    detail: `
      <dl class="signal-list" data-reveal>
        <div><dt>需求拆解</dt><dd>把模糊問題轉成清楚的觸發、條件、資料與責任邊界。</dd></div>
        <div><dt>流程設計</dt><dd>串接 n8n、LLM、Webhook 與 API，建立可追蹤、可維護的資料流。</dd></div>
        <div><dt>介面交付</dt><dd>讓非工程團隊能看懂、能操作，也知道失敗時如何恢復。</dd></div>
      </dl>
    `,
  },
  {
    id: 'skills',
    label: '技能',
    title: '<span>從模型到現場</span><span>連起整條工作流</span>',
    summary: '技能不是關鍵字牆，而是把訊號接成可運作系統的工具組。',
    detail: `
      <div class="skill-ledger" data-reveal>
        <div><span>AI 與自動化</span><p>n8n · LLM · Prompt Engineering · AI Agent</p></div>
        <div><span>系統整合</span><p>Webhook · OAuth · JSON Data Processing</p></div>
        <div><span>資料與工具</span><p>Google Sheets · GCS</p></div>
        <div><span>成長與內容</span><p>Lead Generation · 社群自動化</p></div>
      </div>
    `,
  },
  {
    id: 'experience',
    label: '經歷',
    detail: `
      <ol class="career-route" data-reveal>
        <li>
          <time aria-label="2025 年 11 月至 2026 年 4 月"><span class="experience-date__value">2025.11</span><i class="experience-date__track" aria-hidden="true"></i><span class="experience-date__value">2026.04</span></time>
          <div><strong>AI Workflow Automation Engineer</strong><span class="experience-company">零一成長行銷有限公司 · Remote</span><p>從零建立行銷科技自動化架構，涵蓋內容生成、SEO 報告、Lead Generation 與多平台發布。</p></div>
        </li>
        <li>
          <time aria-label="2024 年 11 月至 2025 年 10 月"><span class="experience-date__value">2024.11</span><i class="experience-date__track" aria-hidden="true"></i><span class="experience-date__value">2025.10</span></time>
          <div><strong>Refining Manager</strong><span class="experience-company">台灣卜蜂企業股份有限公司 · 南投</span><p>優化生產控制流程、跨國協作與部門資訊流；推動 7 套 n8n 工作流，最高生產效率提升至 130%。</p></div>
        </li>
      </ol>
    `,
  },
  {
    id: 'contact',
    label: '聯絡',
  },
];
