import {
	useRef,
	useState,
	useCallback,
	useMemo,
	useLayoutEffect,
} from "preact/hooks";
import type { DayInfo } from "../types";
import type {
	MonthMarker,
	WeekMarker,
	RangeMilestoneLookup,
	BaseMilestone,
	GanttBarBase,
} from "./timelineTypes";

// Milestones that get view transitions
const VIEW_TRANSITION_LABELS = new Set(["Start", "Due"]);

// Portrait milestone layout constants
const PORTRAIT_MONTHS_WIDTH = 32; // width of months column that stems must cross
const MILESTONE_PADDING = 20; // horizontal padding inside milestone
const EMOJI_WIDTH = 18; // approximate emoji width

// ============================================================================
// LAYOUT TYPES
// ============================================================================

type PortraitMilestoneWithLayout = BaseMilestone & {
	topPx: number;
	leftPx: number;
	expanded: boolean;
};

type LayoutInput = {
	top: number;
	height: number;
	isColoured: boolean;
};

type LayoutOutput = {
	left: number;
	width: number;
	collapsed: boolean;
};

type LayoutOptions = {
	maxWidth: number;
	expandedWidth?: number;
	collapsedWidth?: number;
};

// ============================================================================
// LAYOUT FUNCTIONS
// ============================================================================

function measureTextWidth(text: string, font: string): number {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return text.length * 7; // fallback
	ctx.font = font;
	return ctx.measureText(text).width;
}

// Gap between milestones (2px padding on each side = 4px between items)
const MILESTONE_GAP = 4;

function overlapsY(a: LayoutInput, b: LayoutInput): boolean {
	// Include gap in vertical overlap check
	return !(a.top + a.height + MILESTONE_GAP <= b.top || b.top + b.height + MILESTONE_GAP <= a.top);
}

function layoutMilestonesCore<T extends LayoutInput>(
	unsortedMilestones: T[],
	opts: LayoutOptions,
): { layouts: (T & LayoutOutput)[]; ok: boolean } {
	const expandedWidth = opts.expandedWidth ?? 120;
	const collapsedWidth = opts.collapsedWidth ?? 24;
	const maxWidth = opts.maxWidth;

	if (collapsedWidth > maxWidth) {
		throw new Error("collapsedWidth cannot exceed maxWidth");
	}

	const layouts: (T & LayoutOutput)[] = [...unsortedMilestones]
		.sort((a, b) => a.top - b.top)
		.map((ms) => ({
			...ms,
			left: 0,
			width: expandedWidth,
			collapsed: false,
		}));

	const n = layouts.length;

	const runPass = () => {
		let maxRight = 0;

		for (let i = 0; i < n; i++) {
			const base = layouts[i];
			const w = base.width;

			const others: { start: number; end: number }[] = [];

			for (let j = 0; j < i; j++) {
				const other = layouts[j];
				if (overlapsY(base, other)) {
					others.push({
						start: other.left,
						end: other.left + other.width,
					});
				}
			}

			others.sort((a, b) => a.start - b.start);

			let x = 0;
			for (const { start, end } of others) {
				if (x + w + MILESTONE_GAP <= start) break;
				if (x < end + MILESTONE_GAP) x = end + MILESTONE_GAP;
			}

			base.left = x;
			const right = x + w;
			if (right > maxRight) maxRight = right;
		}

		return maxRight;
	};

	for (let iter = 0; iter < n + 2; iter++) {
		const maxRight = runPass();

		if (maxRight <= maxWidth) {
			return { layouts, ok: true };
		}

		const findCandidate = (): (T & LayoutOutput) | null => {
			const expanded = layouts.filter((ms) => !ms.collapsed);
			if (expanded.length === 0) return null;

			const atMaxRight = layouts.filter(
				(ms) => ms.left + ms.width === maxRight,
			);

			const candidates = new Set<T & LayoutOutput>();
			for (const ms of atMaxRight) {
				for (const other of expanded) {
					if (overlapsY(ms, other)) {
						candidates.add(other);
					}
				}
			}

			if (candidates.size === 0) return null;

			const arr = Array.from(candidates);
			const nonColoured = arr.filter((ms) => !ms.isColoured);
			const coloured = arr.filter((ms) => ms.isColoured);

			const findLeftmost = (list: (T & LayoutOutput)[]): T & LayoutOutput => {
				let best = list[0];
				for (const ms of list) {
					if (ms.left < best.left) best = ms;
				}
				return best;
			};

			if (nonColoured.length > 0) return findLeftmost(nonColoured);
			if (coloured.length > 0) return findLeftmost(coloured);
			return arr[0];
		};

		const candidate = findCandidate();
		if (!candidate) {
			return { layouts, ok: false };
		}

		candidate.collapsed = true;
		candidate.width = collapsedWidth;
	}

	return { layouts, ok: false };
}

