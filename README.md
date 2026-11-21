# Little Loop

Little Loop is a browser-based study app that turns a student's topic or study material into practice activities. It starts empty and has no built-in example questions or decks. Google Gemini is called server-side so the API key never enters the browser.

## What is currently built

- AI-generated and manually authored flashcards with flip, previous, next, shuffle, "got it," and "again" controls
- A timed CBT experience with four answer choices, question navigation, review flags, submit confirmation, results review, scoring, and retry
- User-selectable CBT quiz length from 1 to 100 questions, with the selected count sent to Gemini
- An AI study tutor that explains a student's question
- A floating AI study assistant available from the dashboard and CBT page, using the existing server-side tutor endpoint
- A flexible one-session study plan using active recall, practice, and review
- A topic field and a study-material text area
- Drag-and-drop or file-picker support for PDF, `.txt`, and `.md` files
- Browser-side PDF text extraction using PDF.js
- Server-side Google Gemini integration using structured JSON responses
- Structured response validation for quizzes, flashcards, tutor answers, and study plans
- Input limits, duplicate-question/option checks, bounded retries for transient Gemini 503s, and request timeouts
- Study notes up to 200,000 characters, within a 1 MB API request limit
- Best-effort per-IP throttling (8 requests per minute per warm server/function instance)
- A server-side static-file allowlist so server source and environment files are never served to browsers
- Same-origin API requests so the Gemini key remains on the server
- Responsive, keyboard-accessible UI with flashcard keyboard shortcuts
- A responsive learning dashboard with practice-history statistics, score trends, and locally derived study recommendations
- Local Node.js hosting, Netlify serverless deployment, and Pxxl web-service configuration
- Node test coverage for validation, Gemini API handling, static serving, and missing-key behavior

## Main project files

- `index.html` - learning home page
- `flashcards.html` - interactive flashcard study page
- `create.html` - quiz, flashcard, tutor, study-plan, and material creation page
- `progress.html` - quiz history, score trends, study streak, and recommendations
- `cbt.html` - timed multiple-choice practice and results page
- `style.css` - complete visual design and responsive styles
- `favicon.svg` - Little Loop browser icon
- `study-api.js` - shared same-origin client for study API requests
- `assistant.js` - floating chat UI for the server-backed study tutor
- `app.js` - page-aware flashcard interactions, file/PDF loading, AI task controls, and progress rendering
- `cbt.js` - CBT timer, question navigation, answer review, scoring, and retry
- `server.mjs` - local HTTP server, study-task validation, and Gemini integration
- `netlify/functions/generate-quiz.js` - Netlify serverless wrapper for the study assistant API
- `netlify.toml` - Netlify publish and API routing configuration
- `pxxl.toml` - Pxxl Node.js web-service start command, runtime, and port
- `package.json` - Node.js start script used by platforms to detect and launch the web service
- `build.mjs` - copies only public frontend files into the deployment output
- `.env.example` - Gemini configuration variable names; contains no credentials
- `server.test.mjs` - Node test suite

## How study content flows

1. The user enters a topic, pastes notes, uploads a PDF/text/Markdown file, or enters a tutor question.
2. PDF text is extracted in the browser; text and Markdown files are read directly in the browser.
3. The user chooses CBT quiz, flashcards, study plan, or tutor.
4. The browser sends only the selected task and relevant topic/material/question to `/api/study-assistant`. The floating chat sends tutor questions to the same endpoint.
5. The server sends the request to Gemini and validates its structured response.
6. The server returns only the validated result to the browser. The browser opens CBT practice, updates the flashcard deck, or displays the tutor response/study plan.

Study material is sent to Google Gemini only after the user requests an activity. Generated quiz questions are held in the browser tab for the practice session. Little Loop currently has no accounts, database, or saved study history.

## AI provider configuration

Configure this server-side environment variable:

- `GEMINI_API_KEY` - Google Gemini API key

