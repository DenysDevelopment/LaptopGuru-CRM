'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { loginSchema, type LoginInput } from '@/lib/schemas/auth';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
	const router = useRouter();
	const isDev = process.env.NODE_ENV === 'development';
	const [error, setError] = useState('');

	const form = useForm<LoginInput>({
		resolver: zodResolver(loginSchema),
		mode: 'onTouched',
		defaultValues: {
			email: isDev ? 'admin@demo.local' : '',
			password: isDev ? 'admin12345' : '',
		},
	});

	async function onSubmit(data: LoginInput) {
		setError('');

		const result = await signIn('credentials', {
			email: data.email,
			password: data.password,
			redirect: false,
		});

		if (result?.error) {
			setError('Неверный email или пароль');
		} else {
			router.push('/dashboard');
			router.refresh();
		}
	}

	return (
		<div className='w-full max-w-md'>
			<div className='bg-white rounded-2xl shadow-sm border border-gray-100 p-8'>
				<div className='text-center mb-8'>
					<h1 className='text-2xl font-bold text-gray-900'>LaptopGuru CRM</h1>
				</div>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
						{error && (
							<div className='bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3'>
								{error}
							</div>
						)}

						<FormField
							control={form.control}
							name='email'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email</FormLabel>
									<FormControl>
										<Input
											type='email'
											placeholder='email@example.com'
											autoComplete='email'
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='password'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Пароль</FormLabel>
									<FormControl>
										<Input
											type='password'
											placeholder='••••••••'
											autoComplete='current-password'
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Button
							type='submit'
							disabled={form.formState.isSubmitting}
							className='w-full bg-brand hover:bg-brand-hover text-white'>
							{form.formState.isSubmitting ? 'Вход...' : 'Войти'}
						</Button>
					</form>
				</Form>

				<p className='mt-6 text-center text-sm text-gray-400'>
					LaptopGuru CRM — laptopguru.pl
				</p>
			</div>
		</div>
	);
}
