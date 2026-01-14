import { flushSync } from "preact/compat";

type LandingViewProps = {
	dueIndex: number;
	onEnter: () => void;
};

export function LandingView({ dueIndex, onEnter }: LandingViewProps) {
	const handleClick = () => {
		if (document.startViewTransition) {
			document.startViewTransition(() => {
				flushSync(() => {
					onEnter();
				});
			});
		} else {
			onEnter();
		}
	};

	return (
		<div class="landing-view">
			<div
				class="landing-circle"
				style={{ viewTransitionName: `day-${dueIndex}` }}
			>
				<span class="landing-emoji">🐣</span>
				<span class="landing-text">
					Gaby & David
					<br />
					are expecting
					<br />a baby
				</span>
			</div>
			<button
				class="landing-button"
				style={{ viewTransitionName: "today-marker" }}
				onClick={handleClick}
			>
				See progress
			</button>
		</div>
	);
}
