import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuthUser, UserListItem, UserRole } from "../types";

interface Props {
  user: AuthUser;
}

const ROLES: UserRole[] = ["Student", "Publisher", "Admin"];

export function AdminPanel({ user }: Props) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rollNumber, setRollNumber] = useState("");
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getUsers(user.token)
      .then(setUsers)
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
    if (!rollNumber.trim() || !name.trim()) {
      setAddError("Roll Number and Name are required.");
      return;
    }
    try {
      // Only Publishers are ever added here on purpose. Students don't need
      // to be added by anyone — they're identified and registered
      // automatically the first time they open the dashboard.
      await api.addUser({ rollNumber: rollNumber.trim(), name: name.trim(), role: "Publisher" }, user.token);
      setRollNumber("");
      setName("");
      load();
    } catch {
      setAddError("Could not add user — Roll Number may already exist.");
    }
  };

  if (loading) return <p className="ucpnb-status">Loading users...</p>;

  return (
    <div className="ucpnb-panel">
      <h4>Add Publisher by Roll Number</h4>
      <p className="ucpnb-status">
        Only add people who should be able to publish notices. Students don't need
        to be added — they can already see notices as soon as they open the
        dashboard.
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
    </div>
  );
}
