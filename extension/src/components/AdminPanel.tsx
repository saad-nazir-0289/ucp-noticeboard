import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuthUser, Category, UserListItem, UserRole } from "../types";

interface Props {
  user: AuthUser;
}

const ROLES: UserRole[] = ["Student", "Publisher", "Admin"];
const DASHBOARD_URL = "https://horizon.ucp.edu.pk/student/dashboard";

export function AdminPanel({ user }: Props) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rollNumber, setRollNumber] = useState("");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getUsers(user.token), api.getCategories(user.token)])
      .then(([u, c]) => {
        setUsers(u);
        setCategories(c);
      })
      .catch(() => setError("Could not load users."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [user]);

  const handleRoleChange = async (id: number, newRole: UserRole) => {
    const previous = users;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
    try {
      await api.updateUserRole(id, newRole, user.token);
    } catch {
      setUsers(previous);
      setError("Could not update role.");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setActivationLink(null);
    setCopied(false);
    if (!rollNumber.trim() || !name.trim()) {
      setAddError("Roll Number and Name are required.");
      return;
    }
    try {
      const result = await api.addUser({ rollNumber: rollNumber.trim(), name: name.trim() }, user.token);
      setActivationLink(`${DASHBOARD_URL}?ucpnb_activate=${result.activationCode}`);
      setRollNumber("");
      setName("");
      load();
    } catch {
      setAddError("Could not add user.");
    }
  };

  const handleCopy = async () => {
    if (!activationLink) return;
    try {
      await navigator.clipboard.writeText(activationLink);
      setCopied(true);
    } catch {
      /* clipboard access can fail silently in some contexts */
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
      const category = await api.createCategory(newCategoryName.trim(), user.token);
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
        Only add people who should be able to publish notices. Students don't need
        to be added — they can already see notices as soon as they open the
        dashboard. Adding someone here does not grant access by itself — send
        them the one-time link that appears below after adding, and only opening
        that link (once) actually activates Publisher access for them.
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
        <div className="ucpnb-form-actions">
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary">
            Add Publisher
          </button>
        </div>
      </form>

      {activationLink && (
        <div className="ucpnb-activation-box">
          <p className="ucpnb-status">
            Send this link directly to that person (WhatsApp, in person, etc.) —
            not through any public or guessable channel. It only works once.
          </p>
          <div className="ucpnb-activation-row">
            <input type="text" readOnly value={activationLink} onFocus={(e) => e.target.select()} />
            <button type="button" className="ucpnb-btn" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <h4>All Users</h4>
      {error && <p className="ucpnb-error">{error}</p>}
      <p className="ucpnb-status">
        Change anyone's role here — e.g. remove Publisher access, or promote
        someone to Admin.
      </p>
      <table className="ucpnb-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Roll Number</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.rollNumber}</td>
              <td>
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
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
