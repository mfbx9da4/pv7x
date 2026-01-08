import { useMemo, useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { haptic } from 'ios-haptics'
import './app.css'

type DayInfo = {
  index: number
  passed: boolean
  style?: string  // 'discovery' | 'announcement' | 'engagement' | 'due-date'
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
    { date: new Date(2025, 11, 24), label: 'Discovery', emoji: '🧪', style: 'discovery' },
    { date: new Date(2025, 11, 28), label: 'Hospital Scan', emoji: '🏥' },
    { date: new Date(2026, 0, 6), label: 'Dr Rodin', emoji: '👨‍⚕️' },
    { date: new Date(2026, 0, 23), label: 'Blood Tests', emoji: '🩸' },
    { date: new Date(2026, 1, 5), label: 'Announce!', emoji: '📢', style: 'announcement' },
    { date: new Date(2026, 3, 12), label: 'Engagement Party', emoji: '🎉', style: 'engagement' },
    { date: new Date(2026, 7, 20), label: 'Due', emoji: '👶', style: 'due-date' },
  ],
}
// ============================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Build emoji lookup from config
const ANNOTATION_EMOJIS: Record<string, string> = {
  Today: CONFIG.todayEmoji,
  ...Object.fromEntries(CONFIG.milestones.map(m => [m.label, m.emoji]))
}

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

const LONG_PRESS_DURATION = 400
const LONG_PRESS_MOVE_THRESHOLD = 10
const VERSION_TAP_COUNT = 5
const VERSION_TAP_TIMEOUT = 500
const DOUBLE_TAP_TIMEOUT = 300

export function App() {
  const [windowSize, setWindowSize] = useState(getViewportSize)
  const [showAnnotationDate, setShowAnnotationDate] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [pressingIndex, setPressingIndex] = useState<number | null>(null)
  const [showVersion, setShowVersion] = useState(false)

  const pressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const versionTapCount = useRef(0)
  const versionTapTimer = useRef<number | null>(null)
  const lastTap = useRef<{ time: number; index: number } | null>(null)

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

  const cancelPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressStart.current = null
    setPressingIndex(null)
  }, [])

  const handlePointerDown = useCallback((e: PointerEvent, day: DayInfo) => {
    // Only allow long press/double-tap on days with annotations
    if (!day.annotation) return

    e.stopPropagation()
    cancelPress()
    setTooltip(null)

    const now = Date.now()

    // Check for double-tap
    if (lastTap.current &&
        lastTap.current.index === day.index &&
        now - lastTap.current.time < DOUBLE_TAP_TIMEOUT) {
      // Double-tap detected
      lastTap.current = null
      haptic()
      setTooltip({
        day,
        position: { x: e.clientX, y: e.clientY }
      })
      return
    }

    lastTap.current = { time: now, index: day.index }

    pressStart.current = { x: e.clientX, y: e.clientY }
    setPressingIndex(day.index)

    pressTimer.current = window.setTimeout(() => {
      // Haptic feedback on successful long press (works on iOS 18+ and Android)
      haptic()
      setTooltip({
        day,
        position: { x: e.clientX, y: e.clientY }
      })
      setPressingIndex(null)
      pressTimer.current = null
    }, LONG_PRESS_DURATION)
  }, [cancelPress])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!pressStart.current) return
    const dx = e.clientX - pressStart.current.x
    const dy = e.clientY - pressStart.current.y
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      cancelPress()
    }
  }, [cancelPress])

  const handlePointerUp = useCallback(() => {
    cancelPress()
  }, [cancelPress])

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

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalDays = getDaysBetween(CONFIG.startDate, CONFIG.dueDate) + 1
  const daysPassed = Math.max(0, Math.min(totalDays, getDaysBetween(CONFIG.startDate, today) + 1))

  // Build milestone lookup by day index
  const milestoneLookup = useMemo(() => {
    const lookup: Record<number, { label: string; style?: string }> = {}
    for (const m of CONFIG.milestones) {
      const dayIndex = getDaysBetween(CONFIG.startDate, m.date)
      lookup[dayIndex] = { label: m.label, style: m.style }
    }
    return lookup
  }, [])

  const { cols, rows } = useMemo(() => calculateGrid(totalDays, windowSize.width, windowSize.height), [totalDays, windowSize])

  const cellSize = useMemo(() => {
    const availableWidth = windowSize.width - 16 // padding
    const availableHeight = windowSize.height - 50 // padding + info bar
    const cellWidth = availableWidth / cols
    const cellHeight = availableHeight / rows
    return Math.min(cellWidth, cellHeight)
  }, [windowSize, cols, rows])

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
      let style: string | undefined
      if (milestone) {
        annotation = milestone.label
        style = milestone.style
      } else if (isToday) {
        annotation = 'Today'
      }

      return {
        index: i,
        passed: i < daysPassed,
        style,
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

  return (
    <div class="container">
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
            class={`day ${day.passed ? 'passed' : 'future'} ${day.style || ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''} ${pressingIndex === day.index ? 'pressing' : ''} ${day.annotation ? 'has-annotation' : ''}`}
            onPointerDown={(e) => handlePointerDown(e as unknown as PointerEvent, day)}
            onPointerMove={(e) => handlePointerMove(e as unknown as PointerEvent)}
            onPointerUp={handlePointerUp}
            onPointerCancel={cancelPress}
            onPointerLeave={cancelPress}
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
      <div class="info" onClick={handleVersionTap}>
        <span>Week {currentWeek}, Day {currentDayInWeek}</span>
        <span>{progressPercent}%</span>
        <span>{timeRemaining}</span>
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

const STYLE_COLORS: Record<string, string> = {
  'discovery': '#d64d7a',
  'announcement': '#8944ab',
  'engagement': '#f5a623',
  'due-date': '#e05550',
}

function getDayColor(day: DayInfo): string {
  if (day.style && STYLE_COLORS[day.style]) return STYLE_COLORS[day.style]
  if (day.isToday) return '#2d5a3d'
  if (day.passed) return day.isOddWeek ? '#5fb87d' : '#4a9c68'
  return day.isOddWeek ? '#636366' : '#8e8e93'
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

  return (
    <div
      class="day-tooltip"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        borderColor: color,
      }}
    >
      <div class="tooltip-date">{fullDate}</div>
      <div class="tooltip-week">Week {weekNum}, Day {(day.index % 7) + 1}</div>
      {day.annotation && <div class="tooltip-annotation" style={{ color }}>{day.annotation}</div>}
    </div>
  )
}

function VersionPopover({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div class="version-popover" onClick={onClose}>
      <div class="version-content">
        <div class="version-row">
          <span class="version-label">Commit</span>
          <span class="version-value">{__GIT_COMMIT__}</span>
        </div>
        <div class="version-row">
          <span class="version-label">Date</span>
          <span class="version-value">{__GIT_DATE__}</span>
        </div>
        <div class="version-row">
          <span class="version-label">Message</span>
          <span class="version-value">{__GIT_MESSAGE__}</span>
        </div>
      </div>
    </div>
  )
}
