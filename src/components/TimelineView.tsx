import { useMemo, useState, useLayoutEffect, useRef } from 'preact/hooks'
import type { DayInfo } from '../types'
import type { Milestone } from './App'
import { TimelineLandscape } from './TimelineLandscape'
import { TimelinePortrait } from './TimelinePortrait'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Milestone styling constants
const MILESTONE_PADDING = 20 // horizontal padding inside milestone
const MILESTONE_GAP = 8 // minimum gap between milestones
const EMOJI_WIDTH = 18 // approximate emoji width
const ROW_HEIGHT = 42 // vertical spacing between rows


// Build lookup of milestones with date ranges
function getDaysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay)
}

function buildRangeMilestoneLookup(milestones: Milestone[], startDate: Date) {
  const lookup: Record<string, { startIndex: number; endIndex: number; color?: string; emoji: string }> = {}
  for (const m of milestones) {
    if (m.endDate) {
      const startIndex = getDaysBetween(startDate, m.date)
      const endIndex = getDaysBetween(startDate, m.endDate)
      lookup[m.label] = { startIndex, endIndex, color: m.color, emoji: m.emoji }
    }
  }
  return lookup
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

// Measure text width using canvas
function measureTextWidth(text: string, font: string): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length * 7 // fallback
  ctx.font = font
  return ctx.measureText(text).width
}

// ============================================================================
// LANDSCAPE LAYOUT TYPES AND FUNCTIONS
// ============================================================================

type MilestoneWithLayout = DayInfo & {
  /** Percentage (0-100) along the timeline where this milestone appears */
  position: number
  row: number
  width: number
}

// Assign rows to milestones to avoid overlaps (landscape mode)
function assignRows(
  milestones: (DayInfo & { position: number })[],
  containerWidth: number,
  annotationEmojis: Record<string, string>
): MilestoneWithLayout[] {
  const font = '600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif'

  // Calculate width for each milestone
  const withWidths = milestones.map(m => {
    const hasEmoji = !!annotationEmojis[m.annotation]
    const textWidth = measureTextWidth(m.annotation, font)
    const width = textWidth + MILESTONE_PADDING + (hasEmoji ? EMOJI_WIDTH : 0)
    return { ...m, width }
  })

  // Sort by position (left to right)
  const sorted = [...withWidths].sort((a, b) => a.position - b.position)

  // Track occupied ranges per row: Map<row, Array<{left, right}>>
  const rowOccupancy = new Map<number, Array<{ left: number; right: number }>>()

  const result: MilestoneWithLayout[] = []

  for (const milestone of sorted) {
    // Convert percentage position to pixels, centered on the milestone
    const centerPx = (milestone.position / 100) * containerWidth
    const leftPx = centerPx - milestone.width / 2
    const rightPx = centerPx + milestone.width / 2

    // Find the closest available row (searching outward from 0)
    let assignedRow = 0
    let maxSearch = 10 // prevent infinite loop

    for (let distance = 0; distance < maxSearch; distance++) {
      // Try row at +distance, then -distance
      const rowsToTry = distance === 0 ? [0] : [distance, -distance]

      for (const row of rowsToTry) {
        const occupied = rowOccupancy.get(row) || []
        const hasConflict = occupied.some(
          range => !(rightPx + MILESTONE_GAP < range.left || leftPx - MILESTONE_GAP > range.right)
        )

        if (!hasConflict) {
          assignedRow = row
          break
        }
      }

      // Check if we found a row
      const occupied = rowOccupancy.get(assignedRow) || []
      const hasConflict = occupied.some(
        range => !(rightPx + MILESTONE_GAP < range.left || leftPx - MILESTONE_GAP > range.right)
      )
      if (!hasConflict) break
    }

    // Record this milestone's occupancy
    const occupied = rowOccupancy.get(assignedRow) || []
    occupied.push({ left: leftPx, right: rightPx })
    rowOccupancy.set(assignedRow, occupied)

    result.push({ ...milestone, row: assignedRow })
  }

  return result
}

// ============================================================================
// PORTRAIT LAYOUT TYPES AND FUNCTIONS
// ============================================================================

type PortraitMilestoneWithLayout = DayInfo & {
  topPx: number
  leftPx: number
  expanded: boolean
}

