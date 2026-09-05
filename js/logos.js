// ASCII tamagotchi marks, one per service a lane can run.
//
// Block-character marks in the CP437 spirit. Every line is exactly 9 characters
// wide, and letter-spacing must stay at 0 on .logo or the columns drift apart.
//
//   openai  -> owl
//   gemini  -> starburst
//   custom  -> cat
//   mistral -> fox

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