function layoutPortraitMilestones(
	milestones: BaseMilestone[],
	availableDimensions: { width: number; height: number },
): PortraitMilestoneWithLayout[] {
	const { width: availableWidth, height: containerHeight } =
		availableDimensions;
	if (milestones.length === 0 || availableWidth <= 0 || containerHeight <= 0)
		return [];

	const MILESTONE_HEIGHT = 24;
	const STEM_BASE_WIDTH = 48;
	const EXPANDED_WIDTH = 120;
	const COLLAPSED_WIDTH = 24;

	const inputLayouts = milestones.map((m) => ({
		...m,
		top: (m.position / 100) * containerHeight - MILESTONE_HEIGHT / 2,
		height: MILESTONE_HEIGHT,
		isColoured: !!m.color,
	}));

	const { layouts } = layoutMilestonesCore(inputLayouts, {
		maxWidth: availableWidth - STEM_BASE_WIDTH,
		expandedWidth: EXPANDED_WIDTH,
		collapsedWidth: COLLAPSED_WIDTH,
	});

	return layouts.map((layout) => ({
		...layout,
		topPx: (layout.position / 100) * containerHeight,
		leftPx: layout.left,
		expanded: !layout.collapsed,
	}));
}

type GanttBarPortrait = GanttBarBase & {
	labelLeftPx: number;
	labelExpanded: boolean;
};

function computeGanttBars(
	rangeMilestoneLookup: RangeMilestoneLookup,
	totalDays: number,
	containerHeight: number,
	maxWidth: number,
): GanttBarPortrait[] {
	const font = "600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif";
	const MILESTONE_HEIGHT = 24;
	const EXPANDED_WIDTH = 120;
	const COLLAPSED_WIDTH = 24;

	const bars: GanttBarBase[] = [];
	for (const [label, range] of Object.entries(rangeMilestoneLookup)) {
		const startPosition = (range.startIndex / totalDays) * 100;
		const endPosition = (range.endIndex / totalDays) * 100;
		const textWidth = measureTextWidth(label, font);
		const labelWidth = textWidth + MILESTONE_PADDING + EMOJI_WIDTH;
		bars.push({
			label,
			startPosition,
			endPosition,
			width: endPosition - startPosition,
			color: range.color,
			emoji: range.emoji,
			labelWidth,
			startIndex: range.startIndex,
			endIndex: range.endIndex,
		});
	}

	bars.sort((a, b) => a.startPosition - b.startPosition);

	// Use collapsing algorithm for labels
	// Labels have fixed Y position (center of range), stack horizontally when overlapping
	const labelInputs = bars.map((bar) => {
		const centerPosition = (bar.startPosition + bar.endPosition) / 2;
		const topPx = (centerPosition / 100) * containerHeight;
		return {
			...bar,
			barWidth: bar.width, // preserve original bar width
			top: topPx - MILESTONE_HEIGHT / 2,
			height: MILESTONE_HEIGHT,
			isColoured: !!bar.color,
		};
	});

	const { layouts } = layoutMilestonesCore(labelInputs, {
		maxWidth,
		expandedWidth: EXPANDED_WIDTH,
		collapsedWidth: COLLAPSED_WIDTH,
	});

	return layouts.map((layout) => ({
		...layout,
		width: layout.barWidth, // restore original bar width
		labelLeftPx: layout.left,
		labelExpanded: !layout.collapsed,
	}));
}

