const CACHE_KEY = "supportos:currency-rates:v1";
const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;
const DEFAULT_BASE = "USD";

export interface CurrencyRates {
	base: string;
	date: string;
	updatedAt: string;
	rates: Record<string, number>;
	source: string;
}

interface FrankfurterRatesResponse {
	base?: string;
	date?: string;
	rates?: Record<string, number>;
}

interface OpenExchangeRatesResponse {
	result?: string;
	base_code?: string;
	time_last_update_utc?: string;
	rates?: Record<string, number>;
}

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeCurrency(currency: string) {
	return currency.trim().toUpperCase() || DEFAULT_BASE;
}

function readCache() {
	if (!isBrowser()) return undefined;

	try {
		const raw = localStorage.getItem(CACHE_KEY);

		return raw ? (JSON.parse(raw) as CurrencyRates) : undefined;
	} catch {
		return undefined;
	}
}

function writeCache(rates: CurrencyRates) {
	if (!isBrowser()) return;

	localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
}

function isFresh(rates: CurrencyRates) {
	return Date.now() - new Date(rates.updatedAt).getTime() < CACHE_MAX_AGE;
}

function normalizeRates({
	base,
	date,
	rates,
	source,
}: {
	base: string;
	date?: string;
	rates: Record<string, number>;
	source: string;
}): CurrencyRates {
	return {
		base,
		date: date ?? new Date().toISOString().slice(0, 10),
		updatedAt: new Date().toISOString(),
		rates: {
			...rates,
			[base]: 1,
		},
		source,
	};
}

class CurrencyService {
	async getRates({ force = false } = {}) {
		const cached = readCache();

		if (!force && cached && isFresh(cached)) {
			return cached;
		}

		try {
			const rates = await this.loadFrankfurterRates(DEFAULT_BASE);

			writeCache(rates);
			return rates;
		} catch {
			const rates = await this.loadOpenExchangeRates(DEFAULT_BASE);

			writeCache(rates);
			return rates;
		}
	}

	convert({
		amount,
		from,
		to,
		rates,
	}: {
		amount: number;
		from: string;
		to: string;
		rates: CurrencyRates;
	}) {
		const source = normalizeCurrency(from);
		const target = normalizeCurrency(to);

		if (source === target) return amount;

		const sourceRate = rates.rates[source];
		const targetRate = rates.rates[target];

		if (!sourceRate || !targetRate) return undefined;

		const amountInBase = amount / sourceRate;

		return amountInBase * targetRate;
	}

	format(amount: number, currency: string) {
		const normalizedCurrency = normalizeCurrency(currency);

		try {
			return new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: normalizedCurrency,
				maximumFractionDigits: amount >= 100 ? 0 : 2,
			}).format(amount);
		} catch {
			return `${amount.toFixed(amount >= 100 ? 0 : 2)} ${normalizedCurrency}`;
		}
	}

	private async loadFrankfurterRates(base: string) {
		const response = await fetch(
			`https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}`,
		);

		if (!response.ok) {
			throw new Error("Frankfurter rates are unavailable");
		}

		const data = (await response.json()) as FrankfurterRatesResponse;

		if (!data.rates) {
			throw new Error("Frankfurter returned empty rates");
		}

		return normalizeRates({
			base: normalizeCurrency(data.base ?? base),
			date: data.date,
			rates: data.rates,
			source: "Frankfurter",
		});
	}

	private async loadOpenExchangeRates(base: string) {
		const response = await fetch(
			`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
		);

		if (!response.ok) {
			throw new Error("Exchange rates are unavailable");
		}

		const data = (await response.json()) as OpenExchangeRatesResponse;

		if (data.result !== "success" || !data.rates) {
			throw new Error("Exchange rates returned an empty response");
		}

		return normalizeRates({
			base: normalizeCurrency(data.base_code ?? base),
			date: data.time_last_update_utc,
			rates: data.rates,
			source: "Open Exchange Rates",
		});
	}
}

export const currencyService = new CurrencyService();
