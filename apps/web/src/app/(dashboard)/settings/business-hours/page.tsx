'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
	businessHoursSchema,
	type BusinessHoursInput,
	TIMEZONES,
	DAY_KEYS,
	type DayKey,
} from '@/lib/schemas/business-hours';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface BusinessHoursRecord {
	id: string;
	timezone: string;
	schedule: BusinessHoursInput['schedule'];
}

const DAY_LABELS: Record<DayKey, string> = {
	monday: 'Понедельник',
	tuesday: 'Вторник',
	wednesday: 'Среда',
	thursday: 'Четверг',
	friday: 'Пятница',
	saturday: 'Суббота',
	sunday: 'Воскресенье',
};

const DEFAULT_VALUES: BusinessHoursInput = {
	timezone: 'Europe/Warsaw',
	schedule: {
		monday: { enabled: true, startTime: '09:00', endTime: '18:00' },
		tuesday: { enabled: true, startTime: '09:00', endTime: '18:00' },
		wednesday: { enabled: true, startTime: '09:00', endTime: '18:00' },
		thursday: { enabled: true, startTime: '09:00', endTime: '18:00' },
		friday: { enabled: true, startTime: '09:00', endTime: '18:00' },
		saturday: { enabled: false, startTime: '10:00', endTime: '15:00' },
		sunday: { enabled: false, startTime: '10:00', endTime: '15:00' },
	},
};

const TIMEZONE_LABELS: Record<(typeof TIMEZONES)[number], string> = {
	'Europe/Warsaw': 'Europe/Warsaw (CET)',
	'Europe/Moscow': 'Europe/Moscow (MSK)',
	'Europe/Kiev': 'Europe/Kiev (EET)',
	'Europe/London': 'Europe/London (GMT)',
	'America/New_York': 'America/New_York (EST)',
	UTC: 'UTC',
};

export default function BusinessHoursSettingsPage() {
	const [record, setRecord] = useState<BusinessHoursRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [saved, setSaved] = useState(false);

	const form = useForm<BusinessHoursInput>({
		resolver: zodResolver(businessHoursSchema),
		mode: 'onTouched',
		defaultValues: DEFAULT_VALUES,
	});

	useEffect(() => {
		fetch('/api/messaging/business-hours')
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data) {
					const item = Array.isArray(data) ? data[0] : data;
					if (item) {
						setRecord(item);
						form.reset({
							timezone: item.timezone || 'Europe/Warsaw',
							schedule: item.schedule || DEFAULT_VALUES.schedule,
						});
					}
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function onSubmit(data: BusinessHoursInput) {
		const url = record
			? `/api/messaging/business-hours/${record.id}`
			: '/api/messaging/business-hours';
		const method = record ? 'PATCH' : 'POST';
		const res = await fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		});
		if (res.ok) {
			const saved = await res.json();
			setRecord(saved);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		}
	}

	if (loading) {
		return <div className='text-center py-12 text-gray-400'>Загрузка...</div>;
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<div className='flex items-center justify-between mb-6'>
					<div>
						<h1 className='text-2xl font-bold text-gray-900'>Рабочие часы</h1>
						<p className='mt-1 text-sm text-gray-500'>
							Расписание работы операторов
						</p>
					</div>
					<Button
						type='submit'
						disabled={form.formState.isSubmitting}
						className='bg-brand hover:bg-brand-hover text-white'>
						{form.formState.isSubmitting
							? 'Сохранение...'
							: saved
								? 'Сохранено!'
								: 'Сохранить'}
					</Button>
				</div>

				{/* Timezone */}
				<div className='bg-white rounded-xl border border-gray-100 p-4 mb-4'>
					<FormField
						control={form.control}
						name='timezone'
						render={({ field }) => (
							<FormItem>
								<FormLabel>Часовой пояс</FormLabel>
								<Select
									value={field.value}
									onValueChange={(v) => field.onChange(v)}>
									<FormControl>
										<SelectTrigger className='w-full max-w-xs'>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{TIMEZONES.map((tz) => (
											<SelectItem key={tz} value={tz}>
												{TIMEZONE_LABELS[tz]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				{/* Schedule grid */}
				<div className='bg-white rounded-xl border border-gray-100 overflow-hidden'>
					<div className='divide-y divide-gray-100'>
						{DAY_KEYS.map((day) => {
							const isEnabled = form.watch(`schedule.${day}.enabled`);
							return (
								<div key={day} className='px-4 py-3'>
									<div className='flex items-center gap-4'>
										<FormField
											control={form.control}
											name={`schedule.${day}.enabled`}
											render={({ field }) => (
												<FormItem className='flex items-center gap-3 w-36 space-y-0'>
													<FormControl>
														<Checkbox
															checked={field.value}
															onCheckedChange={field.onChange}
														/>
													</FormControl>
													<FormLabel
														className={`text-sm font-medium cursor-pointer ${
															field.value
																? 'text-gray-900'
																: 'text-gray-400'
														}`}>
														{DAY_LABELS[day]}
													</FormLabel>
												</FormItem>
											)}
										/>

										{isEnabled ? (
											<div className='flex items-center gap-2'>
												<FormField
													control={form.control}
													name={`schedule.${day}.startTime`}
													render={({ field }) => (
														<FormItem className='space-y-0'>
															<FormControl>
																<Input
																	type='time'
																	className='w-auto'
																	{...field}
																/>
															</FormControl>
														</FormItem>
													)}
												/>
												<span className='text-gray-400'>-</span>
												<FormField
													control={form.control}
													name={`schedule.${day}.endTime`}
													render={({ field }) => (
														<FormItem className='space-y-0'>
															<FormControl>
																<Input
																	type='time'
																	className='w-auto'
																	{...field}
																/>
															</FormControl>
														</FormItem>
													)}
												/>
											</div>
										) : (
											<span className='text-sm text-gray-400'>Выходной</span>
										)}
									</div>
									{isEnabled && (
										<div className='ml-40 mt-1'>
											<FormMessage>
												{form.formState.errors.schedule?.[day]?.endTime?.message}
											</FormMessage>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</form>
		</Form>
	);
}
