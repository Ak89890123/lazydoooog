/*
THESIS: Contact is a four-app phone home screen with a playful camera beside it.
OWN-WORLD: The original contact dock stays primary; dark camera glass is an optional side experience.
STORY: Choose a contact app directly, or open Camera and return without changing contact state.
FIRST VIEWPORT: The existing four contact apps remain visible on the phone home screen.
FORM: A narrow extension of the established kinetic maker-lab device scene.
*/
const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

export const CONTACT_LINKS = Object.freeze([
  {
    id: 'email',
    label: 'Email',
    kind: 'email',
    href: 'mailto:a89890123@gmail.com',
    iconSrc: '/assets/icons/contact/gmail-app-icon.png',
  },
  {
    id: 'github',
    label: 'GitHub',
    kind: 'external',
    href: 'https://github.com/Ak89890123',
    iconSrc: '/assets/icons/contact/github-app-icon.png',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    kind: 'external',
    href: 'https://www.linkedin.com/in/jimmy-chen-642b53103',
    iconSrc: '/assets/icons/contact/linkedin-in-logo.png',
  },
  {
    id: 'threads',
    label: 'Threads',
    kind: 'external',
    href: 'https://www.threads.com/@lazydoooog',
    iconSrc: '/assets/icons/contact/threads-app-icon.png',
  },
]);

const isValidHref = (link, href) => {
  if (link.kind === 'email') return /^mailto:[^\s<>"']+$/i.test(href);
  return link.kind === 'external' && /^https:\/\/[^\s<>"']+$/i.test(href);
};

export const getContactLinkState = (link) => {
  const href = typeof link.href === 'string' ? link.href.trim() : '';
  const active = isValidHref(link, href);
  const external = active && link.kind === 'external';

  return {
    active,
    href: active ? href : null,
    target: external ? '_blank' : null,
    rel: external ? 'noopener noreferrer' : null,
  };
};

export const renderContactPhoneLinks = (links = CONTACT_LINKS) => `
  <div class="contact-phone-links" role="list" aria-label="聯絡方式">
    ${links.map((link) => {
      const state = getContactLinkState(link);
      const pendingLabel = `${link.label}（網址待提供）`;
      const attributes = [
        `class="contact-phone-link${state.active ? '' : ' contact-phone-link--pending'}"`,
        `data-contact-link="${escapeAttribute(link.id)}"`,
        `aria-label="${escapeAttribute(state.active ? link.label : pendingLabel)}"`,
        `data-contact-link-status="${state.active ? 'active' : 'pending'}"`,
        state.href ? `href="${escapeAttribute(state.href)}"` : 'role="link" tabindex="0" aria-disabled="true"',
        state.target ? `target="${state.target}"` : '',
        state.rel ? `rel="${state.rel}"` : '',
      ].filter(Boolean).join(' ');

      return `
        <a ${attributes}>
          <img src="${escapeAttribute(link.iconSrc)}" alt="" width="512" height="512" loading="lazy" decoding="async" />
        </a>
      `;
    }).join('')}
  </div>
`;

export const bindPendingContactLinks = (root) => {
  const onClick = (event) => {
    if (event.target.closest('[data-contact-link][aria-disabled="true"]')) event.preventDefault();
  };
  const onKeyDown = (event) => {
    if (['Enter', ' '].includes(event.key)
      && event.target.closest('[data-contact-link][aria-disabled="true"]')) {
      event.preventDefault();
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeyDown);
  };
};


export const renderContactCameraApp = (links = CONTACT_LINKS) => `
  <div class="contact-phone-os" data-phone-os data-phone-screen="home">
    <section class="contact-phone-home" data-phone-home aria-label="手機主畫面">
      <div class="contact-phone-home-status" aria-hidden="true">
        <span>CONTACT</span>
        <span>●</span>
      </div>
      <div class="contact-phone-machine" aria-hidden="true">
        <span class="contact-phone-orbit contact-phone-orbit--outer"></span>
        <span class="contact-phone-orbit contact-phone-orbit--inner"></span>
        <span class="contact-phone-route contact-phone-route--a"></span>
        <span class="contact-phone-route contact-phone-route--b"></span>
        <span class="contact-phone-route contact-phone-route--c"></span>
        <span class="contact-phone-core"></span>
        <span class="contact-phone-node contact-phone-node--lime"></span>
        <span class="contact-phone-node contact-phone-node--pink"></span>
        <span class="contact-phone-node contact-phone-node--orange"></span>
        <span class="contact-phone-node contact-phone-node--blue"></span>
      </div>

      ${renderContactPhoneLinks(links)}

      <button class="contact-phone-camera-icon" type="button" data-open-camera aria-label="開啟相機">
        <span aria-hidden="true">
          <img src="/assets/icons/contact/iphone-camera-app-icon.png" alt="" width="512" height="512" loading="lazy" />
        </span>
      </button>
    </section>

    <div class="contact-camera-app" data-camera-app data-camera-state="booting" data-camera-facing="rear" aria-hidden="true" inert>
    <div class="contact-camera-preview" aria-hidden="true">
      <div class="contact-camera-view" data-camera-view>
        <div class="contact-phone-machine">
          <span class="contact-phone-orbit contact-phone-orbit--outer"></span>
          <span class="contact-phone-orbit contact-phone-orbit--inner"></span>
          <span class="contact-phone-route contact-phone-route--a"></span>
          <span class="contact-phone-route contact-phone-route--b"></span>
          <span class="contact-phone-route contact-phone-route--c"></span>
          <span class="contact-phone-core"></span>
          <span class="contact-phone-node contact-phone-node--lime"></span>
          <span class="contact-phone-node contact-phone-node--pink"></span>
          <span class="contact-phone-node contact-phone-node--orange"></span>
          <span class="contact-phone-node contact-phone-node--blue"></span>
        </div>
        <div class="contact-camera-selfie">
          <i></i><b></b><strong>你 × 我</strong>
        </div>
      </div>
      <span class="contact-camera-reticle"></span>
    </div>

    <div class="contact-camera-topbar">
      <button type="button" data-camera-flash aria-label="切換閃光燈" aria-pressed="false"><span aria-hidden="true">ϟ</span></button>
      <span data-camera-facing-label>REAR</span>
    </div>

    <p class="contact-camera-status" data-camera-status role="status" aria-live="polite">相機啟動中</p>

    <div class="contact-camera-zoom" role="group" aria-label="相機倍率">
      ${['0.5', '1', '2'].map((zoom) => `
        <button type="button" data-camera-zoom="${zoom}" aria-label="${zoom} 倍" aria-pressed="${zoom === '1'}">${zoom}<span aria-hidden="true">×</span></button>
      `).join('')}
    </div>


    <div class="contact-camera-controls">
      <button class="contact-camera-last" type="button" data-camera-last aria-label="查看最近一次拍攝">
        <img src="/assets/icons/contact/iphone-camera-app-icon.png" alt="" width="512" height="512" loading="lazy" />
      </button>
      <button class="contact-camera-shutter" type="button" data-camera-shutter aria-label="拍照"><span></span></button>
      <button class="contact-camera-flip" type="button" data-camera-flip aria-label="切換前後鏡頭"><span aria-hidden="true">↻</span></button>
    </div>

    <span class="contact-camera-flash-layer" aria-hidden="true"></span>
  </div>

    <button class="contact-phone-home-indicator" type="button" data-phone-home-indicator aria-label="返回主畫面" aria-hidden="true" tabindex="-1">
      <span aria-hidden="true"></span>
    </button>
  </div>
`;
