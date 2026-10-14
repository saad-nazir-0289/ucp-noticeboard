/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, resolved per build mode in vite.content.config.ts. */
  readonly VITE_API_BASE_URL: string;
  /** PWA base URL (the notifications bell opens it), resolved the same way. */
  readonly VITE_PWA_BASE_URL: string;
  /** Optional "Support NoticeBoard" link (docs/MONETIZATION.md). */
  readonly VITE_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
