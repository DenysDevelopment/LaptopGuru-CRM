import { Providers } from '@/components/providers';
import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';

const nunito = Nunito({
	subsets: ['latin', 'cyrillic'],
	variable: '--font-sans',
	display: 'swap',
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
		<html
			lang='uk'
			suppressHydrationWarning
			className={cn('font-sans', nunito.variable)}>
			<body
				className={`${nunito.className} antialiased bg-white text-gray-900`}>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
