import { useState } from "react";
import { api, hasDeviceToken } from "@shared/api/client";
import { uploadImage, ImageUploadError } from "@shared/api/imageUpload";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@shared/noticeForm";
import { optimizeImageUrl } from "@shared/imageOptimize";
import type { AuthUser, Category, Notice } from "@shared/types";
import { Icon } from "@shared/components/Icon";

/** Pre-filled values for a new notice (e.g. from something shared into the app). */
export interface NoticeDraft {
  title?: string;
  description?: string;
  linkUrl?: string;
  imageUrl?: string;
  categoryId?: number;
  deadline?: string; // ISO
}

interface Props {
  user: AuthUser;
  categories: Category[];
  /** Editing an existing notice; omit to create a new one. */
  notice?: Notice;
  draft?: NoticeDraft;
  onSaved: (notice: Notice) => void;
  onClose: () => void;
  /** The server said this phone is no longer unlocked — ask for the PIN, keeping the form. */
  onNeedsUnlock: () => void;
}

export function NoticeEditor({ user, categories, notice, draft, onSaved, onClose, onNeedsUnlock }: Props) {
  const initial = notice
    ? { ...notice, deadline: notice.deadline ?? undefined }
    : draft ?? {};
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(initial.categoryId ?? "");
  const [deadline, setDeadline] = useState(toDatetimeLocalValue(initial.deadline ?? null));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setImageUrl(await uploadImage(file, user.token));
    } catch (err) {
      setError(err instanceof ImageUploadError ? err.message : "Could not upload the poster.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("A title and description are required.");
      return;
    }
    if (!hasDeviceToken()) {
      onNeedsUnlock();
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim(),
      imageUrl,
      linkUrl: linkUrl.trim(),
      categoryId: categoryId === "" ? null : categoryId,
      deadline: fromDatetimeLocalValue(deadline),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = notice
        ? await api.updateNotice(notice.id, payload, user.token)
        : await api.createNotice(payload, user.token);
      onSaved(saved);
    } catch (err) {
      if (!hasDeviceToken()) {
        // The unlock lapsed (expired, logged out, role changed): get the
        // PIN again, then they can tap Publish once more — nothing is lost.
        onNeedsUnlock();
      } else {
        setError(err instanceof Error ? err.message : "Could not save the notice.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ucpnb-overlay" onClick={onClose}>
      <form
        className="ucpnb-sheet ucpnb-sheet-tall"
        role="dialog"
        aria-modal="true"
        aria-label={notice ? "Edit notice" : "New notice"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="ucpnb-sheet-header">
          <h3>{notice ? "Edit notice" : "New notice"}</h3>
          <button type="button" className="ucpnb-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>

        <div className="ucpnb-sheet-content">
          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Title</span>
            <input className="ucpnb-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Hackathon registrations open" />
          </label>

          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Details</span>
            <textarea className="ucpnb-input" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={4000} placeholder="What students need to know — dates, venue, who it's for" />
          </label>

          <div className="ucpnb-field">
            <span className="ucpnb-field-label">Poster</span>
            {imageUrl ? (
              <div className="ucpnb-poster">
                <img src={optimizeImageUrl(imageUrl, 700) ?? imageUrl} alt="" />
                <button type="button" className="ucpnb-icon-btn ucpnb-poster-remove" onClick={() => setImageUrl("")} aria-label="Remove poster">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            ) : (
              <label className={`ucpnb-dropzone${uploading ? " is-busy" : ""}`}>
                {uploading ? <span className="ucpnb-spinner" /> : <Icon name="image" size={24} />}
                <strong>{uploading ? "Uploading…" : "Add a poster"}</strong>
                <span>Optional · JPG or PNG up to 8 MB</span>
                <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} hidden />
              </label>
            )}
          </div>

          <div className="ucpnb-field-pair">
            <label className="ucpnb-field">
              <span className="ucpnb-field-label">Category</span>
              <select className="ucpnb-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}>
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
            </label>
          </div>
          <span className="ucpnb-field-hint">Without a deadline, a notice stays up for 7 days.</span>

          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Link</span>
            <input className="ucpnb-input" type="url" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Registration form, event page… (optional)" />
          </label>

          {error && <p className="ucpnb-form-error">{error}</p>}
        </div>

        <div className="ucpnb-sheet-footer">
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-lg ucpnb-btn-block" disabled={saving || uploading}>
            {saving ? <span className="ucpnb-spinner" /> : notice ? "Save changes" : "Publish notice"}
          </button>
        </div>
      </form>
    </div>
  );
}
