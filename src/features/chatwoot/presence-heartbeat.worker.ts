import {
	runPresenceHeartbeat,
	sendPresenceHeartbeat,
} from "./presence-heartbeat";

let accessToken = "";
const heartbeat = runPresenceHeartbeat(async () => {
	if (!accessToken) return false;
	const response = await sendPresenceHeartbeat(accessToken);
	if (response.status === 401) self.postMessage("refresh-auth");
	return response.ok;
});

setInterval(() => {
	if (accessToken) self.postMessage("refresh-chats");
}, 8_000);

self.onmessage = ({ data }: MessageEvent<string>) => {
	accessToken = data;
	heartbeat.wake();
};
