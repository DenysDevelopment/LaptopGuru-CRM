'use client';

interface Props {
	name: string;
	seed: string;
	avatarUrl?: string | null;
	size?: number;
	className?: string;
}

const DICEBEAR_URL = 'https://api.dicebear.com/9.x/dylan/svg';

function dicebearSrc(seed: string): string {
	return `${DICEBEAR_URL}?seed=${encodeURIComponent(seed)}`;
}

export function ContactAvatar({ name, seed, avatarUrl, size = 40, className = '' }: Props) {
	const src = avatarUrl || dicebearSrc(seed || name);
	return (
		<img
			src={src}
			alt={name}
			style={{ width: size, height: size }}
			className={`rounded-full object-cover bg-gray-100 flex-shrink-0 ${className}`}
		/>
	);
}
