import { useState, useRef, useEffect } from "preact/hooks";

const API_URL =
	import.meta.env.DEV && import.meta.env.VITE_USE_LOCAL_API
		? "http://localhost:8787"
		: "https://meanwhile-config-editor.dalberto-adler.workers.dev";

const PIN_STORAGE_KEY = "meanwhile-config-pin";

type Message = {
	role: "user" | "assistant";
	content: string;
	commitUrl?: string;
};

type Props = {
	onClose: () => void;
};

export function ConfigEditor({ onClose }: Props) {
	const [pin, setPin] = useState(() => localStorage.getItem(PIN_STORAGE_KEY) || "");
	const [pinError, setPinError] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const isPinEntered = pin.length === 4;

	useEffect(() => {
		if (isPinEntered) {
			inputRef.current?.focus();
		}
	}, [isPinEntered]);

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

	const handlePinChange = (e: Event) => {
		const value = (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4);
		setPin(value);
		setPinError(false);
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
				body: JSON.stringify({ pin, message: userMessage }),
			});

			if (response.status === 401) {
				// Invalid PIN - clear stored PIN
				localStorage.removeItem(PIN_STORAGE_KEY);
				setPin("");
				setPinError(true);
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
				// PIN worked - store it
				localStorage.setItem(PIN_STORAGE_KEY, pin);
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

				{!isPinEntered ? (
					<div class="config-editor-pin">
						<label>Enter PIN to continue</label>
						<input
							type="password"
							inputMode="numeric"
							pattern="[0-9]*"
							maxLength={4}
							value={pin}
							onInput={handlePinChange}
							placeholder="****"
							autoFocus
							class={pinError ? "error" : ""}
						/>
						{pinError && <span class="pin-error">Invalid PIN</span>}
					</div>
				) : (
					<>
						<div class="config-editor-messages">
							{messages.length === 0 && (
								<div class="config-editor-empty">
									Tell me what to change in the config.
									<br />
									<span class="example">
										e.g., "Add my birthday on March 15"
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
