"use client";

import { useState, useEffect, useCallback } from "react";
import { PERMISSION_GROUPS } from "@shorterlink/shared";
import type { Permission } from "@shorterlink/shared";

function generatePassword(length = 12): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

interface UserData {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  permissions: string[];
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: generatePassword() });
  const [creating, setCreating] = useState(false);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, [fetchUsers]);

  const handleSave = async () => {
    if (!editingUser) return;
    setSaving(true);

    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: editingUser.role,
        permissions: editingUser.permissions,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
    } else {
      const err = await res.json();
      alert(err.error || "Ошибка сохранения");
    }
    setSaving(false);
  };

  const togglePermission = (perm: Permission) => {
    if (!editingUser) return;
    setEditingUser((prev) => {
      if (!prev) return prev;
      const has = prev.permissions.includes(perm);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm],
      };
    });
  };

  const toggleAllPermissions = () => {
    if (!editingUser) return;
    const allPerms = PERMISSION_GROUPS.flatMap((g) =>
      g.permissions.map((p) => p.value),
    );
    const hasAll = allPerms.every((p) => editingUser.permissions.includes(p));
    setEditingUser((prev) => {
      if (!prev) return prev;
      return { ...prev, permissions: hasAll ? [] : allPerms };
    });
  };

  const handleCreate = async () => {
    if (!newUser.email || !newUser.password) return;
    setCreating(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });

    if (res.ok) {
      const created = await res.json();
      setUsers((prev) => [...prev, created]);
      setShowCreate(false);
      setNewUser({ email: "", name: "", password: "" });
    } else {
      const err = await res.json();
      alert(err.error || "Ошибка создания");
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400">Загрузка...</div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
          <p className="mt-1 text-sm text-gray-500">
            Управление ролями и разрешениями
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Добавить
        </button>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Пользователь
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Роль
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Разрешения
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Дата
              </th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {user.name || "—"}
                  </div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === "ADMIN"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {user.role === "ADMIN" ? (
                    <span className="text-xs text-purple-600">
                      Полный доступ
                    </span>
                  ) : user.permissions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {user.permissions.slice(0, 4).map((p) => (
                        <span
                          key={p}
                          className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700"
                        >
                          {p}
                        </span>
                      ))}
                      {user.permissions.length > 4 && (
                        <span className="text-xs text-gray-400">
                          +{user.permissions.length - 4}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Нет доступа</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString("ru")}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => setEditingUser({ ...user })}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                Редактирование: {editingUser.name || editingUser.email}
              </h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Role toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Роль
                </label>
                <div className="flex gap-2">
                  {(["ADMIN", "USER"] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() =>
                        setEditingUser((prev) =>
                          prev ? { ...prev, role } : prev,
                        )
                      }
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        editingUser.role === role
                          ? role === "ADMIN"
                            ? "bg-purple-100 text-purple-800 ring-2 ring-purple-300"
                            : "bg-blue-100 text-blue-800 ring-2 ring-blue-300"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permissions (only for USER role) */}
              {editingUser.role === "USER" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Разрешения
                    </label>
                    <button
                      onClick={toggleAllPermissions}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Выбрать все / Снять все
                    </button>
                  </div>

                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">
                          {group.label}
                        </p>
                        <div className="space-y-1.5">
                          {group.permissions.map((perm) => (
                            <label
                              key={perm.value}
                              className="flex items-center gap-2.5 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={editingUser.permissions.includes(
                                  perm.value,
                                )}
                                onChange={() => togglePermission(perm.value)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">
                                {perm.label}
                              </span>
                              <span className="text-xs text-gray-400">
                                ({perm.value})
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {editingUser.role === "ADMIN" && (
                <p className="text-sm text-purple-600 bg-purple-50 px-4 py-3 rounded-lg">
                  ADMIN имеет полный доступ ко всем функциям. Разрешения не
                  требуются.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                Новый пользователь
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Имя
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Имя пользователя"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Пароль *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newUser.password}
                    onChange={(e) =>
                      setNewUser((prev) => ({ ...prev, password: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setNewUser((prev) => ({ ...prev, password: generatePassword() }))
                    }
                    className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    title="Сгенерировать новый"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Пользователь будет создан с ролью USER без разрешений. Настройте доступ после создания.
              </p>
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewUser({ email: "", name: "", password: generatePassword() });
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newUser.email || !newUser.password}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {creating ? "Создание..." : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        Изменения вступят в силу после повторного входа пользователя.
      </p>
    </div>
  );
}
