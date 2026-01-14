import { useRef, useState, useCallback } from "preact/hooks";
import type { DayInfo } from "../types";

// Milestones that get view transitions
const VIEW_TRANSITION_LABELS = new Set(["Start", "Due"]);

// Portrait milestone layout constants
const PORTRAIT_MONTHS_WIDTH = 32; // width of months column that stems must cross

type PortraitMilestoneWithLayout = DayInfo & {
	topPx: number;
	leftPx: number;
	expanded: boolean;
};

type GanttBar = {
	label: string;
	startPosition: number;
	endPosition: number;
	width: number;
	color?: string;
	emoji: string;
	startIndex: number;
	endIndex: number;
};

type MonthMarker = {
	month: string;
	year: number;
	position: number;
};

type WeekMarker = {
	week: number;
	position: number;
};

type TimelinePortraitProps = {
	days: DayInfo[];
	milestones: PortraitMilestoneWithLayout[];
	ganttBars: GanttBar[];
	monthMarkers: MonthMarker[];
	weekMarkers: WeekMarker[];
	todayIndex: number;
	todayPosition: number;
	totalDays: number;
	selectedDayIndex: number | null;
	annotationEmojis: Record<string, string>;
	onDayClick: (e: MouseEvent, day: DayInfo) => void;
	milestonesContainerRef?: { current: HTMLDivElement | null };
};

