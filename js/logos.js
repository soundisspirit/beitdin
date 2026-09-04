// ASCII tamagotchi marks.
//
// Block-character marks in the CP437 spirit. Every line is exactly 9 characters
// wide, and letter-spacing must stay at 0 on .logo or the columns drift apart.
//
// The three marks map to the three services the board can run:
//   openai -> owl        (eyes blink, occasionally spins)
//   gemini -> starburst  (top ray blinks)
//   custom -> cat        (ear twitch)

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

function spin(el) {
  if (el.classList.contains('spinning')) return;
  el.classList.add('spinning');
  el.addEventListener('animationend', () => el.classList.remove('spinning'), { once: true });
}

// Recursive setTimeout rather than setInterval: the delay is re-rolled each
// time, so nothing settles into a visible rhythm.
function loop(action, delay, first = delay()) {
  const tick = () => {
    setTimeout(tick, delay());
    action();
  };
  setTimeout(tick, first);
}

// Every mark keeps its own schedule, so three lanes on the same provider never
// blink in lockstep. Call once the lanes carry their data-provider.
export function startTamagotchis(selector = '.logo') {
  document.querySelectorAll(selector).forEach(el => {
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
