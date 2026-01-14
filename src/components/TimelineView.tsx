import { useMemo, useState, useLayoutEffect, useRef } from "preact/hooks";
import type { DayInfo } from "../types";
import type { Milestone } from "./App";
import { TimelineLandscape } from "./TimelineLandscape";
import { TimelinePortrait } from "./TimelinePortrait";

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

// Milestone styling constants
const MILESTONE_PADDING = 20; // horizontal padding inside milestone
const MILESTONE_GAP = 8; // minimum gap between milestones
const EMOJI_WIDTH = 18; // approximate emoji width
const ROW_HEIGHT = 42; // vertical spacing between rows

// Build lookup of milestones with date ranges
function getDaysBetween(start: Date, end: Date): number {
	const msPerDay = 1000 * 60 * 60 * 24;
	return Math.ceil((end.getTime() - start.getTime()) / msPerDay);
}

function buildRangeMilestoneLookup(milestones: Milestone[], startDate: Date) {
	const lookup: Record<
		string,
		{ startIndex: number; endIndex: number; color?: string; emoji: string }
	> = {};
	for (const m of milestones) {
		if (m.endDate) {
			const startIndex = getDaysBetween(startDate, m.date);
			const endIndex = getDaysBetween(startDate, m.endDate);
			lookup[m.label] = {
				startIndex,
				endIndex,
				color: m.color,
				emoji: m.emoji,
			};
		}
	}
	return lookup;
}

function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

// Measure text width using canvas
function measureTextWidth(text: string, font: string): number {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return text.length * 7; // fallback
	ctx.font = font;
	return ctx.measureText(text).width;
}

// ============================================================================
// LANDSCAPE LAYOUT TYPES AND FUNCTIONS
// ============================================================================

type MilestoneWithLayout = DayInfo & {
	/** Percentage (0-100) along the timeline where this milestone appears */
	position: number;
	row: number;
	width: number;
};

// Assign rows to milestones to avoid overlaps (landscape mode)
function assignRows(
	milestones: (DayInfo & { position: number })[],
	containerWidth: number,
	annotationEmojis: Record<string, string>,
): MilestoneWithLayout[] {
	const font = "600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif";

	// Calculate width for each milestone
	const withWidths = milestones.map((m) => {
		const hasEmoji = !!annotationEmojis[m.annotation];
		const textWidth = measureTextWidth(m.annotation, font);
		const width = textWidth + MILESTONE_PADDING + (hasEmoji ? EMOJI_WIDTH : 0);
		return { ...m, width };
	});

	// Sort by position (left to right)
	const sorted = [...withWidths].sort((a, b) => a.position - b.position);

	// Track occupied ranges per row: Map<row, Array<{left, right}>>
	const rowOccupancy = new Map<
		number,
		Array<{ left: number; right: number }>
	>();

	const result: MilestoneWithLayout[] = [];

	for (const milestone of sorted) {
		// Convert percentage position to pixels, centered on the milestone
		const centerPx = (milestone.position / 100) * containerWidth;
		const leftPx = centerPx - milestone.width / 2;
		const rightPx = centerPx + milestone.width / 2;

		// Find the closest available row (searching outward from 0)
		let assignedRow = 0;
		let maxSearch = 10; // prevent infinite loop

		for (let distance = 0; distance < maxSearch; distance++) {
			// Try row at +distance, then -distance
			const rowsToTry = distance === 0 ? [0] : [distance, -distance];

			for (const row of rowsToTry) {
				const occupied = rowOccupancy.get(row) || [];
				const hasConflict = occupied.some(
					(range) =>
						!(
							rightPx + MILESTONE_GAP < range.left ||
							leftPx - MILESTONE_GAP > range.right
						),
				);

				if (!hasConflict) {
					assignedRow = row;
					break;
				}
			}

			// Check if we found a row
			const occupied = rowOccupancy.get(assignedRow) || [];
			const hasConflict = occupied.some(
				(range) =>
					!(
						rightPx + MILESTONE_GAP < range.left ||
						leftPx - MILESTONE_GAP > range.right
					),
			);
			if (!hasConflict) break;
		}

		// Record this milestone's occupancy
		const occupied = rowOccupancy.get(assignedRow) || [];
		occupied.push({ left: leftPx, right: rightPx });
		rowOccupancy.set(assignedRow, occupied);

		result.push({ ...milestone, row: assignedRow });
	}

	return result;
}

