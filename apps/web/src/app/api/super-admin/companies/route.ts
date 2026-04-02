import { authorize } from "@/lib/authorize";
import { NextResponse } from "next/server";

const API_URL = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function POST(req: Request) {
  const { session, error } = await authorize();
  if (error) return error;

  const accessToken = (session.user as unknown as Record<string, unknown>)?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: "No API token" }, { status: 401 });
  }

  const body = await req.json();
  const res = await fetch(`${API_URL}/api/super-admin/companies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
