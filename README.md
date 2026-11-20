# Little Loop

Little Loop is a browser-based study app that turns a student's topic or study material into practice activities. It starts empty and has no built-in example questions or decks. Gemini is the primary AI provider and Kimi is the fallback; both are called server-side so API keys never enter the browser.

## What is currently built

- AI-generated flashcards with flip, previous, next, shuffle, "got it," and "again" controls
- A standalone CBT practice page with four answer choices, feedback, explanations, scoring, progress, and retry
- An AI study tutor that explains a student's question
- A flexible one-session study plan using active recall, practice, and review
- A topic field and a study-material text area
- Drag-and-drop or file-picker support for PDF, `.txt`, and `.md` files
- Browser-side PDF text extraction using PDF.js
- Server-side Gemini and Kimi integrations, with Gemini attempted first and Kimi used when Gemini fails
- Structured response validation for quizzes, flashcards, tutor answers, and study plans
- Input limits, duplicate-question/option checks, provider timeouts, and generic error responses that do not expose credentials
- Best-effort per-IP throttling (8 requests per minute per warm server/function instance)
- A server-side static-file allowlist so server source and environment files are never served to browsers
- Same-origin API requests so provider keys remain on the server
- Responsive, keyboard-accessible UI with flashcard keyboard shortcuts
- Local Node.js hosting, Netlify serverless deployment, and Pxxl web-service configuration
- Node test coverage for validation, provider fallback, API key handling, static serving, and missing-key behavior

## Main project files

- `index.html` - flashcard workspace and quiz creation form
- `cbt.html` - standalone multiple-choice practice page
- `style.css` - complete visual design and responsive styles
- `app.js` - flashcard interactions, file/PDF loading, AI task controls, and API calls
- `cbt.js` - CBT practice session state, answers, feedback, scoring, and retry
- `server.mjs` - local HTTP server, study-task validation, provider selection/fallback, and Gemini/Kimi integrations
- `netlify/functions/generate-quiz.js` - Netlify serverless wrapper for the study assistant API
- `netlify.toml` - Netlify publish and API routing configuration
- `pxxl.toml` - Pxxl Node.js web-service start command, runtime, and port
- `build.mjs` - copies only public frontend files into the deployment output
- `.env.example` - names of supported provider secrets; contains no credentials
- `server.test.mjs` - Node test suite

## How study content flows

1. The user enters a topic, pastes notes, uploads a PDF/text/Markdown file, or enters a tutor question.
2. PDF text is extracted in the browser; text and Markdown files are read directly in the browser.
3. The user chooses CBT quiz, flashcards, study plan, or tutor.
4. The browser sends only the selected task and relevant topic/material/question to `/api/generate-quiz`, a compatibility route supported by both included deployment configurations.
5. The server asks Gemini first, validates the structured result, and tries Kimi if Gemini is unavailable or returns invalid data.
6. The server returns only the validated result to the browser. The browser opens CBT practice, updates the flashcard deck, or displays the tutor response/study plan.

Study material is sent to the configured AI providers only after the user requests an activity. If fallback is needed, the same request content is sent to Kimi. Generated quiz questions are held in the browser tab for the practice session. Little Loop currently has no accounts, database, or saved study history.

## AI provider configuration

Configure one or both server-side environment variables:

- `GEMINI_API_KEY` - Gemini primary provider
- `MOONSHOT_API_KEY` - Kimi fallback (the app also accepts `KIMI_API_KEY`)

Optional model overrides: `GEMINI_MODEL` and `KIMI_MODEL`. Defaults are `gemini-2.5-flash` and `kimi-k3.1-pro-highspeed`. Never put API keys in `app.js`, `index.html`, or any committed file, and do not send them in chat.

For Netlify, set these as **Functions runtime environment variables** in the site's secret settings, then redeploy. Do not put secret values in `netlify.toml` or the repository. `.env.example` documents variable names only; the app does not load it automatically.

For Pxxl, add the same variables under the project's **Secrets** page and redeploy. Pxxl injects them into the running Node.js server; do not put their values in `pxxl.toml` or the repository.

## Run locally

Requires Node.js 18 or newer. No packages need to be installed.

In PowerShell, enter your provider keys at hidden prompts and start the app. Either key may be left blank; Gemini is used first when configured, then Kimi. Do not send API keys in chat:

```powershell
$geminiSecret = Read-Host "Gemini API key (optional)" -AsSecureString
$kimiSecret = Read-Host "Kimi/Moonshot API key (optional)" -AsSecureString
$geminiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geminiSecret)
$kimiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($kimiSecret)
try {
  $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($geminiPointer)
  $env:MOONSHOT_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($kimiPointer)
  node .\server.mjs
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($geminiPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($kimiPointer)
  Remove-Item Env:\GEMINI_API_KEY, Env:\MOONSHOT_API_KEY -ErrorAction SilentlyContinue
}
```

Then open <http://127.0.0.1:8000>. Keep the server running while using AI features; press Ctrl+C to stop it. The keys are read by the server process and are not saved by this app.

To run the checks:

```powershell
node --test
node --check app.js
node --check server.mjs
```

AI features require at least one configured provider key. The app starts empty and generates practice content from the user's request.

## Deploy to Netlify

Deploy this folder as the Netlify site root. The included `netlify.toml` routes
`/api/study-assistant` and the legacy `/api/generate-quiz` path to the serverless function in
`netlify/functions/generate-quiz.js`.

In Netlify site settings, add `GEMINI_API_KEY` and/or `MOONSHOT_API_KEY` as **Functions runtime environment variables**
and redeploy. The function reads keys server-side; never add them to
`app.js`, `index.html`, or another committed file. Opening `index.html`
directly as a `file://` URL does not run the Netlify function.

### Public launch safeguards

The app applies an 8-request-per-minute in-memory limit per client IP and bounds request sizes. Serverless in-memory limits are best-effort and can reset when Netlify creates a new function instance; they are not a substitute for an account-based quota or a platform-wide rate limit. Before sharing the public URL widely, enable any available Netlify traffic/rate controls and set spending/usage alerts or hard limits with both AI providers. The app currently has no user accounts, billing, shared quota store, or persistent study history.

## Deploy to Pxxl

Deploy this project as a **Web Service**, not as a static-only site: the Node.js server serves the frontend and handles `/api/study-assistant`. The included `pxxl.toml` selects Node.js 24, starts `node server.mjs`, and sets port `3000`. The server honors Pxxl's `PORT` and `HOST` environment variables; locally it continues to bind to `127.0.0.1`.

1. Connect the GitHub repository to Pxxl. If the app is in a subfolder, set that folder (for example, `FUN`) as the project base directory so Pxxl reads this `pxxl.toml`.
2. Confirm the deploy configuration uses `node server.mjs` as the start command and port `3000`. No package installation or build command is needed; this project uses Node built-ins and serves the allow-listed frontend files directly.
3. In the Pxxl project dashboard, open **Secrets** and add `GEMINI_API_KEY` and/or `MOONSHOT_API_KEY` (or `KIMI_API_KEY`) as project variables. Add the values privately there, then redeploy so the server can read them.
4. Open the deployed app and try an AI study task. The server calls Gemini first and falls back to Kimi when both keys are configured. Never put the provider keys in frontend code or commit them.

Pxxl's edge offers per-IP/route rate limits; configure those before wide public use as an additional safeguard. The app's in-memory request limit is best-effort and is not a shared quota. The `dist/` output and `netlify.toml` are for the existing Netlify deployment and are not the Pxxl server deployment.
