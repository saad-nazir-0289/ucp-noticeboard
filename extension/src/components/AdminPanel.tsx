import { Fragment, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuthUser, Category, UserListItem, UserRole } from "../types";
import { AdminPinPrompt } from "./AdminPinPrompt";

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
    if (!confirm(`Reset ${name}'s PIN? They'll be asked to choose a new one next time they publish something.`)) return;

    setPendingId(id);
    setSuccessMessage(null);
    setRowError(null);
    try {
      await api.resetUserPin(id, adminPin, user.token);
      setSuccessMessage(`${name}'s PIN was reset.`);
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err) {
      setRowError({ id, message: err instanceof Error ? err.message : "Could not reset PIN." });
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

  if (loading) return <p className="ucpnb-status">Loading users...</p>;

  return (
    <div className="ucpnb-panel">
      <h4>Add Publisher by Roll Number</h4>
      <p className="ucpnb-status">
        Adding someone here grants Publisher access immediately — no link to
        send, no activation step. They'll be prompted to choose their own PIN
        the first time they actually publish something.
      </p>
      <form className="ucpnb-form" onSubmit={handleAddUser}>
        <input
          type="text"
          placeholder="Roll Number (e.g. L1S23BSCS0285)"
          value={rollNumber}
          onChange={(e) => setRollNumber(e.target.value)}
        />
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {addError && <p className="ucpnb-error">{addError}</p>}
        {addSuccess && <p className="ucpnb-status">{addSuccess}</p>}
        <div className="ucpnb-form-actions">
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary">
            Add Publisher
          </button>
        </div>
      </form>

      <h4>All Users</h4>
      {error && <p className="ucpnb-error">{error}</p>}
      {successMessage && <p className="ucpnb-status ucpnb-status-active">{successMessage}</p>}
      <p className="ucpnb-status">
        Change anyone's role here — takes effect immediately, on any device.
        Click a name to correct it. "Reset PIN" clears a forgotten PIN so
        they can choose a new one next time they publish.
      </p>
      <table className="ucpnb-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Roll Number</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <Fragment key={u.id}>
              <tr>
                <td>
                  {editingNameId === u.id ? (
                    <input
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
                    <button
                      className="ucpnb-btn ucpnb-btn-link"
                      onClick={() => startEditName(u)}
                      title="Click to edit name"
                    >
                      {u.name}
                    </button>
                  )}
                </td>
                <td>{u.rollNumber}</td>
                <td>
                  <select
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
                  {pendingId === u.id && <span className="ucpnb-status"> Saving...</span>}
                </td>
                <td>
                  {u.role !== "Student" && (
                    <button
                      className="ucpnb-btn ucpnb-btn-link"
                      disabled={pendingId === u.id}
                      onClick={() => handleResetPin(u.id, u.name)}
                    >
                      {pendingId === u.id ? "Saving..." : "Reset PIN"}
                    </button>
                  )}
                </td>
              </tr>
              {rowError?.id === u.id && (
                <tr>
                  <td colSpan={4}>
                    <p className="ucpnb-error" style={{ margin: "4px 0" }}>
                      {rowError.message}
                    </p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <h4>Manage Categories</h4>
      <p className="ucpnb-status">
        Only Admins can create categories. Publishers pick from this list when
        creating a notice.
      </p>
      <form className="ucpnb-form ucpnb-form-inline" onSubmit={handleAddCategory}>
        <input
          type="text"
          placeholder="New category name"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
        />
        <button type="submit" className="ucpnb-btn ucpnb-btn-primary">
          Add Category
        </button>
      </form>
      {categoryError && <p className="ucpnb-error">{categoryError}</p>}
      {categories.length > 0 && (
        <div className="ucpnb-category-chips">
          {categories.map((c) => (
            <span key={c.id} className="ucpnb-category-chip">
              {c.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
