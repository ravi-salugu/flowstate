# Continue on Flowstate — can users pay with their own ChatGPT or Claude plan?

Researched 2026-11-10. "Confirmed" means an official OpenAI or Anthropic page says it, with the link. "Inferred" is my reading.

## Bottom line

| | ChatGPT (Plus / Pro) | Claude (Pro / Max) |
|---|---|---|
| Is there a supported route? | **Yes**: "Sign in with ChatGPT", with plan usage | **No** |
| Can Flowstate use it today? | **No. It needs OpenAI's approval first.** Self-serve covers only open-source and locally hosted apps. | **No. The terms forbid it.** |
| What to do | Apply through OpenAI's interest form (see below) | Keep Claude on our metered API key |

So the ChatGPT connect flow (task step 2) is **not built**. It is blocked on OpenAI's approval, and the steps for you are below. The Markdown import uses the normal metered path. It sits behind one function (`resolveImportBilling` in `app/api/admin/conversation-import/route.ts`), so a connected plan can be added there once OpenAI approves us.

---

## ChatGPT: "Sign in with ChatGPT" (SIWC) with plan usage

**This is the program Hyperagent uses.** *Confirmed.* OpenAI's help article lists Hyperagent among the apps where users can spend their ChatGPT plan. The "Use your ChatGPT plan" toggle on the consent screen grants the plan-usage scope. Plan usage was announced at DevDay (Sep 29, 2026).

