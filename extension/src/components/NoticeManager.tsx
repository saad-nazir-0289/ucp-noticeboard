import { useEffect, useState } from "react";
import { api } from "@shared/api/client";
import { uploadImage, ImageUploadError } from "@shared/api/imageUpload";
import type { AuthUser, Category, Notice } from "@shared/types";
import { fromDatetimeLocalValue, isExpired, toDatetimeLocalValue } from "@shared/noticeForm";
import { optimizeImageUrl } from "@shared/imageOptimize";
import { timeAgo } from "@shared/format";
import { Icon } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";
import { CategoryTag, PinnedBadge, PinToggle } from "@shared/components/Tags";
import { parseSharedContent } from "@shared/shareParser";

interface Props {
  user: AuthUser;
  scope: "mine" | "all";
  /** Asks for the PIN once if this Chrome isn't unlocked yet; false if cancelled. */
  ensureUnlocked: () => Promise<boolean>;
}

export function NoticeManager({ user, scope, ensureUnlocked }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [deadline, setDeadline] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Notices ticked for "Delete selected".
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // What pasting filled in, shown above the form so it gets a quick check.
  const [pasteNote, setPasteNote] = useState<string[] | null>(null);

  const load = () => {
    setLoading(true);
    // includeExpired=true is essential here: this is the management view,
    // so it must show everything — expired notices included — not just
    // what's currently visible to students. Without this, an Admin/
    // Publisher would have no way to review, edit, or delete anything
    // that's aged out of the student feed.
    Promise.all([api.getNotices(user.token, true, true), api.getCategories(user.token)])
      .then(([all, cats]) => {
        setNotices(scope === "mine" ? all.filter((n) => n.createdByUserId === user.id) : all);
        setCategories(cats);
        setSelected(new Set());
      })
      .catch(() => setError("Could not load notices."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [user, scope]);

  const resetForm = () => {
    setCreating(false);
    setEditing(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setLinkUrl("");
    setCategoryId("");
    setDeadline("");
    setIsPinned(false);
    setError(null);
    setPasteNote(null);
  };

  const startCreate = () => {
    resetForm();
    setCreating(true);
  };

  const startEdit = (notice: Notice) => {
    resetForm();
    setEditing(notice);
    setTitle(notice.title);
    setDescription(notice.description);
    setImageUrl(notice.imageUrl ?? "");
    setLinkUrl(notice.linkUrl ?? "");
    setCategoryId(notice.categoryId ?? "");
    setDeadline(toDatetimeLocalValue(notice.deadline));
    setIsPinned(notice.isPinned);
  };

  const canManage = (notice: Notice) => user.role === "Admin" || notice.createdByUserId === user.id;

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow selecting the same file again later
    if (file) await uploadPoster(file);
  };

  /**
   * Pasting into the form (anywhere but a field you're typing in): a copied
   * WhatsApp message, email or caption fills the fields it can (title,
   * details, link, deadline, category), and a copied image becomes the
   * poster. Same reading as sharing into the app; nothing leaves the browser
   * except the poster upload.
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    const image = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    const typingInField = target.matches("input, textarea, select") && !target.classList.contains("ucpnb-paste-box");
    // Into a field, a paste behaves normally, except an image into the poster field.
    if (typingInField && !(image && target.classList.contains("ucpnb-poster-input"))) return;

    const text = e.clipboardData.getData("text/plain").trim();
    if (!image && !text) return;
    e.preventDefault();

    const notes: string[] = [];
    if (text) {
      const parsed = parseSharedContent({ text }, categories);
      if (parsed.title) setTitle(parsed.title);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.linkUrl) setLinkUrl(parsed.linkUrl);
      if (parsed.deadline) setDeadline(toDatetimeLocalValue(parsed.deadline));
      if (parsed.categoryId) setCategoryId(parsed.categoryId);
      notes.push("Filled in from what you pasted. Check it before posting.", ...parsed.hints);
    }
    if (image) {
      void uploadPoster(image);
      notes.push(text ? "The image is the poster." : "Poster added. Paste the message text too, and the rest fills in.");
    }
    setPasteNote(notes);
  };

  const handleDrop = (e: React.DragEvent) => {
    const image = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!image) return;
    e.preventDefault();
    void uploadPoster(image);
  };

  const uploadPoster = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file, user.token);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof ImageUploadError ? err.message : "Could not upload image.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    if (!(await ensureUnlocked())) return;
    const payload = {
      title,
      description,
      imageUrl,
      linkUrl,
      categoryId: categoryId === "" ? null : categoryId,
      deadline: fromDatetimeLocalValue(deadline),
      ...(user.role === "Admin" ? { isPinned } : {}),
    };
    try {
      if (editing) {
        await api.updateNotice(editing.id, payload, user.token);
      } else {
        await api.createNotice(payload, user.token);
      }
      resetForm();
      load();
    } catch (err) {
      // The backend's own message, e.g. when this Chrome's unlock has expired.
      setError(err instanceof Error ? err.message : "Could not save the notice.");
    }
  };

  const manageable = notices.filter(canManage);
  const allSelected = manageable.length > 0 && manageable.every((n) => selected.has(n.id));

  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} ${ids.length === 1 ? "notice" : "notices"}? This cannot be undone.`)) return;
    if (!(await ensureUnlocked())) return;
    setBulkBusy(true);
    setError(null);
    try {
      const { deleted } = await api.deleteNotices(ids, null, user.token);
      setMessage(`Deleted ${deleted} ${deleted === 1 ? "notice" : "notices"}.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the notices.");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this notice? This cannot be undone.")) return;
    if (!(await ensureUnlocked())) return;
    try {
      await api.deleteNotice(id, null, user.token);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the notice.");
    }
  };

  return (
    <div className="ucpnb-tab-panel">
      <div className="ucpnb-section-header">
        <div>
          <h4>{scope === "mine" ? "My notices" : "All notices"}</h4>
          <p>Everything you've posted, including notices students no longer see.</p>
        </div>
        {!(creating || editing) && (
          <button className="ucpnb-btn ucpnb-btn-primary" onClick={startCreate}>
            <Icon name="plus" size={16} />
            New notice
          </button>
        )}
      </div>

      {(creating || editing) && (
        <form className="ucpnb-form-card" onSubmit={handleSubmit} onPaste={handlePaste}>
          <div className="ucpnb-form-card-header">
            <h4>{editing ? "Edit notice" : "New notice"}</h4>
            <button type="button" className="ucpnb-icon-btn ucpnb-icon-btn-sm" onClick={resetForm} aria-label="Cancel">
              <Icon name="x" size={18} />
            </button>
          </div>

          {!editing && (
            <textarea
              className="ucpnb-paste-box"
              aria-label="Paste a message or poster to fill the form"
              placeholder="Paste here (Ctrl+V) a WhatsApp message, an email or a poster image, and the form fills itself."
              value=""
              onChange={() => {}}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              rows={2}
            />
          )}
          {pasteNote && (
            <div className="ucpnb-paste-note" role="status">
              {pasteNote.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          )}

          <div className="ucpnb-form-grid">
            <label className="ucpnb-field ucpnb-span-2">
              <span className="ucpnb-field-label">Title</span>
              <input className="ucpnb-input" type="text" placeholder="e.g. Hackathon registrations open" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="ucpnb-field ucpnb-span-2">
              <span className="ucpnb-field-label">Details</span>
              <textarea className="ucpnb-input" aria-label="Details" placeholder="What students need to know" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </label>
            <label className="ucpnb-field">
              <span className="ucpnb-field-label">Category</span>
              <select className="ucpnb-input" aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ucpnb-field">
              <span className="ucpnb-field-label">Deadline</span>
              <input className="ucpnb-input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <span className="ucpnb-field-hint">Leave empty to show it for 7 days.</span>
            </label>
            {user.role === "Admin" && (
              <div className="ucpnb-span-2">
                <PinToggle checked={isPinned} onChange={setIsPinned} />
              </div>
            )}
            <div className="ucpnb-field ucpnb-span-2">
              <span className="ucpnb-field-label">Poster</span>
              <div className="ucpnb-upload-row">
                <input className="ucpnb-input ucpnb-poster-input" type="text" placeholder="Paste an image or its URL, or upload one" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
                <label className="ucpnb-btn ucpnb-btn-secondary">
                  {uploading ? <span className="ucpnb-spinner" /> : <Icon name="image" size={16} />}
                  {uploading ? "Uploading" : "Upload"}
                  <input type="file" accept="image/*" onChange={handleFileSelected} disabled={uploading} hidden />
                </label>
              </div>
              {imageUrl && <img src={optimizeImageUrl(imageUrl, 500) ?? imageUrl} alt="" className="ucpnb-upload-preview" />}
            </div>
            <label className="ucpnb-field ucpnb-span-2">
              <span className="ucpnb-field-label">Link</span>
              <input className="ucpnb-input" type="text" placeholder="Registration form, event page… (optional)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </label>
          </div>

          {error && <p className="ucpnb-form-error">{error}</p>}
          <div className="ucpnb-form-actions">
            <button type="button" className="ucpnb-btn ucpnb-btn-secondary" onClick={resetForm}>
              Cancel
            </button>
            <button type="submit" className="ucpnb-btn ucpnb-btn-primary">
              {editing ? "Save changes" : "Publish notice"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="ucpnb-skeleton" style={{ height: 160, borderRadius: 16 }} />
      ) : notices.length === 0 ? (
        <EmptyState icon="megaphone" title={scope === "mine" ? "You haven't posted yet" : "No notices yet"}>
          Notices you publish will be listed here.
        </EmptyState>
      ) : (
        <>
        {manageable.length > 0 && (
          <div className="ucpnb-bulk-bar">
            <label className="ucpnb-check">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(manageable.map((n) => n.id)))}
              />
              <span>{selected.size > 0 ? `${selected.size} selected` : "Select all"}</span>
            </label>
            <button
              type="button"
              className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm"
              onClick={() => setSelected(new Set(manageable.filter(isExpired).map((n) => n.id)))}
              disabled={!manageable.some(isExpired)}
            >
              Select expired
            </button>
            <button
              type="button"
              className="ucpnb-btn ucpnb-btn-danger ucpnb-btn-sm ucpnb-bulk-delete"
              onClick={handleBulkDelete}
              disabled={selected.size === 0 || bulkBusy}
            >
              {bulkBusy ? <span className="ucpnb-spinner" /> : <Icon name="trash" size={14} />}
              Delete selected
            </button>
          </div>
        )}
        {message && <p className="ucpnb-form-success">{message}</p>}
        <ul className="ucpnb-manage-list">
          {notices.map((n) => {
            const expired = isExpired(n);
            return (
              <li key={n.id} className={selected.has(n.id) ? "ucpnb-manage-row is-selected" : "ucpnb-manage-row"}>
                {canManage(n) && (
                  <input
                    type="checkbox"
                    className="ucpnb-row-check"
                    checked={selected.has(n.id)}
                    onChange={() => toggleSelected(n.id)}
                    aria-label={`Select "${n.title}"`}
                  />
                )}
                <div className="ucpnb-manage-info">
                  <div className="ucpnb-card-tags">
                    <span className={expired ? "ucpnb-badge ucpnb-badge-closed" : "ucpnb-badge ucpnb-badge-success"}>
                      {expired ? "Expired" : "Live"}
                    </span>
                    {n.isPinned && <PinnedBadge />}
                    {n.categoryName && <CategoryTag name={n.categoryName} />}
                  </div>
                  <strong>{n.title}</strong>
                  <span className="ucpnb-manage-meta">
                    {scope === "all" && <>{n.createdByName} · </>}
                    Posted {timeAgo(n.createdAt)}
                    {n.deadline && <> · Deadline {new Date(n.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>}
                    {/* Only the Admin is ever sent view counts. */}
                    {n.viewCount != null && <> · <Icon name="eye" size={13} /> {n.viewCount}</>}
                  </span>
                </div>
                {canManage(n) && (
                  <div className="ucpnb-manage-actions">
                    <button className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" onClick={() => startEdit(n)}>
                      <Icon name="pencil" size={14} />
                      Edit
                    </button>
                    <button className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-danger ucpnb-btn-sm" onClick={() => handleDelete(n.id)}>
                      <Icon name="trash" size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </div>
  );
}
