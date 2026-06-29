export type SportsBettingEventStatus = "Live" | "Upcoming" | "Settling";

export interface SportsBettingOutcome {
	name: string;
	price: number;
	point?: number;
	bookmakerKey: string;
	bookmakerTitle: string;
	marketKey: string;
	marketLabel: string;
	lastUpdate?: string;
	link?: string;
}

export interface SportsBettingMarket {
	key: string;
	label: string;
	outcomes: SportsBettingOutcome[];
}

export interface SportsBettingEvent {
	id: string;
	sportKey: string;
	sportTitle: string;
	commenceTime: string;
	homeTeam?: string;
	awayTeam?: string;
	matchup: string;
	status: SportsBettingEventStatus;
	bookmakerCount: number;
	marketCount: number;
	lastUpdate?: string;
	markets: SportsBettingMarket[];
	bestOdds: SportsBettingOutcome[];
}

export interface SportsBettingFeed {
	provider: string;
	loadedAt: string;
	pollMs: number;
	cacheTtlSeconds: number;
	config: {
		sports: string[];
		regions: string;
		markets: string;
		bookmakers?: string;
		oddsFormat: string;
	};
	quota?: {
		requestsRemaining?: string;
		requestsUsed?: string;
		requestsLast?: string;
	};
	warnings: string[];
	events: SportsBettingEvent[];
}

interface SportsBettingErrorResponse {
	error?: string;
	details?: string;
}

const SPORTS_BETTING_ENDPOINT = "/api/sports-betting/live";

async function readJson<T>(response: Response): Promise<T | undefined> {
	try {
		return (await response.json()) as T;
	} catch {
		return undefined;
	}
}

class SportsBettingService {
	async loadLiveFeed() {
		const response = await fetch(SPORTS_BETTING_ENDPOINT);
		const data = await readJson<SportsBettingFeed | SportsBettingErrorResponse>(
			response,
		);

		if (!response.ok) {
			const errorData = data as SportsBettingErrorResponse | undefined;

			throw new Error(
				errorData?.error ?? "Unable to load live sports betting data",
			);
		}

		if (!data || !("events" in data)) {
			throw new Error("Live sports betting data has an unexpected format");
		}

		return data;
	}
}

export const sportsBettingService = new SportsBettingService();
