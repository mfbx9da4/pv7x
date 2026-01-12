import { useMemo, useState, useRef, useCallback } from 'preact/hooks'
import type { DayInfo } from '../types'
import { highlightedDays } from './App'
import { CONFIG } from '../config'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Milestones that get view transitions
const VIEW_TRANSITION_LABELS = new Set(['Start', 'Announce!', 'Third Trimester', 'Due'])

// Milestone styling constants
const MILESTONE_PADDING = 20 // horizontal padding inside milestone
const MILESTONE_GAP = 8 // minimum gap between milestones
const EMOJI_WIDTH = 18 // approximate emoji width
const ROW_HEIGHT = 42 // vertical spacing between rows
const GANTT_ROW_HEIGHT = 24 // height of gantt bar rows
const GANTT_BAR_HEIGHT = 18 // height of individual gantt bars

// Build lookup of milestones with date ranges
function getDaysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay)
}

const rangeMilestoneLookup: Record<string, { startIndex: number; endIndex: number; color?: string; emoji: string }> = {}
for (const m of CONFIG.milestones) {
  if (m.endDate) {
    const startIndex = getDaysBetween(CONFIG.startDate, m.date)
    const endIndex = getDaysBetween(CONFIG.startDate, m.endDate)
    rangeMilestoneLookup[m.label] = { startIndex, endIndex, color: m.color, emoji: m.emoji }
  }
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

type MilestoneWithLayout = DayInfo & {
  position: number
  row: number
  width: number
}

type PortraitMilestoneWithLayout = DayInfo & {
  position: number
  column: number  // column offset (0 = closest to line, positive = further right)
  height: number  // estimated height of milestone element
  expanded: boolean // whether to show label or just emoji
}

// Portrait milestone layout constants
const PORTRAIT_EMOJI_HEIGHT = 26 // height when showing only emoji
const PORTRAIT_EXPANDED_HEIGHT = 26 // height when showing emoji + label (same height, different width)
const PORTRAIT_MILESTONE_GAP = 2
const PORTRAIT_MONTHS_WIDTH = 32 // width of months column that stems must cross

// Get responsive column width for portrait milestones
function getPortraitColumnWidth(screenWidth: number): number {
  if (screenWidth <= 400) return 35 // small mobile
  if (screenWidth <= 500) return 45 // mobile
  return 80 // default
}

// Smart column assignment for portrait milestones
// 1. Start with all emoji-only (collapsed)
// 2. Assign columns based on emoji collision detection
// 3. Try to expand colored milestones (non-subtle)
// 4. Try to expand subtle milestones
function assignPortraitColumns(
  milestones: (DayInfo & { position: number })[],
  containerHeight: number,
  screenWidth: number,
  maxColumns: number = 10
): PortraitMilestoneWithLayout[] {
  // Sort by position (top to bottom)
  const sorted = [...milestones].sort((a, b) => a.position - b.position)

  // Track occupied ranges per column
  const columnOccupancy = new Map<number, Array<{ top: number; bottom: number; index: number }>>()

  // First pass: assign columns using emoji-only (collapsed) size
  const result: PortraitMilestoneWithLayout[] = []

  for (const milestone of sorted) {
    const centerPx = (milestone.position / 100) * containerHeight
    const topPx = centerPx - PORTRAIT_EMOJI_HEIGHT / 2
    const bottomPx = centerPx + PORTRAIT_EMOJI_HEIGHT / 2

    // Find the closest available column
    let assignedColumn = 0

    for (let distance = 0; distance < maxColumns; distance++) {
      const occupied = columnOccupancy.get(distance) || []
      const hasConflict = occupied.some(
        range => !(bottomPx + PORTRAIT_MILESTONE_GAP < range.top || topPx - PORTRAIT_MILESTONE_GAP > range.bottom)
      )

      if (!hasConflict) {
        assignedColumn = distance
        break
      }
    }

    // Record this milestone's occupancy
    const occupied = columnOccupancy.get(assignedColumn) || []
    const idx = result.length
    occupied.push({ top: topPx, bottom: bottomPx, index: idx })
    columnOccupancy.set(assignedColumn, occupied)

    result.push({
      ...milestone,
      column: assignedColumn,
      height: PORTRAIT_EMOJI_HEIGHT,
      expanded: false
    })
  }

  // Helper to estimate label width (emoji + text + padding)
  const estimateLabelWidth = (label: string): number => {
    // ~7px per character + 18px emoji + 16px padding
    return Math.min(150, label.length * 7 + 34)
  }

  // Helper to check if expanding a milestone causes conflicts
  const canExpand = (index: number, expandedWidth: number, availableWidth: number): boolean => {
    const m = result[index]
    const columnWidth = screenWidth > 500 ? 80 : screenWidth > 400 ? 45 : 35
    const emojiOnlyWidth = 24 // width of collapsed emoji-only milestone
    const columnOffset = m.column * columnWidth

    // Check if expanding would overflow the screen
    if (columnOffset + expandedWidth > availableWidth) {
      return false
    }

    // On very narrow screens, only allow expansion in column 0
    if (screenWidth <= 400 && m.column > 0) {
      return false
    }

    const centerPx = (m.position / 100) * containerHeight
    const expandedTop = centerPx - PORTRAIT_EXPANDED_HEIGHT / 2
    const expandedBottom = centerPx + PORTRAIT_EXPANDED_HEIGHT / 2

    // Horizontal extent of this milestone if expanded
    const myLeft = columnOffset
    const myRight = columnOffset + expandedWidth

    // Check against ALL other milestones for overlap
    for (let i = 0; i < result.length; i++) {
      if (i === index) continue

      const other = result[i]
      const otherCenterPx = (other.position / 100) * containerHeight
      const otherHeight = other.expanded ? PORTRAIT_EXPANDED_HEIGHT : PORTRAIT_EMOJI_HEIGHT
      const otherTop = otherCenterPx - otherHeight / 2
      const otherBottom = otherCenterPx + otherHeight / 2

      // Check vertical overlap
      const verticalOverlap = !(expandedBottom + PORTRAIT_MILESTONE_GAP < otherTop ||
                                expandedTop - PORTRAIT_MILESTONE_GAP > otherBottom)

      if (verticalOverlap) {
        // Calculate other milestone's horizontal extent
        const otherColumnOffset = other.column * columnWidth
        const otherWidth = other.expanded ? estimateLabelWidth(other.annotation) : emojiOnlyWidth
        const otherLeft = otherColumnOffset
        const otherRight = otherColumnOffset + otherWidth

        // Check horizontal overlap (with small gap)
        const horizontalOverlap = !(myRight + 4 < otherLeft || myLeft - 4 > otherRight)

        if (horizontalOverlap) {
          return false
        }
      }
    }
    return true
  }

  // Calculate available width for milestones based on screen width
  // Portrait layout: weeks(30px) + gantt(~110px) + line(4px) + months(32px) + padding
  // Available for milestones is roughly: screenWidth - 190px
  const availableWidth = Math.max(80, screenWidth - 190)

  // Second pass: try to expand colored milestones (non-subtle)
  const coloredIndices = result
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.color && m.color !== 'subtle')
    .map(({ i }) => i)

  for (const idx of coloredIndices) {
    const expandedWidth = estimateLabelWidth(result[idx].annotation)
    if (canExpand(idx, expandedWidth, availableWidth)) {
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
    if (canExpand(idx, expandedWidth, availableWidth)) {
      result[idx].expanded = true
    }
  }

  return result
}

// Assign rows to milestones to avoid overlaps
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

type TimelineViewProps = {
  days: DayInfo[]
  windowSize: { width: number; height: number }
  startDate: Date
  onDayClick: (e: MouseEvent, day: DayInfo) => void
  selectedDayIndex: number | null
  annotationEmojis: Record<string, string>
}

export function TimelineView({
  days,
  windowSize,
  startDate,
  onDayClick,
  selectedDayIndex,
  annotationEmojis,
}: TimelineViewProps) {
  const totalDays = days.length
  const isLandscape = windowSize.width > windowSize.height

  // Find today's index
  const todayIndex = days.findIndex(d => d.isToday)

  // Get point milestones (non-range) with positions and row assignments
  const milestones = useMemo(() => {
    const basic = days
      .filter(d => d.annotation && d.annotation !== 'Today' && !rangeMilestoneLookup[d.annotation])
      .map(d => ({
        ...d,
        position: (d.index / totalDays) * 100,
      }))

    // Use container width minus padding for layout calculation
    const containerWidth = windowSize.width - 120 // account for 60px padding on each side
    return assignRows(basic, containerWidth, annotationEmojis)
  }, [days, totalDays, windowSize.width, annotationEmojis])

  // Get point milestones for portrait mode with column assignments
  const portraitMilestones = useMemo(() => {
    const basic = days
      .filter(d => d.annotation && d.annotation !== 'Today' && !rangeMilestoneLookup[d.annotation])
      .map(d => ({
        ...d,
        position: (d.index / totalDays) * 100,
      }))

    // Use container height minus padding for layout calculation
    const containerHeight = windowSize.height - 100 // account for padding
    // Limit columns on narrow screens to prevent overflow
    const maxColumns = windowSize.width <= 400 ? 2 : windowSize.width <= 500 ? 3 : 10
    return assignPortraitColumns(basic, containerHeight, windowSize.width, maxColumns)
  }, [days, totalDays, windowSize.height, windowSize.width])

  // Get range milestones for Gantt bars
  type GanttBar = {
    label: string
    startPosition: number
    endPosition: number
    width: number
    color?: string
    emoji: string
    barRow: number      // row for the bar itself (handles overlapping ranges)
    labelRow: number    // row for the label above (handles label collision)
    labelWidth: number  // calculated width of label for collision detection
    startIndex: number
    endIndex: number
  }

  const ganttBars = useMemo(() => {
    const font = '600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
    const containerWidth = windowSize.width - 120

    const bars: Omit<GanttBar, 'barRow' | 'labelRow'>[] = []
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

    const result: GanttBar[] = []
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
  }, [totalDays, windowSize.width])

  const { ganttBarRowCount, ganttLabelRowCount } = useMemo(() => {
    if (ganttBars.length === 0) return { ganttBarRowCount: 0, ganttLabelRowCount: 0 }
    return {
      ganttBarRowCount: Math.max(...ganttBars.map(b => b.barRow)) + 1,
      ganttLabelRowCount: Math.max(...ganttBars.map(b => b.labelRow)) + 1,
    }
  }, [ganttBars])

  // Calculate the row range for dynamic height
  const { minRow, maxRow } = useMemo(() => {
    if (milestones.length === 0) return { minRow: 0, maxRow: 0 }
    const rows = milestones.map(m => m.row)
    return { minRow: Math.min(...rows), maxRow: Math.max(...rows) }
  }, [milestones])

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

  const todayPosition = todayIndex >= 0 ? (todayIndex / totalDays) * 100 : -1

  // Hover state for showing day dot on timeline
  const lineRef = useRef<HTMLDivElement>(null)
  const [hoverPosition, setHoverPosition] = useState<number | null>(null)
  const [hoverDayIndex, setHoverDayIndex] = useState<number | null>(null)

  const handleLineMouseMove = useCallback((e: MouseEvent) => {
    if (!lineRef.current) return
    const rect = lineRef.current.getBoundingClientRect()
    // For landscape, use X position; for portrait, use Y position
    const pos = isLandscape ? e.clientX - rect.left : e.clientY - rect.top
    const size = isLandscape ? rect.width : rect.height
    const percent = Math.max(0, Math.min(100, (pos / size) * 100))
    const dayIndex = Math.round((percent / 100) * (totalDays - 1))
    setHoverPosition(percent)
    setHoverDayIndex(dayIndex)
  }, [totalDays, isLandscape])

  const handleLineMouseLeave = useCallback(() => {
    setHoverPosition(null)
    setHoverDayIndex(null)
  }, [])

  // Calculate container height based on row range
  const aboveRows = maxRow + 1 // rows 0 and above
  const belowRows = Math.abs(minRow) // rows below 0
  const milestonesHeight = (aboveRows + belowRows) * ROW_HEIGHT

  // Portrait layout - vertical timeline
  if (!isLandscape) {
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
                  class={`timeline-gantt-bar-portrait ${bar.color ? `colored color-${bar.color}` : ''}`}
                  style={{
                    top: `${bar.startPosition}%`,
                    height: `${bar.width}%`,
                    ...(bar.color ? { '--bar-color': `var(--color-${bar.color})` } : {}),
                  }}
                  onClick={(e) => {
                    const day = days[bar.startIndex]
                    if (day) onDayClick(e as unknown as MouseEvent, day)
                  }}
                />
              ))}
              {/* Labels with stems */}
              {ganttBars.map((bar) => {
                const centerPosition = (bar.startPosition + bar.endPosition) / 2
                return (
                  <div
                    key={`label-${bar.label}`}
                    class={`timeline-gantt-item-portrait ${bar.color ? `colored color-${bar.color}` : ''}`}
                    style={{
                      top: `${centerPosition}%`,
                      ...(bar.color ? { '--bar-color': `var(--color-${bar.color})` } : {}),
                    }}
                    onClick={(e) => {
                      const day = days[bar.startIndex]
                      if (day) onDayClick(e as unknown as MouseEvent, day)
                    }}
                  >
                    <div class="timeline-gantt-label-portrait timeline-label">
                      <span class="timeline-gantt-label-emoji">{bar.emoji}</span>
                      <span class="timeline-gantt-label-text">{bar.label}</span>
                    </div>
                    <div class="timeline-gantt-stem-portrait" />
                  </div>
                )
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
            {hoverPosition !== null && hoverDayIndex !== null && hoverDayIndex !== todayIndex && (
              <div
                class={`timeline-hover-dot-portrait ${hoverDayIndex < (todayIndex >= 0 ? todayIndex : totalDays) ? 'passed' : 'future'}`}
                style={{ top: `${hoverPosition}%` }}
                onClick={(e) => {
                  const day = days[hoverDayIndex]
                  if (day) onDayClick(e as unknown as MouseEvent, day)
                }}
              />
            )}
            {/* Today marker */}
            {todayIndex >= 0 && (
              <div
                class="timeline-today-portrait"
                style={{ top: `${todayPosition}%`, viewTransitionName: 'today-marker' }}
                onClick={(e) => {
                  const today = days.find(d => d.isToday)
                  if (today) onDayClick(e as unknown as MouseEvent, today)
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

          {/* Milestones on the right (stems go left to line) */}
          <div class="timeline-milestones-portrait">
            {portraitMilestones.map((m) => {
              // Offset the content box based on column (column 0 = no offset, column 1 = one step right, etc.)
              const columnWidth = getPortraitColumnWidth(windowSize.width)
              const contentOffset = m.column * columnWidth
              // Stem extends from milestone container through months column to the timeline line
              // Base: 16px stem + 32px months width + collision offset
              const stemWidth = 16 + PORTRAIT_MONTHS_WIDTH + contentOffset
              const viewTransitionStyle = VIEW_TRANSITION_LABELS.has(m.annotation) ? { viewTransitionName: `day-${m.index}` } : {}
              return (
                <div
                  key={m.index}
                  class={`timeline-milestone-portrait ${m.color ? `colored color-${m.color}` : ''} ${m.isToday ? 'today' : ''} ${selectedDayIndex === m.index ? 'selected' : ''} ${m.expanded ? 'expanded' : 'collapsed'}`}
                  style={{
                    top: `${m.position}%`,
                    ...(m.color ? { '--milestone-color': `var(--color-${m.color})` } : {}),
                  }}
                  onClick={(e) => onDayClick(e as unknown as MouseEvent, m)}
                >
                  <div class="timeline-milestone-stem-portrait" style={{ width: `${stemWidth}px` }} />
                  {m.expanded ? (
                    <div class="timeline-milestone-content-portrait timeline-label" style={viewTransitionStyle}>
                      <span class="timeline-milestone-emoji">{annotationEmojis[m.annotation] || ''}</span>
                      <span class="timeline-milestone-label">{m.annotation}</span>
                    </div>
                  ) : (
                    <div class="timeline-milestone-emoji-only" style={viewTransitionStyle}>
                      <span class="timeline-milestone-emoji">{annotationEmojis[m.annotation] || ''}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Landscape layout - horizontal timeline
  return (
    <div class="timeline-view landscape">
      <div class="timeline-content-landscape">
        {/* Milestones container */}
        <div
          class="timeline-milestones-landscape"
          style={{ height: `${milestonesHeight}px` }}
        >
          {milestones.map(m => {
            // Stem height determines vertical position - taller stem = higher up
            // All milestones anchored at bottom: 0, stem creates the spacing
            const stemHeight = 45 + (m.row - minRow) * ROW_HEIGHT
            // Lower rows get higher z-index so their content appears above stems from higher rows
            const zIndex = maxRow - m.row + 1

            const viewTransitionStyle = VIEW_TRANSITION_LABELS.has(m.annotation) ? { viewTransitionName: `day-${m.index}` } : {}
            return (
              <div
                key={m.index}
                class={`timeline-milestone-landscape ${m.color ? `colored color-${m.color}` : ''} ${m.isToday ? 'today' : ''} ${selectedDayIndex === m.index ? 'selected' : ''} ${highlightedDays.value.indices.has(m.index) ? 'highlighted' : ''}`}
                style={{
                  left: `${m.position}%`,
                  zIndex,
                  ...(m.color ? { '--milestone-color': `var(--color-${m.color})` } : {}),
                  ...(highlightedDays.value.indices.has(m.index) && highlightedDays.value.color ? { '--highlight-color': `var(--color-${highlightedDays.value.color})` } : {}),
                }}
                onClick={(e) => onDayClick(e as unknown as MouseEvent, m)}
              >
                <div class="timeline-milestone-content-landscape timeline-label" style={viewTransitionStyle}>
                  <span class="timeline-milestone-emoji">{annotationEmojis[m.annotation] || ''}</span>
                  <span class="timeline-milestone-label">{m.annotation}</span>
                </div>
                <div class="timeline-milestone-stem-landscape" style={{ height: `${stemHeight}px` }} />
              </div>
            )
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
            {hoverPosition !== null && hoverDayIndex !== null && hoverDayIndex !== todayIndex && (
              <div
                class={`timeline-hover-dot-landscape ${hoverDayIndex < (todayIndex >= 0 ? todayIndex : totalDays) ? 'passed' : 'future'}`}
                style={{ left: `${hoverPosition}%` }}
                onClick={(e) => {
                  const day = days[hoverDayIndex]
                  if (day) onDayClick(e as unknown as MouseEvent, day)
                }}
              />
            )}
            {/* Today marker */}
            {todayIndex >= 0 && (
              <div
                class="timeline-today-landscape"
                style={{ left: `${todayPosition}%`, viewTransitionName: 'today-marker' }}
                onClick={(e) => {
                  const today = days.find(d => d.isToday)
                  if (today) onDayClick(e as unknown as MouseEvent, today)
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
            style={{ height: `${ganttLabelRowCount * ROW_HEIGHT + ganttBarRowCount * GANTT_ROW_HEIGHT + 10}px` }}
          >
            {/* Bars at top */}
            <div class="timeline-gantt-bars-landscape" style={{ height: `${ganttBarRowCount * GANTT_ROW_HEIGHT}px` }}>
              {ganttBars.map((bar) => {
                const isHighlighted = highlightedDays.value.indices.has(bar.startIndex)
                return (
                  <div
                    key={`bar-${bar.label}`}
                    class={`timeline-gantt-bar-landscape ${bar.color ? `colored color-${bar.color}` : ''} ${isHighlighted ? 'highlighted' : ''}`}
                    style={{
                      left: `${bar.startPosition}%`,
                      width: `${bar.width}%`,
                      top: `${bar.barRow * GANTT_ROW_HEIGHT + (GANTT_ROW_HEIGHT - GANTT_BAR_HEIGHT) / 2}px`,
                      height: `${GANTT_BAR_HEIGHT}px`,
                      ...(bar.color ? { '--bar-color': `var(--color-${bar.color})` } : {}),
                      ...(isHighlighted && highlightedDays.value.color ? { '--highlight-color': `var(--color-${highlightedDays.value.color})` } : {}),
                    }}
                    onClick={(e) => {
                      const day = days[bar.startIndex]
                      if (day) onDayClick(e as unknown as MouseEvent, day)
                    }}
                  />
                )
              })}
            </div>
            {/* Labels below bars with stems going up from center of range */}
            <div class="timeline-gantt-labels-landscape" style={{ height: `${ganttLabelRowCount * ROW_HEIGHT}px` }}>
              {ganttBars.map((bar) => {
                const isHighlighted = highlightedDays.value.indices.has(bar.startIndex)
                const stemHeight = 20 + bar.labelRow * ROW_HEIGHT
                const centerPosition = (bar.startPosition + bar.endPosition) / 2
                return (
                  <div
                    key={`label-${bar.label}`}
                    class={`timeline-gantt-item-landscape ${bar.color ? `colored color-${bar.color}` : ''} ${isHighlighted ? 'highlighted' : ''}`}
                    style={{
                      left: `${centerPosition}%`,
                      top: 0,
                      ...(bar.color ? { '--bar-color': `var(--color-${bar.color})` } : {}),
                      ...(isHighlighted && highlightedDays.value.color ? { '--highlight-color': `var(--color-${highlightedDays.value.color})` } : {}),
                    }}
                    onClick={(e) => {
                      const day = days[bar.startIndex]
                      if (day) onDayClick(e as unknown as MouseEvent, day)
                    }}
                  >
                    <div class="timeline-gantt-stem-landscape" style={{ height: `${stemHeight}px` }} />
                    <div class="timeline-gantt-label-content-landscape timeline-label">
                      <span class="timeline-gantt-label-emoji">{bar.emoji}</span>
                      <span class="timeline-gantt-label-text">{bar.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
