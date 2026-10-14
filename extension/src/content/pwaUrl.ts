// The notifications bell (NoticeBoard.tsx) opens the real PWA — unlike a
// notice share link (@shared/share), which goes through the backend's
// rich-preview endpoint instead. Set per build mode in vite.content.config.ts.
export const PWA_BASE_URL = import.meta.env.VITE_PWA_BASE_URL;
