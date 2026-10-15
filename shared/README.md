# shared/

Code compiled into **both** the PWA and the extension — the API client,
types, poster upload, share links, and the notice card/detail components.
Change it here once and both apps get it.

- Import it as `@shared/...` (e.g. `import { api } from "@shared/api/client"`).
  The alias is set in each app's `tsconfig.json` (`paths`) and Vite config
  (`resolve.alias`).
- It has no `package.json` or `node_modules` of its own: `react` resolves
  from whichever app is building it (Vite `resolve.dedupe`, tsconfig
  `paths`), so there is exactly one copy of React in each bundle.
- `import.meta.env.VITE_API_BASE_URL` is provided by each app's build mode
  (see `pwa/vite.config.ts` and `extension/vite.content.config.ts`).
- Keep app-specific UI (feeds, admin screens, layout) in the app itself.
