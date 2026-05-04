'use client';

import type { ConversationDetail } from './conversation-sidebar.types';

interface Props {
	subject: string | null;
	offer: NonNullable<ConversationDetail['allegroOffer']>;
}

export function SidebarAllegroOffer({ subject, offer }: Props) {
	const title = subject ?? `Offer ${offer.id}`;
	return (
		<section>
			<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
				Товар
			</h3>
			<a
				href={offer.url}
				target='_blank'
				rel='noopener noreferrer'
				className='flex gap-3 p-2 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors'>
				<div className='w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center'>
					{offer.imageUrl ? (
						/* eslint-disable-next-line @next/next/no-img-element */
						<img
							src={offer.imageUrl}
							alt={title}
							className='w-full h-full object-cover'
						/>
					) : (
						<svg
							className='w-7 h-7 text-gray-300'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={1.5}
							stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Z'
							/>
						</svg>
					)}
				</div>
				<div className='min-w-0 flex-1'>
					<p className='text-[10px] text-gray-400 uppercase tracking-wider'>
						allegro.pl
					</p>
					<p className='text-xs text-gray-900 font-medium leading-snug line-clamp-3 mt-0.5'>
						{title}
					</p>
					{offer.priceText && (
						<p className='text-sm text-gray-900 font-semibold mt-1'>
							{offer.priceText}
						</p>
					)}
				</div>
			</a>
		</section>
	);
}
