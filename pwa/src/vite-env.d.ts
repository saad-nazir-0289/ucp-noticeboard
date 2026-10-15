/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, resolved per build mode in vite.config.ts. */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The commit this build was made from (see vite.config.ts). */
declare const __APP_VERSION__: string;
