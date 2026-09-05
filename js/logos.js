// ASCII lane marks, one per lane.
//
// Block-character marks in the CP437 spirit. Every line is exactly 9 characters
// wide, and letter-spacing must stay at 0 on .logo or the columns drift apart.
//
// The mark belongs to the lane itself, not to whatever the lane is configured
// to talk to, so a lane keeps its identity when its settings change.

export const LOGOS = {
  lane1: [
    ' ▄  █  ▄ ',
    '  ▀▄█▄▀  ',
    ' ██ █ ██ ',
    '  ▄▀█▀▄  ',
    ' ▀  █  ▀ '
  ].join('\n'),
  lane2: [
    '  ▄███▄  ',
    ' ██• •██ ',
    ' █ ▄▀▄ █ ',
    ' █▄▀ ▀▄█ ',
    '  ▀███▀  '
  ].join('\n'),
  lane3: [
    ' ██▄ ▄██ ',
    ' ██• •██ ',
    ' ██ ▀ ██ ',
    ' ██ ▄ ██ ',
    ' ██   ██ '
  ].join('\n')
};

// The mark for lane index 0..2.
export const laneMark = i => LOGOS['lane' + (i + 1)];
