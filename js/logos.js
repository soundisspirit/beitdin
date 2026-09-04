// ASCII tamagotchi marks.
//
// Block-character marks in the CP437 spirit. Every line is exactly 9 characters
// wide, and letter-spacing must stay at 0 on .logo or the columns drift apart.
//
// Each mark maps to one of the services a lane can run:
//   openai  -> owl        (eyes blink, occasionally spins)
//   gemini  -> starburst  (top ray blinks)
//   custom  -> cat        (ear twitch)
//   mistral -> fox        (eyes blink)

export const LOGOS = {
  openai: [
    '  ▄▀▀▀▄  ',
    ' █ • • █ ',
    ' █ ▀█▀ █ ',
    ' █▄▀ ▀▄█ ',
    '  ▀▄▄▄▀  '
  ].join('\n'),
  gemini: [
    ' ▄  █  ▄ ',
    '  ▀▄█▄▀  ',
    ' ██ █ ██ ',
    '  ▄▀█▀▄  ',
    ' ▀  █  ▀ '
  ].join('\n'),
  custom: [
    ' ██▄ ▄██ ',
    ' ██• •██ ',
    ' ██ ▀ ██ ',
    ' ██ ▄ ██ ',
    ' ██   ██ '
  ].join('\n'),
  mistral: [
    '  ▄   ▄  ',
    ' █▀█ █▀█ ',
    ' █ • • █ ',
    ' █ ▄▀▄ █ ',
    '  ▀   ▀  '
  ].join('\n')
};

// Each entry plays [lineIndex, replacement, holdMs] out from the rest pose and
// back again, on its own [min, max] ms rhythm. Line indexes match the marks.
const SPECS = {
  openai: {
    every: [3500, 8500],
    frames: [[1, ' █ - - █ ', 70], [1, ' █     █ ', 100], [1, ' █ - - █ ', 70]]
  },
  gemini: {
    every: [4000, 9000],
    frames: [[0, ' ▀  █  ▀ ', 70], [0, '    █    ', 100], [0, ' ▀  █  ▀ ', 70]]
  },
  custom: {
    every: [5000, 12000],
    frames: [[0, ' ██▄ ▀██ ', 120], [0, ' ██▄  ██ ', 120], [0, ' ██▄ ▀██ ', 100]]
  },
  mistral: {
    every: [4500, 10000],
    frames: [[2, ' █ - - █ ', 70], [2, ' █     █ ', 100], [2, ' █ - - █ ', 70]]
  }
};

// Compose every pose once at load, so playing one is just a textContent write.
const ANIMATIONS = Object.fromEntries(
  Object.entries(SPECS).map(([provider, spec]) => {
    const rest = LOGOS[provider];
    const restLines = rest.split('\n');
    return [provider, {
      rest,
      every: spec.every,
      poses: spec.frames.map(([line, art, hold]) => ({
        art: restLines.map((l, i) => (i === line ? art : l)).join('\n'),
        hold
      }))
    }];
  })
);

const rand = ([min, max]) => min + Math.random() * (max - min);

function play(el, provider) {
  const anim = ANIMATIONS[provider];
  if (!anim) return;
  if (el.classList.contains('spinning')) return;

  let step = 0;
  const next = () => {
    // The lane may have switched provider mid-animation. Bail out rather than
    // restore the old mark over the new one.
    if (el.dataset.provider !== provider) return;
    if (step >= anim.poses.length) {
      el.textContent = anim.rest;
      return;
    }
    const pose = anim.poses[step++];
    el.textContent = pose.art;
    setTimeout(next, pose.hold);
  };
  next();
}

// Comfortably longer than the 0.8s .logo.spinning animation in the host pages.
// A timer rather than an animationend listener: the event never arrives if the
// tab is hidden mid-spin, and a stuck class would suppress the mark's blink for
// the rest of the session.
const SPIN_CLEAR_MS = 1000;

function spin(el) {
  if (el.classList.contains('spinning')) return;
  el.classList.add('spinning');
  setTimeout(() => el.classList.remove('spinning'), SPIN_CLEAR_MS);
}

// Recursive setTimeout rather than setInterval: the delay is re-rolled each
// time, so nothing settles into a visible rhythm.
function loop(action, delay, first = delay()) {
  const tick = () => {
    setTimeout(tick, delay());
    // Hidden tabs clamp setTimeout to about once a minute, so there is nothing
    // worth animating while nobody is looking.
    if (!document.hidden) action();
  };
  setTimeout(tick, first);
}

// Every mark keeps its own schedule, so three lanes on the same provider never
// blink in lockstep. Call once the lanes carry their data-provider.
export function startTamagotchis() {
  document.querySelectorAll('.logo').forEach(el => {
    loop(
      () => play(el, el.dataset.provider),
      () => {
        const anim = ANIMATIONS[el.dataset.provider];
        return anim ? rand(anim.every) : 4000;
      },
      1500 + Math.random() * 4000
    );

    // The owl also spins now and then.
    loop(
      () => { if (el.dataset.provider === 'openai') spin(el); },
      () => rand([7000, 13000])
    );
  });
}
