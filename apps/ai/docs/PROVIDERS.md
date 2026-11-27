# Provider research notes (verified 2026-11-27)

These notes record what the code relies on, with the documentation it came from.

## OpenRouter (Chat Completions, streaming)

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, `stream: true`. Optional attribution headers `HTTP-Referer` and `X-Title`.
- SSE: lines beginning with `:` are keep-alive comments (for example `: OPENROUTER PROCESSING`) and must be skipped before `JSON.parse`. The stream ends with `data: [DONE]`. — https://openrouter.ai/docs/api/reference/streaming
- Errors: a pre-stream failure returns a JSON error with an HTTP status (400/401/402/429/502/503). Once streaming has started, an error arrives as a chunk with a top-level `error` object and `finish_reason: "error"`, and the HTTP status stays 200. We surface both as `{type:"error"}`. — same page
- Cancellation: aborting the fetch cancels the stream, which stops billing for providers that support it. — same page
- Reasoning: `reasoning: { effort | max_tokens | enabled | exclude }`. Effort values are `max`, `xhigh`, `high`, `medium`, `low`, `minimal` and `none`; send either `effort` or `max_tokens`, not both. Streaming reasoning arrives in `choices[].delta.reasoning_details[]` (`{type:"reasoning.text", text, signature, ...}`), and in practice also in `delta.reasoning` (string). — https://openrouter.ai/docs/use-cases/reasoning-tokens
  - Mapping: Low/Medium/High → `reasoning.effort` low/medium/high. Custom → `reasoning.max_tokens = thinkingBudget` (`<= 0` → `effort: "none"`), or medium if no budget is given.
  - We store the collected `reasoning_details` on the assistant turn and send them back with `tool_calls`, so reasoning is preserved across tool steps.
- Tools: `tools: [{type:"function", function:{name, description, parameters}}]`. The assistant message carries `tool_calls: [{id, type:"function", function:{name, arguments: <JSON string>}}]`, and the result goes back as `{role:"tool", tool_call_id, content}`. `tools` must be sent on every request. — https://openrouter.ai/docs/guides/features/tool-calling
  - Streamed `delta.tool_calls[]` fragments follow the OpenAI format (keyed by `index`, with `id`/`function.name` on the first fragment and `function.arguments` concatenated). The OpenRouter page does not document this explicitly; the code follows the standard OpenAI shape.
- Models: `GET https://openrouter.ai/api/v1/models` returns `{ data: [{id, name, supported_parameters, context_length, pricing}], links, total_count }`. The full list is returned when `limit`/`offset` are omitted. — https://openrouter.ai/docs/api/api-reference/models/get-models

## Gemini (generateContent REST)

Google's docs now lead with the newer **Interactions API** (`/v1beta/interactions`) and label `generateContent` as "Legacy". It is still the documented stable REST surface, and it is what this service uses.

- Streaming: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse` with header `x-goog-api-key`. Each SSE `data:` holds a `GenerateContentResponse` (`candidates[0].content.parts`, `finishReason`, `promptFeedback.blockReason`). — https://ai.google.dev/api/generate-content
- `systemInstruction: {parts:[{text}]}`. Roles are `user` and `model`.
- Newer models (Gemini 3.6 Flash and later) reject a request whose last turn is a `model` turn (no prefill), so we drop trailing model turns. — https://ai.google.dev/gemini-api/docs/gemini-3
- Function calling: `tools: [{functionDeclarations: [{name, description, parameters}]}]`. The response part is `functionCall {id?, name, args}`, and we reply with a `user` content part `functionResponse {id?, name, response: {result} | {error}}`, matching `id` when present. — https://ai.google.dev/api/generate-content
- **Thought signatures**: Gemini 3 and 4 return `thoughtSignature` on parts (always on the first `functionCall` of each step). They **must** be sent back in the exact part they came on, or the request fails with a 400 ("Function call … is missing a thought_signature"). We keep the model's parts verbatim (`providerData.parts`) and replay them. For tool calls that have no signature, the documented dummy value `skip_thought_signature_validator` is used. — https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures
- Thinking: `generationConfig.thinkingConfig { includeThoughts, thinkingBudget, thinkingLevel }`. Thought text comes back as parts with `thought: true` and is streamed as `reasoning` events. — https://ai.google.dev/api/generate-content, https://ai.google.dev/gemini-api/docs/generate-content/thinking
  - `thinkingLevel` enum: `MINIMAL | LOW | MEDIUM | HIGH | XHIGH`. It is recommended for Gemini 3 and required for Gemini 4, and it errors on earlier models.
  - `thinkingBudget` (introduced in 2.5; `-1` = dynamic, `0` = off where allowed). It still works on 3.x for backwards compatibility (Vertex warns of intermittent 400s). On Gemini 4 it is deprecated: sent alone, it maps to the nearest level with a warning; sent together with `thinkingLevel`, it returns a 400.
  - Per-model levels: `gemini-3-pro-preview` supports only low/high; Flash variants add `minimal`; `xhigh` is only on `gemini-4-neon` and `gemini-4-hydrogen`. Thinking cannot be fully disabled on 3.x and later. — https://ai.google.dev/gemini-api/docs/thinking
  - Mapping used in `src/providers/gemini.ts`:
    | Effort | Gemini 2.5 | Gemini 3.x | Gemini 4+ |
    |---|---|---|---|
    | Low | `thinkingBudget: 1024` | `thinkingLevel: LOW` | `LOW` |
    | Medium | `8192` | `MEDIUM` (`HIGH` on 3-pro) | `MEDIUM` |
    | High | `24576` (Pro: `32768`) | `HIGH` | `HIGH` |
    | Custom | `thinkingBudget` as given | `thinkingBudget` as given | nearest level (≤2048 LOW, ≤12000 MEDIUM, else HIGH) |
  - If Gemini returns 400 because of the thinking config (for example 2.5 Pro with budget 0, or a non-thinking model), the request is retried once without `thinkingConfig`.
- Models: `GET /v1beta/models?pageSize=1000&pageToken=…` returns `{models:[{name:"models/…", displayName, supportedGenerationMethods, thinking}], nextPageToken}`. We keep models whose methods include `generateContent`. — https://ai.google.dev/api/models

## GitHub REST

`Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`. Endpoints used: `/user/repos`, `/repos/{o}/{r}/contents/{path}`, `/search/code`, `/repos/{o}/{r}/git/ref/heads/{b}`, `POST /repos/{o}/{r}/git/refs`, `PUT /repos/{o}/{r}/contents/{path}`, `/repos/{o}/{r}/issues`, `POST /repos/{o}/{r}/pulls`. — https://docs.github.com/en/rest
