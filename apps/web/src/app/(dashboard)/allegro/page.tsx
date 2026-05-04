'use client';

export default function AllegroPage() {
	return (
		<div className='flex items-center justify-center h-full'>
			<div className='text-center px-6'>
				<svg
					className='w-20 h-20 mx-auto text-gray-200 mb-4'
					fill='none'
					viewBox='0 0 24 24'
					strokeWidth={0.75}
					stroke='currentColor'>
					<path
						strokeLinecap='round'
						strokeLinejoin='round'
						d='M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z'
					/>
				</svg>
				<h2 className='text-lg font-semibold text-gray-900 mb-1'>Allegro Direct</h2>
				<p className='text-sm text-gray-400 max-w-sm'>
					Выберите дискуссию слева. Новые сообщения от покупателей
					автоматически подтягиваются раз в минуту.
				</p>
			</div>
		</div>
	);
}
