'use client';

interface Props {
	name: string;
	seed: string;
	avatarUrl?: string | null;
	size?: number;
	className?: string;
}

function multiavatarSrc(seed: string): string {
	return `https://api.multiavatar.com/${encodeURIComponent(seed)}.svg`;
}

export function ContactAvatar({ name, seed, avatarUrl, size = 40, className = '' }: Props) {
	const src = avatarUrl || multiavatarSrc(seed || name);
	return (
		<img
			src={src}
			alt={name}
			style={{ width: size, height: size }}
			className={`rounded-full object-cover bg-gray-100 flex-shrink-0 ${className}`}
		/>
	);
}
