// What the install and update introductions show: the toolbar menu
// (popup.js) and Horizon's pages (horizon-theme/theme.js) both read it.
// Update "updates" with each release that has something to show, and set
// "since" to that release: updating from an older version shows the list;
// a small fix after it (from "since" or newer) shows nothing again.
globalThis.UCPNB_WHATS_NEW = {
  since: "1.33.0",
  // First install: what NoticeBoard does.
  install: [
    { icon: "📢", title: "Campus notices on your dashboard", text: "Societies, events and deadlines from across UCP, in one place." },
    { icon: "🌙", title: "A new look for all of Horizon", text: "Dark NoticeBoard style, with Light and Original in the menu." },
    { icon: "📱", title: "Notices on your phone", text: "Scan the QR code in the menu to get notified." },
    { icon: "🖼️", title: "Your own picture", text: "Upload a photo or paste an image link in the menu." },
  ],
  // Updates: what changed.
  updates: [
    { icon: "📌", title: "Submissions due", text: "Every open assignment on your dashboard, soonest first." },
    { icon: "🔓", title: "Stay logged in", text: "No more session timeouts. Switch it off in the menu." },
    { icon: "🎆", title: "Fireworks when you submit", text: "Submit an assignment on Horizon and celebrate." },
    { icon: "🖼️", title: "Your picture follows you", text: "Saved to your roll number, synced with your Google account." },
  ],
};
