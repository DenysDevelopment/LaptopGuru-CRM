import axios from 'axios';

export const api = axios.create({
	baseURL: '/api',
	withCredentials: true,
	headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
	(response) => response,
	(error) => {
		const message =
			error?.response?.data?.error ||
			error?.response?.data?.message ||
			error?.message ||
			'Request failed';
		return Promise.reject(new Error(message));
	},
);
