const fs = require('fs');
const js = fs.readFileSync('js/ui.js', 'utf8');
let depth = 0;
let lines = js.split('\n');
for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  for (let c of line) {
    if (c === '{') depth++;
    if (c === '}') depth--;
  }
  if (depth < 0) {
    console.log(`Unbalanced '}' at line ${i + 1}:\n${line}`);
    break;
  }
}
if (depth > 0) console.log("Unbalanced '{', depth:", depth);
