/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, resolved per build mode in vite.config.ts. */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
