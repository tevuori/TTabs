"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getSession,
  getAllUsers,
  addUser,
  deleteUser,
  changePassword,
  logout,
  type User,
} from "@/lib/auth";
import { AuthGuard, useRequireAuth } from "@/components/AuthGuard";
import Header from "@/components/Header";

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}

function SettingsContent() {
  const router = useRouter();
  const { session } = useRequireAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [editingPassword, setEditingPassword] = useState<string | null>(null);
  const [editPasswordValue, setEditPasswordValue] = useState("");

  const refresh = useCallback(async () => {
    const all = await getAllUsers();
    setUsers(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!session) return null;

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    if (!newUsername.trim() || !newPassword) {
      setAddError("Username and password are required");
      return;
    }
    if (newPassword.length < 4) {
      setAddError("Password must be at least 4 characters");
      return;
    }
    try {
      await addUser(newUsername.trim(), newPassword, newIsAdmin);
      setAddSuccess(`User "${newUsername.trim()}" created`);
      setNewUsername("");
      setNewPassword("");
      setNewIsAdmin(false);
      await refresh();
    } catch (err) {
      setAddError((err as Error).message);
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await deleteUser(id);
      await refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleChangePassword = async (id: string) => {
    if (!editPasswordValue || editPasswordValue.length < 4) {
      alert("Password must be at least 4 characters");
      return;
    }
    try {
      await changePassword(id, editPasswordValue);
      setEditingPassword(null);
      setEditPasswordValue("");
      alert("Password updated");
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-text mb-2">Settings</h1>
        <p className="text-text-muted text-sm mb-6">
          Signed in as <span className="text-text font-medium">{session.username}</span>
          {session.isAdmin && <span className="text-accent"> (admin)</span>}
        </p>

        {/* User management — admin only */}
        {session.isAdmin ? (
          <div className="space-y-6">
            {/* Add new user */}
            <div className="bg-bg-card border border-bg-border rounded-xl p-5">
              <h2 className="text-text font-semibold text-sm mb-4">Add new user</h2>
              <form onSubmit={handleAddUser} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-text-muted text-xs font-medium mb-1.5">Username</label>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-bg-hover border border-bg-border rounded-lg text-text placeholder:text-text-dim focus:outline-none focus:border-accent text-sm"
                      placeholder="new_user"
                    />
                  </div>
                  <div>
                    <label className="block text-text-muted text-xs font-medium mb-1.5">Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-bg-hover border border-bg-border rounded-lg text-text placeholder:text-text-dim focus:outline-none focus:border-accent text-sm"
                      placeholder="••••••"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-text-muted text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsAdmin}
                    onChange={e => setNewIsAdmin(e.target.checked)}
                    className="accent-accent"
                  />
                  Grant admin privileges
                </label>
                {addError && (
                  <p className="text-red-400 text-sm">{addError}</p>
                )}
                {addSuccess && (
                  <p className="text-green-400 text-sm">{addSuccess}</p>
                )}
                <button
                  type="submit"
                  disabled={!newUsername.trim() || !newPassword}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm transition-colors"
                >
                  Create user
                </button>
              </form>
            </div>

            {/* User list */}
            <div className="bg-bg-card border border-bg-border rounded-xl p-5">
              <h2 className="text-text font-semibold text-sm mb-4">
                Users ({users.length})
              </h2>
              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-bg-border border-t-accent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 flex-wrap bg-bg-hover rounded-lg p-3"
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        user.isAdmin ? "bg-accent text-white" : "bg-bg-border text-text-muted"
                      }`}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-text font-medium text-sm truncate">{user.username}</span>
                          {user.isAdmin && (
                            <span className="text-accent text-[10px] font-semibold uppercase tracking-wider">Admin</span>
                          )}
                          {user.id === session.userId && (
                            <span className="text-text-dim text-[10px]">(you)</span>
                          )}
                        </div>
                        <span className="text-text-dim text-xs">
                          Created {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {editingPassword === user.id ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            <input
                              type="password"
                              value={editPasswordValue}
                              onChange={e => setEditPasswordValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") handleChangePassword(user.id);
                                if (e.key === "Escape") { setEditingPassword(null); setEditPasswordValue(""); }
                              }}
                              autoFocus
                              placeholder="New password"
                              className="w-28 px-2 py-1 bg-bg border border-accent rounded text-text text-xs focus:outline-none"
                            />
                            <button
                              onClick={() => handleChangePassword(user.id)}
                              className="px-2 py-1 bg-accent text-white rounded text-xs font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingPassword(null); setEditPasswordValue(""); }}
                              className="px-2 py-1 text-text-dim hover:text-text text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditingPassword(user.id); setEditPasswordValue(""); }}
                              className="px-2 py-1.5 text-text-dim hover:text-accent text-xs transition-colors"
                              title="Change password"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2 11L2 9L9 2L11 4L4 11H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                              </svg>
                            </button>
                            {user.id !== "admin" && user.id !== session.userId && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.username)}
                                className="px-2 py-1.5 text-text-dim hover:text-red-400 transition-colors"
                                title="Delete user"
                              >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M3 4H11M5 4V3C5 2.5 5.5 2 6 2H8C8.5 2 9 2.5 9 3V4M4 4V11C4 11.5 4.5 12 5 12H9C9.5 12 10 11.5 10 11V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-bg-card border border-bg-border rounded-xl p-6 text-center">
            <p className="text-text-muted text-sm">
              User management is available to admins only.
            </p>
          </div>
        )}

        {/* Logout */}
        <div className="mt-6">
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-bg-card hover:bg-bg-hover border border-bg-border rounded-xl text-text-muted text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