### 1. Is it open to us? Do we need to apply?
- *Confirmed:* "Sign in with ChatGPT is currently offered to a select group of commercial partners. To join the waitlist, complete the Sign in with ChatGPT interest form." (https://developers.openai.com/siwc/request-client-id)
- *Confirmed:* "These docs explain ChatGPT plan usage for open-source and locally hosted apps. If you're interested in offering it in a paid or remotely hosted app, complete the interest form." (https://developers.openai.com/siwc/token-sharing-open-source)
- *Confirmed:* only Plus and Pro subscribers can apply their plan. Anyone can sign in. (https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md)
- *Inferred:* Flowstate is a paid, hosted, multi-tenant web app, so it must go through the partner track. The self-serve flow (`client_id=dynamic_agent_client`, loopback redirect only) is built for local apps and does not fit a Vercel-hosted server. Using it anyway would go against the docs.

### 2. OAuth flow, scopes and tokens (as documented for the self-serve flow; the partner flow may differ)
- *Confirmed (https://developers.openai.com/siwc/token-sharing-open-source/sign-in):*
  - Authorize: `https://auth.openai.com/api/accounts/authorize`. Token: `https://auth.openai.com/api/accounts/oauth/token`.
  - Authorization code with PKCE `S256`, plus a fresh `state` and `nonce` each time. No client secret in the open-source flow.
  - Scopes: `openid profile email` for identity, plus `offline_access resource.invoke chatgpt.tokens.use.direct` for plan usage. The app must check that `chatgpt.tokens.use.direct` was granted: "A valid ID token alone does not authorize ChatGPT plan usage."
  - `resource=https://api.openai.com/v1`.
  - Redirect: loopback `http://127.0.0.1:<port>/...` only in the open-source flow. A hosted https callback is not documented, so it would come with partner onboarding.
- *Confirmed (https://developers.openai.com/siwc/token-sharing-open-source/token-reference):* access token lasts 1 hour. The refresh token lasts 30 days and rotates on each refresh. Token response fields: `access_token, refresh_token, id_token, expires_in, scope, earliest_refresh_at`. If you get `refresh_token_reused`, `refresh_token_expired` or `invalid_grant`, clear the tokens and send the user through OAuth again.
- *Confirmed:* OpenAI does not notify the app when a user disconnects in ChatGPT settings. The app finds out when a call fails with 401.
- *Inferred, for when we build it:* store tokens server-side in a new `llm_provider_connections` table, encrypted, service-role only, with row-level security that denies all client access. Refresh behind a per-user lock, because a rotating refresh token raced across two Vercel lambdas triggers `refresh_token_reused`.

### 3. Models and rate limits
- *Confirmed (https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference):* there is no fixed model list. Call `GET https://api.openai.com/v1/models` with the user's bearer token and keep the entries marked `visibility == "list"`. Inference is `POST https://api.openai.com/v1/responses` with `store: false` and `stream: true` both required. Do not call ChatGPT's `backend-api`.
- *Confirmed (https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations):* not supported: `temperature`, `top_p`, `max_output_tokens`, `metadata`, `previous_response_id` over HTTP, image generation, file search, Code Interpreter, hosted MCP, computer use, audio and file uploads. *Inferred:* our tool loop in `lib/llm/` would need a reduced Responses-API provider. We could not reuse `openrouterProvider` as it stands.
- *Confirmed (https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery):* when limits are hit you get `subscription_sharing_usage_limit_exceeded` (429), which can arrive mid-stream as `response.failed`. "OpenAI does not silently switch the request to another billing path." Users can set a weekly cap per app. Other errors: `..._user_not_eligible` (403), `..._usage_unavailable` (503, retry with backoff), `..._unsupported_capability` (400). No rate-limit headers are documented.
- *Inferred:* when a plan is exhausted, Flowstate must stop. It may then *offer* the metered Flowstate-credits path. It must not switch to it silently.

### 4. Terms and UI requirements
- *Confirmed (https://developers.openai.com/siwc/ui-ux-guidelines):* the button must say "Continue with ChatGPT" in the approved branding. Show a one-time "You're using your ChatGPT plan" modal, a "Using ChatGPT plan" label near the composer with a "Manage usage" link to `https://chatgpt.com/settings/usage`, and make clear which Flowstate plans support ChatGPT plan usage and how that differs from our own charges.
- *Confirmed (https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md):* the app gets no access to the user's ChatGPT conversations or memory. Usage counts against the user's existing plan limits and does not add any allowance.
- *Not verified:* whether there is an explicit rule against reselling. I didn't read the partner agreement or https://openai.com/policies for SIWC-specific terms. The help article (https://help.openai.com/en/articles/20001542) returned 403 to the fetcher.

### What you need to do (ChatGPT)
1. Fill in **https://openai.com/form/sign-in-with-chatgpt-interest/** as the company (Flowstate, hosted web app plus Electron desktop app, research canvas, expected monthly active users).
2. In the application, ask for: a hosted https redirect URI (`https://<prod-domain>/api/auth/chatgpt/callback`), the partner client ID and secret model, and the data, reselling and branding terms for plan usage.
3. Once approved, reopen this task. The build is about 1 to 2 days: an OAuth route pair, a `llm_provider_connections` table, a `chatgptPlanProvider` on the Responses API, skipping the billing guard and ledger when `billing = "user_plan"`, and the UI the guidelines require.
4. Possible stopgap, *your call*: Electron is a locally hosted app. The self-serve open-source flow is written for local *open-source* apps. Flowstate is closed-source and paid, so I read the docs as excluding it too. I'd ask OpenAI rather than rely on it.

---

## Claude: no supported way to bill a user's Pro or Max plan

- *Confirmed (https://code.claude.com/docs/en/legal-and-compliance):* "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications" or "to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users", and "developers may not collect, store, or intermediate Claude.ai credentials or session tokens." Products must use API keys (Claude Console, Bedrock, Vertex, Foundry).
- *Confirmed (https://support.claude.com/en/articles/13189465-logging-in-to-your-claude-account):* subscription OAuth is for "ordinary use of native Anthropic applications". Apps that "attempt to route third-party traffic against subscription limits" are prohibited and "may be enforced against". Anthropic "may at its discretion" let subscribers with usage credits use certain third-party tools. That is not an open program.
- *Confirmed (https://code.claude.com/docs/en/agent-sdk/overview.md):* "Unless previously approved," Anthropic "does not allow third party developers to offer claude.ai login or rate limits for their products".
- *Reported, secondary sources:* server-side enforcement began in January 2026 and the policy text was tightened in February 2026 (e.g. https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/). The open feature request https://github.com/anthropics/claude-code/issues/82266 has no reply from Anthropic.
- **The legitimate Claude-side alternative** *(inferred, and fits "Continue on Flowstate"):* the user's own Claude plan already pays for the *consolidation* step. They paste our prompt into their long Claude chat, Claude writes the Markdown on their plan, and Flowstate only pays for the cheaper import. Later, a remote MCP connector could let users push the file to Flowstate from claude.ai, with the model run on their plan inside claude.ai. That is allowed, because Anthropic runs the model in its own app.

## Sources
- https://developers.openai.com/siwc
- https://developers.openai.com/siwc/request-client-id
- https://developers.openai.com/siwc/token-sharing-open-source (and /sign-in, /models-and-inference, /errors-and-recovery, /token-reference, /preview-limitations)
- https://developers.openai.com/siwc/ui-ux-guidelines
- https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md
- https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites (could not be fetched; known only from search snippets)
- https://thenewstack.io/sign-in-with-chatgpt/
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/agent-sdk/overview.md
- https://support.claude.com/en/articles/13189465-logging-in-to-your-claude-account
- https://www.anthropic.com/legal/consumer-terms
- https://github.com/anthropics/claude-code/issues/82266
