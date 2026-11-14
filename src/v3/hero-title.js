import { gsap } from 'gsap';

// The Hero controller scrubs this with the intro's fade, so the title dissolves as the visitor scrolls.
// The timeline owns only the letters and particles; the Hero still owns the intro's opacity.
export function createHeroTitle(title) {
  const original = title.innerHTML;
  const lines = [title.firstChild, title.querySelector('span').firstChild];
  const letters = [];
  lines.forEach((text) => {
    const fragment = document.createDocumentFragment();
    for (const character of text.textContent) {
      if (character === ' ') {
        fragment.append(' ');
        continue;
      }
      const letter = document.createElement('span');
      letter.className = 'hero-letter';
      const glyph = document.createElement('span');
      glyph.className = 'hero-glyph';
      glyph.textContent = character;
      letter.append(glyph);
      for (let i = 0; i < 3; i++) {
        const particle = document.createElement('i');
        particle.className = 'hero-particle';
        particle.setAttribute('aria-hidden', 'true');
        letter.append(particle);
      }
      letters.push(glyph);
      fragment.append(letter);
    }
    text.replaceWith(fragment);
  });
  const particles = title.querySelectorAll('.hero-particle');
  const timeline = gsap.timeline({ paused: true });
  timeline.set(particles, { autoAlpha: 0, scale: 0 })
    .to(letters, { x: 32, y: -36, filter: 'blur(8px)', autoAlpha: 0, duration: 0.65, stagger: 0.035, ease: 'power2.in' }, 0)
    .to(particles, { autoAlpha: 1, scale: 1, duration: 0.12, stagger: 0.035 / 3 }, 0.1)
    .to(particles, { x: (i) => 30 + (i % 3) * 24, y: (i) => -20 - (i % 5) * 18, rotation: (i) => i % 2 ? 110 : -80, autoAlpha: 0, scale: 0.3, duration: 0.7, stagger: 0.035 / 3, ease: 'power2.out' }, 0.18);

  return {
    progress: (value) => timeline.progress(value),
    revert() {
      timeline.revert();
      title.innerHTML = original;
    },
  };
}
