import { Fragment, useEffect, useState } from "react";
import { api } from "@shared/api/client";
import { uploadImage } from "@shared/api/imageUpload";
import type { AuthUser, Category, UserListItem, UserRole } from "@shared/types";
import { AdminPinPrompt } from "./AdminPinPrompt";
import { Icon } from "@shared/components/Icon";
import { Avatar, CategoryTag } from "@shared/components/Tags";

interface Props {
  user: AuthUser;
  /** Unlocked Admin PIN (see AdminPinPrompt), or null until entered. */
  adminPin: string | null;
  onAdminPinChange: (pin: string | null) => void;
}

const ROLES: UserRole[] = ["Student", "Publisher", "Admin"];
const PAGE_SIZE = 20;

export function AdminPanel({ user, adminPin, onAdminPinChange }: Props) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // `search`, debounced
  const [listLoading, setListLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  const [rollNumber, setRollNumber] = useState("");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);

  const fetchUsers = async (pin: string, q: string, p: number) => {
    const result = await api.getUsers(pin, user.token, { search: q, page: p, pageSize: PAGE_SIZE });
    setUsers(result.items);
    setTotal(result.total);
  };

  const fetchAll = async (pin: string) => {
    const [, c] = await Promise.all([fetchUsers(pin, query, page), api.getCategories(user.token)]);
    setCategories(c);
    setError(null);
  };

  /** Reloads the page of users currently shown (after adding someone, etc.). */
  const load = () => {
    if (!adminPin) return;
    setListLoading(true);
    fetchUsers(adminPin, query, page)
      .then(() => setError(null))
      .catch(() => {
        // Most likely the PIN changed since it was unlocked — ask again.
        onAdminPinChange(null);
        setError("Could not load users.");
      })
      .finally(() => {
        setListLoading(false);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!adminPin) return;
    if (loading) {
      fetchAll(adminPin)
        .catch(() => {
          onAdminPinChange(null);
          setError("Could not load users.");
        })
        .finally(() => setLoading(false));
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, query, page]);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  if (!adminPin) {
    return (
      <AdminPinPrompt
        section="Manage Users"
        onUnlock={async (pin) => {
          await fetchAll(pin);
          setLoading(false);
          onAdminPinChange(pin);
        }}
      />
    );
  }

  const handleRoleChange = async (id: number, newRole: UserRole) => {
    setPendingId(id);
    setSuccessMessage(null);
    setRowError(null);
    const previous = users;
    try {
      await api.updateUserRole(id, newRole, adminPin, user.token);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
      setSuccessMessage("Role updated.");
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err) {
      setUsers(previous);
      setRowError({ id, message: err instanceof Error ? err.message : "Could not update role." });
    } finally {
      setPendingId(null);
    }
  };

  const handleResetPin = async (id: number, name: string) => {
    if (!confirm(`Reset ${name}'s PIN? This also lifts any lock and logs out their unlocked devices. They'll choose a new PIN next time they publish something.`)) return;

    setPendingId(id);
    setSuccessMessage(null);
    setRowError(null);
    try {
      await api.resetUserPin(id, adminPin, user.token);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, pinLocked: false, activeDevices: 0 } : u)));
      setSuccessMessage(`${name}'s PIN was reset.`);
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Could not reset PIN." });
    } finally {
      setPendingId(null);
    }
  };

  const handleRevokeDevices = async (id: number, name: string) => {
    if (!confirm(`Log out all of ${name}'s unlocked devices? They'll need their PIN again on each one.`)) return;

    setPendingId(id);
    setSuccessMessage(null);
    setRowError(null);
    try {
      await api.revokeUserDevices(id, adminPin, user.token);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, activeDevices: 0 } : u)));
      setSuccessMessage(`${name}'s devices were logged out.`);
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Could not log out devices." });
    } finally {
      setPendingId(null);
    }
  };

  // A society that sends its logo to the Admin: upload it for them.
  const handleLogo = async (id: number, name: string, file: File | null) => {
    setPendingId(id);
    setSuccessMessage(null);
    setRowError(null);
    try {
      const url = file ? await uploadImage(file, user.token) : null;
      await api.updateUserLogo(id, url, adminPin, user.token);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, logoUrl: url } : u)));
      setSuccessMessage(url ? `${name}'s logo was updated.` : `${name}'s logo was removed.`);
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Could not update the logo." });
    } finally {
      setPendingId(null);
    }
  };

  const startEditName = (u: UserListItem) => {
    setEditingNameId(u.id);
    setEditingNameValue(u.name);
  };

  const cancelEditName = () => {
    setEditingNameId(null);
    setEditingNameValue("");
  };

  const saveEditName = async (id: number) => {
    const trimmed = editingNameValue.trim();
    if (!trimmed) {
      cancelEditName();
      return;
    }
    const previous = users;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, name: trimmed } : u)));
    cancelEditName();
    try {
      await api.updateUserName(id, trimmed, adminPin, user.token);
    } catch {
      setUsers(previous);
      setError("Could not update name.");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    if (!rollNumber.trim() || !name.trim()) {
      setAddError("Roll Number and Name are required.");
      return;
    }
    try {
      const result = await api.addUser(
        { rollNumber: rollNumber.trim(), name: name.trim(), pin: adminPin },
        user.token
      );
      setAddSuccess(`${result.name} can publish immediately — no link needed. They'll set their own PIN the first time they publish something.`);
      setRollNumber("");
      setName("");
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add user.");
    }
  };

  if (loading) return <div className="ucpnb-skeleton" style={{ height: 200, borderRadius: 16 }} />;

  return (
    <div className="ucpnb-tab-panel">
      <section className="ucpnb-form-card">
        <div className="ucpnb-form-card-header">
          <div>
            <h4>Add a Publisher</h4>
            <p className="ucpnb-field-hint">They can post right away and choose their own PIN the first time they publish.</p>
          </div>
        </div>
        <form className="ucpnb-inline-form" onSubmit={handleAddUser}>
          <input className="ucpnb-input" type="text" placeholder="Roll Number (e.g. L1S23BSCS0285)" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
          <input className="ucpnb-input" type="text" placeholder="Name shown on their notices" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary">
            <Icon name="plus" size={16} />
            Add Publisher
          </button>
        </form>
        {addError && <p className="ucpnb-form-error">{addError}</p>}
        {addSuccess && <p className="ucpnb-form-success">{addSuccess}</p>}
      </section>

      <section className="ucpnb-form-card">
        <div className="ucpnb-form-card-header">
          <div>
            <h4>People</h4>
            <p className="ucpnb-field-hint">
              Role changes apply immediately. Click a name to correct it. Reset PIN also lifts a lock and logs out their devices.
            </p>
          </div>
          {successMessage && (
            <span className="ucpnb-badge ucpnb-badge-success">
              <Icon name="check" size={12} strokeWidth={2.6} />
              {successMessage}
            </span>
          )}
        </div>
        {error && <p className="ucpnb-form-error">{error}</p>}
        <label className="ucpnb-search ucpnb-users-search">
          <Icon name="search" size={17} />
          <input
            className="ucpnb-input"
            type="search"
            placeholder="Search by Roll Number or name"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className={listLoading ? "ucpnb-table-wrap is-loading" : "ucpnb-table-wrap"}>
          <table className="ucpnb-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roll Number</th>
                <th>Role</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td>
                      <div className="ucpnb-user-cell">
                        <Avatar name={u.name} imageUrl={u.logoUrl} />
                        {editingNameId === u.id ? (
                          <input
                            className="ucpnb-input ucpnb-input-sm"
                            type="text"
                            value={editingNameValue}
                            autoFocus
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onBlur={() => saveEditName(u.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditName(u.id);
                              if (e.key === "Escape") cancelEditName();
                            }}
                          />
                        ) : (
                          <button className="ucpnb-name-btn" onClick={() => startEditName(u)} title="Click to edit name">
                            {u.name}
                          </button>
                        )}
                        {u.pinLocked && <span className="ucpnb-badge ucpnb-badge-urgent">Locked</span>}
                      </div>
                    </td>
                    <td className="ucpnb-mono">{u.rollNumber}</td>
                    <td>
                      <select
                        className="ucpnb-input ucpnb-input-sm"
                        aria-label={`Role for ${u.name}`}
                        value={u.role}
                        disabled={pendingId === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.role !== "Student" && (
                        <div className="ucpnb-row-actions">
                          <button className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm" disabled={pendingId === u.id} onClick={() => handleResetPin(u.id, u.name)}>
                            <Icon name="restore" size={14} />
                            Reset PIN
                          </button>
                          <label className={pendingId === u.id ? "ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm is-disabled" : "ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm"}>
                            <Icon name="image" size={14} />
                            {u.logoUrl ? "Change logo" : "Add logo"}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={pendingId === u.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) handleLogo(u.id, u.name, file);
                              }}
                            />
                          </label>
                          {u.logoUrl && (
                            <button className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm" disabled={pendingId === u.id} onClick={() => handleLogo(u.id, u.name, null)}>
                              <Icon name="trash" size={14} />
                              Remove logo
                            </button>
                          )}
                          {(u.activeDevices ?? 0) > 0 && (
                            <button className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm" disabled={pendingId === u.id} onClick={() => handleRevokeDevices(u.id, u.name)}>
                              <Icon name="lock" size={14} />
                              Log out devices ({u.activeDevices})
                            </button>
                          )}
                          {pendingId === u.id && <span className="ucpnb-spinner" />}
                        </div>
                      )}
                    </td>
                  </tr>
                  {rowError?.id === u.id && (
                    <tr>
                      <td colSpan={4}>
                        <p className="ucpnb-form-error">{rowError.message}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {users.length === 0 && !listLoading && (
            <p className="ucpnb-table-empty">{query ? `No one matches "${query}".` : "No users yet."}</p>
          )}
        </div>
        {total > 0 && (
          <div className="ucpnb-pager">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
            </span>
            <div>
              <button className="ucpnb-icon-btn ucpnb-icon-btn-sm ucpnb-icon-btn-outlined" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || listLoading} aria-label="Previous page">
                <Icon name="chevronLeft" size={16} />
              </button>
              <span className="ucpnb-pager-page">
                Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <button
                className="ucpnb-icon-btn ucpnb-icon-btn-sm ucpnb-icon-btn-outlined"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * PAGE_SIZE >= total || listLoading}
                aria-label="Next page"
              >
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="ucpnb-form-card">
        <div className="ucpnb-form-card-header">
          <div>
            <h4>Categories</h4>
            <p className="ucpnb-field-hint">
              A fixed list, so filters, notification topics and Quick fill always mean the same thing. Publishers pick
              one when posting; students filter by them.
            </p>
          </div>
        </div>
        {categories.length > 0 && (
          <div className="ucpnb-card-tags">
            {categories.map((c) => (
              <CategoryTag key={c.id} name={c.name} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
