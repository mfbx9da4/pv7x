import { useMemo } from 'preact/hooks'
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

// Portrait milestone layout constants
const PORTRAIT_EMOJI_HEIGHT = 26 // height when showing only emoji

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
  position: number
  column: number  // approximate column (for legacy compatibility)
  leftPx: number  // actual left position in pixels (relative to content area start)
  height: number  // estimated height of milestone element
  expanded: boolean // whether to show label or just emoji
}

// Lane-based layout algorithm for portrait milestones
// Uses interval graph coloring to assign lanes, then optimizes expansion
function assignPortraitColumns(
  milestones: (DayInfo & { position: number })[],
  screenWidth: number
): PortraitMilestoneWithLayout[] {
  if (milestones.length === 0) return []

  // Layout constants
  const COLLAPSED_WIDTH = 24
  const BASE_STEM_WIDTH = 48 // 16px stem + 32px months column
  const halfHeightPct = 2
  const verticalGapPct = 0.5

  // The milestone container starts at roughly 54% from left edge
  // Content position = container.left + BASE_STEM_WIDTH + leftPx
  // Available width for leftPx + contentWidth = screenEdge - container.left - BASE_STEM_WIDTH - padding
  const RIGHT_PADDING = 10
  const availableWidth = Math.floor(screenWidth * 0.46) - BASE_STEM_WIDTH - RIGHT_PADDING

  // Estimate expanded label width: ~7px per char + emoji + padding
  const estimateLabelWidth = (label: string): number => Math.min(140, label.length * 7 + 34)

  // Check if two items conflict vertically
  const conflictsVertically = (a: { position: number }, b: { position: number }): boolean => {
    const aTop = a.position - halfHeightPct
    const aBottom = a.position + halfHeightPct
    const bTop = b.position - halfHeightPct
    const bBottom = b.position + halfHeightPct
    return Math.max(aTop, bTop) < Math.min(aBottom, bBottom) + verticalGapPct
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

  // Calculate x positions given expansion decisions
  const calculateXPositions = (expanded: Map<number, boolean>): Map<number, number> => {
    const xPositions = new Map<number, number>()

    for (let currentLane = 0; currentLane < lanes.length; currentLane++) {
      for (const item of sorted) {
        const itemId = itemIds.get(item)!
        if (laneAssignment.get(itemId) !== currentLane) continue

        if (currentLane === 0) {
          xPositions.set(itemId, 0)
        } else {
          let maxRight = 0
          for (const conflictId of conflicts.get(itemId)!) {
            const conflictLane = laneAssignment.get(conflictId)!
            if (conflictLane < currentLane) {
              const conflictX = xPositions.get(conflictId)!
              const conflictWidth = expanded.get(conflictId)
                ? estimateLabelWidth(sorted[conflictId].annotation)
                : COLLAPSED_WIDTH
              maxRight = Math.max(maxRight, conflictX + conflictWidth)
            }
          }
          xPositions.set(itemId, maxRight)
        }
      }
    }
    return xPositions
  }

  // Start with all expanded
  const expanded = new Map<number, boolean>()
  sorted.forEach((_, i) => expanded.set(i, true))

  // Collapse items that exceed available width
  // Collapse from lane 0 outward - collapsing closer items frees space for those further right
  let stable = false
  let iterations = 0
  while (!stable && iterations < 50) {
    stable = true
    iterations++
    const xPositions = calculateXPositions(expanded)

    for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
      for (const item of lanes[laneIdx]) {
        const itemId = itemIds.get(item)!
        const x = xPositions.get(itemId)!
        const width = expanded.get(itemId) ? estimateLabelWidth(item.annotation) : COLLAPSED_WIDTH

        if (x + width > availableWidth && expanded.get(itemId)) {
          expanded.set(itemId, false)
          stable = false
        }
      }
    }
  }

  // Try to re-expand collapsed items if they fit
  for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
    for (const item of lanes[laneIdx]) {
      const itemId = itemIds.get(item)!
      if (!expanded.get(itemId)) {
        expanded.set(itemId, true)
        const xPositions = calculateXPositions(expanded)

        let fits = true
        for (let i = 0; i < sorted.length; i++) {
          const x = xPositions.get(i)!
          const w = expanded.get(i) ? estimateLabelWidth(sorted[i].annotation) : COLLAPSED_WIDTH
          if (x + w > availableWidth) {
            fits = false
            break
          }
        }

        if (!fits) expanded.set(itemId, false)
      }
    }
  }

  const finalX = calculateXPositions(expanded)

  // Clamp positions so even collapsed items don't overflow
  const maxLeftPx = Math.max(0, availableWidth - COLLAPSED_WIDTH)

  return sorted.map((item, i) => ({
    ...item,
    column: laneAssignment.get(i) ?? 0,
    leftPx: Math.min(finalX.get(i) ?? 0, maxLeftPx),
    height: PORTRAIT_EMOJI_HEIGHT,
    expanded: expanded.get(i) ?? false,
  }))
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
    return assignPortraitColumns(baseMilestones, windowSize.width)
  }, [baseMilestones, windowSize.width, isLandscape])

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
    />
  )
}
