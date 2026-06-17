let cleanupStarted = false;

export function cleanupDevelopmentCaches() {
	if (!import.meta.env.DEV || cleanupStarted || typeof window === "undefined") {
		return;
	}

	cleanupStarted = true;

	if ("serviceWorker" in navigator) {
		void navigator.serviceWorker
			.getRegistrations()
			.then((registrations) =>
				Promise.all(
					registrations.map((registration) => registration.unregister()),
				),
			)
			.catch(() => undefined);
	}

	if ("caches" in window) {
		void caches
			.keys()
			.then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
			.catch(() => undefined);
	}
}
