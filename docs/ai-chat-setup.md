# AI learning chat (local preview)

## Configuration

Fill `ARK_API_KEY` in the ignored `.env.local` file. Do not paste the key into chat, frontend files, screenshots or Git. The model defaults to `doubao-seed-2-0-lite-260428`, using Ark's `/api/v3/responses` endpoint. `.env.example` contains the public template.

Run `node scripts/dev-server.mjs` from the project directory, then open the URL printed in the terminal (normally http://127.0.0.1:4173). Restart after changing environment variables. File URLs cannot call the backend. The local server never serves environment files.

## Behavior

Open a lesson, start practice, and click the AI button below the sentence number. The panel sends the current English sentence, Chinese prompt, typed words, wrong-word indexes and available stored analysis with each question. These data and up to ten recent messages are sent to Volcengine. History stays in browser memory and is reset when opening a different sentence. Closing the panel cancels waiting locally; an upstream request may still incur usage. The practice timer continues running.

Answers are plain text, not executable HTML. Chat keyboard events do not trigger practice shortcuts. Questions are retained after failures for retry. AI explanations do not change grades, course annotations or wrong-answer records. The model is instructed to offer hints before revealing the answer, but this is not a strict answer-access restriction.

## Limits and Deployment

The practice entry is a right-side floating button. Suggested questions are selected locally from sentence punctuation, modal verbs and wrong-word state; opening the panel does not call the model. Clicking a suggestion submits it. Messages appear immediately before the API response, with elapsed waiting time, stop and retry controls. A failed message remains visible but is not added to model conversation history. Draft text typed while waiting is preserved.

Maximum question: 1,500 characters. Maximum request: 24 KB. Maximum output: 1,200 tokens. Upstream timeout: 45 seconds. Ten requests per minute per connection address per server process; this is only a local/basic safeguard, not distributed abuse protection.

No production deployment is performed with this change. Before enabling public access, add authenticated access and a shared rate/quota store, and set a provider-side spending limit. A same-origin check is not authentication. On Vercel, configure `ARK_API_KEY`, `ARK_MODEL`, and `AI_CHAT_ENABLED` as server environment variables. Without explicit enablement and a key, the API returns an unavailable message. Never copy `.env.local` to the public build directory.

Run `node scripts/test-ai-chat.mjs` for mocked upstream and browser checks. A real-provider smoke test remains required after entering a valid key; mock tests do not validate model permissions or balance.
