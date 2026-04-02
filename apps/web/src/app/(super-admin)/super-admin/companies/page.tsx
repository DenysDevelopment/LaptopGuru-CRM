import { auth } from "@/lib/auth";
import Link from "next/link";
import { CreateCompanyForm } from "./create-company-form";

interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; landings: number; contacts: number };
}

async function getCompanies(token: string): Promise<Company[]> {
  try {
    const res = await fetch(
      `${process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/super-admin/companies`,
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

export default async function SuperAdminCompaniesPage() {
  const session = await auth();
  const token = (session?.user as unknown as Record<string, unknown>)?.accessToken as string | undefined;
  const companies = token ? await getCompanies(token) : [];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Компании</h1>
        <CreateCompanyForm />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {companies.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-500">
            Компаний пока нет. Нажми «+ Новая компания» чтобы создать первую.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">Название</th>
                <th className="px-4 py-3 font-medium text-gray-600">Slug</th>
                <th className="px-4 py-3 font-medium text-gray-600">Пользователи</th>
                <th className="px-4 py-3 font-medium text-gray-600">Статус</th>
                <th className="px-4 py-3 font-medium text-gray-600">Создана</th>
                <th className="px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{c._count.users}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        c.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {c.isActive ? "Активна" : "Неактивна"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/super-admin/companies/${c.id}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Открыть →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
