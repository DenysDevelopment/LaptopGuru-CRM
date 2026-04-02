"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CreateCompanyForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function slugify(val: string) {
    return val
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name") as string,
      slug: fd.get("slug") as string,
      adminEmail: fd.get("adminEmail") as string,
      adminPassword: fd.get("adminPassword") as string,
      adminName: fd.get("adminName") as string | undefined,
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/super-admin/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message ?? `Ошибка ${res.status}`);
          return;
        }

        setOpen(false);
        router.refresh();
      } catch {
        setError("Не удалось подключиться к API");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        + Новая компания
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Создать компанию
              </h2>
              <button
                onClick={() => { setOpen(false); setError(null); }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Название компании
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="LaptopGuru"
                  onChange={(e) => {
                    const slugInput = e.currentTarget.form?.querySelector<HTMLInputElement>(
                      '[name="slug"]'
                    );
                    if (slugInput && !slugInput.dataset.touched) {
                      slugInput.value = slugify(e.target.value);
                    }
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slug{" "}
                  <span className="text-gray-400 font-normal">(a-z, 0-9, -)</span>
                </label>
                <input
                  name="slug"
                  type="text"
                  required
                  placeholder="laptopguru"
                  pattern="[a-z0-9-]+"
                  onInput={(e) => {
                    (e.currentTarget as HTMLInputElement).dataset.touched = "1";
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <hr className="border-gray-100" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Admin-аккаунт
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  name="adminEmail"
                  type="email"
                  required
                  placeholder="admin@laptopguru.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Имя</label>
                <input
                  name="adminName"
                  type="text"
                  placeholder="Иван Иванов"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
                <input
                  name="adminPassword"
                  type="password"
                  required
                  minLength={8}
                  placeholder="минимум 8 символов"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setError(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Создаём…" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
