// Mirror of apps/web/src/lib/decode-entities.ts — kept in sync intentionally.
// Used at ingestion to store decoded message bodies (Allegro returns
// HTML-encoded text like &quot;, &oacute;, &lstrok;).

const NAMED: Record<string, string> = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
	copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
	laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’',
	ldquo: '“', rdquo: '”', bull: '•', middot: '·',
	Aacute: 'Á', aacute: 'á', Eacute: 'É', eacute: 'é',
	Iacute: 'Í', iacute: 'í', Oacute: 'Ó', oacute: 'ó',
	Uacute: 'Ú', uacute: 'ú', Yacute: 'Ý', yacute: 'ý',
	Agrave: 'À', agrave: 'à', Egrave: 'È', egrave: 'è',
	Igrave: 'Ì', igrave: 'ì', Ograve: 'Ò', ograve: 'ò', Ugrave: 'Ù', ugrave: 'ù',
	Acirc: 'Â', acirc: 'â', Ecirc: 'Ê', ecirc: 'ê',
	Icirc: 'Î', icirc: 'î', Ocirc: 'Ô', ocirc: 'ô', Ucirc: 'Û', ucirc: 'û',
	Auml: 'Ä', auml: 'ä', Euml: 'Ë', euml: 'ë',
	Iuml: 'Ï', iuml: 'ï', Ouml: 'Ö', ouml: 'ö', Uuml: 'Ü', uuml: 'ü', yuml: 'ÿ',
	Atilde: 'Ã', atilde: 'ã', Ntilde: 'Ñ', ntilde: 'ñ', Otilde: 'Õ', otilde: 'õ',
	Aring: 'Å', aring: 'å', AElig: 'Æ', aelig: 'æ',
	Ccedil: 'Ç', ccedil: 'ç', Oslash: 'Ø', oslash: 'ø',
	szlig: 'ß',
	Aogon: 'Ą', aogon: 'ą', Eogon: 'Ę', eogon: 'ę',
	Lstrok: 'Ł', lstrok: 'ł', Nacute: 'Ń', nacute: 'ń',
	Sacute: 'Ś', sacute: 'ś', Zacute: 'Ź', zacute: 'ź',
	Zdot: 'Ż', zdot: 'ż',
};

export function decodeEntities(input: string): string {
	if (!input || input.indexOf('&') === -1) return input;
	return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]+);/g, (whole, body: string) => {
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X'
				? parseInt(body.slice(2), 16)
				: parseInt(body.slice(1), 10);
			if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
			try { return String.fromCodePoint(code); } catch { return whole; }
		}
		return NAMED[body] ?? whole;
	});
}
