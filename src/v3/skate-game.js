// Skateboard runner: jump the repetitive chores; the first clear of each kind unlocks a real automation.
// Lengths are stage heights (H); time is seconds.
export const PHYSICS = { jump: 1.7, gravity: 4.4, startSpeed: 1.25, maxSpeed: 2.3, accel: 0.03 };
export const DOG = { x: 0.3, height: 0.42, aspect: 0.8, ground: 0.9, hitbox: { left: 0.24, right: 0.8 } };
export const OBSTACLES = { paper: 0.24, box: 0.18, inbox: 0.15, cone: 0.21, computer: 0.19, binders: 0.14 };
export const INSET = 0.12;
const AIR_TIME = (2 * PHYSICS.jump) / PHYSICS.gravity;

// Seconds the board stays above `height` during a full jump.
export const airWindow = (height, { jump, gravity } = PHYSICS) => {
  const peak = (jump * jump) / (2 * gravity);
  return height >= peak ? 0 : 2 * Math.sqrt((2 * (peak - height)) / gravity);
};

export function initSkateGame(section, obstacleMeta) {
  const stage = section.querySelector('[data-game]');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const hit = stage.querySelector('[data-game-hit]');
  const status = stage.querySelector('[data-game-status]');
  const scoreEl = stage.querySelector('[data-game-score]');
  const unlocks = new Map([...section.querySelectorAll('[data-unlock]')].map((item) => [item.dataset.unlock, item]));
  let width = 1;
  let height = 1;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let keyAt = 0;
  let mode = 'idle';
  let speed = PHYSICS.startSpeed;
  let travelled = 0;
  let lift = 0;
  let velocity = 0;
  let buffer = 0;
  let gap = 0;
  let score = 0;
  let best = 0;
  let spin = 0;
  let crashTime = 0;
  let deck = [];
  let items = [];

  const sprite = (img, x, y, w, h) => { if (img.naturalWidth) ctx.drawImage(img, x, y, w, h); };
  const draw = () => {
    const view = width / height;
    ctx.setTransform(dpr * height, 0, 0, dpr * height, 0, 0);
    ctx.clearRect(0, 0, view, 1);
    if (backdrop.naturalWidth) {
      const tile = backdrop.naturalWidth / backdrop.naturalHeight;
      for (let x = -((travelled * 0.5) % tile); x < view; x += tile) ctx.drawImage(backdrop, x, 0, tile, 1);
    }
    ctx.fillStyle = 'rgba(8, 10, 11, 0.32)';
    ctx.fillRect(0, DOG.ground - 0.03, view, 0.2);
    ctx.strokeStyle = 'rgba(242, 243, 238, 0.08)';
    ctx.lineWidth = 0.004;
    for (let x = -(travelled % 0.8); x < view + 0.1; x += 0.8) {
      ctx.beginPath();
      ctx.moveTo(x, DOG.ground - 0.03);
      ctx.lineTo(x - 0.08, 1);
      ctx.stroke();
    }
    items.forEach(({ kind, x }) => sprite(kind.img, x, DOG.ground - kind.h, kind.w, kind.h));
    const img = mode === 'over' ? falling : riding;
    const h = DOG.height;
    const w = img.naturalWidth ? (h * img.naturalWidth) / img.naturalHeight : h * DOG.aspect;
    const cx = DOG.x + (h * DOG.aspect) / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(cx, DOG.ground - 0.004, 0.13 * Math.max(0.35, 1 - lift * 2), 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, DOG.ground - lift);
    ctx.rotate(mode === 'over' ? spin : -Math.max(-0.12, Math.min(0.28, velocity * 0.16)));
    sprite(img, -w / 2, -h, w, h);
    ctx.restore();
  };
  const image = (src) => {
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => { if (mode !== 'running') draw(); });
    img.src = src;
    return img;
  };
  const backdrop = image('/assets/v3/runner-bg.webp');
  const riding = image('/assets/v3/dog-glide.webp');
  const falling = image('/assets/v3/dog-air.webp');
  const kinds = obstacleMeta.filter(({ id }) => OBSTACLES[id]).map((meta) => ({
    id: meta.id,
    h: OBSTACLES[meta.id],
    w: (OBSTACLES[meta.id] * meta.width) / meta.height,
    img: image(meta.src),
  }));
  items = [{ kind: kinds[0], x: 1.25, passed: true }];

  const nextKind = () => {
    if (!deck.length) deck = [...kinds].sort(() => Math.random() - 0.5);
    return deck.pop();
  };
  const chip = (label) => {
    const el = document.createElement('span');
    el.className = 'game-chip';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = label;
    el.style.left = `${(DOG.x + 0.04) * height}px`;
    el.style.top = `${Math.max(0.04, DOG.ground - DOG.height - lift - 0.14) * height}px`;
    stage.append(el);
    setTimeout(() => el.remove(), 1600);
    status.textContent = `解鎖：${label}`;
  };
  const clear = (kind) => {
    score += 1;
    scoreEl.textContent = String(score);
    const item = unlocks.get(kind.id);
    if (!item || item.classList.contains('is-unlocked')) return;
    item.classList.add('is-unlocked');
    chip(item.querySelector('strong').textContent);
    if ([...unlocks.values()].every((li) => li.classList.contains('is-unlocked'))) section.classList.add('is-complete');
  };
  const crash = () => {
    mode = 'over';
    crashTime = 0;
    spin = 0;
    velocity = Math.max(velocity, 1);
    best = Math.max(best, score);
    stage.classList.remove('is-running');
    status.textContent = `撞上了！跳過 ${score} 件（最佳 ${best}）。點擊或按空白鍵重來`;
  };
  const step = (dt) => {
    speed = Math.min(PHYSICS.maxSpeed, speed + PHYSICS.accel * dt);
    const dx = speed * dt;
    travelled += dx;
    buffer = Math.max(0, buffer - dt);
    if (lift > 0 || velocity > 0) {
      velocity -= PHYSICS.gravity * dt;
      lift += velocity * dt;
      if (lift <= 0) {
        lift = 0;
        velocity = buffer > 0 ? PHYSICS.jump : 0;
        buffer = 0;
      }
    }
    gap -= dx;
    if (gap <= 0) {
      items.push({ kind: nextKind(), x: width / height + 0.1, passed: false });
      gap = speed * (AIR_TIME + 0.4) + Math.random() * 1.2;
    }
    const dogWidth = DOG.height * DOG.aspect;
    const left = DOG.x + dogWidth * DOG.hitbox.left;
    const right = DOG.x + dogWidth * DOG.hitbox.right;
    for (const item of items) {
      item.x -= dx;
      const x0 = item.x + item.kind.w * INSET;
      const x1 = item.x + item.kind.w * (1 - INSET);
      if (right > x0 && left < x1 && lift < item.kind.h * (1 - INSET)) {
        crash();
        return;
      }
      if (!item.passed && x1 < left) {
        item.passed = true;
        clear(item.kind);
      }
    }
    items = items.filter((item) => item.x + item.kind.w > -0.1);
  };
  const tick = (now) => {
    frame = 0;
    const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
    last = now;
    if (mode === 'running') step(dt);
    else if (mode === 'over') {
      crashTime += dt;
      spin = Math.min(1.2, spin + dt * 4);
      velocity -= PHYSICS.gravity * dt;
      lift = Math.max(0, lift + velocity * dt);
    }
    draw();
    if (mode === 'running' || (mode === 'over' && crashTime < 0.8)) frame = requestAnimationFrame(tick);
  };
  const run = () => {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const press = () => {
    if (mode === 'running') {
      if (lift === 0 && velocity <= 0) velocity = PHYSICS.jump;
      else buffer = 0.14;
      return;
    }
    if (mode !== 'paused') {
      speed = PHYSICS.startSpeed;
      travelled = 0;
      lift = 0;
      velocity = 0;
      buffer = 0;
      gap = 0.5;
      score = 0;
      spin = 0;
      deck = [];
      items = [];
      scoreEl.textContent = '0';
    }
    mode = 'running';
    stage.classList.add('is-running');
    status.textContent = '起跳：點擊或空白鍵';
    run();
  };

  hit.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    hit.focus({ preventScroll: true });
    press();
  });
  hit.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.key !== 'Enter') return;
    event.preventDefault();
    keyAt = performance.now();
    if (!event.repeat) press();
  });
  hit.addEventListener('click', (event) => {
    if (event.detail === 0 && performance.now() - keyAt > 400) press();
  });
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting || mode !== 'running') return;
    mode = 'paused';
    stage.classList.remove('is-running');
    status.textContent = '暫停中，點擊或按空白鍵繼續';
  }, { threshold: 0.4 }).observe(stage);
  new ResizeObserver(() => {
    const box = stage.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
  }).observe(stage);
}
