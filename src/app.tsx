import { useMemo, useState, useEffect, useRef, useCallback } from 'preact/hooks'
import { haptic } from 'ios-haptics'
import './app.css'

type DayInfo = {
  index: number
  passed: boolean
  isDiscovery: boolean
  isAnnouncement: boolean
  isEngagement: boolean
  isDueDate: boolean
  isToday: boolean
  isOddWeek: boolean
  dateLabel: string
  annotation: string
}

type TooltipState = {
  day: DayInfo
  position: { x: number; y: number }
} | null

// Hard-coded dates
const START_DATE = new Date(2025, 10, 20) // November 20, 2025
const DISCOVERY_DATE = new Date(2025, 11, 24) // December 24, 2025
const HOSPITAL_SCAN = new Date(2025, 11, 28) // December 28, 2025
const DR_RODIN = new Date(2026, 0, 6) // January 6, 2026
const TEN_WEEK_SCAN = new Date(2026, 0, 23) // January 23, 2026
const ANNOUNCEMENT_DAY = new Date(2026, 1, 5) // February 5, 2026
const ENGAGEMENT_PARTY = new Date(2026, 3, 12) // April 12, 2026
const DUE_DATE = new Date(2026, 7, 20) // August 20, 2026

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const ANNOTATION_EMOJIS: Record<string, string> = {
  'Start': '🌱',
  'Discovery': '🧪',
  'Hospital Scan': '🏥',
  'Dr Rodin': '👨‍⚕️',
  '10 Week Scan': '🔬',
  'Announce!': '📢',
  'Engagement Party': '🎉',
  'Today': '📍',
  'Due': '👶',
}

function getAnnotationDisplay(text: string, cellSize: number, fontSize: number): string {
  // Estimate if text fits: each char ~0.5 * fontSize wide
  const estimatedWidth = text.length * fontSize * 0.5
  const availableWidth = cellSize * 0.9
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

export function App() {
  const [windowSize, setWindowSize] = useState(getViewportSize)
  const [showAnnotationDate, setShowAnnotationDate] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [pressingIndex, setPressingIndex] = useState<number | null>(null)

  const pressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)

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
    // Only allow long press on days with annotations
    if (!day.annotation) return

    e.stopPropagation()
    cancelPress()
    setTooltip(null)

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

  // Cycle annotation display on mobile
  useEffect(() => {
    const interval = setInterval(() => {
      setShowAnnotationDate(prev => !prev)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalDays = getDaysBetween(START_DATE, DUE_DATE) + 1
  const daysPassed = Math.max(0, Math.min(totalDays, getDaysBetween(START_DATE, today) + 1))
  const discoveryDay = getDaysBetween(START_DATE, DISCOVERY_DATE)
  const hospitalScanDay = getDaysBetween(START_DATE, HOSPITAL_SCAN)
  const drRodinDay = getDaysBetween(START_DATE, DR_RODIN)
  const tenWeekScanDay = getDaysBetween(START_DATE, TEN_WEEK_SCAN)
  const announcementDay = getDaysBetween(START_DATE, ANNOUNCEMENT_DAY)
  const engagementPartyDay = getDaysBetween(START_DATE, ENGAGEMENT_PARTY)

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
      const date = addDays(START_DATE, i)
      const weekNum = Math.floor(i / 7) + 1
      let annotation = ''
      if (i === 0) annotation = 'Start'
      else if (i === discoveryDay) annotation = 'Discovery'
      else if (i === hospitalScanDay) annotation = 'Hospital Scan'
      else if (i === drRodinDay) annotation = 'Dr Rodin'
      else if (i === tenWeekScanDay) annotation = '10 Week Scan'
      else if (i === announcementDay) annotation = 'Announce!'
      else if (i === engagementPartyDay) annotation = 'Engagement Party'
      else if (i === daysPassed - 1) annotation = 'Today'
      else if (i === totalDays - 1) annotation = 'Due'

      return {
        index: i,
        passed: i < daysPassed,
        isDiscovery: i === discoveryDay,
        isAnnouncement: i === announcementDay,
        isEngagement: i === engagementPartyDay,
        isDueDate: i === totalDays - 1,
        isToday: i === daysPassed - 1,
        isOddWeek: weekNum % 2 === 1,
        dateLabel: i % 7 === 0 ? `${formatDate(date)} (${weekNum})` : formatDate(date),
        annotation,
      }
    })
  }, [totalDays, daysPassed, discoveryDay, hospitalScanDay, drRodinDay, tenWeekScanDay, announcementDay])

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
            class={`day ${day.passed ? 'passed' : 'future'} ${day.isDiscovery ? 'discovery' : ''} ${day.isAnnouncement ? 'announcement' : ''} ${day.isEngagement ? 'engagement' : ''} ${day.isDueDate ? 'due-date' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''} ${pressingIndex === day.index ? 'pressing' : ''} ${day.annotation ? 'has-annotation' : ''}`}
            onPointerDown={(e) => handlePointerDown(e as unknown as PointerEvent, day)}
            onPointerMove={(e) => handlePointerMove(e as unknown as PointerEvent)}
            onPointerUp={handlePointerUp}
            onPointerCancel={cancelPress}
            onPointerLeave={cancelPress}
          >
            {day.annotation ? (
              cellSize >= 50 ? (
                <>
                  <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{formatDate(addDays(START_DATE, day.index))}</span>
                  <span class="annotation-text visible" style={{ fontSize: `${fontSize}px` }}>{getAnnotationDisplay(day.annotation, cellSize, fontSize)}</span>
                </>
              ) : (
                <span class="annotation-container" style={{ fontSize: `${fontSize}px` }}>
                  <span class={`annotation-text ${showAnnotationDate ? 'hidden' : 'visible'}`}>{getAnnotationDisplay(day.annotation, cellSize, fontSize)}</span>
                  <span class={`annotation-date ${showAnnotationDate ? 'visible' : 'hidden'}`}>{formatDate(addDays(START_DATE, day.index))}</span>
                </span>
              )
            ) : (
              <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{day.dateLabel}</span>
            )}
          </div>
        ))}
      </div>
      <div class="info">
        <span>Week {currentWeek}, Day {currentDayInWeek}</span>
        <span>{progressPercent}%</span>
        <span>{timeRemaining}</span>
      </div>
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

function getDayColor(day: DayInfo): string {
  if (day.isDiscovery) return '#d64d7a'
  if (day.isAnnouncement) return '#8944ab'
  if (day.isEngagement) return '#f5a623'
  if (day.isDueDate) return '#e05550'
  if (day.isToday) return '#2d5a3d'
  if (day.passed) return day.isOddWeek ? '#5fb87d' : '#4a9c68'
  return day.isOddWeek ? '#636366' : '#8e8e93'
}

function Tooltip({ day, position, windowSize }: {
  day: DayInfo
  position: { x: number; y: number }
  windowSize: { width: number; height: number }
}) {
  const date = addDays(START_DATE, day.index)
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
