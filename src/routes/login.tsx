import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LogIn } from "lucide-react";
import { type FormEvent, useState } from "react";

import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";
import { useToast } from "@/shared/hooks/useToast";
import { useAuthStore } from "@/store/auth.store";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const configured = useAuthStore((state) => state.configured);
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setError("");
		setLoading(true);

		try {
			const session =
				mode === "signIn"
					? await supabaseService.signIn(email.trim(), password)
					: await supabaseService.signUp(email.trim(), password);

			if (!session) {
				showToast("Check your email to confirm the account");
				return;
			}

			await knowledgeService.loadCloudKnowledge();
			showToast("Cloud sync connected");
			void navigate({ to: "/" });
		} catch (authError) {
			setError(
				authError instanceof Error
					? authError.message
					: "Authentication failed",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex h-full items-center justify-center overflow-auto bg-background p-6">
			<form
				onSubmit={submit}
				className="w-full max-w-md rounded-lg border border-border bg-surface p-6"
			>
				<div className="mb-6">
					<h1 className="text-2xl font-bold">Cloud Login</h1>
					<p className="mt-1 text-sm text-muted">
						Sign in to sync SupportOS across devices.
					</p>
				</div>

				{!configured && (
					<div className="mb-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
						Cloud sync is disabled or Supabase is not configured.
					</div>
				)}

				{error && (
					<div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
						{error}
					</div>
				)}

				<div className="space-y-4">
					<label className="block space-y-2">
						<span className="text-sm font-medium">Email</span>
						<input
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							disabled={loading || !configured}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="you@example.com"
							required
						/>
					</label>

					<label className="block space-y-2">
						<span className="text-sm font-medium">Password</span>
						<input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							disabled={loading || !configured}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="••••••••"
							required
							minLength={6}
						/>
					</label>
				</div>

				<button
					type="submit"
					disabled={loading || !configured}
					className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{loading ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<LogIn size={16} />
					)}
					{mode === "signIn" ? "Sign In" : "Create Account"}
				</button>

				<button
					type="button"
					onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
					disabled={loading}
					className="mt-3 w-full rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
				>
					{mode === "signIn"
						? "Need an account? Create one"
						: "Already have an account? Sign in"}
				</button>
			</form>
		</div>
	);
}
