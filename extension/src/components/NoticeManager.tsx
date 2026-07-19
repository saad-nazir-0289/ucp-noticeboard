import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuthUser, Notice } from "../types";

interface Props {
  user: AuthUser;
  scope: "mine" | "all"; // "mine" = Publisher managing only their own notices; "all" = Admin managing every notice
}

export function NoticeManager({ user, scope }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getNotices(user.token)
      .then((all) =>
        setNotices(scope === "mine" ? all.filter((n) => n.createdByUserId === user.id) : all)
      )
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
  };

  // A Publisher can only edit/delete notices they created themselves.
  // Admin can act on any notice. This mirrors what the backend enforces.
  const canManage = (notice: Notice) => user.role === "Admin" || notice.createdByUserId === user.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    try {
      if (editing) {
        await api.updateNotice(editing.id, { title, description, imageUrl }, user.token);
      } else {
        await api.createNotice({ title, description, imageUrl }, user.token);
      }
      resetForm();
      load();
    } catch {
      setError("Could not save the notice.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this notice?")) return;
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
          <input
            type="text"
            placeholder="Poster image URL (optional)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
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
              {scope === "all" && <th>Published By</th>}
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {notices.map((n) => (
              <tr key={n.id}>
                <td>{n.title}</td>
                {scope === "all" && <td>{n.createdByName}</td>}
                <td>{new Date(n.createdAt).toLocaleDateString()}</td>
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
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