The default model is `gemini-4-hydrogen`. You can optionally set `GEMINI_MODEL` to another model available to your API key. Never put API keys in `app.js`, `index.html`, or any committed file, and do not send them in chat.
For material over 24,000 characters, the server uses Gemini 3.5 Flash-Lite with minimal thinking to reduce processing time; it supports up to 1 million input tokens and structured outputs. Shorter requests retain medium thinking.

For Netlify, set `GEMINI_API_KEY` as a **Functions runtime environment variable** in the site's secret settings, then redeploy. Do not put secret values in `netlify.toml` or the repository. `.env.example` documents variable names only; the app does not load it automatically.

For Pxxl, add `GEMINI_API_KEY` under the project's **Secrets** page and redeploy. Pxxl injects it into the running Node.js server; do not put its value in `pxxl.toml` or the repository.

## Run locally

Requires Node.js 18 or newer. No packages need to be installed.

In PowerShell, enter your Gemini API key at a hidden prompt and start the app. Do not send API keys in chat:

```powershell
$geminiSecret = Read-Host "Gemini API key (optional)" -AsSecureString
$geminiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($geminiSecret)
try {
  $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($geminiPointer)
  node .\server.mjs
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($geminiPointer)
  Remove-Item Env:\GEMINI_API_KEY -ErrorAction SilentlyContinue
}
```

Then open <http://127.0.0.1:3000>. Keep the server running while using AI features; press Ctrl+C to stop it. The keys are read by the server process and are not saved by this app.

To run the checks:

```powershell
node --test
node --check app.js
node --check server.mjs
```

AI features require `GEMINI_API_KEY`. The app starts empty and generates practice content from the user's request.

## Deploy to Netlify

Deploy this folder as the Netlify site root. The included `netlify.toml` routes
`/api/study-assistant` and the legacy `/api/generate-quiz` path to the serverless function in
`netlify/functions/generate-quiz.js`.

In Netlify site settings, add `GEMINI_API_KEY` as a **Functions runtime environment variable**
and redeploy. The function reads keys server-side; never add them to
`app.js`, `index.html`, or another committed file. Opening `index.html`
directly as a `file://` URL does not run the Netlify function.

### Public launch safeguards

The app applies an 8-request-per-minute in-memory limit per client IP and bounds request sizes. Serverless in-memory limits are best-effort and can reset when Netlify creates a new function instance; they are not a substitute for an account-based quota or a platform-wide rate limit. Before sharing the public URL widely, enable any available Netlify traffic/rate controls and set spending/usage alerts or hard limits with Google AI. The app currently has no user accounts, billing, shared quota store, or persistent study history.

## Deploy to Pxxl

Deploy this project as a **Web Service**, not as a static-only site: the Node.js server serves the frontend and handles `/api/study-assistant`. The included `pxxl.toml` selects Node.js 24, starts `node server.mjs`, and sets port `3000`. The server honors Pxxl's `PORT` and `HOST` environment variables; locally it continues to bind to `127.0.0.1`.

If a study request returns `route not found`, the project is likely running as a static site. Switch its Pxxl deployment type to **Web Service**, use the repository folder containing `pxxl.toml` as the project root, and redeploy.

1. Connect the GitHub repository to Pxxl. If the app is in a subfolder, set that folder (for example, `FUN`) as the project base directory so Pxxl reads this `pxxl.toml`.
2. Confirm the deploy configuration uses `node server.mjs` as the start command and port `3000`. No external packages or build command are needed; the `package.json` start script lets Pxxl detect and launch the Node.js web service, which uses Node built-ins and serves the allow-listed frontend files directly.
3. In the Pxxl project dashboard, open **Secrets** and add `GEMINI_API_KEY` as a project variable. Add its value privately there, then redeploy so the server can read it.
4. Open the deployed app and try an AI study task. The server uses Gemini only. Never put the API key in frontend code or commit it.

Pxxl's edge offers per-IP/route rate limits; configure those before wide public use as an additional safeguard. The app's in-memory request limit is best-effort and is not a shared quota. The `dist/` output and `netlify.toml` are for the existing Netlify deployment and are not the Pxxl server deployment.
