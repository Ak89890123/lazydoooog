import './studio.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { skillGroups, resumeSections } from './sections/resume-content.js';
import animationMap from './animation-map.json';
import { featuredProjects } from './sections/featured-projects.js';

gsap.registerPlugin(ScrollTrigger);

const portfolioUrl = 'https://brave-cricket-1e4.notion.site/AI-23f6e83c928880d0b45ff6db26679604';
const hero = animationMap.sections.find(({ id }) => id === 'hero');
const about = animationMap.sections.find(({ id }) => id === 'about');
const nav = [['about', '關於'], ['skills', '技能'], ['experience', '經歷'], ['projects', '作品'], ['values', '理念'], ['contact', '聯絡']];
const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.5"/></svg>';
const external = 'target="_blank" rel="noopener noreferrer"';
const staticReading = new URLSearchParams(location.search).get('motion') === 'off';
document.documentElement.dataset.motion = staticReading ? 'reduced' : 'auto';
const readingLink = `<a class="reading-mode" href="${staticReading ? '?' : '?motion=off'}">${staticReading ? '開啟動態' : '靜態閱讀'}</a>`;

document.querySelector('#app').innerHTML = `
  <header class="studio-header">
    <a class="wordmark" href="#hero" aria-label="LazyDoooog，回到首頁"><span class="wordmark-symbol">c<span>.</span></span><span>LazyDoooog<small>AI WORKFLOW ENGINEER</small></span></a>
    <nav aria-label="履歷導覽">${nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
    <div class="header-actions">${readingLink}<a class="header-mail" href="mailto:a89890123@gmail.com">一起做點什麼 ${arrow}</a></div>
    <button class="menu-toggle" aria-label="開啟導覽" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span></button>
  </header>
  <nav id="mobile-menu" class="mobile-menu" aria-label="手機履歷導覽" hidden>${nav.map(([id, label]) => `<a href="#${id}">${label}${arrow}</a>`).join('')}${readingLink}</nav>
  <main>
    <section id="hero" class="studio-hero" aria-labelledby="hero-title">
      <div class="hero-stage" data-studio-hero-stage>
        <div class="hero-grid" aria-hidden="true"></div>
        <div class="hero-studio-art" data-world-hero>
          <img class="hero-character-fallback" src="/assets/references/lazydooog-leaning-pose-v1.png" alt="拿著滑板的 Lazydoooog" fetchpriority="high" />
        </div>
        <div class="hero-intro wrap" data-hero-intro>
          <p class="occupation"><i aria-hidden="true"></i> LazyDoooog · AI Workflow Automation Engineer</p>
          <h1 id="hero-title">把重複，<br>交給<span class="type-outline">系統。</span></h1>
          <p class="hero-summary">讓想法往前走，<br>讓工作自己運作。</p>
          <div class="hero-actions"><a class="action action-primary" href="#projects">探索我的作品 ${arrow}</a><a class="text-link" href="${portfolioUrl}" ${external}>完整作品集 ${arrow}</a></div>
        </div>
        <div class="hero-bottom wrap" data-hero-intro>
          <p>n8n / LLM / API Integration</p>
          <a href="#about" class="scroll-cue">向下探索工作室 <span aria-hidden="true">↓</span></a>
          <p class="hero-location">TAIWAN · REMOTE</p>
        </div>
        <div class="hero-film" data-studio-film aria-hidden="true">
          <img src="${hero.poster}" alt="" />
          <video data-studio-film-video muted playsinline preload="none" poster="${hero.poster}">
            <source data-src="${hero.video}" type="video/mp4" />
            <source data-src="${hero.fallbackVideo}" type="video/mp4" />
          </video>
        </div>
        <div class="hero-paper" data-studio-paper aria-hidden="true"><canvas></canvas></div>
      </div>
    </section>

    <section id="about" class="studio-about" aria-labelledby="about-title">
      <div class="about-stage" data-about-stage>
        <header class="section-heading wrap">
          <h2 id="about-title">有玩心。<br><span>也有讓它落地的能力。</span></h2>
          <p>我從真實工作現場出發，<br>把需求、資料與 AI，接成團隊能使用的系統。</p>
        </header>
        <div class="about-world" data-world-about></div>
        <div class="about-console wrap">
          <article class="console-screen" data-console-screen><span class="console-led" aria-hidden="true"></span><h3>看見重複</h3><p>拆解日常操作，找到真正值得自動化的環節。</p></article>
          <article class="console-screen" data-console-screen><span class="console-led" aria-hidden="true"></span><h3>接起系統</h3><p>串接 LLM、資料與 API，讓每一步有清楚的責任。</p></article>
          <article class="console-screen" data-console-screen><span class="console-led" aria-hidden="true"></span><h3>交付工作方式</h3><p>讓團隊看得懂、接得手，遇到問題也知道如何恢復。</p></article>
        </div>
        <div class="about-caption wrap"><span>從需求，到真正運作。</span><a class="text-link" href="#skills">看看怎麼做 ${arrow}</a></div>
      </div>
    </section>

    <section id="skills" class="studio-skills section-space" aria-labelledby="skills-title">
      <div class="wrap">
        <header class="section-heading"><h2 id="skills-title">工具很多。<br><span>重點是，接起來。</span></h2><p>從模型推理、系統整合到資料回收，<br>把散落的工具，變成完整的工作流。</p></header>
        <div class="workflow-bench">
          <div class="bench-head"><span class="small-type">流程示意</span><div class="workflow-options" role="group" aria-label="選擇示範工作流"><button type="button" data-workflow="content" aria-pressed="true">社群內容</button><button type="button" data-workflow="rag" aria-pressed="false">知識檢索</button></div><button class="run-flow" type="button" data-run-flow>執行一次 <span aria-hidden="true">↗</span></button></div>
          <ol class="workflow-track" aria-label="工作流步驟">${['接收需求', 'AI 處理', '檢查與整合', '交付結果'].map((label, i) => `<li data-flow-node><span class="node-icon" aria-hidden="true">${['↳', '✳', '⌘', '↗'][i]}</span><strong>${label}</strong><span class="node-status">等待</span></li>`).join('')}</ol>
          <div class="flow-result"><span class="result-indicator" aria-hidden="true"></span><p data-flow-result role="status">選一個工作流，看看資料如何走到結果。</p></div>
        </div>
        <div class="tool-ledger">${skillGroups.map((group, i) => `<article style="--signal:var(--signal-${i})"><h3>${group.title}</h3><p>${group.description}</p><ul>${group.skills.map((tool) => `<li>${tool}</li>`).join('')}</ul></article>`).join('')}</div>
      </div>
    </section>

    <section id="experience" class="studio-experience section-space" aria-labelledby="experience-title">
      <div class="wrap experience-layout">
        <header class="experience-heading"><h2 id="experience-title">從生產現場，<br>走到系統背後。</h2><p>流程改善，一直是我的工作。<br>改變的是工具，留下的是對現場的理解。</p><div class="experience-figure"><strong>130<span>%</span></strong><p>台灣卜蜂任職期間<br>最高生產效率</p></div><div class="education"><span>國立中興大學 · 學士</span><span>English · TOEIC 745</span></div></header>
        <div class="experience-records">${resumeSections.find(({ id }) => id === 'experience').detail}<div class="experience-footnote"><span>現場觀察</span><i aria-hidden="true">→</i><span>流程設計</span><i aria-hidden="true">→</i><span>系統交付</span></div></div>
      </div>
    </section>

    <section id="projects" class="studio-projects section-space" aria-labelledby="projects-title">
      <div class="wrap">
        <header class="section-heading"><h2 id="projects-title">讓作品，<br><span>替能力說話。</span></h2><a class="text-link" href="${portfolioUrl}" ${external}>全部專案 ${arrow}</a></header>
        <div class="project-list">${featuredProjects.map((project, i) => `
          <article class="project-row" style="--project-color:${project.color}">
            <div class="project-art project-art--${project.id}" aria-hidden="true">
              ${i === 0 ? `<div class="project-monitor"><div class="monitor-chrome"><i></i><i></i><i></i></div><img src="${about.workflowMedia.poster}" alt="" loading="lazy" /><span class="monitor-line"></span></div><span class="art-orbit"></span>` : i === 1 ? `<div class="data-stack"><span></span><span></span><span></span><span></span></div><div class="data-target">✳</div>` : `<div class="signal-pipe"></div><div class="system-wheel">↗</div>`}
            </div>
            <div class="project-copy"><p class="project-category">${project.category}</p><h3>${project.title}</h3><p>${project.summary}</p><ul class="project-tools">${project.tools.map((tool) => `<li>${tool}</li>`).join('')}</ul><button class="text-link" type="button" data-project="${project.id}">打開專案 ${arrow}</button></div>
          </article>`).join('')}</div>
        <div class="project-proof"><p>既有專案紀錄</p><div><strong>5,136<span>+</span></strong><span>七日自動化執行次數</span></div><div><strong>11</strong><span>已部署 Workflows</span></div><div><strong>15</strong><span>完成自動化專案</span></div></div>
      </div>
    </section>

    <section id="values" class="studio-values section-space" aria-labelledby="values-title">
      <div class="wrap"><div class="values-statement"><h2 id="values-title">把時間還給人，<br><span>把可能留給想法。</span></h2><img src="/assets/references/lazydooog-leaning-pose-v1.png" alt="Lazydoooog 靠著滑板休息" loading="lazy" /></div><div class="values-ledger"><article><h3>先理解，再自動化。</h3><p>先弄清楚誰在做、為什麼做，再決定哪些事情值得交給系統。</p></article><article><h3>能運作，也能接手。</h3><p>好的交付不只成功執行一次，也要讓下一個使用它的人看得懂。</p></article><article><h3>保留玩心，認真落地。</h3><p>用實驗探索可能，用可操作的作品回答問題。</p></article></div></div>
    </section>

    <section id="contact" class="studio-contact section-space" aria-labelledby="contact-title">
      <div class="wrap contact-layout"><div><p class="occupation"><i aria-hidden="true"></i> 面試邀請 / 專案合作</p><h2 id="contact-title">下一個想法，<br>一起<span>實現。</span></h2><a class="contact-email" href="mailto:a89890123@gmail.com">a89890123@gmail.com ${arrow}</a><div class="contact-links"><a href="https://github.com/Ak89890123" ${external}>GitHub ${arrow}</a><a href="https://www.linkedin.com/in/jimmy-chen-642b53103" ${external}>LinkedIn ${arrow}</a><a href="https://www.threads.com/@lazydoooog" ${external}>Threads ${arrow}</a></div></div><div class="contact-object" data-world-contact aria-hidden="true"><img src="/assets/posters/contact-iphone-live-fallback.png" alt="" loading="lazy" /></div></div>
      <footer class="wrap"><span>© ${new Date().getFullYear()} LazyDoooog</span><a href="#hero">回到頂端 ↑</a></footer>
    </section>
  </main>
  <dialog class="project-dialog" aria-labelledby="project-dialog-title"><button class="dialog-close" type="button" aria-label="關閉專案">×</button><div data-project-detail></div></dialog>
  <div class="page-progress" aria-hidden="true"><span></span></div>
`;

