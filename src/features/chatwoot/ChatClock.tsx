import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

const ChatClock = createContext(0);
const millisecondsPerSecond = 1000;

export function ChatClockProvider({ children }: { children: ReactNode }) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		let timer: number | undefined;
		const update = () => {
			window.clearTimeout(timer);
			const current = Date.now();
			setNow(current);
			if (!document.hidden) {
				timer = window.setTimeout(
					update,
					millisecondsPerSecond - (current % millisecondsPerSecond),
				);
			}
		};
		update();
		document.addEventListener("visibilitychange", update);
		window.addEventListener("pageshow", update);
		return () => {
			window.clearTimeout(timer);
			document.removeEventListener("visibilitychange", update);
			window.removeEventListener("pageshow", update);
		};
	}, []);
	return <ChatClock.Provider value={now}>{children}</ChatClock.Provider>;
}

export function useChatClock() {
	return useContext(ChatClock);
}

function waitingDuration(timestamp: number, now: number) {
	const since =
		timestamp > 1e12 ? timestamp : timestamp * millisecondsPerSecond;
	const total = Math.max(0, Math.floor((now - since) / millisecondsPerSecond));
	if (total < 60) return `${total} с`;
	const seconds = String(total % 60).padStart(2, "0");
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes} мин ${seconds} с`;
	const hours = Math.floor(minutes / 60);
	const elapsed = `${hours % 24}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
	return hours < 24 ? elapsed : `${Math.floor(hours / 24)} д ${elapsed}`;
}

export function WaitingTime({
	timestamp,
	className,
}: {
	timestamp: number;
	className: string;
}) {
	const now = useChatClock();
	return (
		<span className={`${className} tabular-nums`} title="Время ожидания ответа">
			Ждёт {waitingDuration(timestamp, now)}
		</span>
	);
}
