'use client';

import { Check, ChevronDown, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { hasPermission, PERMISSIONS } from '@laptopguru-crm/shared';
import { PRIMARY_STATUSES, STATUS_DICTIONARY } from '@/lib/messaging/status';
import type { ConversationStatus } from '@/generated/prisma/client';

interface StatusControlProps {
	conversationId: string;
	status: ConversationStatus;
	lastStatusChangedAt?: string | null;
	lastStatusChangedBy?: { id: string; name: string | null; email: string } | null;
	onChange: () => void;
}

function timeAgo(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return 'только что';
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min} мин назад`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} ч назад`;
	const day = Math.floor(hr / 24);
	return `${day} д назад`;
}

export function StatusControl({
	conversationId,
	status,
	lastStatusChangedAt,
	lastStatusChangedBy,
	onChange,
}: StatusControlProps) {
	const { data: session } = useSession();
	const userRole = session?.user?.role;
	const userPerms = session?.user?.permissions;
	const canWrite = hasPermission(
		userRole,
		userPerms,
		PERMISSIONS.MESSAGING_CONVERSATIONS_WRITE,
	);
	const canClose = hasPermission(
		userRole,
		userPerms,
		PERMISSIONS.MESSAGING_CONVERSATIONS_CLOSE,
	);

	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', onClick);
		return () => document.removeEventListener('mousedown', onClick);
	}, []);

	const dict = STATUS_DICTIONARY[status] ?? STATUS_DICTIONARY.OPEN;

	async function setStatus(target: ConversationStatus) {
		if (!canWrite || busy) return;
		const isClose = target === 'RESOLVED' || target === 'CLOSED' || target === 'SPAM';
		if (isClose && !canClose) return;
		setBusy(true);
		try {
			await fetch(`/api/messaging/conversations/${conversationId}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: target }),
			});
			onChange();
		} finally {
			setBusy(false);
			setOpen(false);
		}
	}

	return (
		<div className='flex items-center gap-2 text-xs'>
			{/* Pill + dropdown */}
			<div ref={ref} className='relative'>
				<button
					type='button'
					onClick={() => canWrite && setOpen((o) => !o)}
					disabled={!canWrite || busy}
					className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ring-1 ring-inset font-semibold ${dict.pillClass} ${canWrite ? 'cursor-pointer hover:brightness-95' : 'cursor-default'} disabled:opacity-50`}>
					<span
						className='w-1.5 h-1.5 rounded-full'
						style={{ backgroundColor: dict.color }}
					/>
					{dict.label}
					{canWrite && <ChevronDown className='w-3 h-3 opacity-60' />}
				</button>
				{open && (
					<div className='absolute z-30 mt-1 left-0 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-xs'>
						{PRIMARY_STATUSES.map((s) => {
							const d = STATUS_DICTIONARY[s];
							const isClose = s === 'RESOLVED';
							const disabled = isClose && !canClose;
							const current = s === status;
							return (
								<button
									key={s}
									type='button'
									disabled={disabled || busy}
									onClick={() => setStatus(s)}
									className='w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed'>
									<span className='inline-flex items-center gap-2'>
										<span
											className='w-2 h-2 rounded-full'
											style={{ backgroundColor: d.color }}
										/>
										{d.label}
									</span>
									<span className='inline-flex items-center gap-1 text-gray-300'>
										{current && <Check className='w-3 h-3 text-green-600' />}
										{disabled && <Lock className='w-3 h-3' />}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Audit text */}
			{lastStatusChangedAt && (
				<span className='text-gray-400 hidden sm:inline'>
					изменил {lastStatusChangedBy?.name ?? lastStatusChangedBy?.email ?? 'система'}{' '}
					{timeAgo(lastStatusChangedAt)}
				</span>
			)}

			{/* Quick "Завершить" CTA when not yet resolved */}
			{status !== 'RESOLVED' && status !== 'CLOSED' && canClose && (
				<button
					type='button'
					onClick={() => setStatus('RESOLVED')}
					disabled={busy}
					className='ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-inset ring-emerald-200 px-2 py-0.5 rounded-full disabled:opacity-50'>
					<Check className='w-3 h-3' strokeWidth={3} />
					Завершить
				</button>
			)}
		</div>
	);
}
