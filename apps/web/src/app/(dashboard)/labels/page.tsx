export default function LabelsPage() {
	return (
		<div className='h-screen w-full'>
			<iframe
				src='https://generate.laptopguru.link/'
				title='Генератор этикеток'
				className='block h-full w-full border-0'
				allow='clipboard-read; clipboard-write; usb'
			/>
		</div>
	);
}
