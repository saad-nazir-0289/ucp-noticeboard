/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, resolved per build mode in vite.config.ts. */
  readonly VITE_API_BASE_URL: string;
  /** Optional monetisation (docs/MONETIZATION.md); the sponsored slot is hidden unless set. */
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_ADSENSE_SLOT?: string;
  readonly VITE_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
