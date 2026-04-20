'use client';

import { useEffect, useState } from 'react';
import { normalizeListResponse } from '@/lib/utils/normalize-response';
import type { Note } from './conversation-sidebar.types';

interface Props {
	conversationId: string;
	canWriteNotes: boolean;
}

export function SidebarNotes({ conversationId, canWriteNotes }: Props) {
	const [notes, setNotes] = useState<Note[]>([]);
	const [newNote, setNewNote] = useState('');
	const [savingNote, setSavingNote] = useState(false);

	useEffect(() => {
		fetch(`/api/messaging/conversations/${conversationId}/notes`)
			.then(r => (r.ok ? r.json() : []))
			.then(data => setNotes(normalizeListResponse(data)))
			.catch(() => {});
	}, [conversationId]);

	const addNote = async () => {
		const trimmed = newNote.trim();
		if (!trimmed || savingNote) return;
		setSavingNote(true);
		try {
			const res = await fetch('/api/messaging/notes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ conversationId, body: trimmed }),
			});
			if (res.ok) {
				const note = await res.json();
				setNotes(prev => [...prev, note]);
				setNewNote('');
			}
		} catch {
			/* ignore */
		}
		setSavingNote(false);
	};

	return (
		<section>
			<h3 className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
				Заметки
			</h3>
			<div className='space-y-2'>
				{notes.map(note => (
					<div
						key={note.id}
						className='bg-amber-50 border border-amber-100 rounded-lg p-2.5'>
						<p className='text-sm text-gray-700 whitespace-pre-wrap'>
							{note.body}
						</p>
						<div className='flex items-center gap-2 mt-1.5'>
							<span className='text-[10px] text-gray-400'>
								{note.author?.name || 'Система'}
							</span>
							<span className='text-[10px] text-gray-300'>
								{new Date(note.createdAt).toLocaleString('ru-RU', {
									day: 'numeric',
									month: 'short',
									hour: '2-digit',
									minute: '2-digit',
								})}
							</span>
						</div>
					</div>
				))}

				{canWriteNotes && (
					<div className='flex gap-2'>
						<input
							type='text'
							value={newNote}
							onChange={e => setNewNote(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && addNote()}
							placeholder='Добавить заметку...'
							className='flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder:text-gray-400'
						/>
						<button
							onClick={addNote}
							disabled={!newNote.trim() || savingNote}
							className='px-3 py-2 text-sm font-medium text-brand hover:bg-brand-light rounded-lg transition-colors disabled:opacity-50'>
							{savingNote ? '...' : 'OK'}
						</button>
					</div>
				)}
			</div>
		</section>
	);
}
