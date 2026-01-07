import { useMemo, useState, useEffect } from 'preact/hooks'
import './app.css'

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
  let bestCols = 1
  let bestRows = totalDays
  let bestEmpty = totalDays - 1
  let bestAspectDiff = Infinity

  for (let cols = 1; cols <= totalDays; cols++) {
    const rows = Math.ceil(totalDays / cols)
    const empty = cols * rows - totalDays
    const cellAspect = (width / cols) / (height / rows)
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

export function App() {
  const [windowSize, setWindowSize] = useState(getViewportSize)

  useEffect(() => {
    const handleResize = () => setWindowSize(getViewportSize())
    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
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
        isWeekStart: i % 7 === 0,
        dateLabel: i % 7 === 0 ? `${formatDate(date)} (${weekNum})` : formatDate(date),
        annotation,
      }
    })
  }, [totalDays, daysPassed, discoveryDay, hospitalScanDay, drRodinDay, tenWeekScanDay, announcementDay])

  const weeksRemaining = Math.ceil((totalDays - daysPassed) / 7)
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
            class={`day ${day.passed ? 'passed' : 'future'} ${day.isDiscovery ? 'discovery' : ''} ${day.isAnnouncement ? 'announcement' : ''} ${day.isEngagement ? 'engagement' : ''} ${day.isDueDate ? 'due-date' : ''} ${day.isWeekStart ? 'week-start' : ''}`}
          >
            <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{day.dateLabel}</span>
            {day.annotation && <span class="annotation" style={{ fontSize: `${fontSize}px` }}>{day.annotation}</span>}
          </div>
        ))}
      </div>
      <div class="info">
        <span>{daysPassed} / {totalDays} days</span>
        <span>{progressPercent}%</span>
        <span>{weeksRemaining} weeks to go</span>
      </div>
    </div>
  )
}
