import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = (session?.user as unknown as Record<string, unknown>)?.role as string | undefined;

  if (role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-gray-900 text-white px-6 py-3 flex items-center gap-6 sticky top-0 z-40">
        <span className="font-bold text-base">⚙ Super Admin</span>
        <Link href="/super-admin/dashboard" className="text-gray-300 hover:text-white text-sm transition-colors">
          Dashboard
        </Link>
        <Link href="/super-admin/companies" className="text-gray-300 hover:text-white text-sm transition-colors">
          Companies
        </Link>
        <Link href="/super-admin/users" className="text-gray-300 hover:text-white text-sm transition-colors">
          Users
        </Link>
      </nav>
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}