const abort = new AbortController();
const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: abort.signal });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const menu = document.querySelector('#mobile-menu');
const menuButton = document.querySelector('.menu-toggle');
const closeMenu = () => {
  menu.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', '開啟導覽');
  document.querySelector('main').inert = false;
  document.body.classList.remove('menu-is-open');
};
listen(menuButton, 'click', () => {
  if (!menu.hidden) { closeMenu(); return; }
  menu.hidden = false;
  menuButton.setAttribute('aria-expanded', 'true');
  menuButton.setAttribute('aria-label', '關閉導覽');
  document.querySelector('main').inert = true;
  document.body.classList.add('menu-is-open');
  menu.querySelector('a').focus();
});
listen(matchMedia('(min-width: 768px)'), 'change', closeMenu);
listen(document, 'keydown', (event) => { if (event.key === 'Escape' && !menu.hidden) { closeMenu(); menuButton.focus(); } });
document.querySelectorAll('a[href^="#"]').forEach((link) => listen(link, 'click', (event) => {
  closeMenu();
  const trigger = ScrollTrigger.getById(`studio-${link.hash.slice(1)}`);
  if (trigger) {
    event.preventDefault();
    history.pushState(null, '', link.hash);
    window.scrollTo({ top: trigger.start + 1, behavior: reducedMotion.matches || staticReading ? 'instant' : 'smooth' });
  }
}));

