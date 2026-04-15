"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CompanyDetail {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	logo: string | null;
	customDomain: string | null;
	isActive: boolean;
	enabledModules: string[];
	createdAt: string;
	users: { id: string; email: string; name: string | null; role: string; createdAt: string }[];
	_count: { landings: number; contacts: number; conversations: number; channels: number };
}

export default function CompanyDetailPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const [company, setCompany] = useState<CompanyDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [customDomain, setCustomDomain] = useState("");

	const fetchCompany = useCallback(async () => {
		try {
			const res = await fetch(`/api/super-admin/companies/${id}`);
			if (!res.ok) throw new Error("Not found");
			const data: CompanyDetail = await res.json();
			setCompany(data);
			setName(data.name);
			setDescription(data.description ?? "");
			setCustomDomain(data.customDomain ?? "");
		} catch {
			setCompany(null);
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchCompany();
	}, [fetchCompany]);

	async function handleSave() {
		setSaving(true);
		setMessage(null);
		try {
			const res = await fetch(`/api/super-admin/companies/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					description: description || null,
					customDomain: customDomain.trim() || null,
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setMessage({ type: "err", text: data.message ?? `Ошибка ${res.status}` });
				return;
			}
			setMessage({ type: "ok", text: "Сохранено" });
			fetchCompany();
		} catch {
			setMessage({ type: "err", text: "Ошибка соединения" });
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return <p className="text-gray-500 py-8 text-center">Загрузка...</p>;
	}

	if (!company) {
		return (
			<div className="text-center py-8">
				<p className="text-gray-500 mb-4">Компания не найдена</p>
				<Button variant="outline" onClick={() => router.push("/super-admin/companies")}>
					Назад
				</Button>
			</div>
		);
	}

	return (
		<div className="max-w-3xl">
			<button
				onClick={() => router.push("/super-admin/companies")}
				className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-flex items-center gap-1"
			>
				&larr; Все компании
			</button>

			<div className="flex items-center gap-3 mb-6">
				<h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
				<span className="text-xs font-mono text-gray-400">{company.slug}</span>
				<span
					className={`px-2 py-0.5 rounded text-xs font-medium ${
						company.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
					}`}
				>
					{company.isActive ? "Активна" : "Неактивна"}
				</span>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-4 gap-3 mb-6">
				{[
					{ label: "Пользователи", value: company.users.length },
					{ label: "Лендинги", value: company._count.landings },
					{ label: "Контакты", value: company._count.contacts },
					{ label: "Диалоги", value: company._count.conversations },
				].map((s) => (
					<div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
						<p className="text-2xl font-bold text-gray-900">{s.value}</p>
						<p className="text-xs text-gray-500">{s.label}</p>
					</div>
				))}
			</div>

			{/* Edit form */}
			<div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 mb-6">
				<h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Настройки</h2>

				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
					<Input value={name} onChange={(e) => setName(e.target.value)} />
				</div>

				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
					<Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание компании" />
				</div>

				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">Кастомный домен</label>
					<Input
						value={customDomain}
						onChange={(e) => setCustomDomain(e.target.value)}
						placeholder="landos.firma.pl"
						className="font-mono"
					/>
					<p className="text-xs text-gray-400 mt-1">
						Клиент должен добавить CNAME запись, указывающую на crm.laptopguru.link. SSL выдаётся автоматически.
					</p>
				</div>

				{message && (
					<p className={`text-sm rounded-lg px-3 py-2 ${message.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
						{message.text}
					</p>
				)}

				<Button
					onClick={handleSave}
					disabled={saving}
					className="bg-blue-600 hover:bg-blue-700 text-white"
				>
					{saving ? "Сохраняем..." : "Сохранить"}
				</Button>
			</div>

			{/* Users list */}
			<div className="bg-white border border-gray-200 rounded-lg p-5">
				<h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
					Пользователи ({company.users.length})
				</h2>
				<table className="w-full text-sm">
					<thead className="text-left text-gray-500">
						<tr>
							<th className="pb-2 font-medium">Email</th>
							<th className="pb-2 font-medium">Имя</th>
							<th className="pb-2 font-medium">Роль</th>
							<th className="pb-2 font-medium">Дата</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-100">
						{company.users.map((u) => (
							<tr key={u.id}>
								<td className="py-2 text-gray-900">{u.email}</td>
								<td className="py-2 text-gray-600">{u.name ?? "—"}</td>
								<td className="py-2">
									<span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
										{u.role}
									</span>
								</td>
								<td className="py-2 text-gray-400 text-xs">
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
