import { useEffect, useState } from "react";
import { api } from "../api/client";
import { uploadImage, ImageUploadError } from "../api/imageUpload";
import type { AuthUser, Category, Notice } from "../types";

interface Props {
  user: AuthUser;
  scope: "mine" | "all";
}

function isExpired(notice: Notice): boolean {
  const now = new Date();
  if (notice.deadline) {
    return new Date(notice.deadline) <= now;
  }
  const sevenDaysAfterCreated = new Date(notice.createdAt);
  sevenDaysAfterCreated.setDate(sevenDaysAfterCreated.getDate() + 7);
  return sevenDaysAfterCreated <= now;
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in LOCAL time, not the ISO
// UTC string the API returns/expects — these two convert between them.
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
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
  };

  const canManage = (notice: Notice) => user.role === "Admin" || notice.createdByUserId === user.id;

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow selecting the same file again later
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
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
    const payload = {
      title,
      description,
      imageUrl,
      linkUrl,
      categoryId: categoryId === "" ? null : categoryId,
      deadline: fromDatetimeLocalValue(deadline),
    };
    try {
      if (editing) {
        await api.updateNotice(editing.id, payload, user.token);
      } else {
        await api.createNotice(payload, user.token);
      }
      resetForm();
      load();
    } catch {
      setError("Could not save the notice.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Permanently delete this notice? This cannot be undone.")) return;
    try {
      await api.deleteNotice(id, user.token);
      load();
    } catch {
      setError("Could not delete the notice.");
    }
  };

  return (
    <div className="ucpnb-panel">
      <div className="ucpnb-panel-header">
        <h4>{scope === "mine" ? "My Notices" : "All Notices"}</h4>
        <button className="ucpnb-btn ucpnb-btn-primary" onClick={startCreate}>
          + New Notice
        </button>
      </div>

      {(creating || editing) && (
        <form className="ucpnb-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="ucpnb-upload-row">
            <input
              type="text"
              placeholder="Poster image URL (optional)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <label className="ucpnb-btn ucpnb-upload-btn">
              {uploading ? "Uploading..." : "Upload Image"}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelected}
                disabled={uploading}
                hidden
              />
            </label>
          </div>
          {imageUrl && (
            <img src={imageUrl} alt="Preview" className="ucpnb-upload-preview" />
          )}
          <input
            type="text"
            placeholder="Link URL — e.g. a registration form (optional)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <label className="ucpnb-field-label">
            Deadline (optional — leave blank to auto-expire 7 days after posting)
          </label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          {error && <p className="ucpnb-error">{error}</p>}
          <div className="ucpnb-form-actions">
            <button type="submit" className="ucpnb-btn ucpnb-btn-primary">
              Publish
            </button>
            <button type="button" className="ucpnb-btn" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="ucpnb-status">Loading...</p>
      ) : notices.length === 0 ? (
        <p className="ucpnb-status">
          {scope === "mine" ? "You haven't published any notices yet." : "No notices yet."}
        </p>
      ) : (
        <table className="ucpnb-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              {scope === "all" && <th>Published By</th>}
              <th>Posted</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {notices.map((n) => {
              const expired = isExpired(n);
              return (
                <tr key={n.id}>
                  <td>{n.title}</td>
                  <td>{n.categoryName ?? "—"}</td>
                  {scope === "all" && <td>{n.createdByName}</td>}
                  <td>{new Date(n.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span className={expired ? "ucpnb-status-expired" : "ucpnb-status-active"}>
                      {expired ? "Hidden from students" : "Visible"}
                    </span>
                    {n.deadline && (
                      <div className="ucpnb-status">
                        Deadline: {new Date(n.deadline).toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td className="ucpnb-table-actions">
                    {canManage(n) ? (
                      <>
                        <button className="ucpnb-btn ucpnb-btn-link" onClick={() => startEdit(n)}>
                          Edit
                        </button>
                        <button
                          className="ucpnb-btn ucpnb-btn-link ucpnb-btn-danger"
                          onClick={() => handleDelete(n.id)}
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <span className="ucpnb-status">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
