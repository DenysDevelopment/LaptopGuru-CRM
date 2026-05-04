'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChannelIcon, getChannelLabel } from '@/components/messaging/channel-icon';
import {
	getAnalyticsOverview,
	getAnalyticsByChannel,
	type AnalyticsOverview,
	type AnalyticsByChannel,
} from '@/services/messaging/analytics.service';

type OverviewStats = AnalyticsOverview;
type ChannelStat = AnalyticsByChannel;

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}с`;
	if (seconds < 3600) return `${Math.round(seconds / 60)}м`;
	const hours = Math.floor(seconds / 3600);
	const mins = Math.round((seconds % 3600) / 60);
	return `${hours}ч ${mins}м`;
}

export default function MessagingAnalyticsPage() {
	const [overview, setOverview] = useState<OverviewStats | null>(null);
	const [channelStats, setChannelStats] = useState<ChannelStat[]>([]);
	const [loading, setLoading] = useState(true);
	const [dateRange, setDateRange] = useState('7d');

	const getDateRange = useCallback((): { from: string; to: string } => {
		const to = new Date();
		const from = new Date();
		switch (dateRange) {
			case '1d':
				from.setDate(from.getDate() - 1);
				break;
			case '7d':
				from.setDate(from.getDate() - 7);
				break;
			case '30d':
				from.setDate(from.getDate() - 30);
				break;
			case '90d':
				from.setDate(from.getDate() - 90);
				break;
			default:
				from.setDate(from.getDate() - 7);
		}
		return { from: from.toISOString(), to: to.toISOString() };
	}, [dateRange]);

	const fetchData = useCallback(async () => {
		setLoading(true);
		const { from, to } = getDateRange();

		try {
			const [overviewData, channelData] = await Promise.all([
				getAnalyticsOverview({ from, to }).catch(() => null),
				getAnalyticsByChannel({ from, to }).catch(() => [] as ChannelStat[]),
			]);
			if (overviewData) setOverview(overviewData);
			setChannelStats(channelData);
		} catch {
			// silently fail
		}
		setLoading(false);
	}, [getDateRange]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchData();
	}, [fetchData]);

	return (
		<div>
			<div className='flex items-center justify-between mb-6'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Аналитика</h1>
					<p className='mt-1 text-sm text-gray-500'>Статистика мессенджера</p>
				</div>
				<div className='flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5'>
					{[
						{ value: '1d', label: 'День' },
						{ value: '7d', label: 'Неделя' },
						{ value: '30d', label: 'Месяц' },
						{ value: '90d', label: '3 мес.' },
					].map((range) => (
						<button
							key={range.value}
							onClick={() => setDateRange(range.value)}
							className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
								dateRange === range.value
									? 'bg-brand text-white'
									: 'text-gray-500 hover:text-gray-700'
							}`}>
							{range.label}
						</button>
					))}
				</div>
			</div>

			{loading ? (
				<div className='text-center py-12 text-gray-400'>Загрузка...</div>
			) : (
				<>
					{/* Overview cards */}
					<div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8'>
						<StatCard
							label='Разговоров'
							value={String(overview?.totalConversations || 0)}
						/>
						<StatCard
							label='Сообщений'
							value={String(overview?.totalMessages || 0)}
						/>
						<StatCard
							label='Среднее время ответа'
							value={formatDuration(overview?.avgResponseTime || 0)}
						/>
						<StatCard
							label='Открытых'
							value={String(overview?.openConversations || 0)}
							accent
						/>
						<StatCard
							label='Закрытых'
							value={String(overview?.closedConversations || 0)}
						/>
						<StatCard
							label='Новых контактов'
							value={String(overview?.newContacts || 0)}
						/>
					</div>

					{/* Channel breakdown */}
					<div>
						<h2 className='text-sm font-semibold text-gray-900 mb-3'>
							По каналам
						</h2>
						{channelStats.length === 0 ? (
							<div className='text-center py-12 bg-white rounded-xl border border-gray-100'>
								<p className='text-sm text-gray-400'>Нет данных за выбранный период</p>
							</div>
						) : (
							<div className='space-y-2'>
								{channelStats.map((stat) => {
									const maxConversations = Math.max(
										...channelStats.map((s) => s.conversations),
										1,
									);
									const barWidth = (stat.conversations / maxConversations) * 100;

									return (
										<div
											key={stat.channelType}
											className='bg-white rounded-xl border border-gray-100 p-4'>
											<div className='flex items-center gap-3 mb-2'>
												<ChannelIcon channel={stat.channelType} size={20} />
												<span className='text-sm font-medium text-gray-900'>
													{getChannelLabel(stat.channelType)}
												</span>
											</div>
											<div className='grid grid-cols-3 gap-4 mb-2'>
												<div>
													<p className='text-lg font-bold text-gray-900'>
														{stat.conversations}
													</p>
													<p className='text-xs text-gray-400'>
														Разговоров
													</p>
												</div>
												<div>
													<p className='text-lg font-bold text-gray-900'>
														{stat.messages}
													</p>
													<p className='text-xs text-gray-400'>
														Сообщений
													</p>
												</div>
												<div>
													<p className='text-lg font-bold text-gray-900'>
														{formatDuration(stat.avgResponseTime || 0)}
													</p>
													<p className='text-xs text-gray-400'>
														Время ответа
													</p>
												</div>
											</div>
											{/* Simple bar */}
											<div className='h-2 bg-gray-100 rounded-full overflow-hidden'>
												<div
													className='h-full bg-brand rounded-full transition-all duration-500'
													style={{ width: `${barWidth}%` }}
												/>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}

function StatCard({
	label,
	value,
	accent,
}: {
	label: string;
	value: string;
	accent?: boolean;
}) {
	return (
		<div
			className={`rounded-xl border p-4 ${
				accent
					? 'bg-brand-light border-brand/20'
					: 'bg-white border-gray-100'
			}`}>
			<p
				className={`text-xl font-bold ${
					accent ? 'text-brand' : 'text-gray-900'
				}`}>
				{value}
			</p>
			<p className='text-xs text-gray-500 mt-1'>{label}</p>
		</div>
	);
}
