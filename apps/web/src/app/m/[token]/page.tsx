import { validateMobileUploadToken } from "@/lib/mobile-upload-token";
import { MobileCapture } from "./mobile-capture";

// Avoid caching — token status changes over time.
export const dynamic = "force-dynamic";

export default async function MobileUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const check = await validateMobileUploadToken(token);

  if (!check.ok) {
    const heading =
      check.reason === "consumed"
        ? "Ссылка уже использована"
        : check.reason === "expired"
          ? "Ссылка истекла"
          : "Ссылка недействительна";
    const body =
      check.reason === "consumed"
        ? "Видео по этой ссылке уже загружено. Вернитесь на компьютер и сгенерируйте новую."
        : check.reason === "expired"
          ? "Срок действия ссылки истёк. Вернитесь на компьютер и сгенерируйте новую."
          : "Проверьте ссылку или сгенерируйте новую на компьютере.";
    return (
      <main className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
        <div className="max-w-sm w-full text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">{heading}</h1>
          <p className="mt-2 text-sm text-gray-600">{body}</p>
        </div>
      </main>
    );
  }

  return <MobileCapture token={token} title={check.token.title} />;
}