export function TimelinePortrait({
	days,
	milestones,
	ganttBars,
	monthMarkers,
	weekMarkers,
	todayIndex,
	todayPosition,
	totalDays,
	selectedDayIndex,
	annotationEmojis,
	onDayClick,
	milestonesContainerRef,
}: TimelinePortraitProps) {
	const lineRef = useRef<HTMLDivElement>(null);
	const [hoverPosition, setHoverPosition] = useState<number | null>(null);
	const [hoverDayIndex, setHoverDayIndex] = useState<number | null>(null);

	const handleLineMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!lineRef.current) return;
			const rect = lineRef.current.getBoundingClientRect();
			const pos = e.clientY - rect.top;
			const size = rect.height;
			const percent = Math.max(0, Math.min(100, (pos / size) * 100));
			const dayIndex = Math.round((percent / 100) * (totalDays - 1));
			setHoverPosition(percent);
			setHoverDayIndex(dayIndex);
		},
		[totalDays],
	);

	const handleLineMouseLeave = useCallback(() => {
		setHoverPosition(null);
		setHoverDayIndex(null);
	}, []);

	return (
		<div class="timeline-view portrait">
			<div class="timeline-content-portrait">
				{/* Week markers on the left */}
				<div class="timeline-weeks-portrait">
					{weekMarkers.map((w) => (
						<div
							key={w.week}
							class="timeline-week"
							style={{ top: `${w.position}%` }}
						>
							{w.week}
						</div>
					))}
				</div>

				{/* Gantt bars on the left (stems go right to line) */}
				{ganttBars.length > 0 && (
					<div class="timeline-gantt-portrait">
						{/* Vertical bars positioned absolutely */}
						{ganttBars.map((bar) => (
							<div
								key={`bar-${bar.label}`}
								class={`timeline-gantt-bar-portrait ${bar.color ? `colored color-${bar.color}` : ""}`}
								style={{
									top: `${bar.startPosition}%`,
									height: `${bar.width}%`,
									...(bar.color
										? { "--bar-color": `var(--color-${bar.color})` }
										: {}),
								}}
								onClick={(e) => {
									const day = days[bar.startIndex];
									if (day) onDayClick(e as unknown as MouseEvent, day);
								}}
							/>
						))}
						{/* Labels with stems */}
						{ganttBars.map((bar) => {
							const centerPosition = (bar.startPosition + bar.endPosition) / 2;
							return (
								<div
									key={`label-${bar.label}`}
									class={`timeline-gantt-item-portrait ${bar.color ? `colored color-${bar.color}` : ""}`}
									style={{
										top: `${centerPosition}%`,
										...(bar.color
											? { "--bar-color": `var(--color-${bar.color})` }
											: {}),
									}}
									onClick={(e) => {
										const day = days[bar.startIndex];
										if (day) onDayClick(e as unknown as MouseEvent, day);
									}}
								>
									<div class="timeline-gantt-label-portrait timeline-label">
										<span class="timeline-gantt-label-emoji">{bar.emoji}</span>
										<span class="timeline-gantt-label-text">{bar.label}</span>
									</div>
									<div class="timeline-gantt-stem-portrait" />
								</div>
							);
						})}
					</div>
				)}

				{/* The vertical timeline line */}
				<div
					ref={lineRef}
					class="timeline-line-portrait"
					onMouseMove={handleLineMouseMove as unknown as (e: Event) => void}
					onMouseLeave={handleLineMouseLeave}
				>
					{/* Progress fill */}
					<div
						class="timeline-progress-portrait"
						style={{ height: `${todayPosition}%` }}
					/>
					{/* Hover dot */}
					{hoverPosition !== null &&
						hoverDayIndex !== null &&
						hoverDayIndex !== todayIndex && (
							<div
								class={`timeline-hover-dot-portrait ${hoverDayIndex < (todayIndex >= 0 ? todayIndex : totalDays) ? "passed" : "future"}`}
								style={{ top: `${hoverPosition}%` }}
								onClick={(e) => {
									const day = days[hoverDayIndex];
									if (day) onDayClick(e as unknown as MouseEvent, day);
								}}
							/>
						)}
					{/* Today marker */}
					{todayIndex >= 0 && (
						<div
							class="timeline-today-portrait"
							style={{
								top: `${todayPosition}%`,
								viewTransitionName: "today-marker",
							}}
							onClick={(e) => {
								const today = days.find((d) => d.isToday);
								if (today) onDayClick(e as unknown as MouseEvent, today);
							}}
						>
							<div class="timeline-today-dot" />
						</div>
					)}
				</div>

				{/* Month markers */}
				<div class="timeline-months-portrait">
					{monthMarkers.map((m, i) => (
						<div
							key={i}
							class="timeline-month"
							style={{ top: `${m.position}%` }}
						>
							{m.month}
						</div>
					))}
				</div>

				{/* Milestones on the right - stems layer (behind) then labels layer (in front) */}
				<div class="timeline-milestones-portrait" ref={milestonesContainerRef}>
					{/* Stems layer - rendered first, appears behind */}
					{milestones.map((m) => {
						const contentOffset = m.leftPx;
						const stemWidth = 16 + PORTRAIT_MONTHS_WIDTH + contentOffset;
						return (
							<div
								key={`stem-${m.index}`}
								class={`timeline-milestone-portrait ${m.color ? `colored color-${m.color}` : ""}`}
								style={{
									top: `${m.topPx}px`,
									...(m.color
										? { "--milestone-color": `var(--color-${m.color})` }
										: {}),
								}}
							>
								<div
									class="timeline-milestone-stem-portrait"
									style={{ width: `${stemWidth}px` }}
								/>
							</div>
						);
					})}
					{/* Labels layer - rendered second, appears in front */}
					{milestones.map((m) => {
						const contentOffset = m.leftPx;
						const viewTransitionStyle = VIEW_TRANSITION_LABELS.has(m.annotation)
							? { viewTransitionName: `day-${m.index}` }
							: {};
						return (
							<div
								key={`label-${m.index}`}
								class={`timeline-milestone-portrait ${m.color ? `colored color-${m.color}` : ""} ${m.isToday ? "today" : ""} ${selectedDayIndex === m.index ? "selected" : ""} ${m.expanded ? "expanded" : "collapsed"}`}
								style={{
									top: `${m.topPx}px`,
									paddingLeft: `${16 + PORTRAIT_MONTHS_WIDTH + contentOffset}px`,
									...(m.color
										? { "--milestone-color": `var(--color-${m.color})` }
										: {}),
								}}
							>
								{m.expanded ? (
									<div
										class="timeline-milestone-content-portrait timeline-label"
										style={viewTransitionStyle}
										onClick={(e) => onDayClick(e as unknown as MouseEvent, m)}
									>
										<span class="timeline-milestone-emoji">
											{annotationEmojis[m.annotation] || ""}
										</span>
										<span class="timeline-milestone-label">{m.annotation}</span>
									</div>
								) : (
									<div
										class="timeline-milestone-emoji-only"
										style={viewTransitionStyle}
										onClick={(e) => onDayClick(e as unknown as MouseEvent, m)}
									>
										<span class="timeline-milestone-emoji">
											{annotationEmojis[m.annotation] || ""}
										</span>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
