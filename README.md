# Little Loop

Little Loop is a browser-based study app with flashcards and multiple-choice quizzes. Quiz requests use a same-origin Node server so the Gemini API key never needs to be entered into the page or sent to the browser.

## Run locally

Requires Node.js 18 or newer. No packages need to be installed.

In PowerShell, enter your **rotated** Gemini key at the hidden prompt and start the app:

```powershell
$secret = Read-Host "Enter Gemini API key" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node .\server.mjs
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:\GEMINI_API_KEY -ErrorAction SilentlyContinue
}
```

Then open <http://127.0.0.1:8000>. Keep the server running while using Gemini; press Ctrl+C to stop it. Do not paste the key into the page or commit it to source files. The key is read by the server process and is not saved by this app. Revoke any key previously shared in chat before using a replacement.

To run the checks:

```powershell
node --test
node --check app.js
node --check server.mjs
```

The sample flashcards and quiz work without an API key. AI quiz generation requires the server-side `GEMINI_API_KEY` environment variable.

## Deploy to Netlify

Deploy this folder as the Netlify site root. The included `netlify.toml` routes
`/api/generate-quiz` to the serverless function in
`netlify/functions/generate-quiz.js`.

In the Netlify site settings, add `GEMINI_API_KEY` as an environment variable
and redeploy. The function reads the key server-side; never add it to
`app.js`, `index.html`, or another committed file. Opening `index.html`
directly as a `file://` URL does not run the Netlify function.
