import { Providers } from '@/components/providers';
import type { Metadata } from 'next';
import { Inter, Geist } from 'next/font/google';
import './globals.css';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
	subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
	title: 'CRM - LaptopGuru',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='uk' suppressHydrationWarning className={cn("font-sans", geist.variable)}>
			<body className={`${inter.className} antialiased bg-white text-gray-900`}>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
