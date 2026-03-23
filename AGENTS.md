<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Encoding Guardrails (Project Memory)

- All source files must be UTF-8. Keep CRLF line endings on Windows.
- For TS/JS/JSON files, prefer `\uXXXX` escapes for Chinese UI literals to reduce console/codepage corruption risk.
- Never use mojibake text as patch context (for example: `锟`, `閳`, `鈥`, `Ã`, `æ`-style corrupted fragments).
- Do not run broad regex replace on files that contain Chinese content. Use small anchored edits only.
- After edits, run encoding checks before commit/deploy:
  - `npm run check:encoding`
  - `npm run test:tips`
