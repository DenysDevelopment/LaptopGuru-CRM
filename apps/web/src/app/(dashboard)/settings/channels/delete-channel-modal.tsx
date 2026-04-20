'use client';

interface Props {
	step: 'choose' | 'confirm';
	setStep: (v: 'choose' | 'confirm') => void;
	deleting: boolean;
	onClose: () => void;
	onExecute: (deleteData: boolean) => void;
}

export function DeleteChannelModal({
	step,
	setStep,
	deleting,
	onClose,
	onExecute,
}: Props) {
	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
			<div
				className='absolute inset-0 bg-black/40'
				onClick={() => !deleting && onClose()}
			/>
			<div className='relative bg-white rounded-2xl shadow-xl max-w-md w-full'>
				<div className='p-6'>
					{step === 'choose' ? (
						<>
							<div className='w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center'>
								<svg
									className='w-6 h-6 text-red-500'
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={1.5}
									stroke='currentColor'>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0'
									/>
								</svg>
							</div>
							<h3 className='text-lg font-bold text-gray-900 text-center mb-2'>
								Удалить канал?
							</h3>
							<p className='text-sm text-gray-500 text-center mb-6'>
								Выберите способ удаления канала
							</p>

							<div className='space-y-3'>
								<button
									onClick={() => onExecute(false)}
									disabled={deleting}
									className='w-full text-left p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50'>
									<p className='text-sm font-medium text-gray-900'>
										Отключить канал
									</p>
									<p className='text-xs text-gray-500 mt-0.5'>
										Сообщения и разговоры останутся
									</p>
								</button>
								<button
									onClick={() => setStep('confirm')}
									className='w-full text-left p-4 rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50 transition-colors'>
									<p className='text-sm font-medium text-red-600'>
										Удалить канал и все данные
									</p>
									<p className='text-xs text-gray-500 mt-0.5'>
										Сообщения, разговоры будут удалены безвозвратно
									</p>
								</button>
							</div>

							<button
								onClick={onClose}
								className='w-full mt-4 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors'>
								Отмена
							</button>
						</>
					) : (
						<>
							<div className='w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center'>
								<svg
									className='w-6 h-6 text-red-600'
									fill='none'
									viewBox='0 0 24 24'
									strokeWidth={2}
									stroke='currentColor'>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z'
									/>
								</svg>
							</div>
							<h3 className='text-lg font-bold text-gray-900 text-center mb-2'>
								Вы уверены?
							</h3>
							<p className='text-sm text-gray-500 text-center mb-6'>
								ВСЕ сообщения и разговоры этого канала будут удалены
								безвозвратно. Это действие нельзя отменить.
							</p>

							<div className='flex gap-3'>
								<button
									onClick={() => setStep('choose')}
									disabled={deleting}
									className='flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50'>
									Назад
								</button>
								<button
									onClick={() => onExecute(true)}
									disabled={deleting}
									className='flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50'>
									{deleting ? 'Удаление...' : 'Удалить всё'}
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
