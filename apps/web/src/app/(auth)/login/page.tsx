'use client';

import { signIn } from 'next-auth/react';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
	const router = useRouter();
	const isDev = process.env.NODE_ENV === 'development';
	const [email, setEmail] = useState(isDev ? 'admin@demo.local' : '');
	const [password, setPassword] = useState(isDev ? 'admin12345' : '');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		setLoading(true);

		const result = await signIn('credentials', {
			email,
			password,
			redirect: false,
		});

		if (result?.error) {
			setError('Неверный email или пароль');
			setLoading(false);
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

				<form onSubmit={handleSubmit} className='space-y-4'>
					{error && (
						<div className='bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3'>
							{error}
						</div>
					)}

					<div>
						<label
							htmlFor='email'
							className='block text-sm font-medium text-gray-700 mb-1'>
							Email
						</label>
						<input
							id='email'
							type='email'
							required
							value={email}
							onChange={e => setEmail(e.target.value)}
							className='w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors'
							placeholder='email@example.com'
						/>
					</div>

					<div>
						<label
							htmlFor='password'
							className='block text-sm font-medium text-gray-700 mb-1'>
							Пароль
						</label>
						<input
							id='password'
							type='password'
							required
							value={password}
							onChange={e => setPassword(e.target.value)}
							className='w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:ring-2 focus:ring-brand-muted outline-none transition-colors'
							placeholder='••••••••'
						/>
					</div>

					<button
						type='submit'
						disabled={loading}
						className='w-full bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
						{loading ? 'Вход...' : 'Войти'}
					</button>
				</form>

				<p className='mt-6 text-center text-sm text-gray-400'>
					LaptopGuru CRM — laptopguru.pl
				</p>
			</div>
		</div>
	);
}
