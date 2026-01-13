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

// Smart column assignment for portrait milestones
// Uses percentage-based vertical positioning to match CSS rendering
// Horizontal positions in pixels for precise collision detection
function assignPortraitColumns(
  milestones: (DayInfo & { position: number })[],
  _containerHeight: number, // kept for API compatibility but not used
  screenWidth: number
): PortraitMilestoneWithLayout[] {
  // Sort by position (top to bottom)
  const sorted = [...milestones].sort((a, b) => a.position - b.position)

  // Collision detection parameters
  const emojiOnlyWidth = 32 // pixels - actual rendered width of emoji element
  const emojiGap = 8 // pixels - horizontal gap between emojis
  const verticalGapPercent = 1.5 // percentage points - how close vertically before collision

  // Calculate available width for milestone content
  const availableWidth = screenWidth <= 500
    ? Math.max(60, screenWidth * 0.45)
    : Math.max(80, screenWidth - 190)

  // Track occupied ranges: vertical in %, horizontal in px
  const occupiedRanges: Array<{ topPct: number; bottomPct: number; leftPx: number; rightPx: number }>[] = []

  const result: PortraitMilestoneWithLayout[] = []

  for (const milestone of sorted) {
    // Vertical bounds in percentage (matches CSS top: X%)
    const centerPct = milestone.position
    const halfHeightPct = 2 // approximate height in percentage points
    const topPct = centerPct - halfHeightPct
    const bottomPct = centerPct + halfHeightPct

    // Find leftmost position that doesn't conflict
    let bestLeftPx = 0

    // Get ranges that vertically overlap with this milestone
    const conflictingRanges = occupiedRanges.flat().filter(range => {
      const verticalOverlap = !(bottomPct + verticalGapPercent < range.topPct ||
                                topPct - verticalGapPercent > range.bottomPct)
      return verticalOverlap
    })

    // Candidate positions: 0, then after each conflicting range
    const positionsToTry = [0, ...conflictingRanges.map(r => r.rightPx + emojiGap)]
      .filter((v, i, a) => a.indexOf(v) === i) // unique
      .sort((a, b) => a - b)

    for (const tryLeft of positionsToTry) {
      const tryRight = tryLeft + emojiOnlyWidth

      // Skip if off-screen
      if (tryRight > availableWidth) continue

      // Check for horizontal collision with vertically-overlapping ranges
      const hasConflict = conflictingRanges.some(range =>
        !(tryRight < range.leftPx || tryLeft > range.rightPx)
      )

      if (!hasConflict) {
        bestLeftPx = tryLeft
        break
      }
    }

    // Record occupancy
    const bounds = { topPct, bottomPct, leftPx: bestLeftPx, rightPx: bestLeftPx + emojiOnlyWidth }
    occupiedRanges.push([bounds])

    result.push({
      ...milestone,
      column: 0, // legacy
      leftPx: bestLeftPx,
      height: PORTRAIT_EMOJI_HEIGHT,
      expanded: false,
    })
  }

  // Helper to estimate label width (emoji + text + padding)
  const estimateLabelWidth = (label: string): number => {
    // ~7px per character + 18px emoji + 16px padding
    return Math.min(150, label.length * 7 + 34)
  }

  // Helper to check if expanding a milestone causes conflicts
  const canExpand = (index: number, expandedWidth: number): boolean => {
    const m = result[index]

    // Check if expanding would overflow the screen
    if (m.leftPx + expandedWidth > availableWidth) {
      return false
    }

    // On very narrow screens, only allow expansion at position 0
    if (screenWidth <= 400 && m.leftPx > 0) {
      return false
    }

    // Vertical bounds in percentage (same as first pass)
    const centerPct = m.position
    const halfHeightPct = 2
    const myTopPct = centerPct - halfHeightPct
    const myBottomPct = centerPct + halfHeightPct

    // Horizontal extent if expanded
    const myLeft = m.leftPx
    const myRight = m.leftPx + expandedWidth

    // Check against ALL other milestones for overlap
    for (let i = 0; i < result.length; i++) {
      if (i === index) continue

      const other = result[i]
      const otherCenterPct = other.position
      const otherTopPct = otherCenterPct - halfHeightPct
      const otherBottomPct = otherCenterPct + halfHeightPct

      // Check vertical overlap (in percentage)
      const verticalOverlap = !(myBottomPct + verticalGapPercent < otherTopPct ||
                                myTopPct - verticalGapPercent > otherBottomPct)

      if (verticalOverlap) {
        // Calculate other milestone's horizontal extent
        const otherWidth = other.expanded ? estimateLabelWidth(other.annotation) : emojiOnlyWidth
        const otherLeft = other.leftPx
        const otherRight = other.leftPx + otherWidth

        // Check horizontal overlap
        const horizontalOverlap = !(myRight + emojiGap < otherLeft || myLeft - emojiGap > otherRight)

        if (horizontalOverlap) {
          return false
        }
      }
    }
    return true
  }

  // Second pass: try to expand colored milestones (non-subtle)
  const coloredIndices = result
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.color && m.color !== 'subtle')
    .map(({ i }) => i)

  for (const idx of coloredIndices) {
    const expandedWidth = estimateLabelWidth(result[idx].annotation)
    if (canExpand(idx, expandedWidth)) {
      result[idx].expanded = true
    }
  }

  // Third pass: try to expand subtle milestones
  const subtleIndices = result
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.color === 'subtle')
    .map(({ i }) => i)

  for (const idx of subtleIndices) {
    const expandedWidth = estimateLabelWidth(result[idx].annotation)
    if (canExpand(idx, expandedWidth)) {
      result[idx].expanded = true
    }
  }

  return result
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
    const containerHeight = windowSize.height - 100
    return assignPortraitColumns(baseMilestones, containerHeight, windowSize.width)
  }, [baseMilestones, windowSize.height, windowSize.width, isLandscape])

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
