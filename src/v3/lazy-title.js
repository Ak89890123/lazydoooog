import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrambleTextPlugin);

// Scrambled LAZY row -> resolved left to right -> shrink into column -> words (docs/v3-motion-contract.md).
// The Hero controller scrubs its progress, so the scramble only moves while the visitor scrolls.
// Offsets are percentages of each fixed letter slot, so the folded row lands exactly on the column at any font size.
export function createLazyTitle(root) {
  const initials = gsap.utils.toArray('.lazy b', root);
  const letters = initials.slice(1);
  const words = gsap.utils.toArray('.lazy b + span', root);
  const timeline = gsap.timeline({ paused: true });
  // New characters every 0.05 / speed = 0.01 timeline seconds: about every 10px of scroll in the 3D Hero.
  initials.forEach((letter, i) => timeline.to(letter, { duration: 0.25 + i * 0.06, ease: 'none', scrambleText: {
    text: '{original}', chars: 'アイウエオカキクケコサシスセソ0123456789!?#%+', revealDelay: 0.1 + i * 0.06,
    speed: 5, newClass: 'lazy-resolved', oldClass: 'lazy-scrambled',
  } }, 0));
  timeline.addLabel('fold')
    .from(root.querySelector('.lazy'), { scale: 1.8, transformOrigin: 'left top', duration: 0.5, ease: 'power2.inOut' }, 'fold')
    .from(letters, { xPercent: (i) => (i + 1) * 100, yPercent: (i) => (i + 1) * -100, duration: 0.3, stagger: 0.1, ease: 'power2.inOut' }, 'fold')
    .fromTo(words, { clipPath: 'inset(-0.2em 100% -0.2em -0.1em)' }, { clipPath: 'inset(-0.2em 0% -0.2em -0.1em)', duration: 0.3, stagger: 0.18, ease: 'power2.out' });
  return {
    progress: (value) => timeline.progress(value),
    revert() {
      timeline.revert();
      initials.forEach((letter, i) => { letter.textContent = 'LAZY'[i]; });
    },
  };
}