// ============================================================================
// COMPONENT
// ============================================================================

type TimelinePortraitProps = {
	days: DayInfo[];
	baseMilestones: BaseMilestone[];
	rangeMilestoneLookup: RangeMilestoneLookup;
	monthMarkers: MonthMarker[];
	weekMarkers: WeekMarker[];
	todayIndex: number;
	todayPosition: number;
	totalDays: number;
	selectedDayIndex: number | null;
	annotationEmojis: Record<string, string>;
	onDayClick: (e: MouseEvent, day: DayInfo) => void;
	windowSize: { width: number; height: number };
};

export function TimelinePortrait({
	days,
	baseMilestones,
	rangeMilestoneLookup,
	monthMarkers,
	weekMarkers,
	todayIndex,
	todayPosition,
	totalDays,
	selectedDayIndex,
	annotationEmojis,
	onDayClick,
	windowSize,
}: TimelinePortraitProps) {
	const lineRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [hoverPosition, setHoverPosition] = useState<number | null>(null);
	const [hoverDayIndex, setHoverDayIndex] = useState<number | null>(null);

	// Measure the milestones container position from the DOM
	const [portraitLayout, setPortraitLayout] = useState<{
		width: number;
		height: number;
	} | null>(null);

	useLayoutEffect(() => {
		if (containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			setPortraitLayout({
				width: Math.floor(windowSize.width - rect.left - 10),
				height: Math.floor(rect.height),
			});
		}
	}, [windowSize.width, windowSize.height]);

	const availableWidth =
		portraitLayout?.width ?? Math.floor(windowSize.width * 0.35);
	const containerHeight =
		portraitLayout?.height ?? Math.floor(windowSize.height * 0.85);

	// Compute milestone layouts
	const milestones = useMemo(() => {
		return layoutPortraitMilestones(baseMilestones, {
			width: availableWidth,
			height: containerHeight,
		});
	}, [baseMilestones, availableWidth, containerHeight]);

	// Max width for gantt labels (limited space on left side)
	const maxGanttLabelWidth = Math.floor(windowSize.width * 0.4);

	// Compute gantt bars
	const ganttBars = useMemo(() => {
		return computeGanttBars(rangeMilestoneLookup, totalDays, containerHeight, maxGanttLabelWidth);
	}, [rangeMilestoneLookup, totalDays, containerHeight, maxGanttLabelWidth]);

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
							// Stem width extends based on label horizontal offset
							const stemWidth = 16 + bar.labelLeftPx;
							return (
								<div
									key={`label-${bar.label}`}
									class={`timeline-gantt-item-portrait ${bar.color ? `colored color-${bar.color}` : ""} ${bar.labelExpanded ? "expanded" : "collapsed"}`}
									style={{
										top: `${centerPosition}%`,
										...(bar.color
											? { "--bar-color": `var(--color-${bar.color})` }
											: {}),
									}}
								>
									{bar.labelExpanded ? (
										<div
											class="timeline-gantt-label-portrait timeline-label"
											style={{ marginRight: `${bar.labelLeftPx}px` }}
											onClick={(e) => {
												const day = days[bar.startIndex];
												if (day) onDayClick(e as unknown as MouseEvent, day);
											}}
										>
											<span class="timeline-gantt-label-emoji">{bar.emoji}</span>
											<span class="timeline-gantt-label-text">{bar.label}</span>
										</div>
									) : (
										<div
											class="timeline-gantt-emoji-only-portrait"
											style={{ marginRight: `${bar.labelLeftPx}px` }}
											onClick={(e) => {
												const day = days[bar.startIndex];
												if (day) onDayClick(e as unknown as MouseEvent, day);
											}}
										>
											<span class="timeline-gantt-label-emoji">{bar.emoji}</span>
										</div>
									)}
									<div
										class="timeline-gantt-stem-portrait"
										style={{ width: `${stemWidth}px` }}
									/>
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
				<div class="timeline-milestones-portrait" ref={containerRef}>
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
