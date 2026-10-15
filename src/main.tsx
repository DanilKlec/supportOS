import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "#/app/App";
import { ApplicationBoundary } from "#/app/ApplicationStatus";

createRoot(document.getElementById("app")!).render(
	<ApplicationBoundary>
		<App />
	</ApplicationBoundary>,
);
