"use client";

import { useEffect, useState } from "react";

interface UserInfo {
  id: string;
  email: string;
  name: string | null;
}

interface AuditRow {
  id: string;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  payload: unknown;
  createdAt: string;
  user: UserInfo | null;
}

interface AuditResponse {
  rows: AuditRow[];
  total: number;
  page: number;
  limit: number;
  filters: {
    users: UserInfo[];
    actions: string[];
    entities: string[];
  };
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Создание",
  UPDATE: "Изменение",
  DELETE: "Удаление",
  DEACTIVATE: "Деактивация",
  SWITCH: "Переключение",
};

const ENTITY_LABELS: Record<string, string> = {
  Landing: "Лендинг",
  Video: "Видео",
  User: "Пользователь",
  Company: "Компания",
};

export default function AuditLogPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);
    if (userId) params.set("userId", userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading indicator for async fetch
    setLoading(true);
    fetch(`/api/admin/audit-log?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: AuditResponse) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, entity, action, userId]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Журнал действий</h1>
        <p className="mt-1 text-sm text-gray-500">
          История изменений в системе — кто, когда, что сделал
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={entity}
          onChange={(e) => {
            setPage(1);
            setEntity(e.target.value);
          }}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white hover:border-gray-300"
        >
          <option value="">Все сущности</option>
          {data?.filters.entities.map((en) => (
            <option key={en} value={en}>
              {ENTITY_LABELS[en] ?? en}
            </option>
          ))}
        </select>

        <select
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white hover:border-gray-300"
        >
          <option value="">Все действия</option>
          {data?.filters.actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a] ?? a}
            </option>
          ))}
        </select>

        <select
          value={userId}
          onChange={(e) => {
            setPage(1);
            setUserId(e.target.value);
          }}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white hover:border-gray-300"
        >
          <option value="">Все пользователи</option>
          {data?.filters.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
        </select>

        {(entity || action || userId) && (
          <button
            onClick={() => {
              setEntity("");
              setAction("");
              setUserId("");
              setPage(1);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
          >
            Сбросить
          </button>
        )}
      </div>

      {error && <div className="text-red-500 py-4">Ошибка: {error}</div>}

      {loading && !data ? (
        <div className="text-center py-12 text-gray-400">Загрузка...</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          По этим фильтрам нет записей
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Когда</th>
                <th className="text-left px-4 py-2 font-medium">Кто</th>
                <th className="text-left px-4 py-2 font-medium">Действие</th>
                <th className="text-left px-4 py-2 font-medium">Сущность</th>
                <th className="text-left px-4 py-2 font-medium">ID</th>
                <th className="text-left px-4 py-2 font-medium">Детали</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const isExpanded = expandedId === row.id;
                const hasPayload =
                  row.payload &&
                  typeof row.payload === "object" &&
                  Object.keys(row.payload).length > 0;
                return (
                  <>
                    <tr
                      key={row.id}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {row.user?.name || row.user?.email || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className={actionBadge(row.action)}>
                          {ACTION_LABELS[row.action] ?? row.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {row.entity ? ENTITY_LABELS[row.entity] ?? row.entity : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400 font-mono">
                        {row.entityId ? row.entityId.slice(0, 10) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {hasPayload ? (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : row.id)}
                            className="text-xs text-brand hover:text-brand-hover"
                          >
                            {isExpanded ? "Скрыть" : "Показать"}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasPayload && (
                      <tr key={row.id + "-payload"} className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-2">
                          <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(row.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-gray-500">
            Всего записей: {data.total}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              ←
            </button>
            <span className="text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 border border-gray-200 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function actionBadge(action: string): string {
  const base =
    "inline-block text-xs font-medium px-2 py-0.5 rounded";
  switch (action) {
    case "DELETE":
    case "DEACTIVATE":
      return `${base} bg-red-100 text-red-700`;
    case "CREATE":
      return `${base} bg-green-100 text-green-700`;
    case "UPDATE":
      return `${base} bg-blue-100 text-blue-700`;
    case "SWITCH":
      return `${base} bg-purple-100 text-purple-700`;
    default:
      return `${base} bg-gray-100 text-gray-700`;
  }
}
