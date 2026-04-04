import Link from "next/link";
import Image from "next/image";

export default function LandingNotFound() {
  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col items-center justify-center px-6">
      <Image
        src="/LG_logo2.webp"
        alt="Laptop Guru"
        width={140}
        height={48}
        className="mb-8 w-auto"
        style={{ height: 48 }}
      />
      <h1 className="text-6xl font-bold text-gray-900 mb-2">404</h1>
      <p className="text-lg text-gray-500 mb-8 text-center">
        Ta strona nie istnieje lub link wygasł
      </p>
      <Link
        href="https://laptopguru.pl"
        className="inline-block bg-gradient-to-r from-[#fb7830] to-[#e56a25] text-white font-bold py-3 px-8 rounded-xl shadow-[0_4px_16px_rgba(251,120,48,0.35)] hover:shadow-[0_6px_24px_rgba(251,120,48,0.5)] transition-all active:scale-[0.98]"
      >
        Przejdź do laptopguru.pl
      </Link>
    </div>
  );
}
