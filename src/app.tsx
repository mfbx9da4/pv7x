import { useMemo, useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { haptic } from 'ios-haptics'
import './app.css'

type DayInfo = {
  index: number
  passed: boolean
  color?: string  // color name from CSS variables (e.g., 'pink', 'purple', 'teal')
  isToday: boolean
  isOddWeek: boolean
  dateLabel: string
  annotation: string
}

type TooltipState = {
  day: DayInfo
  position: { x: number; y: number }
} | null

// ============================================
// CUSTOM DATA - Edit this section to customize
// ============================================
const CONFIG = {
  startDate: new Date(2025, 10, 20),  // November 20, 2025
  dueDate: new Date(2026, 7, 20),     // August 20, 2026
  todayEmoji: '📍',
  milestones: [
    { date: new Date(2025, 10, 20), label: 'Start', emoji: '🌱' },
    { date: new Date(2025, 11, 24), label: 'Discovery', emoji: '🕵️‍♀️', color: 'pink' },
    { date: new Date(2025, 11, 28), label: 'Hospital Scan', emoji: '🏥', description: 'Confirmed heartbeat and normal implantation' },
    { date: new Date(2026, 0, 6), label: 'Dr Rodin', emoji: '👨‍⚕️' },
    { date: new Date(2026, 0, 23), label: 'Blood Tests', emoji: '🩸', description: '10 week blood tests which should reveal gender and any adverse genetic issues' },
    { date: new Date(2026, 1, 5), label: 'Announce!', emoji: '📢', color: 'purple', description: 'Start of second trimester' },
    { date: new Date(2026, 3, 12), label: 'Engagement Party', emoji: '🎉', color: 'orange' },
    { date: new Date(2026, 4, 28), label: 'Third Trimester', emoji: '🤰', color: 'teal', description: 'Start of third trimester (week 28)' },
    { date: new Date(2026, 5, 7), label: 'Dan & Bex Wedding', emoji: '💒', color: 'gold' },
    { date: new Date(2026, 7, 13), label: 'C Section', emoji: '🥗', color: 'blue', description: 'Potential scheduled date of Caesarean section birth' },
    { date: new Date(2026, 7, 20), label: 'Due', emoji: '👶', color: 'red' },
  ],
}
// ============================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Build emoji lookup from config
const ANNOTATION_EMOJIS: Record<string, string> = {
  Today: CONFIG.todayEmoji,
  ...Object.fromEntries(CONFIG.milestones.map(m => [m.label, m.emoji]))
}

// Build description lookup from config
const ANNOTATION_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  CONFIG.milestones.filter(m => m.description).map(m => [m.label, m.description!])
)

function getAnnotationDisplay(text: string, cellSize: number, fontSize: number): string {
  // Estimate if longest word fits: each char ~0.55 * fontSize wide
  const longestWord = text.split(' ').reduce((a, b) => a.length > b.length ? a : b, '')
  const estimatedWidth = longestWord.length * fontSize * 0.55
  const availableWidth = cellSize * 0.85
  if (estimatedWidth <= availableWidth) {
    return text
  }
  return ANNOTATION_EMOJIS[text] || text
}

function getDaysBetween(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function calculateGrid(totalDays: number, width: number, height: number): { cols: number; rows: number } {
  // Minimize empty slots (dead space), with tie-breaker for squarest cells
  // Aspect ratio must be between 0.5 and 2.0 (not too tall/thin)
  const MIN_ASPECT = 0.5
  const MAX_ASPECT = 2.0

  let bestCols = 1
  let bestRows = totalDays
  let bestEmpty = totalDays - 1
  let bestAspectDiff = Infinity

  for (let cols = 1; cols <= totalDays; cols++) {
    const rows = Math.ceil(totalDays / cols)
    const cellAspect = (width / cols) / (height / rows)

    // Skip configurations with extreme aspect ratios
    if (cellAspect < MIN_ASPECT || cellAspect > MAX_ASPECT) continue

    const empty = cols * rows - totalDays
    const aspectDiff = Math.abs(cellAspect - 1)

    if (empty < bestEmpty || (empty === bestEmpty && aspectDiff < bestAspectDiff)) {
      bestEmpty = empty
      bestAspectDiff = aspectDiff
      bestCols = cols
      bestRows = rows
    }
  }
  return { cols: bestCols, rows: bestRows }
}

const getViewportSize = () => ({
  width: window.visualViewport?.width ?? window.innerWidth,
  height: window.visualViewport?.height ?? window.innerHeight,
})

const VERSION_TAP_COUNT = 3
const VERSION_TAP_TIMEOUT = 500

type ViewMode = 'compact' | 'weekly'

const VIEW_MODE_KEY = 'pregnancy-visualizer-view-mode'

function getStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === 'compact' || stored === 'weekly') {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return 'weekly'
}

