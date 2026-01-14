import { useRef, useState, useCallback } from "preact/hooks";
import type { DayInfo } from "../types";
import { highlightedDays } from "./App";

// Milestones that get view transitions
const VIEW_TRANSITION_LABELS = new Set([
	"Start",
	"Announce!",
	"Third Trimester",
	"Due",
]);

// Milestone styling constants
const ROW_HEIGHT = 42; // vertical spacing between rows
const GANTT_ROW_HEIGHT = 24; // height of gantt bar rows
const GANTT_BAR_HEIGHT = 18; // height of individual gantt bars

type MilestoneWithLayout = DayInfo & {
	position: number;
	row: number;
	width: number;
};

type GanttBar = {
	label: string;
	startPosition: number;
	endPosition: number;
	width: number;
	color?: string;
	emoji: string;
	barRow: number;
	labelRow: number;
	labelWidth: number;
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

type TimelineLandscapeProps = {
	days: DayInfo[];
	milestones: MilestoneWithLayout[];
	ganttBars: GanttBar[];
	monthMarkers: MonthMarker[];
	weekMarkers: WeekMarker[];
	todayIndex: number;
	todayPosition: number;
	totalDays: number;
	selectedDayIndex: number | null;
	annotationEmojis: Record<string, string>;
	onDayClick: (e: MouseEvent, day: DayInfo) => void;
	milestonesHeight: number;
	minRow: number;
	maxRow: number;
	ganttBarRowCount: number;
	ganttLabelRowCount: number;
};

export function TimelineLandscape({
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
	milestonesHeight,
	minRow,
	maxRow,
	ganttBarRowCount,
	ganttLabelRowCount,
}: TimelineLandscapeProps) {
	const lineRef = useRef<HTMLDivElement>(null);
	const [hoverPosition, setHoverPosition] = useState<number | null>(null);
	const [hoverDayIndex, setHoverDayIndex] = useState<number | null>(null);

	const handleLineMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!lineRef.current) return;
			const rect = lineRef.current.getBoundingClientRect();
			const pos = e.clientX - rect.left;
			const size = rect.width;
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
		<div class="timeline-view landscape">
			<div class="timeline-content-landscape">
				{/* Milestones container */}
				<div
					class="timeline-milestones-landscape"
					style={{ height: `${milestonesHeight}px` }}
				>
					{milestones.map((m) => {
						// Stem height determines vertical position - taller stem = higher up
						// All milestones anchored at bottom: 0, stem creates the spacing
						const stemHeight = 45 + (m.row - minRow) * ROW_HEIGHT;
						// Lower rows get higher z-index so their content appears above stems from higher rows
						const zIndex = maxRow - m.row + 1;

						const viewTransitionStyle = VIEW_TRANSITION_LABELS.has(m.annotation)
							? { viewTransitionName: `day-${m.index}` }
							: {};
						return (
							<div
								key={m.index}
								class={`timeline-milestone-landscape ${m.color ? `colored color-${m.color}` : ""} ${m.isToday ? "today" : ""} ${selectedDayIndex === m.index ? "selected" : ""} ${highlightedDays.value.indices.has(m.index) ? "highlighted" : ""}`}
								style={{
									left: `${m.position}%`,
									zIndex,
									...(m.color
										? { "--milestone-color": `var(--color-${m.color})` }
										: {}),
									...(highlightedDays.value.indices.has(m.index) &&
									highlightedDays.value.color
										? {
												"--highlight-color": `var(--color-${highlightedDays.value.color})`,
											}
										: {}),
								}}
								onClick={(e) => onDayClick(e as unknown as MouseEvent, m)}
							>
								<div
									class="timeline-milestone-content-landscape timeline-label"
									style={viewTransitionStyle}
								>
									<span class="timeline-milestone-emoji">
										{annotationEmojis[m.annotation] || ""}
									</span>
									<span class="timeline-milestone-label">{m.annotation}</span>
								</div>
								<div
									class="timeline-milestone-stem-landscape"
									style={{ height: `${stemHeight}px` }}
								/>
							</div>
						);
					})}
				</div>

				{/* Line area with months above */}
				<div class="timeline-line-area-landscape">
					{/* Month markers above the line */}
					<div class="timeline-months-landscape">
						{monthMarkers.map((m, i) => (
							<div
								key={i}
								class="timeline-month"
								style={{ left: `${m.position}%` }}
							>
								{m.month}
							</div>
						))}
					</div>

					{/* The timeline line */}
					<div
						ref={lineRef}
						class="timeline-line-landscape"
						onMouseMove={handleLineMouseMove as unknown as (e: Event) => void}
						onMouseLeave={handleLineMouseLeave}
					>
						{/* Progress fill */}
						<div
							class="timeline-progress-landscape"
							style={{ width: `${todayPosition}%` }}
						/>
						{/* Hover dot */}
						{hoverPosition !== null &&
							hoverDayIndex !== null &&
							hoverDayIndex !== todayIndex && (
								<div
									class={`timeline-hover-dot-landscape ${hoverDayIndex < (todayIndex >= 0 ? todayIndex : totalDays) ? "passed" : "future"}`}
									style={{ left: `${hoverPosition}%` }}
									onClick={(e) => {
										const day = days[hoverDayIndex];
										if (day) onDayClick(e as unknown as MouseEvent, day);
									}}
								/>
							)}
						{/* Today marker */}
						{todayIndex >= 0 && (
							<div
								class="timeline-today-landscape"
								style={{
									left: `${todayPosition}%`,
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
				</div>

				{/* Week markers below the line */}
				<div class="timeline-weeks-landscape">
					{weekMarkers.map((w) => (
						<div
							key={w.week}
							class="timeline-week"
							style={{ left: `${w.position}%` }}
						>
							{w.week}
						</div>
					))}
				</div>

				{/* Gantt section for range milestones */}
				{ganttBars.length > 0 && (
					<div
						class="timeline-gantt-section-landscape"
						style={{
							height: `${ganttLabelRowCount * ROW_HEIGHT + ganttBarRowCount * GANTT_ROW_HEIGHT + 10}px`,
						}}
					>
						{/* Bars at top */}
						<div
							class="timeline-gantt-bars-landscape"
							style={{ height: `${ganttBarRowCount * GANTT_ROW_HEIGHT}px` }}
						>
							{ganttBars.map((bar) => {
								const isHighlighted = highlightedDays.value.indices.has(
									bar.startIndex,
								);
								return (
									<div
										key={`bar-${bar.label}`}
										class={`timeline-gantt-bar-landscape ${bar.color ? `colored color-${bar.color}` : ""} ${isHighlighted ? "highlighted" : ""}`}
										style={{
											left: `${bar.startPosition}%`,
											width: `${bar.width}%`,
											top: `${bar.barRow * GANTT_ROW_HEIGHT + (GANTT_ROW_HEIGHT - GANTT_BAR_HEIGHT) / 2}px`,
											height: `${GANTT_BAR_HEIGHT}px`,
											...(bar.color
												? { "--bar-color": `var(--color-${bar.color})` }
												: {}),
											...(isHighlighted && highlightedDays.value.color
												? {
														"--highlight-color": `var(--color-${highlightedDays.value.color})`,
													}
												: {}),
										}}
										onClick={(e) => {
											const day = days[bar.startIndex];
											if (day) onDayClick(e as unknown as MouseEvent, day);
										}}
									/>
								);
							})}
						</div>
						{/* Labels below bars with stems going up from center of range */}
						<div
							class="timeline-gantt-labels-landscape"
							style={{ height: `${ganttLabelRowCount * ROW_HEIGHT}px` }}
						>
							{ganttBars.map((bar) => {
								const isHighlighted = highlightedDays.value.indices.has(
									bar.startIndex,
								);
								const stemHeight = 20 + bar.labelRow * ROW_HEIGHT;
								const centerPosition =
									(bar.startPosition + bar.endPosition) / 2;
								return (
									<div
										key={`label-${bar.label}`}
										class={`timeline-gantt-item-landscape ${bar.color ? `colored color-${bar.color}` : ""} ${isHighlighted ? "highlighted" : ""}`}
										style={{
											left: `${centerPosition}%`,
											top: 0,
											...(bar.color
												? { "--bar-color": `var(--color-${bar.color})` }
												: {}),
											...(isHighlighted && highlightedDays.value.color
												? {
														"--highlight-color": `var(--color-${highlightedDays.value.color})`,
													}
												: {}),
										}}
										onClick={(e) => {
											const day = days[bar.startIndex];
											if (day) onDayClick(e as unknown as MouseEvent, day);
										}}
									>
										<div
											class="timeline-gantt-stem-landscape"
											style={{ height: `${stemHeight}px` }}
										/>
										<div class="timeline-gantt-label-content-landscape timeline-label">
											<span class="timeline-gantt-label-emoji">
												{bar.emoji}
											</span>
											<span class="timeline-gantt-label-text">{bar.label}</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
