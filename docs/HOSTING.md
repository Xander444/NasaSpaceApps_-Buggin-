# Static website hosting

The public-facing project, sourced keyword explorer, and precomputed cabin result build as static files. The optional live PyTorch simulation, Gemini guidance, and semantic reranking are separate services; the core judge path does not require them.

## Build

```bash
npm ci
npm run check
```

Publish the generated `dist/` directory. The build copies `public/_redirects` so Netlify and Cloudflare Pages route `/evidence`, `/simulator`, `/sources`, and `/about` back to the single-page application. `vercel.json` supplies the equivalent Vercel rewrite.

Recommended settings:

- build command: `npm run build`
- output directory: `dist`
- Node version: current active LTS
- site root: `/`

No API key belongs in the frontend host. The keyword explorer reads the committed index and the precomputed simulator reads committed assets.

## Optional services

- Set `VITE_SIMULATOR_API_URL` only when a public simulator backend is deployed. See `BACKEND_DEPLOYMENT.md`.
- Gemini guidance needs the same-origin research API and a backend-only key. See `GEMINI_RESEARCH.md`.
- Leave `VITE_SEMANTIC_URL` unset for the default static keyword experience.

The `/about` page is technically host-ready, but its team biographies remain the team's content task before public submission.
