import { useState, useRef, useEffect } from "preact/hooks";

const API_URL =
	import.meta.env.DEV && import.meta.env.VITE_USE_LOCAL_API
		? "http://localhost:8787"
		: "https://meanwhile-config-editor.dalberto-adler.workers.dev";

const PASSWORD_STORAGE_KEY = "meanwhile-config-password";

type Message = {
	role: "user" | "assistant";
	content: string;
	commitUrl?: string;
};

type Props = {
	onClose: () => void;
};

export function ConfigEditor({ onClose }: Props) {
	const [password, setPassword] = useState(() => localStorage.getItem(PASSWORD_STORAGE_KEY) || "");
	const [passwordError, setPasswordError] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const isPasswordEntered = password.length > 0;

	useEffect(() => {
		if (isPasswordEntered) {
			inputRef.current?.focus();
		}
	}, [isPasswordEntered]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Close on Escape
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	const handlePasswordChange = (e: Event) => {
		const value = (e.target as HTMLInputElement).value;
		setPassword(value);
		setPasswordError(false);
	};

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		if (!input.trim() || loading) return;

		const userMessage = input.trim();
		setInput("");
		setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
		setLoading(true);

		try {
			const response = await fetch(`${API_URL}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pin: password, message: userMessage }),
			});

			if (response.status === 401) {
				// Invalid password - clear stored password
				localStorage.removeItem(PASSWORD_STORAGE_KEY);
				setPassword("");
				setPasswordError(true);
				setMessages((prev) => prev.slice(0, -1)); // Remove the user message
				setInput(userMessage); // Restore input
				return;
			}

			const data = await response.json();

			if (data.error) {
				setMessages((prev) => [
					...prev,
					{ role: "assistant", content: `Error: ${data.error}` },
				]);
			} else {
				// Password worked - store it
				localStorage.setItem(PASSWORD_STORAGE_KEY, password);
				setMessages((prev) => [
					...prev,
					{
						role: "assistant",
						content: data.response,
						commitUrl: data.commitUrl,
					},
				]);
			}
		} catch (err) {
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: "Failed to connect to server" },
			]);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div class="config-editor-overlay" onClick={onClose}>
			<div class="config-editor" onClick={(e) => e.stopPropagation()}>
				<div class="config-editor-header">
					<h2>Config Editor</h2>
					<button class="config-editor-close" onClick={onClose}>
						&times;
					</button>
				</div>

				{!isPasswordEntered ? (
					<div class="config-editor-password">
						<label>Enter password to continue</label>
						<input
							type="password"
							value={password}
							onInput={handlePasswordChange}
							placeholder="password"
							autoFocus
							class={passwordError ? "error" : ""}
						/>
						{passwordError && <span class="password-error">Invalid password</span>}
					</div>
				) : (
					<>
						<div class="config-editor-messages">
							{messages.length === 0 && (
								<div class="config-editor-empty">
									Tell me what to change in the config.
									<br />
									<span class="example">
										e.g., "Add my birthday on March 16"
									</span>
								</div>
							)}
							{messages.map((msg, i) => (
								<div key={i} class={`message ${msg.role}`}>
									<div class="message-content">{msg.content}</div>
									{msg.commitUrl && (
										<a
											href={msg.commitUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="commit-link"
										>
											View commit
										</a>
									)}
								</div>
							))}
							{loading && (
								<div class="message assistant loading">
									<span class="typing-indicator">...</span>
								</div>
							)}
							<div ref={messagesEndRef} />
						</div>

						<form class="config-editor-input" onSubmit={handleSubmit}>
							<input
								ref={inputRef}
								type="text"
								value={input}
								onInput={(e) => setInput((e.target as HTMLInputElement).value)}
								placeholder="What would you like to change?"
								disabled={loading}
							/>
							<button type="submit" disabled={loading || !input.trim()}>
								Send
							</button>
						</form>
					</>
				)}
			</div>
		</div>
	);
}
