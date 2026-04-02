import { Providers } from '@/components/providers';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
	subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
	title: 'CRM - LaptopGuru',
	// description: "Внутренний инструмент для обработки заявок и отправки email с видеообзорами",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang='uk'>
			<body className={`${inter.className} antialiased bg-white text-gray-900`}>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
