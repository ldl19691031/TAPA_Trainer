import fs from 'node:fs';
import path from 'node:path';

const filePath = path.join(process.cwd(), 'app', 'page.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const blockedTokens = ['(hint)', 'TODO_TIP', 'TIPS_PLACEHOLDER'];
for (const token of blockedTokens) {
  if (content.includes(token)) {
    console.error(`Tips check failed: found blocked token "${token}" in app/page.tsx`);
    process.exit(1);
  }
}

const requiredSnippets = [
  '\\u8981\\u5b8c\\u7f8e',
  '\\u8981\\u575a\\u5f3a',
  '\\u8981\\u52aa\\u529b\\u8bd5',
  '\\u8981\\u8ba8\\u597d',
  '\\u8981\\u8fc5\\u901f',
  'lexicon:',
  'tone:',
  'gesture:',
  'posture:',
  'face:',
];

for (const snippet of requiredSnippets) {
  if (!content.includes(snippet)) {
    console.error(`Tips check failed: missing snippet "${snippet}" in app/page.tsx`);
    process.exit(1);
  }
}

console.log('Tips check passed.');