const dialog = document.querySelector('.project-dialog');
document.querySelectorAll('[data-project]').forEach((button) => listen(button, 'click', () => {
  const project = featuredProjects.find(({ id }) => id === button.dataset.project);
  document.querySelector('[data-project-detail]').innerHTML = `<p class="project-category">${project.category}</p><h2 id="project-dialog-title">${project.title}</h2><p class="dialog-summary">${project.summary}</p><dl>${project.details.map(([heading, copy]) => `<div><dt>${heading}</dt><dd>${copy}</dd></div>`).join('')}</dl>${project.id === 'content' ? `<video controls playsinline preload="metadata" poster="${about.workflowMedia.poster}"><source src="${about.workflowMedia.sources[0].src}" type="video/mp4" /></video>` : ''}<a class="action action-primary" href="${portfolioUrl}" ${external}>前往完整作品集 ${arrow}</a>`;
  dialog.showModal();
}));
listen(dialog.querySelector('.dialog-close'), 'click', () => dialog.close());
listen(dialog, 'click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
listen(dialog, 'close', () => dialog.querySelector('video')?.pause());

const flowLabels = {
  content: ['接收主題', '生成文案', '格式檢查', '排程發布'],
  rag: ['接收問題', '語意檢索', '整合知識', '產生回答'],
};
const flowOutputs = {
  content: '示意完成：主題已轉成文案，通過格式檢查後送入發布排程。',
  rag: '示意完成：問題已轉成檢索需求，相關知識交由模型整理為回答。',
};
let selectedFlow = 'content';
let flowTimeline;
const nodes = [...document.querySelectorAll('[data-flow-node]')];
const runButton = document.querySelector('[data-run-flow]');
const result = document.querySelector('[data-flow-result]');
const resetFlow = () => {
  flowTimeline?.kill();
  runButton.disabled = false;
  nodes.forEach((node, i) => { node.classList.remove('is-running', 'is-done'); node.querySelector('strong').textContent = flowLabels[selectedFlow][i]; node.querySelector('.node-status').textContent = '等待'; });
};
document.querySelectorAll('[data-workflow]').forEach((button) => listen(button, 'click', () => {
  selectedFlow = button.dataset.workflow;
  document.querySelectorAll('[data-workflow]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  resetFlow();
  result.textContent = '工作流已切換。按下「執行一次」開始示意。';
}));
listen(runButton, 'click', () => {
  resetFlow();
  runButton.disabled = true;
  result.textContent = '正在依序處理。這是本機流程示意，不會發布內容或呼叫外部服務。';
  flowTimeline = gsap.timeline({ onComplete: () => { runButton.disabled = false; result.textContent = flowOutputs[selectedFlow]; } });
  nodes.forEach((node, i) => {
    const reduced = reducedMotion.matches || staticReading;
    const at = reduced ? i * 0.08 : i * 0.65;
    flowTimeline.call(() => { node.classList.add('is-running'); node.querySelector('.node-status').textContent = '處理中'; }, [], at);
    flowTimeline.call(() => { node.classList.remove('is-running'); node.classList.add('is-done'); node.querySelector('.node-status').textContent = '完成'; }, [], at + (reduced ? 0.06 : 0.5));
  });
});
resetFlow();

const sectionObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    document.querySelectorAll('.studio-header nav a').forEach((a) => {
      if (a.hash === `#${entry.target.id}`) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }
}, { rootMargin: '-25% 0px -55% 0px' });
document.querySelectorAll('main > section').forEach((section) => sectionObserver.observe(section));

let motion;
let disposed = false;
import('./studio-motion.js').then(async ({ initStudioMotion }) => {
  motion = await initStudioMotion(animationMap);
  if (disposed) motion.destroy();
}).catch((error) => { document.documentElement.classList.add('studio-static'); console.warn('Studio motion unavailable; readable fallback retained.', error); });

listen(window, 'pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  motion?.destroy();
  sectionObserver.disconnect();
  flowTimeline?.kill();
  abort.abort();
});
