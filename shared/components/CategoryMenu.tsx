import { useEffect, useRef, useState } from "react";
import type { Category } from "../types";
import { categoryTone } from "../format";
import { Icon } from "./Icon";

interface Props {
  categories: Category[];
  value: number | "all";
  onChange: (value: number | "all") => void;
}

/**
 * The category filter as one button and a menu: "All categories ▾". Keeps
 * the toolbar to a single row however many categories there are. Works by
 * keyboard too: arrows move, Enter picks, Escape closes.
 */
export function CategoryMenu({ categories, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options: { value: number | "all"; label: string; tone?: number }[] = [
    { value: "all", label: "All categories" },
    ...categories.map((c) => ({ value: c.id, label: c.name, tone: categoryTone(c.name) })),
  ];
  const current = options.find((o) => o.value === value) ?? options[0];

  // Close on a click anywhere else (inside the portal page too).
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    const onPointerDown = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    root?.addEventListener("pointerdown", onPointerDown);
    // Start on the selected option, so arrow keys continue from there.
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    return () => root?.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (next: number | "all") => {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    const index = items.indexOf(e.target as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="ucpnb-catmenu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={open || value !== "all" ? "ucpnb-catmenu-button is-active" : "ucpnb-catmenu-button"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Category: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={current.tone === undefined ? "ucpnb-catmenu-dot is-all" : `ucpnb-catmenu-dot ucpnb-dot-tone-${current.tone}`} aria-hidden="true" />
        <span className="ucpnb-catmenu-label">{current.label}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <ul className="ucpnb-catmenu-list" role="listbox" aria-label="Categories" ref={listRef} onKeyDown={onListKeyDown}>
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                className={selected ? "ucpnb-catmenu-option is-selected" : "ucpnb-catmenu-option"}
                onClick={() => choose(o.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choose(o.value);
                  }
                }}
              >
                <span className={o.tone === undefined ? "ucpnb-catmenu-dot is-all" : `ucpnb-catmenu-dot ucpnb-dot-tone-${o.tone}`} aria-hidden="true" />
                <span className="ucpnb-catmenu-label">{o.label}</span>
                {selected && <Icon name="check" size={16} strokeWidth={2.4} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
