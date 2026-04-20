'use client';

import { ChannelIcon, getChannelLabel } from './channel-icon';
import type { ConversationDetail } from './conversation-sidebar.types';

type Contact = NonNullable<ConversationDetail['contact']>;

export function SidebarContact({ contact }: { contact: Contact }) {
	return (
		<section>
			<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
				Контакт
			</h3>
			<div className='bg-gray-50 rounded-xl p-3'>
				<div className='flex items-center gap-3 mb-3'>
					{contact.avatarUrl ? (
						<img
							src={contact.avatarUrl}
							alt={contact.name || ''}
							className='w-10 h-10 rounded-full object-cover'
						/>
					) : (
						<div className='w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600'>
							{(contact.name || '?')[0]?.toUpperCase()}
						</div>
					)}
					<div className='min-w-0'>
						<p className='text-sm font-medium text-gray-900 truncate'>
							{contact.name || 'Без имени'}
						</p>
						{contact.company && (
							<p className='text-xs text-gray-400'>{contact.company}</p>
						)}
					</div>
				</div>

				{contact.email && (
					<div className='flex items-center gap-2 text-xs text-gray-500 mb-1'>
						<svg
							className='w-3.5 h-3.5 text-gray-400'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={1.5}
							stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75'
							/>
						</svg>
						{contact.email}
					</div>
				)}
				{contact.phone && (
					<div className='flex items-center gap-2 text-xs text-gray-500 mb-1'>
						<svg
							className='w-3.5 h-3.5 text-gray-400'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={1.5}
							stroke='currentColor'>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z'
							/>
						</svg>
						{contact.phone}
					</div>
				)}

				{contact.channels && contact.channels.length > 0 && (
					<div className='flex flex-wrap gap-1.5 mt-2'>
						{contact.channels.map((ch, idx) => (
							<span
								key={idx}
								className='inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-100'>
								<ChannelIcon channel={ch.type} size={10} />
								{getChannelLabel(ch.type)}
							</span>
						))}
					</div>
				)}
			</div>
		</section>
	);
}
