import { Fragment, useEffect, useState } from "react";
import { api } from "@shared/api/client";
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

export function AdminPanel({ user, adminPin, onAdminPinChange }: Props) {
  const [users, setUsers] = useState<UserListItem[]>([]);
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
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const fetchAll = async (pin: string) => {
    const [u, c] = await Promise.all([api.getUsers(pin, user.token), api.getCategories(user.token)]);
    setUsers(u);
    setCategories(c);
    setError(null);
  };

  const load = () => {
    if (!adminPin) return;
    setLoading(true);
    fetchAll(adminPin)
      .catch(() => {
        // Most likely the PIN changed since it was unlocked — ask again.
        onAdminPinChange(null);
        setError("Could not load users.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [user]);

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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError(null);
    if (!newCategoryName.trim()) {
      setCategoryError("Category name is required.");
      return;
    }
    try {
      const category = await api.createCategory(newCategoryName.trim(), adminPin, user.token);
      setCategories((prev) => [...prev, category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName("");
    } catch {
      setCategoryError("Could not add category — it may already exist.");
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
        <div className="ucpnb-table-wrap">
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
                        <Avatar name={u.name} />
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
        </div>
      </section>

      <section className="ucpnb-form-card">
        <div className="ucpnb-form-card-header">
          <div>
            <h4>Categories</h4>
            <p className="ucpnb-field-hint">Publishers pick from these when posting; students filter by them.</p>
          </div>
        </div>
        <form className="ucpnb-inline-form" onSubmit={handleAddCategory}>
          <input className="ucpnb-input" type="text" placeholder="New category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
          <button type="submit" className="ucpnb-btn ucpnb-btn-secondary">
            <Icon name="plus" size={16} />
            Add category
          </button>
        </form>
        {categoryError && <p className="ucpnb-form-error">{categoryError}</p>}
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
