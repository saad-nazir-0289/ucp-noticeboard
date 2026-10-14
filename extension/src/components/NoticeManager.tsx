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

interface Props {
  user: AuthUser;
  scope: "mine" | "all";
}

export function NoticeManager({ user, scope }: Props) {
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
  const [pin, setPin] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setPin("");
    setError(null);
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
    if (!file) return;

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
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter your PIN (4–6 digits) to publish. Publishing for the first time? Choose a PIN now and use it from then on.");
      return;
    }
    const payload = {
      title,
      description,
      imageUrl,
      linkUrl,
      categoryId: categoryId === "" ? null : categoryId,
      deadline: fromDatetimeLocalValue(deadline),
      pin,
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
      // Surfaces the backend's actual message ("Incorrect PIN.") rather
      // than a generic failure — that distinction matters here.
      setError(err instanceof Error ? err.message : "Could not save the notice.");
      setPin("");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this notice? This cannot be undone.")) return;
    const deletePin = window.prompt("Enter your PIN to confirm deletion:");
    if (!deletePin) return;
    try {
      await api.deleteNotice(id, deletePin, user.token);
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
        <form className="ucpnb-form-card" onSubmit={handleSubmit}>
          <div className="ucpnb-form-card-header">
            <h4>{editing ? "Edit notice" : "New notice"}</h4>
            <button type="button" className="ucpnb-icon-btn ucpnb-icon-btn-sm" onClick={resetForm} aria-label="Cancel">
              <Icon name="x" size={18} />
            </button>
          </div>

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
                <input className="ucpnb-input" type="text" placeholder="Paste an image URL, or upload one" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
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
            <label className="ucpnb-field">
              <span className="ucpnb-field-label">Your PIN</span>
              <input
                className="ucpnb-input"
                type="password"
                inputMode="numeric"
                placeholder="4–6 digits"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
              />
              <span className="ucpnb-field-hint">First time publishing? The PIN you choose now becomes yours.</span>
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
        <ul className="ucpnb-manage-list">
          {notices.map((n) => {
            const expired = isExpired(n);
            return (
              <li key={n.id} className="ucpnb-manage-row">
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
      )}
    </div>
  );
}
