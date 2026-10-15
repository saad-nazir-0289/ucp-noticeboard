import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * A poster on its own, full screen, for reading its small print: double-tap
 * (or double-click) to zoom in at that spot and back out, pinch to zoom,
 * drag to move around, the mouse wheel on a computer. The rest of the app
 * doesn't zoom on a double tap; this is the one place that should.
 */
export function PosterViewer({ src, alt, onClose }: Props) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startScale: number; lastX: number; lastY: number; moved: number; downAt: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Keeps the poster from being dragged off screen. */
  const clamp = (scale: number, x: number, y: number) => {
    const box = stage.current?.getBoundingClientRect();
    const maxX = box ? (box.width * (scale - 1)) / 2 : 0;
    const maxY = box ? (box.height * (scale - 1)) / 2 : 0;
    return { scale, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  /** Zooms to `scale` keeping the point under (clientX, clientY) where it is. */
  const zoomAt = (scale: number, clientX: number, clientY: number) => {
    setView((v) => {
      const box = stage.current!.getBoundingClientRect();
      const px = clientX - (box.left + box.width / 2);
      const py = clientY - (box.top + box.height / 2);
      const k = scale / v.scale;
      return clamp(scale, px - (px - v.x) * k, py - (py - v.y) * k);
    });
  };

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setMoving(true);
    gesture.current = {
      startDist: pointers.current.size === 2 ? distance() : 0,
      startScale: view.scale,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: 0,
      downAt: Date.now(),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2 && g.startDist > 0) {
      const [a, b] = [...pointers.current.values()];
      const scale = Math.max(1, Math.min(MAX_SCALE, (g.startScale * distance()) / g.startDist));
      zoomAt(scale, (a.x + b.x) / 2, (a.y + b.y) / 2);
      g.moved += 20;
      return;
    }
    const dx = e.clientX - g.lastX;
    const dy = e.clientY - g.lastY;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    g.moved += Math.abs(dx) + Math.abs(dy);
    if (view.scale > 1) setView((v) => clamp(v.scale, v.x + dx, v.y + dy));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    setMoving(false);
    gesture.current = null;
    // A tap (not a drag or pinch): two in quick succession zoom in or out.
    if (g && g.moved < 10 && Date.now() - g.downAt < 300) {
      const now = Date.now();
      if (now - lastTap.current < 320) {
        lastTap.current = 0;
        if (view.scale > 1) setView({ scale: 1, x: 0, y: 0 });
        else zoomAt(DOUBLE_TAP_SCALE, e.clientX, e.clientY);
      } else {
        lastTap.current = now;
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const scale = Math.max(1, Math.min(MAX_SCALE, view.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    zoomAt(scale, e.clientX, e.clientY);
  };

  return (
    <div className="ucpnb-poster-viewer" role="dialog" aria-modal="true" aria-label={alt}>
      <div
        className="ucpnb-poster-stage"
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: moving ? "none" : "transform 0.22s ease",
          }}
        />
      </div>
      <button className="ucpnb-icon-btn ucpnb-poster-viewer-close" onClick={onClose} aria-label="Close">
        <Icon name="x" />
      </button>
      {view.scale === 1 && <p className="ucpnb-poster-viewer-hint">Double-tap or pinch to zoom</p>}
    </div>
  );
}
