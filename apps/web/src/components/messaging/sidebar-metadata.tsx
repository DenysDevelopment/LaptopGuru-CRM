'use client';

import { ChannelIcon, getChannelLabel } from './channel-icon';
import type { ConversationDetail } from './conversation-sidebar.types';

interface Props {
	channelType: ConversationDetail['channelType'];
	createdAt: ConversationDetail['createdAt'];
	closedAt: ConversationDetail['closedAt'];
	subject: ConversationDetail['subject'];
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
};

export function SidebarMetadata({
	channelType,
	createdAt,
	closedAt,
	subject,
}: Props) {
	return (
		<section>
			<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
				Информация
			</h3>
			<div className='space-y-1.5 text-xs'>
				<div className='flex justify-between'>
					<span className='text-gray-400'>Канал</span>
					<span className='text-gray-600 flex items-center gap-1'>
						<ChannelIcon channel={channelType} size={12} />
						{getChannelLabel(channelType)}
					</span>
				</div>
				<div className='flex justify-between'>
					<span className='text-gray-400'>Создан</span>
					<span className='text-gray-600'>
						{new Date(createdAt).toLocaleString('ru-RU', DATE_FMT)}
					</span>
				</div>
				{closedAt && (
					<div className='flex justify-between'>
						<span className='text-gray-400'>Закрыт</span>
						<span className='text-gray-600'>
							{new Date(closedAt).toLocaleString('ru-RU', DATE_FMT)}
						</span>
					</div>
				)}
				{subject && (
					<div className='flex justify-between'>
						<span className='text-gray-400'>Тема</span>
						<span className='text-gray-600 text-right max-w-[60%] truncate'>
							{subject}
						</span>
					</div>
				)}
			</div>
		</section>
	);
}
