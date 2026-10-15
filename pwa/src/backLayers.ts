import { useEffect, useRef } from "react";

// The phone's back gesture closes the topmost popup (a notice, a sheet)
// instead of leaving the app: each open popup adds a browser history
// entry, and going back closes it. One listener manages the whole stack,
// because closing a popup with its own X has to take its entry off again
// (history.back(), which is asynchronous) without closing anything else,
// and a popup opened meanwhile has to wait for that to finish.
interface Layer {
  close: () => void;
}

const stack: Layer[] = [];
let ownBacksPending = 0;
const waitingToPush: Layer[] = [];

function push(layer: Layer) {
  stack.push(layer);
  if (ownBacksPending > 0) {
    waitingToPush.push(layer);
    return;
  }
  history.pushState({ ...(history.state ?? {}), ucpnbLayers: stack.length }, "");
}

function onPopState() {
  if (ownBacksPending > 0) {
    // The entry of a popup that was closed with its own button.
    ownBacksPending--;
    if (ownBacksPending === 0) {
      for (const layer of waitingToPush.splice(0)) {
        if (stack.includes(layer)) history.pushState({ ...(history.state ?? {}), ucpnbLayers: stack.indexOf(layer) + 1 }, "");
      }
    }
    return;
  }
  // The person went back: close the topmost popup.
  stack.pop()?.close();
}

function release(layer: Layer) {
  const index = stack.indexOf(layer);
  if (index < 0) return; // already closed by going back
  stack.splice(index, 1);
  const waiting = waitingToPush.indexOf(layer);
  if (waiting >= 0) {
    waitingToPush.splice(waiting, 1); // its entry was never added
    return;
  }
  ownBacksPending++;
  history.back();
}

if (typeof window !== "undefined") window.addEventListener("popstate", onPopState);

/** While `open`, the back gesture calls `onClose` instead of leaving the app. */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const layer: Layer = { close: () => closeRef.current() };
    push(layer);
    return () => release(layer);
  }, [open]);
}
