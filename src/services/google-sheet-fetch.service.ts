export interface GoogleSheetTextResponse {
	ok: boolean;
	status: number;
	text: string;
}

const GOOGLE_SHEETS_PROXY_ENDPOINT = "/api/google-sheets/fetch";

export function extractGoogleSpreadsheetId(url: string) {
	try {
		const parsed = new URL(url);
		const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);

		return match?.[1];
	} catch {
		return undefined;
	}
}

export function extractPublishedGoogleSpreadsheetId(url: string) {
	try {
		const parsed = new URL(url);
		const match = parsed.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);

		return match?.[1];
	} catch {
		return undefined;
	}
}

export function extractGoogleSheetGid(url: string) {
	try {
		const parsed = new URL(url);

		return (
			parsed.searchParams.get("gid") ?? parsed.hash.match(/gid=(\d+)/)?.[1]
		);
	} catch {
		return undefined;
	}
}

export function looksLikeGoogleSheetHtml(text: string) {
	return /^\s*(?:<!doctype html|<html[\s>])/i.test(text);
}

function looksLikeMissingProxy(response: Response, text: string) {
	const contentType = response.headers.get("content-type") ?? "";

	return (
		response.status === 404 ||
		(response.ok &&
			contentType.includes("text/html") &&
			text.includes('<div id="root"'))
	);
}

async function fetchDirectText(url: string): Promise<GoogleSheetTextResponse> {
	const response = await fetch(url);
	const text = await response.text();

	return {
		ok: response.ok,
		status: response.status,
		text,
	};
}

async function fetchProxiedText(
	url: string,
): Promise<GoogleSheetTextResponse | undefined> {
	if (typeof window === "undefined") return undefined;

	try {
		const proxyUrl = new URL(
			GOOGLE_SHEETS_PROXY_ENDPOINT,
			window.location.origin,
		);

		proxyUrl.searchParams.set("url", url);

		const response = await fetch(proxyUrl.toString(), {
			cache: "no-store",
		});
		const text = await response.text();

		if (looksLikeMissingProxy(response, text)) {
			return undefined;
		}

		return {
			ok: response.ok,
			status: response.status,
			text,
		};
	} catch {
		return undefined;
	}
}

export async function fetchGoogleSheetText(url: string) {
	const proxied = await fetchProxiedText(url);

	if (proxied) return proxied;

	return fetchDirectText(url);
}

export function toGoogleSheetExportUrl(sourceUrl: string, gid?: string) {
	const spreadsheetId = extractGoogleSpreadsheetId(sourceUrl);
	const publishedSpreadsheetId = extractPublishedGoogleSpreadsheetId(sourceUrl);

	if (
		sourceUrl.includes("output=csv") ||
		sourceUrl.includes("output=tsv") ||
		sourceUrl.includes("format=csv") ||
		sourceUrl.includes("format=tsv") ||
		/\.(csv|tsv)(?:$|[?#])/i.test(sourceUrl)
	) {
		return sourceUrl;
	}

	if (publishedSpreadsheetId) {
		return `https://docs.google.com/spreadsheets/d/e/${publishedSpreadsheetId}/pub?gid=${gid ?? extractGoogleSheetGid(sourceUrl) ?? "0"}&single=true&output=csv`;
	}

	if (!spreadsheetId) return sourceUrl;

	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=tsv&gid=${gid ?? extractGoogleSheetGid(sourceUrl) ?? "0"}`;
}
