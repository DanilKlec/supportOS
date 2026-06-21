export interface GoogleSheetTextResponse {
	ok: boolean;
	status: number;
	text: string;
}

export interface GoogleSheetBinaryResponse {
	ok: boolean;
	status: number;
	bytes: ArrayBuffer;
	contentType: string;
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

async function fetchProxiedResponse(
	url: string,
): Promise<Response | undefined> {
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

		if (response.status === 404) {
			return undefined;
		}

		const contentType = response.headers.get("content-type") ?? "";

		if (response.ok && contentType.includes("text/html")) {
			const text = await response.clone().text();

			if (text.includes('<div id="root"')) {
				return undefined;
			}
		}

		return response;
	} catch {
		return undefined;
	}
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

async function fetchDirectBinary(
	url: string,
): Promise<GoogleSheetBinaryResponse> {
	const response = await fetch(url);
	const bytes = await response.arrayBuffer();

	return {
		ok: response.ok,
		status: response.status,
		bytes,
		contentType: response.headers.get("content-type") ?? "",
	};
}

async function fetchProxiedText(
	url: string,
): Promise<GoogleSheetTextResponse | undefined> {
	const response = await fetchProxiedResponse(url);

	if (!response) return undefined;

	const text = await response.text();

	if (looksLikeMissingProxy(response, text)) {
		return undefined;
	}

	return {
		ok: response.ok,
		status: response.status,
		text,
	};
}

async function fetchProxiedBinary(
	url: string,
): Promise<GoogleSheetBinaryResponse | undefined> {
	const response = await fetchProxiedResponse(url);

	if (!response) return undefined;

	return {
		ok: response.ok,
		status: response.status,
		bytes: await response.arrayBuffer(),
		contentType: response.headers.get("content-type") ?? "",
	};
}

function isDelimitedUrl(sourceUrl: string) {
	return (
		sourceUrl.includes("output=csv") ||
		sourceUrl.includes("output=tsv") ||
		sourceUrl.includes("format=csv") ||
		sourceUrl.includes("format=tsv") ||
		/\.(csv|tsv)(?:$|[?#])/i.test(sourceUrl)
	);
}

function isXlsxUrl(sourceUrl: string) {
	return (
		sourceUrl.includes("output=xlsx") ||
		sourceUrl.includes("format=xlsx") ||
		/\.xlsx(?:$|[?#])/i.test(sourceUrl)
	);
}

export async function fetchGoogleSheetArrayBuffer(url: string) {
	const proxied = await fetchProxiedBinary(url);

	if (proxied) return proxied;

	return fetchDirectBinary(url);
}

export function toGoogleSheetXlsxExportUrl(sourceUrl: string) {
	const spreadsheetId = extractGoogleSpreadsheetId(sourceUrl);
	const publishedSpreadsheetId = extractPublishedGoogleSpreadsheetId(sourceUrl);

	if (isXlsxUrl(sourceUrl)) {
		return sourceUrl;
	}

	if (isDelimitedUrl(sourceUrl)) {
		return undefined;
	}

	if (publishedSpreadsheetId) {
		return `https://docs.google.com/spreadsheets/d/e/${publishedSpreadsheetId}/pub?output=xlsx`;
	}

	if (!spreadsheetId) return undefined;

	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
}

export function toGoogleSheetNamedExportUrl(
	sourceUrl: string,
	sheetName: string,
) {
	const spreadsheetId = extractGoogleSpreadsheetId(sourceUrl);
	const publishedSpreadsheetId = extractPublishedGoogleSpreadsheetId(sourceUrl);
	const encodedSheetName = encodeURIComponent(sheetName);

	if (isDelimitedUrl(sourceUrl)) {
		return sourceUrl;
	}

	if (spreadsheetId) {
		return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodedSheetName}`;
	}

	if (publishedSpreadsheetId) {
		return `https://docs.google.com/spreadsheets/d/e/${publishedSpreadsheetId}/pub?single=true&output=csv&sheet=${encodedSheetName}`;
	}

	return sourceUrl;
}

export async function fetchGoogleSheetText(url: string) {
	const proxied = await fetchProxiedText(url);

	if (proxied) return proxied;

	return fetchDirectText(url);
}

export function toGoogleSheetExportUrl(sourceUrl: string, gid?: string) {
	const spreadsheetId = extractGoogleSpreadsheetId(sourceUrl);
	const publishedSpreadsheetId = extractPublishedGoogleSpreadsheetId(sourceUrl);

	if (isDelimitedUrl(sourceUrl)) {
		return sourceUrl;
	}

	if (publishedSpreadsheetId) {
		return `https://docs.google.com/spreadsheets/d/e/${publishedSpreadsheetId}/pub?gid=${gid ?? extractGoogleSheetGid(sourceUrl) ?? "0"}&single=true&output=csv`;
	}

	if (!spreadsheetId) return sourceUrl;

	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=tsv&gid=${gid ?? extractGoogleSheetGid(sourceUrl) ?? "0"}`;
}