// ============================================================================
// PORTRAIT LAYOUT TYPES AND FUNCTIONS
// ============================================================================

type PortraitMilestoneWithLayout = DayInfo & {
	topPx: number;
	leftPx: number;
	expanded: boolean;
};

// Internal types for the layout algorithm
type MilestoneLayoutInput = {
	top: number;
	height: number;
	isColoured: boolean;
};

type MilestoneLayout = MilestoneLayoutInput & {
	left: number;
	width: number;
	collapsed: boolean;
};

type LayoutOptions = {
	maxWidth: number;
	expandedWidth?: number;
	collapsedWidth?: number;
};

function overlapsY(a: MilestoneLayoutInput, b: MilestoneLayoutInput): boolean {
	// vertical intervals [top, top+height) intersect?
	return !(a.top + a.height <= b.top || b.top + b.height <= a.top);
}

function layoutMilestonesCore(
	unsortedMilestones: MilestoneLayoutInput[],
	opts: LayoutOptions,
): { layouts: MilestoneLayout[]; ok: boolean } {
	const expandedWidth = opts.expandedWidth ?? 120;
	const collapsedWidth = opts.collapsedWidth ?? 24;
	const maxWidth = opts.maxWidth;

	if (collapsedWidth > maxWidth) {
		throw new Error("collapsedWidth cannot exceed maxWidth");
	}

	// Sort by top; build mutable layout objects
	const layouts: MilestoneLayout[] = [...unsortedMilestones]
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

			// collect horizontal spans for vertically-overlapping earlier milestones
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

			// slide from x = 0 to the first gap large enough
			let x = 0;
			for (const { start, end } of others) {
				if (x + w <= start) break;
				if (x < end) x = end;
			}

			base.left = x;
			const right = x + w;
			if (right > maxRight) maxRight = right;
		}

		return maxRight;
	};

	// collapse loop
	for (let iter = 0; iter < n + 2; iter++) {
		const maxRight = runPass();

		if (maxRight <= maxWidth) {
			return { layouts, ok: true };
		}

		// Find the candidate to collapse: prioritize collapsing dependencies (Y-overlapping
		// milestones to the left) of the rightmost milestone, starting with the innermost.
		const findCandidate = (): MilestoneLayout | null => {
			const expanded = layouts.filter((ms) => !ms.collapsed);
			if (expanded.length === 0) return null;

			// Find all milestones at the max right edge (could be collapsed or expanded)
			const atMaxRight = layouts.filter(
				(ms) => ms.left + ms.width === maxRight,
			);

			// Find all Y-overlapping expanded milestones (only expanded can be collapsed)
			const candidates = new Set<MilestoneLayout>();
			for (const ms of atMaxRight) {
				for (const other of expanded) {
					if (overlapsY(ms, other)) {
						candidates.add(other);
					}
				}
			}

			if (candidates.size === 0) return null;

			// Collapse the leftmost candidate, preferring non-coloured
			const arr = Array.from(candidates);
			const nonColoured = arr.filter((ms) => !ms.isColoured);
			const coloured = arr.filter((ms) => ms.isColoured);

			const findLeftmost = (list: MilestoneLayout[]): MilestoneLayout => {
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

	// Safety fallback (iteration limit reached)
	return { layouts, ok: false };
}

// Wrapper that adapts the core algorithm to work with the existing interface
function layoutTimelineMilestones(
	milestones: (DayInfo & { position: number })[],
	availableDimensions: { width: number; height: number },
): PortraitMilestoneWithLayout[] {
	const { width: availableWidth, height: containerHeight } =
		availableDimensions;
	if (milestones.length === 0 || availableWidth <= 0 || containerHeight <= 0)
		return [];

	// Layout constants
	const MILESTONE_HEIGHT = 24; // fixed pixel height of milestone elements
	const STEM_BASE_WIDTH = 48; // 16px base stem + 32px months column (content starts after stem)
	const EXPANDED_WIDTH = 120;
	const COLLAPSED_WIDTH = 24;

	// Convert input milestones to the core algorithm's format
	// position is percentage (0-100), convert to pixel top
	const inputLayouts: (MilestoneLayoutInput & {
		original: DayInfo & { position: number };
	})[] = milestones.map((m) => ({
		top: (m.position / 100) * containerHeight - MILESTONE_HEIGHT / 2,
		height: MILESTONE_HEIGHT,
		isColoured: false, // Can be extended to check for special milestones
		original: m,
	}));

	// Run the core layout algorithm
	const { layouts } = layoutMilestonesCore(
		inputLayouts.map(({ top, height, isColoured }) => ({
			top,
			height,
			isColoured,
		})),
		{
			maxWidth: availableWidth - STEM_BASE_WIDTH,
			expandedWidth: EXPANDED_WIDTH,
			collapsedWidth: COLLAPSED_WIDTH,
		},
	);

	// Sort inputLayouts by top to match layouts order (core algorithm sorts by top)
	const sortedInputs = [...inputLayouts].sort((a, b) => a.top - b.top);

	// Convert back to the output format
	return layouts.map((layout, i) => ({
		...sortedInputs[i].original,
		topPx: (sortedInputs[i].original.position / 100) * containerHeight,
		leftPx: layout.left,
		expanded: !layout.collapsed,
	}));
}

// ============================================================================
// GANTT BAR TYPES
// ============================================================================

type GanttBarBase = {
	label: string;
	startPosition: number;
	endPosition: number;
	width: number;
	color?: string;
	emoji: string;
	labelWidth: number;
	startIndex: number;
	endIndex: number;
};

type GanttBarLandscape = GanttBarBase & {
	barRow: number;
	labelRow: number;
};

type GanttBarPortrait = GanttBarBase;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type TimelineViewProps = {
	days: DayInfo[];
	windowSize: { width: number; height: number };
	startDate: Date;
	onDayClick: (e: MouseEvent, day: DayInfo) => void;
	selectedDayIndex: number | null;
	annotationEmojis: Record<string, string>;
	milestones: Milestone[];
};

export function TimelineView({
	days,
	windowSize,
	startDate,
	onDayClick,
	selectedDayIndex,
	annotationEmojis,
	milestones,
}: TimelineViewProps) {
	const totalDays = days.length;
	const isLandscape = windowSize.width > windowSize.height;

	// Measure the milestones container position from the DOM
	const [portraitLayout, setPortraitLayout] = useState<{
		left: number;
		top: number;
		width: number;
		height: number;
	} | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);

	// Measure container position when in portrait mode
	useLayoutEffect(() => {
		if (!isLandscape && containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			setPortraitLayout({
				left: Math.floor(rect.left),
				top: Math.floor(rect.top),
				// Smaller margin on mobile (narrow screens)
				width: Math.floor(windowSize.width - rect.left - 10),
				height: Math.floor(rect.height),
			});
		}
	}, [isLandscape, windowSize.width, windowSize.height]);

	// Fallback values until measured
	const portraitAvailableWidth =
		portraitLayout?.width ?? Math.floor(windowSize.width * 0.35);
	const portraitContainerHeight =
		portraitLayout?.height ?? Math.floor(windowSize.height * 0.85);

	// Build range milestone lookup from passed milestones
	const rangeMilestoneLookup = useMemo(() => {
		return buildRangeMilestoneLookup(milestones, startDate);
	}, [milestones, startDate]);

	// Find today's index
	const todayIndex = days.findIndex((d) => d.isToday);
	const todayPosition = todayIndex >= 0 ? (todayIndex / totalDays) * 100 : -1;

	// Get month markers
	const monthMarkers = useMemo(() => {
		const markers: { month: string; year: number; position: number }[] = [];
		let lastMonth = -1;

		for (let i = 0; i < totalDays; i++) {
			const date = addDays(startDate, i);
			const month = date.getMonth();
			if (month !== lastMonth) {
				markers.push({
					month: MONTHS[month],
					year: date.getFullYear(),
					position: (i / totalDays) * 100,
				});
				lastMonth = month;
			}
		}
		return markers;
	}, [totalDays, startDate]);

	// Get week markers (pregnancy weeks 1-40)
	const weekMarkers = useMemo(() => {
		const markers: { week: number; position: number }[] = [];
		for (let i = 0; i < totalDays; i += 7) {
			const weekNum = Math.floor(i / 7) + 1;
			markers.push({
				week: weekNum,
				position: (i / totalDays) * 100,
			});
		}
		return markers;
	}, [totalDays]);

	// Get base milestones (non-range) with positions
	const baseMilestones = useMemo(() => {
		return days
			.filter(
				(d) =>
					d.annotation &&
					d.annotation !== "Today" &&
					!rangeMilestoneLookup[d.annotation],
			)
			.map((d) => ({
				...d,
				position: (d.index / totalDays) * 100,
			}));
	}, [days, totalDays]);

	// Landscape: Get point milestones with row assignments
	const landscapeMilestones = useMemo(() => {
		if (!isLandscape) return [];
		const containerWidth = windowSize.width - 120;
		return assignRows(baseMilestones, containerWidth, annotationEmojis);
	}, [baseMilestones, windowSize.width, annotationEmojis, isLandscape]);

	// Portrait: Get point milestones with column assignments
	const portraitMilestones = useMemo(() => {
		if (isLandscape) return [];
		return layoutTimelineMilestones(baseMilestones, {
			width: portraitAvailableWidth,
			height: portraitContainerHeight,
		});
	}, [
		baseMilestones,
		isLandscape,
		portraitAvailableWidth,
		portraitContainerHeight,
	]);

	// Landscape: Calculate row range for dynamic height
	const { minRow, maxRow, milestonesHeight } = useMemo(() => {
		if (!isLandscape || landscapeMilestones.length === 0) {
			return { minRow: 0, maxRow: 0, milestonesHeight: ROW_HEIGHT };
		}
		const rows = landscapeMilestones.map((m) => m.row);
		const min = Math.min(...rows);
		const max = Math.max(...rows);
		const aboveRows = max + 1;
		const belowRows = Math.abs(min);
		return {
			minRow: min,
			maxRow: max,
			milestonesHeight: (aboveRows + belowRows) * ROW_HEIGHT,
		};
	}, [landscapeMilestones, isLandscape]);

	// Landscape: Get Gantt bars with row assignments
	const landscapeGanttBars = useMemo((): GanttBarLandscape[] => {
		if (!isLandscape) return [];

		const font =
			"600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif";
		const containerWidth = windowSize.width - 120;

		const bars: Omit<GanttBarLandscape, "barRow" | "labelRow">[] = [];
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

		// Sort by start position for row assignment
		bars.sort((a, b) => a.startPosition - b.startPosition);

		// Assign bar rows (for overlapping date ranges)
		const barRowOccupancy: Array<{ left: number; right: number }>[] = [];
		// Assign label rows (for label collision detection)
		const labelRowOccupancy: Array<{ left: number; right: number }>[] = [];

		const result: GanttBarLandscape[] = [];
		for (const bar of bars) {
			const barLeftPx = (bar.startPosition / 100) * containerWidth;
			const barRightPx = (bar.endPosition / 100) * containerWidth;

			// Find first available bar row
			let assignedBarRow = 0;
			for (let row = 0; row < barRowOccupancy.length + 1; row++) {
				const occupied = barRowOccupancy[row] || [];
				const hasConflict = occupied.some(
					(range) =>
						!(barRightPx + 4 < range.left || barLeftPx - 4 > range.right),
				);
				if (!hasConflict) {
					assignedBarRow = row;
					break;
				}
			}

			// Record bar occupancy
			if (!barRowOccupancy[assignedBarRow])
				barRowOccupancy[assignedBarRow] = [];
			barRowOccupancy[assignedBarRow].push({
				left: barLeftPx,
				right: barRightPx,
			});

			// Label is centered on middle of bar
			const labelCenterPx = (barLeftPx + barRightPx) / 2;
			const labelLeftPx = labelCenterPx - bar.labelWidth / 2;
			const labelRightPx = labelCenterPx + bar.labelWidth / 2;

			// Find first available label row
			let assignedLabelRow = 0;
			for (let row = 0; row < labelRowOccupancy.length + 1; row++) {
				const occupied = labelRowOccupancy[row] || [];
				const hasConflict = occupied.some(
					(range) =>
						!(
							labelRightPx + MILESTONE_GAP < range.left ||
							labelLeftPx - MILESTONE_GAP > range.right
						),
				);
				if (!hasConflict) {
					assignedLabelRow = row;
					break;
				}
			}

			// Record label occupancy
			if (!labelRowOccupancy[assignedLabelRow])
				labelRowOccupancy[assignedLabelRow] = [];
			labelRowOccupancy[assignedLabelRow].push({
				left: labelLeftPx,
				right: labelRightPx,
			});

			result.push({
				...bar,
				barRow: assignedBarRow,
				labelRow: assignedLabelRow,
			});
		}

		return result;
	}, [totalDays, windowSize.width, isLandscape]);

	// Portrait: Get Gantt bars (simpler, no row assignments needed)
	const portraitGanttBars = useMemo((): GanttBarPortrait[] => {
		if (isLandscape) return [];

		const font =
			"600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif";

		const bars: GanttBarPortrait[] = [];
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

		return bars.sort((a, b) => a.startPosition - b.startPosition);
	}, [totalDays, isLandscape]);

	// Landscape: Gantt row counts
	const { ganttBarRowCount, ganttLabelRowCount } = useMemo(() => {
		if (!isLandscape || landscapeGanttBars.length === 0) {
			return { ganttBarRowCount: 0, ganttLabelRowCount: 0 };
		}
		return {
			ganttBarRowCount:
				Math.max(...landscapeGanttBars.map((b) => b.barRow)) + 1,
			ganttLabelRowCount:
				Math.max(...landscapeGanttBars.map((b) => b.labelRow)) + 1,
		};
	}, [landscapeGanttBars, isLandscape]);

	// Render appropriate view
	if (isLandscape) {
		return (
			<TimelineLandscape
				days={days}
				milestones={landscapeMilestones}
				ganttBars={landscapeGanttBars}
				monthMarkers={monthMarkers}
				weekMarkers={weekMarkers}
				todayIndex={todayIndex}
				todayPosition={todayPosition}
				totalDays={totalDays}
				selectedDayIndex={selectedDayIndex}
				annotationEmojis={annotationEmojis}
				onDayClick={onDayClick}
				milestonesHeight={milestonesHeight}
				minRow={minRow}
				maxRow={maxRow}
				ganttBarRowCount={ganttBarRowCount}
				ganttLabelRowCount={ganttLabelRowCount}
			/>
		);
	}

	return (
		<>
			<TimelinePortrait
				days={days}
				milestones={portraitMilestones}
				ganttBars={portraitGanttBars}
				monthMarkers={monthMarkers}
				weekMarkers={weekMarkers}
				todayIndex={todayIndex}
				todayPosition={todayPosition}
				totalDays={totalDays}
				selectedDayIndex={selectedDayIndex}
				annotationEmojis={annotationEmojis}
				onDayClick={onDayClick}
				milestonesContainerRef={containerRef}
			/>
		</>
	);
}