export function App() {
  const [windowSize, setWindowSize] = useState(getViewportSize)
  const [showAnnotationDate, setShowAnnotationDate] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [showVersion, setShowVersion] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode)

  const versionTapCount = useRef(0)
  const versionTapTimer = useRef<number | null>(null)

  useEffect(() => {
    const handleResize = () => setWindowSize(getViewportSize())
    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [])

  // Dismiss tooltip on tap elsewhere
  useEffect(() => {
    if (!tooltip) return
    const dismiss = () => setTooltip(null)
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [tooltip])

  // Auto-dismiss tooltip after 3 seconds
  useEffect(() => {
    if (!tooltip) return
    const timer = setTimeout(() => setTooltip(null), 3000)
    return () => clearTimeout(timer)
  }, [tooltip])

  const handleDayPointerDown = useCallback((e: PointerEvent, day: DayInfo) => {
    e.stopPropagation()
    // If tooltip is open, just close it
    if (tooltip) {
      setTooltip(null)
      return
    }
    haptic()
    setTooltip({
      day,
      position: { x: e.clientX, y: e.clientY }
    })
  }, [tooltip])

  const handleVersionTap = useCallback(() => {
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current)
    }
    versionTapCount.current++
    if (versionTapCount.current >= VERSION_TAP_COUNT) {
      versionTapCount.current = 0
      haptic()
      setShowVersion(true)
    } else {
      versionTapTimer.current = window.setTimeout(() => {
        versionTapCount.current = 0
      }, VERSION_TAP_TIMEOUT)
    }
  }, [])

  // Cycle annotation display on mobile
  useEffect(() => {
    const interval = setInterval(() => {
      setShowAnnotationDate(prev => !prev)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  // Persist view mode to local storage
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      // localStorage not available
    }
  }, [viewMode])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalDays = getDaysBetween(CONFIG.startDate, CONFIG.dueDate) + 1
  const daysPassed = Math.max(0, Math.min(totalDays, getDaysBetween(CONFIG.startDate, today) + 1))

  // Build milestone lookup by day index
  const milestoneLookup = useMemo(() => {
    const lookup: Record<number, { label: string; color?: string }> = {}
    for (const m of CONFIG.milestones) {
      const dayIndex = getDaysBetween(CONFIG.startDate, m.date)
      lookup[dayIndex] = { label: m.label, color: m.color }
    }
    return lookup
  }, [])

  const availableWidth = windowSize.width - 20 // padding
  const availableHeight = windowSize.height - 100 // padding + info bar + safe area + browser chrome

  const { cols, rows } = useMemo(() => calculateGrid(totalDays, availableWidth, availableHeight), [totalDays, availableWidth, availableHeight])

  const cellSize = useMemo(() => {
    const cellWidth = availableWidth / cols
    const cellHeight = availableHeight / rows
    return Math.min(cellWidth, cellHeight)
  }, [availableWidth, availableHeight, cols, rows])

  const fontSize = useMemo(() => {
    const base = cellSize * 0.16
    return Math.max(7, Math.min(base, 13))
  }, [cellSize])

  const days = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const date = addDays(CONFIG.startDate, i)
      const weekNum = Math.floor(i / 7) + 1
      const milestone = milestoneLookup[i]
      const isToday = i === daysPassed - 1

      let annotation = ''
      let color: string | undefined
      if (milestone) {
        annotation = milestone.label
        color = milestone.color
      } else if (isToday) {
        annotation = 'Today'
      }

      return {
        index: i,
        passed: i < daysPassed,
        color,
        isToday,
        isOddWeek: weekNum % 2 === 1,
        dateLabel: i % 7 === 0 ? `${formatDate(date)} (${weekNum})` : formatDate(date),
        annotation,
      }
    })
  }, [totalDays, daysPassed, milestoneLookup])

  const daysRemaining = totalDays - daysPassed
  const weeksRemaining = Math.floor(daysRemaining / 7)
  const extraDays = daysRemaining % 7
  const timeRemaining = weeksRemaining > 0
    ? `${weeksRemaining} week${weeksRemaining !== 1 ? 's' : ''}${extraDays > 0 ? ` and ${extraDays} day${extraDays !== 1 ? 's' : ''}` : ''} to go`
    : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} to go`
  const currentWeek = Math.floor((daysPassed - 1) / 7) + 1
  const currentDayInWeek = ((daysPassed - 1) % 7) + 1
  const progressPercent = ((daysPassed / totalDays) * 100).toFixed(1)

  const isLandscape = windowSize.width > windowSize.height
  const toggleViewMode = useCallback(() => {
    haptic()
    setViewMode(prev => prev === 'compact' ? 'weekly' : 'compact')
  }, [])

  return (
    <div class="container">
      {viewMode === 'compact' ? (
        <div
          class="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {days.map((day) => (
            <div
              key={day.index}
              class={`day ${day.passed ? 'passed' : 'future'} ${day.color ? 'milestone' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''} ${day.annotation ? 'has-annotation' : ''}`}
              style={day.color ? { background: `var(--color-${day.color})`, color: `var(--color-${day.color}-text)` } : undefined}
              onPointerDown={(e) => handleDayPointerDown(e as unknown as PointerEvent, day)}
            >
              {day.annotation ? (
                cellSize >= 50 ? (
                  <>
                    <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{formatDate(addDays(CONFIG.startDate, day.index))}</span>
                    <span class="annotation-text visible" style={{ fontSize: `${fontSize}px` }}>{getAnnotationDisplay(day.annotation, cellSize, fontSize)}</span>
                  </>
                ) : (
                  <span class="annotation-container" style={{ fontSize: `${fontSize}px` }}>
                    <span class={`annotation-text ${showAnnotationDate ? 'hidden' : 'visible'}`}>{getAnnotationDisplay(day.annotation, cellSize, fontSize)}</span>
                    <span class={`annotation-date ${showAnnotationDate ? 'visible' : 'hidden'}`}>{formatDate(addDays(CONFIG.startDate, day.index))}</span>
                  </span>
                )
              ) : (
                <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{day.dateLabel}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <WeeklyView
          days={days}
          windowSize={windowSize}
          isLandscape={isLandscape}
          onDayPointerDown={handleDayPointerDown}
        />
      )}
      <div class="info">
        <button class="view-toggle" onClick={toggleViewMode} aria-label="Toggle view">
          {viewMode === 'compact' ? (
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="4" height="16" rx="1" fill="currentColor" opacity="0.3"/>
              <rect x="7" y="1" width="4" height="16" rx="1" fill="currentColor" opacity="0.5"/>
              <rect x="13" y="1" width="4" height="16" rx="1" fill="currentColor" opacity="0.7"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="7" y="1" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="13" y="1" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="1" y="7" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="7" y="7" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="13" y="7" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="1" y="13" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="7" y="13" width="4" height="4" rx="1" fill="currentColor"/>
              <rect x="13" y="13" width="4" height="4" rx="1" fill="currentColor"/>
            </svg>
          )}
        </button>
        <span class="info-text" onClick={handleVersionTap}>Week {currentWeek}, Day {currentDayInWeek}</span>
        <span class="info-text" onClick={handleVersionTap}>{progressPercent}%</span>
        <span class="info-text" onClick={handleVersionTap}>{timeRemaining}</span>
      </div>
      {showVersion && (
        <VersionPopover onClose={() => setShowVersion(false)} />
      )}
      {tooltip && (
        <Tooltip
          day={tooltip.day}
          position={tooltip.position}
          windowSize={windowSize}
        />
      )}
    </div>
  )
}

const DAY_LABELS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']
const DAY_LABELS_SHORT = ['T', 'F', 'S', 'S', 'M', 'T', 'W']

function WeeklyView({
  days,
  windowSize,
  isLandscape,
  onDayPointerDown,
}: {
  days: DayInfo[]
  windowSize: { width: number; height: number }
  isLandscape: boolean
  onDayPointerDown: (e: PointerEvent, day: DayInfo) => void
}) {
  const labelSpace = 42 // space for week labels like "Dec 12"

  // Calculate how many weeks we have
  // First, figure out the day of week for the start date
  // Convert to Thursday-first: (getDay() + 3) % 7 makes Thursday = 0, Wednesday = 6
  const startDayOfWeek = (CONFIG.startDate.getDay() + 3) % 7
  const totalDays = days.length

  // Calculate total weeks needed (including partial weeks at start and end)
  const totalWeeks = Math.ceil((startDayOfWeek + totalDays) / 7)

  // Calculate week labels with week numbers and month when a new month starts
  const weekLabels = useMemo(() => {
    // First, build a map of weekIndex -> month name for weeks where a new month starts
    const monthStartsInWeek: Map<number, string> = new Map()
    let lastMonth = -1

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(CONFIG.startDate, i)
      const month = date.getMonth()
      if (month !== lastMonth) {
        const weekIndex = Math.floor((startDayOfWeek + i) / 7)
        // Only set if not already set (keep the first month that starts in this week)
        if (!monthStartsInWeek.has(weekIndex)) {
          monthStartsInWeek.set(weekIndex, MONTHS[month])
        }
        lastMonth = month
      }
    }

    // Create labels for all weeks
    const labels: { weekNum: number; month?: string; position: number }[] = []
    for (let week = 0; week < totalWeeks; week++) {
      labels.push({
        weekNum: week + 1,
        month: monthStartsInWeek.get(week),
        position: week,
      })
    }
    return labels
  }, [totalDays, startDayOfWeek, totalWeeks])

  // Calculate cell size to fit all cells
  const { cellSize, labelSize, gap } = useMemo(() => {
    const padding = 10
    const monthLabelSpace = 16 // space for month labels
    const gapSize = 2

    let availableWidth: number
    let availableHeight: number
    let numCols: number
    let numRows: number

    if (isLandscape) {
      // Landscape: weeks horizontal, days vertical
      availableWidth = windowSize.width - padding * 2 - labelSpace
      availableHeight = windowSize.height - 80 - padding * 2 - monthLabelSpace
      numCols = totalWeeks
      numRows = 7
    } else {
      // Portrait: days horizontal, weeks vertical
      availableWidth = windowSize.width - padding * 2 - labelSpace
      availableHeight = windowSize.height - 80 - padding * 2 - monthLabelSpace
      numCols = 7
      numRows = totalWeeks
    }

    const maxCellWidth = (availableWidth - gapSize * (numCols - 1)) / numCols
    const maxCellHeight = (availableHeight - gapSize * (numRows - 1)) / numRows
    const size = Math.min(maxCellWidth, maxCellHeight)

    return {
      cellSize: Math.max(size, 8), // minimum 8px
      labelSize: Math.max(8, Math.min(11, size * 0.4)),
      gap: gapSize,
    }
  }, [windowSize, isLandscape, totalWeeks])

  // Build the grid data: array of weeks, each containing array of days (or null for empty cells)
  const weekData = useMemo(() => {
    const weeks: (DayInfo | null)[][] = []

    for (let week = 0; week < totalWeeks; week++) {
      const weekDays: (DayInfo | null)[] = []
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        const dayIndex = week * 7 + dayOfWeek - startDayOfWeek
        if (dayIndex >= 0 && dayIndex < totalDays) {
          weekDays.push(days[dayIndex])
        } else {
          weekDays.push(null)
        }
      }
      weeks.push(weekDays)
    }
    return weeks
  }, [days, totalWeeks, startDayOfWeek, totalDays])

  const usedDayLabels = cellSize < 20 ? DAY_LABELS_SHORT : DAY_LABELS

  if (isLandscape) {
    // Landscape: days are rows (vertical), weeks are columns (horizontal)
    return (
      <div class="weekly-view landscape">
        <div class="weekly-body">
          {/* Day labels column */}
          <div class="weekly-day-labels" style={{ gap: `${gap}px`, marginTop: `${labelSize + 4}px` }}>
            {usedDayLabels.map((label, i) => (
              <span
                key={i}
                class="weekly-day-label"
                style={{ height: `${cellSize}px`, fontSize: `${labelSize}px` }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Grid with week labels */}
          <div class="weekly-grid-wrapper">
            {/* Week labels row */}
            <div class="weekly-week-labels" style={{ height: `${(labelSize + 4) * (weekLabels.some(l => l.month) ? 2 : 1)}px` }}>
              {weekLabels.map((label, i) => (
                <span
                  key={i}
                  class="weekly-week-label"
                  style={{
                    left: `${label.position * (cellSize + gap)}px`,
                    fontSize: `${labelSize}px`,
                  }}
                >
                  {label.month && <span class="week-label-month">{label.month}</span>}
                  <span class="week-label-num">{label.weekNum}</span>
                </span>
              ))}
            </div>

            {/* Grid */}
            <div
              class="weekly-grid"
              style={{
                gridTemplateColumns: `repeat(${totalWeeks}, ${cellSize}px)`,
                gridTemplateRows: `repeat(7, ${cellSize}px)`,
                gap: `${gap}px`,
              }}
            >
            {/* Render by column (week), then row (day of week) */}
            {Array.from({ length: 7 }, (_, dayOfWeek) =>
              weekData.map((week, weekIndex) => {
                const day = week[dayOfWeek]
                return day ? (
                  <div
                    key={`${weekIndex}-${dayOfWeek}`}
                    class={`weekly-cell ${day.passed ? 'passed' : 'future'} ${day.color ? 'milestone' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''}`}
                    style={{
                      gridColumn: weekIndex + 1,
                      gridRow: dayOfWeek + 1,
                      ...(day.color ? { background: `var(--color-${day.color})` } : {}),
                    }}
                    onPointerDown={(e) => onDayPointerDown(e as unknown as PointerEvent, day)}
                  />
                ) : (
                  <div
                    key={`${weekIndex}-${dayOfWeek}`}
                    class="weekly-cell empty"
                    style={{
                      gridColumn: weekIndex + 1,
                      gridRow: dayOfWeek + 1,
                    }}
                  />
                )
              })
            )}
          </div>
          </div>
        </div>
      </div>
    )
  } else {
    // Portrait: days are columns (horizontal), weeks are rows (vertical)
    const gridHeight = totalWeeks * cellSize + (totalWeeks - 1) * gap

    return (
      <div class="weekly-view portrait">
        <div class="weekly-body-portrait">
          {/* Empty corner cell */}
          <div class="weekly-corner" style={{ width: `${labelSpace}px`, height: `${labelSize + 4}px` }} />

          {/* Day labels row */}
          <div class="weekly-day-labels-row" style={{ gap: `${gap}px`, height: `${labelSize + 4}px` }}>
            {usedDayLabels.map((label, i) => (
              <span
                key={i}
                class="weekly-day-label"
                style={{ width: `${cellSize}px`, fontSize: `${labelSize}px` }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Week labels column */}
          <div class="weekly-week-labels-col" style={{ width: `${labelSpace}px`, height: `${gridHeight}px` }}>
            {weekLabels.map((label, i) => (
              <span
                key={i}
                class="weekly-week-label"
                style={{
                  top: `${label.position * (cellSize + gap)}px`,
                  fontSize: `${labelSize}px`,
                }}
              >
                {label.month ? `${label.month} ${label.weekNum}` : label.weekNum}
              </span>
            ))}
          </div>

          {/* Grid */}
          <div
            class="weekly-grid"
            style={{
              gridTemplateColumns: `repeat(7, ${cellSize}px)`,
              gridTemplateRows: `repeat(${totalWeeks}, ${cellSize}px)`,
              gap: `${gap}px`,
            }}
          >
            {/* Render by row (week), then column (day of week) */}
            {weekData.map((week, weekIndex) =>
              week.map((day, dayOfWeek) =>
                day ? (
                  <div
                    key={`${weekIndex}-${dayOfWeek}`}
                    class={`weekly-cell ${day.passed ? 'passed' : 'future'} ${day.color ? 'milestone' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''}`}
                    style={day.color ? { background: `var(--color-${day.color})` } : undefined}
                    onPointerDown={(e) => onDayPointerDown(e as unknown as PointerEvent, day)}
                  />
                ) : (
                  <div
                    key={`${weekIndex}-${dayOfWeek}`}
                    class="weekly-cell empty"
                  />
                )
              )
            )}
          </div>
        </div>
      </div>
    )
  }
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function getDayColor(day: DayInfo): string {
  if (day.color) {
    const varName = `--color-${day.color}`
    return getCssVar(varName) || getCssVar('--color-primary')
  }
  if (day.isToday) return getCssVar('--color-primary')
  if (day.passed) return getCssVar(day.isOddWeek ? '--color-passed-odd' : '--color-passed-even')
  return getCssVar(day.isOddWeek ? '--color-text-tertiary' : '--color-text-secondary')
}

function Tooltip({ day, position, windowSize }: {
  day: DayInfo
  position: { x: number; y: number }
  windowSize: { width: number; height: number }
}) {
  const date = addDays(CONFIG.startDate, day.index)
  const weekNum = Math.floor(day.index / 7) + 1
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
  const fullDate = `${dayOfWeek}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  const color = getDayColor(day)

  // Position tooltip: prefer above the touch point, fall back to below
  const tooltipWidth = 180
  const tooltipHeight = day.annotation ? 70 : 50
  const margin = 12

  let left = position.x - tooltipWidth / 2
  let top = position.y - tooltipHeight - margin

  // Keep within horizontal bounds
  if (left < margin) left = margin
  if (left + tooltipWidth > windowSize.width - margin) {
    left = windowSize.width - tooltipWidth - margin
  }

  // If too close to top, show below instead
  if (top < margin) {
    top = position.y + margin
  }

  const emoji = day.annotation ? ANNOTATION_EMOJIS[day.annotation] : null
  const description = day.annotation ? ANNOTATION_DESCRIPTIONS[day.annotation] : null

  return (
    <div
      class={`day-tooltip ${emoji ? 'has-emoji' : ''}`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        borderColor: color,
      }}
    >
      {emoji && <div class="tooltip-emoji">{emoji}</div>}
      <div class="tooltip-content">
        <div class="tooltip-date">{fullDate}</div>
        <div class="tooltip-week">Week {weekNum}, Day {(day.index % 7) + 1}</div>
        {day.annotation && <div class="tooltip-annotation" style={{ color }}>{day.annotation}</div>}
        {description && <div class="tooltip-description">{description}</div>}
      </div>
    </div>
  )
}

function getTimeAgo(dateString: string): string {
  // Git date format: "2026-01-08 11:24:58 +0000"
  // Convert to ISO format by replacing space with T before time
  const isoString = dateString.replace(' ', 'T').replace(' ', '')
  const date = new Date(isoString)

  if (isNaN(date.getTime())) {
    return ''
  }

  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 0) {
    return ''
  }
  if (seconds < 60) {
    return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 30) {
    return days === 1 ? '1 day ago' : `${days} days ago`
  }
  const months = Math.floor(days / 30)
  if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.floor(months / 12)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

function VersionPopover({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const timeAgo = getTimeAgo(__GIT_DATE__)

  return (
    <div class="version-popover" onClick={onClose}>
      <div class="version-content">
        <div class="version-row">
          <span class="version-label">Commit</span>
          <span class="version-value">{__GIT_COMMIT__}</span>
        </div>
        <div class="version-row">
          <span class="version-label">Date</span>
          <span class="version-value">{__GIT_DATE__}<br />{timeAgo && ` (${timeAgo})`}</span>
        </div>
        <div class="version-row">
          <span class="version-label">Message</span>
          <span class="version-value">{__GIT_MESSAGE__}</span>
        </div>
      </div>
    </div>
  )
}
