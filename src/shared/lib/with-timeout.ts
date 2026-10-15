export function withTimeout<T>(
	request: Promise<T>,
	milliseconds = 15000,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() =>
				reject(
					new Error(
						"Время ожидания истекло. Проверьте соединение и повторите попытку.",
					),
				),
			milliseconds,
		);
		request.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}
