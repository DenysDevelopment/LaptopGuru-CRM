export function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		hash = (hash << 5) - hash + ch;
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

// Parse product name like "Apple MacBook Pro A1990 (2019)/i7-8850H/32GB/512GB/Radeon Pro555x (4GB)/15.4"
export function parseSpecs(productName: string | null) {
	if (!productName) return null;

	// Clean video title prefixes and hashtags/id suffixes
	const cleaned = productName
		.replace(/^(Wideorecenzja|Recenzja|Review)\s+/i, '')
		.replace(/\s+id:\d+.*$/i, '');

	const parts = cleaned.split('/').map(p => p.trim());
	if (parts.length < 3) return null;

	// If model part contains CPU info (e.g. "Dell Latitude 5500 i5-8gen"), split them
	const cpuPattern =
		/\b(i[3579]-?\w+|ryzen\s*\w+|m[12]\s*\w+|celeron\s*\w+|pentium\s*\w+|xeon\s*\w+|amd\s*\w+)/i;
	let model = parts[0] || null;
	let cpu = parts.find((p, i) => i > 0 && cpuPattern.test(p)) || null;

	if (!cpu && model && cpuPattern.test(model)) {
		const match = model.match(cpuPattern);
		if (match) {
			cpu = model.substring(match.index!).trim();
			model = model.substring(0, match.index!).trim();
		}
	}
	if (!cpu) cpu = parts.find(p => cpuPattern.test(p)) || null;
	const ram = parts.find(p => /^\d+\s*GB(\s*RAM)?$/i.test(p)) || null;
	const storage =
		parts.find(
			p => /^\d+\s*(GB|TB)(\s*SSD|\s*HDD|\s*NVMe)?$/i.test(p) && p !== ram,
		) || null;
	const gpu =
		parts.find(p =>
			/radeon|geforce|nvidia|gtx|rtx|intel\s*(hd|iris|uhd)|pro\s*\d{3}/i.test(
				p,
			),
		) || null;
	const display = parts.find(p => /^\d{1,2}(\.\d+)?(")?$/i.test(p)) || null;

	if (!model && !cpu && !ram) return null;

	return {
		model,
		cpu,
		ram,
		storage,
		gpu,
		display: display ? `${display}"` : null,
	};
}
