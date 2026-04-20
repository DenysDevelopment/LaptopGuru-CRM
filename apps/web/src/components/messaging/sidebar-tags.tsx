'use client';

import { useCallback, useState } from 'react';
import { normalizeListResponse } from '@/lib/utils/normalize-response';
import type { ConversationDetail, Tag } from './conversation-sidebar.types';

interface Props {
	conversationId: string;
	tags: ConversationDetail['tags'];
	canManageTags: boolean;
	onUpdate: () => void;
}

export function SidebarTags({
	conversationId,
	tags,
	canManageTags,
	onUpdate,
}: Props) {
	const [allTags, setAllTags] = useState<Tag[]>([]);
	const [showTagPicker, setShowTagPicker] = useState(false);

	const loadTags = useCallback(async () => {
		try {
			const res = await fetch('/api/messaging/tags');
			if (res.ok) {
				const data = await res.json();
				setAllTags(normalizeListResponse(data));
			}
		} catch {
			/* ignore */
		}
	}, []);

	const addTag = async (tagId: string) => {
		try {
			await fetch(`/api/messaging/conversations/${conversationId}/tags`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tagId }),
			});
			setShowTagPicker(false);
			onUpdate();
		} catch {
			/* ignore */
		}
	};

	const togglePicker = () => {
		setShowTagPicker(!showTagPicker);
		if (!showTagPicker) loadTags();
	};

	return (
		<section>
			<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
				Теги
			</h3>
			<div className='flex flex-wrap gap-1.5'>
				{tags.map(tag => (
					<span
						key={tag.id}
						className='inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md'
						style={{
							backgroundColor: tag.color + '20',
							color: tag.color,
						}}>
						<span
							className='w-1.5 h-1.5 rounded-full'
							style={{ backgroundColor: tag.color }}
						/>
						{tag.name}
					</span>
				))}
				{canManageTags && (
					<button
						onClick={togglePicker}
						className='text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-md px-2 py-1 transition-colors'>
						+ Тег
					</button>
				)}
			</div>

			{showTagPicker && (
				<div className='mt-2 border border-gray-200 rounded-lg bg-white shadow-sm max-h-36 overflow-y-auto'>
					{allTags
						.filter(t => !tags.find(ct => ct.id === t.id))
						.map(tag => (
							<button
								key={tag.id}
								onClick={() => addTag(tag.id)}
								className='w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2'>
								<span
									className='w-2 h-2 rounded-full'
									style={{ backgroundColor: tag.color }}
								/>
								{tag.name}
							</button>
						))}
				</div>
			)}
		</section>
	);
}
