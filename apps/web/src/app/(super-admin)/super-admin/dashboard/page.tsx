import { auth } from "@/lib/auth";

interface CompanyStats {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  _count: { users: number; contacts: number; conversations: number; landings: number };
}

interface DashboardData {
  totals: {
    totalCompanies: number;
    activeCompanies: number;
    totalUsers: number;
    totalContacts: number;
    totalConversations: number;
  };
  companies: CompanyStats[];
}

async function getDashboardStats(token: string): Promise<DashboardData | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/super-admin/dashboard`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function SuperAdminDashboardPage() {
  const session = await auth();
  const token = (session as unknown as Record<string, unknown>)?.accessToken as string | undefined;
  const stats = token ? await getDashboardStats(token) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Global Dashboard</h1>

      {stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { label: "Companies", value: stats.totals.totalCompanies },
              { label: "Active", value: stats.totals.activeCompanies },
              { label: "Users", value: stats.totals.totalUsers },
              { label: "Contacts", value: stats.totals.totalContacts },
              { label: "Conversations", value: stats.totals.totalConversations },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="text-gray-500 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800">Recent Companies</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-600">Name</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Users</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Contacts</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.companies.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-gray-600">{c._count.users}</td>
                    <td className="px-4 py-2 text-gray-600">{c._count.contacts}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-gray-500">Failed to load stats. Make sure the API is running.</p>
      )}
    </div>
  );
}
