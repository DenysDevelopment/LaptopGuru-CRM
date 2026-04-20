'use client';

interface ReturnModalProps {
	open: boolean;
	onClose: () => void;
	productTitle?: string;
	buyUrl?: string;
	lang?: string;
}

const COPY: Record<
	string,
	{
		headline: string;
		body: (product: string | undefined) => string;
		cta: string;
		later: string;
	}
> = {
	pl: {
		headline: '🔥 Jeszcze tu jesteś — i świetnie!',
		body: product =>
			product
				? `Ten ${product} jest w magazynie TYLKO DZIŚ w tej cenie. Wracaj do filmu i zamawiaj, zanim ktoś go złapie.`
				: 'Ten laptop jest w magazynie TYLKO DZIŚ w tej cenie. Wracaj do filmu i zamawiaj, zanim ktoś go złapie.',
		cta: 'Dokończ oglądanie',
		later: 'Może później',
	},
	en: {
		headline: '🔥 Still here — good!',
		body: product =>
			product
				? `This ${product} is in stock at this price TODAY ONLY. Finish the video and grab it before someone else does.`
				: 'This laptop is in stock at this price TODAY ONLY. Finish the video and grab it before someone else does.',
		cta: 'Back to the video',
		later: 'Maybe later',
	},
	ru: {
		headline: '🔥 Ты ещё здесь — класс!',
		body: product =>
			product
				? `Этот ${product} в наличии по этой цене ТОЛЬКО СЕГОДНЯ. Досмотри видео и успей заказать, пока не забрали.`
				: 'Этот ноутбук в наличии по этой цене ТОЛЬКО СЕГОДНЯ. Досмотри видео и успей заказать, пока не забрали.',
		cta: 'Вернуться к видео',
		later: 'Может позже',
	},
};

export function ReturnModal({ open, onClose, productTitle, buyUrl, lang = 'pl' }: ReturnModalProps) {
	if (!open) return null;
	const t = COPY[lang] ?? COPY.pl;

	return (
		<div
			className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="return-modal-title"
		>
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
				onClick={onClose}
				aria-hidden="true"
			/>
			<div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
				<div className="bg-gradient-to-br from-[#fb7830] to-[#e55a00] px-6 py-5 text-white">
					<h2
						id="return-modal-title"
						className="text-xl font-bold leading-tight"
					>
						{t.headline}
					</h2>
				</div>
				<div className="px-6 py-5 space-y-4">
					<p className="text-sm text-gray-700 leading-relaxed">
						{t.body(productTitle)}
					</p>
					<div className="flex flex-col gap-2">
						{buyUrl && (
							<a
								href={buyUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="w-full bg-[#fb7830] hover:bg-[#e55a00] text-white font-semibold px-5 py-3 rounded-xl text-center text-sm transition-colors shadow-[0_4px_14px_rgba(251,120,48,0.4)]"
								onClick={onClose}
							>
								{t.cta}
							</a>
						)}
						{!buyUrl && (
							<button
								type="button"
								onClick={onClose}
								className="w-full bg-[#fb7830] hover:bg-[#e55a00] text-white font-semibold px-5 py-3 rounded-xl text-sm transition-colors shadow-[0_4px_14px_rgba(251,120,48,0.4)]"
							>
								{t.cta}
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							className="w-full text-gray-500 hover:text-gray-700 text-sm font-medium py-2 transition-colors"
						>
							{t.later}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
