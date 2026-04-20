export function SpecRow({
	icon,
	label,
	value,
	delay,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	delay?: number;
}) {
	return (
		<div
			data-animate
			{...(delay ? { 'data-animate-delay': delay } : {})}
			className='flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 hover:bg-gray-100 transition-colors'>
			<span className='flex-shrink-0 spec-icon'>{icon}</span>
			<div className='min-w-0'>
				<p className='text-xs text-gray-500 m-0'>{label}</p>
				<p className='text-sm font-semibold text-gray-900 truncate m-0'>
					{value}
				</p>
			</div>
		</div>
	);
}
