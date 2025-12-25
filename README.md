# AI Angular Website Builder

Production-quality Angular application that orchestrates AI-driven website generation inside a WebContainer-powered environment.

## Getting started

```bash
npm install
npm start
```

## Notes
- The app requires `crossOriginIsolated` to be `true` to boot WebContainer. Make sure COOP/COEP headers are enabled in your hosting environment:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- Generated projects live inside the WebContainer filesystem under `generated-site/`.
- To connect to OpenAI, paste your API key in the UI. It is stored locally in your browser.