// Lane-based layout algorithm for portrait milestones
// Uses interval graph coloring to assign lanes, then optimizes expansion
function layoutPortraitMilestones(
  milestones: (DayInfo & { position: number })[],
  availableDimensions: { width: number; height: number }
): PortraitMilestoneWithLayout[] {
  const { width: availableWidth, height: containerHeight } = availableDimensions
  if (milestones.length === 0 || availableWidth <= 0 || containerHeight <= 0) return []

  // Layout constants
  const COLLAPSED_WIDTH = 24
  const MILESTONE_HEIGHT = 24 // fixed pixel height of milestone elements
  const VERTICAL_GAP = 4 // minimum pixel gap between milestones
  const HORIZONTAL_GAP = 4 // minimum pixel gap between horizontally adjacent items
  const STEM_BASE_WIDTH = 48 // 16px base stem + 32px months column (content starts after stem)

  // Estimate expanded label width: ~9px per char + emoji + padding + buffer for CSS truncation
  const estimateLabelWidth = (label: string): number => Math.min(180, label.length * 9 + 50)

  // Check if two items conflict vertically
  // Convert position (%) to pixel top, then check if bounding boxes overlap
  const conflictsVertically = (a: { position: number }, b: { position: number }): boolean => {
    // position is center point as percentage, convert to pixel top
    const aTopPx = (a.position / 100) * containerHeight - MILESTONE_HEIGHT / 2
    const aBottomPx = aTopPx + MILESTONE_HEIGHT
    const bTopPx = (b.position / 100) * containerHeight - MILESTONE_HEIGHT / 2
    const bBottomPx = bTopPx + MILESTONE_HEIGHT
    // Check if ranges overlap with minimum gap
    return Math.max(aTopPx, bTopPx) < Math.min(aBottomPx, bBottomPx) + VERTICAL_GAP
  }

  // Sort by position (top to bottom)
  const sorted = [...milestones].sort((a, b) => a.position - b.position)
  const itemIds = new Map(sorted.map((m, i) => [m, i]))

  // Assign lanes using greedy interval graph coloring
  const lanes: typeof sorted[] = []
  const laneAssignment = new Map<number, number>()

  for (const item of sorted) {
    const itemId = itemIds.get(item)!
    let assignedLane = -1

    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      if (!lanes[laneIdx].some(other => conflictsVertically(item, other))) {
        assignedLane = laneIdx
        break
      }
    }

    if (assignedLane === -1) {
      assignedLane = lanes.length
      lanes.push([])
    }

    lanes[assignedLane].push(item)
    laneAssignment.set(itemId, assignedLane)
  }

  // Build conflict map
  const conflicts = new Map<number, Set<number>>()
  for (let i = 0; i < sorted.length; i++) {
    conflicts.set(i, new Set())
  }
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (conflictsVertically(sorted[i], sorted[j])) {
        conflicts.get(i)!.add(j)
        conflicts.get(j)!.add(i)
      }
    }
  }

  // Calculate x positions using two-pass greedy packing
  // Pass 1: Place items that can fit at x=0 (no conflicts with other x=0 items)
  // Pass 2: Place remaining items in the first available gap
  const calculateXPositions = (expanded: Map<number, boolean>): Map<number, number> => {
    const xPositions = new Map<number, number>()
    const placed = new Set<number>()

    // Pass 1: Greedily place items at x=0 if they don't conflict with existing x=0 items
    for (const item of sorted) {
      const itemId = itemIds.get(item)!
      const itemConflicts = conflicts.get(itemId)!

      // Check if this item conflicts with any already-placed item at x=0
      let canPlaceAtZero = true
      for (const conflictId of itemConflicts) {
        if (placed.has(conflictId) && xPositions.get(conflictId) === 0) {
          // This item conflicts vertically with something already at x=0
          // So both can't be at x=0
          canPlaceAtZero = false
          break
        }
      }

      if (canPlaceAtZero) {
        xPositions.set(itemId, 0)
        placed.add(itemId)
      }
    }

    // Pass 2: Place remaining items in gaps
    for (const item of sorted) {
      const itemId = itemIds.get(item)!
      if (placed.has(itemId)) continue

      const itemConflicts = conflicts.get(itemId)!
      const itemWidth = expanded.get(itemId)
        ? estimateLabelWidth(item.annotation)
        : COLLAPSED_WIDTH

      // Collect blocked ranges from all placed conflicting items (including horizontal gap)
      const blockedRanges: { start: number; end: number }[] = []
      for (const conflictId of itemConflicts) {
        if (placed.has(conflictId)) {
          const conflictX = xPositions.get(conflictId)!
          const conflictWidth = expanded.get(conflictId)
            ? estimateLabelWidth(sorted[conflictId].annotation)
            : COLLAPSED_WIDTH
          blockedRanges.push({ start: conflictX, end: conflictX + conflictWidth + HORIZONTAL_GAP })
        }
      }

      // Sort and find first gap
      blockedRanges.sort((a, b) => a.start - b.start)
      let x = 0
      for (const range of blockedRanges) {
        if (x + itemWidth <= range.start) break
        x = Math.max(x, range.end)
      }

      xPositions.set(itemId, x)
      placed.add(itemId)
    }

    return xPositions
  }

  // Start with all expanded
  const expanded = new Map<number, boolean>()
  sorted.forEach((_, i) => expanded.set(i, true))

  // Check if current layout fits
  const layoutFits = (): boolean => {
    const xPositions = calculateXPositions(expanded)
    for (let i = 0; i < sorted.length; i++) {
      const x = xPositions.get(i)!
      const w = expanded.get(i) ? estimateLabelWidth(sorted[i].annotation) : COLLAPSED_WIDTH
      if (STEM_BASE_WIDTH + x + w > availableWidth) return false
    }
    return true
  }

  // Collapse items starting from leftmost (smallest x) until layout fits
  // This keeps rightmost items expanded, which tend to be more important
  let iterations = 0
  while (!layoutFits() && iterations < 50) {
    iterations++
    const xPositions = calculateXPositions(expanded)

    // Find leftmost expanded item and collapse it
    let leftmostIdx = -1
    let leftmostX = Infinity
    for (let i = 0; i < sorted.length; i++) {
      if (expanded.get(i)) {
        const x = xPositions.get(i)!
        if (x < leftmostX) {
          leftmostX = x
          leftmostIdx = i
        }
      }
    }

    if (leftmostIdx >= 0) {
      expanded.set(leftmostIdx, false)
    } else {
      break // No more items to collapse
    }
  }

  // Try to re-expand collapsed items, starting from rightmost (largest x)
  // This prioritizes expanding items that are already pushed right
  const xPositionsForReexpand = calculateXPositions(expanded)
  const collapsedItems = sorted
    .map((_, i) => i)
    .filter(i => !expanded.get(i))
    .sort((a, b) => {
      // Sort by x position descending (rightmost first)
      const xA = xPositionsForReexpand.get(a) ?? 0
      const xB = xPositionsForReexpand.get(b) ?? 0
      return xB - xA
    })

  for (const itemId of collapsedItems) {
    expanded.set(itemId, true)
    if (!layoutFits()) {
      expanded.set(itemId, false)
    }
  }

  const finalX = calculateXPositions(expanded)

  // Clamp positions so items don't overflow, accounting for stem and content width
  // Content right edge = STEM_BASE_WIDTH + leftPx + itemWidth (must fit in availableWidth)
  return sorted.map((item, i) => {
    const isExpanded = expanded.get(i) ?? false
    const itemWidth = isExpanded ? estimateLabelWidth(item.annotation) : COLLAPSED_WIDTH
    const maxLeftPx = Math.max(0, availableWidth - STEM_BASE_WIDTH - itemWidth)
    return {
      ...item,
      topPx: (item.position / 100) * containerHeight,
      leftPx: Math.min(finalX.get(i) ?? 0, maxLeftPx),
      expanded: isExpanded,
    }
  })
}

