'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
				<div className='flex justify-center mb-8'>
					<Image
						src='/LG_logo2.webp'
						alt='LaptopGuru'
						width={180}
						height={72}
						priority
						className='h-16 w-auto object-contain'
						unoptimized
					/>
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

				<p className='mt-6 text-[10px] text-gray-500 text-center'>
					Developed with 💛 by{' '}
					<a
						href='https://t.me/denys_maksymuck'
						target='_blank'
						rel='noreferrer'
						className='hover:text-gray-700'>
						Denys
					</a>
				</p>
			</div>
		</div>
	);
}
