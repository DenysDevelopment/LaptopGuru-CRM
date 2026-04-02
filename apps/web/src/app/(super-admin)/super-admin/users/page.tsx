import { auth } from "@/lib/auth";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  companyId: string | null;
  company: { name: string; slug: string } | null;
  createdAt: string;
}

async function getUsers(token: string): Promise<User[]> {
  try {
    const res = await fetch(
      `${process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/super-admin/users`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function SuperAdminUsersPage() {
  const session = await auth();
  const token = (session as unknown as Record<string, unknown>)?.accessToken as string | undefined;
  const users = token ? await getUsers(token) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Все пользователи</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="px-4 py-3 font-medium text-gray-600">Имя</th>
              <th className="px-4 py-3 font-medium text-gray-600">Роль</th>
              <th className="px-4 py-3 font-medium text-gray-600">Компания</th>
              <th className="px-4 py-3 font-medium text-gray-600">Создан</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">{u.email}</td>
                <td className="px-4 py-3 text-gray-600">{u.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    u.role === "SUPER_ADMIN" ? "bg-purple-100 text-purple-700" :
                    u.role === "ADMIN" ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {u.company ? `${u.company.name} (${u.company.slug})` : "—"}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