// ============================================================================
// GANTT BAR TYPES
// ============================================================================

type GanttBarBase = {
  label: string
  startPosition: number
  endPosition: number
  width: number
  color?: string
  emoji: string
  labelWidth: number
  startIndex: number
  endIndex: number
}

type GanttBarLandscape = GanttBarBase & {
  barRow: number
  labelRow: number
}

type GanttBarPortrait = GanttBarBase

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type TimelineViewProps = {
  days: DayInfo[]
  windowSize: { width: number; height: number }
  startDate: Date
  onDayClick: (e: MouseEvent, day: DayInfo) => void
  selectedDayIndex: number | null
  annotationEmojis: Record<string, string>
  milestones: Milestone[]
}

export function TimelineView({
  days,
  windowSize,
  startDate,
  onDayClick,
  selectedDayIndex,
  annotationEmojis,
  milestones,
}: TimelineViewProps) {
  const totalDays = days.length
  const isLandscape = windowSize.width > windowSize.height

  // Measure the milestones container position from the DOM
  const [portraitLayout, setPortraitLayout] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Measure container position when in portrait mode
  useLayoutEffect(() => {
    if (!isLandscape && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setPortraitLayout({
        left: Math.floor(rect.left),
        top: Math.floor(rect.top),
        // Add 20px safety margin to account for CSS rendering differences
        width: Math.floor(windowSize.width - rect.left - 30),
        height: Math.floor(rect.height),
      })
    }
  }, [isLandscape, windowSize.width, windowSize.height])

  // Fallback values until measured
  const portraitAvailableWidth = portraitLayout?.width ?? Math.floor(windowSize.width * 0.35)
  const portraitContainerHeight = portraitLayout?.height ?? Math.floor(windowSize.height * 0.85)

  // Build range milestone lookup from passed milestones
  const rangeMilestoneLookup = useMemo(() => {
    return buildRangeMilestoneLookup(milestones, startDate)
  }, [milestones, startDate])

  // Find today's index
  const todayIndex = days.findIndex(d => d.isToday)
  const todayPosition = todayIndex >= 0 ? (todayIndex / totalDays) * 100 : -1

  // Get month markers
  const monthMarkers = useMemo(() => {
    const markers: { month: string; year: number; position: number }[] = []
    let lastMonth = -1

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(startDate, i)
      const month = date.getMonth()
      if (month !== lastMonth) {
        markers.push({
          month: MONTHS[month],
          year: date.getFullYear(),
          position: (i / totalDays) * 100,
        })
        lastMonth = month
      }
    }
    return markers
  }, [totalDays, startDate])

  // Get week markers (pregnancy weeks 1-40)
  const weekMarkers = useMemo(() => {
    const markers: { week: number; position: number }[] = []
    for (let i = 0; i < totalDays; i += 7) {
      const weekNum = Math.floor(i / 7) + 1
      markers.push({
        week: weekNum,
        position: (i / totalDays) * 100,
      })
    }
    return markers
  }, [totalDays])

  // Get base milestones (non-range) with positions
  const baseMilestones = useMemo(() => {
    return days
      .filter(d => d.annotation && d.annotation !== 'Today' && !rangeMilestoneLookup[d.annotation])
      .map(d => ({
        ...d,
        position: (d.index / totalDays) * 100,
      }))
  }, [days, totalDays])

  // Landscape: Get point milestones with row assignments
  const landscapeMilestones = useMemo(() => {
    if (!isLandscape) return []
    const containerWidth = windowSize.width - 120
    return assignRows(baseMilestones, containerWidth, annotationEmojis)
  }, [baseMilestones, windowSize.width, annotationEmojis, isLandscape])

  // Portrait: Get point milestones with column assignments
  const portraitMilestones = useMemo(() => {
    if (isLandscape) return []
    return layoutPortraitMilestones(baseMilestones, {
      width: portraitAvailableWidth,
      height: portraitContainerHeight,
    })
  }, [baseMilestones, isLandscape, portraitAvailableWidth, portraitContainerHeight])

  // Landscape: Calculate row range for dynamic height
  const { minRow, maxRow, milestonesHeight } = useMemo(() => {
    if (!isLandscape || landscapeMilestones.length === 0) {
      return { minRow: 0, maxRow: 0, milestonesHeight: ROW_HEIGHT }
    }
    const rows = landscapeMilestones.map(m => m.row)
    const min = Math.min(...rows)
    const max = Math.max(...rows)
    const aboveRows = max + 1
    const belowRows = Math.abs(min)
    return {
      minRow: min,
      maxRow: max,
      milestonesHeight: (aboveRows + belowRows) * ROW_HEIGHT,
    }
  }, [landscapeMilestones, isLandscape])

  // Landscape: Get Gantt bars with row assignments
  const landscapeGanttBars = useMemo((): GanttBarLandscape[] => {
    if (!isLandscape) return []

    const font = '600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
    const containerWidth = windowSize.width - 120

    const bars: Omit<GanttBarLandscape, 'barRow' | 'labelRow'>[] = []
    for (const [label, range] of Object.entries(rangeMilestoneLookup)) {
      const startPosition = (range.startIndex / totalDays) * 100
      const endPosition = (range.endIndex / totalDays) * 100
      const textWidth = measureTextWidth(label, font)
      const labelWidth = textWidth + MILESTONE_PADDING + EMOJI_WIDTH
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
      })
    }

    // Sort by start position for row assignment
    bars.sort((a, b) => a.startPosition - b.startPosition)

    // Assign bar rows (for overlapping date ranges)
    const barRowOccupancy: Array<{ left: number; right: number }>[] = []
    // Assign label rows (for label collision detection)
    const labelRowOccupancy: Array<{ left: number; right: number }>[] = []

    const result: GanttBarLandscape[] = []
    for (const bar of bars) {
      const barLeftPx = (bar.startPosition / 100) * containerWidth
      const barRightPx = (bar.endPosition / 100) * containerWidth

      // Find first available bar row
      let assignedBarRow = 0
      for (let row = 0; row < barRowOccupancy.length + 1; row++) {
        const occupied = barRowOccupancy[row] || []
        const hasConflict = occupied.some(
          range => !(barRightPx + 4 < range.left || barLeftPx - 4 > range.right)
        )
        if (!hasConflict) {
          assignedBarRow = row
          break
        }
      }

      // Record bar occupancy
      if (!barRowOccupancy[assignedBarRow]) barRowOccupancy[assignedBarRow] = []
      barRowOccupancy[assignedBarRow].push({ left: barLeftPx, right: barRightPx })

      // Label is centered on middle of bar
      const labelCenterPx = (barLeftPx + barRightPx) / 2
      const labelLeftPx = labelCenterPx - bar.labelWidth / 2
      const labelRightPx = labelCenterPx + bar.labelWidth / 2

      // Find first available label row
      let assignedLabelRow = 0
      for (let row = 0; row < labelRowOccupancy.length + 1; row++) {
        const occupied = labelRowOccupancy[row] || []
        const hasConflict = occupied.some(
          range => !(labelRightPx + MILESTONE_GAP < range.left || labelLeftPx - MILESTONE_GAP > range.right)
        )
        if (!hasConflict) {
          assignedLabelRow = row
          break
        }
      }

      // Record label occupancy
      if (!labelRowOccupancy[assignedLabelRow]) labelRowOccupancy[assignedLabelRow] = []
      labelRowOccupancy[assignedLabelRow].push({ left: labelLeftPx, right: labelRightPx })

      result.push({ ...bar, barRow: assignedBarRow, labelRow: assignedLabelRow })
    }

    return result
  }, [totalDays, windowSize.width, isLandscape])

  // Portrait: Get Gantt bars (simpler, no row assignments needed)
  const portraitGanttBars = useMemo((): GanttBarPortrait[] => {
    if (isLandscape) return []

    const font = '600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif'

    const bars: GanttBarPortrait[] = []
    for (const [label, range] of Object.entries(rangeMilestoneLookup)) {
      const startPosition = (range.startIndex / totalDays) * 100
      const endPosition = (range.endIndex / totalDays) * 100
      const textWidth = measureTextWidth(label, font)
      const labelWidth = textWidth + MILESTONE_PADDING + EMOJI_WIDTH
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
      })
    }

    return bars.sort((a, b) => a.startPosition - b.startPosition)
  }, [totalDays, isLandscape])

  // Landscape: Gantt row counts
  const { ganttBarRowCount, ganttLabelRowCount } = useMemo(() => {
    if (!isLandscape || landscapeGanttBars.length === 0) {
      return { ganttBarRowCount: 0, ganttLabelRowCount: 0 }
    }
    return {
      ganttBarRowCount: Math.max(...landscapeGanttBars.map(b => b.barRow)) + 1,
      ganttLabelRowCount: Math.max(...landscapeGanttBars.map(b => b.labelRow)) + 1,
    }
  }, [landscapeGanttBars, isLandscape])

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
    )
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
  )
}
