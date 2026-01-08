import { useMemo, useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { haptic } from 'ios-haptics'
import { FillView } from './FillView'
import { WeeklyView } from './WeeklyView'
import { InfoBar, VersionPopover, useVersionTap } from './InfoBar'
import { Tooltip } from './Tooltip'
import { useViewMode } from './useViewMode'
import { CONFIG, ANNOTATION_EMOJIS, ANNOTATION_DESCRIPTIONS } from './config'
import type { DayInfo } from './types'
import './app.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type TooltipState = {
  day: DayInfo
  position: { x: number; y: number }
} | null

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

const getViewportSize = () => ({
  width: window.visualViewport?.width ?? window.innerWidth,
  height: window.visualViewport?.height ?? window.innerHeight,
})

export function App() {
  const [windowSize, setWindowSize] = useState(getViewportSize)
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [showAnnotationDate, setShowAnnotationDate] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [showVersion, setShowVersion] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [viewMode, setViewMode] = useViewMode()
  const handleVersionTap = useVersionTap(() => setShowVersion(true))

  useEffect(() => {
    const updateSizes = () => {
      setWindowSize(getViewportSize())
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect()
        setContentSize({ width: rect.width, height: rect.height })
      }
    }
    updateSizes()
    // Periodic recalc for standalone PWA mode where initial size can be wrong
    const interval = setInterval(updateSizes, 500)
    window.addEventListener('resize', updateSizes)
    window.visualViewport?.addEventListener('resize', updateSizes)
    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', updateSizes)
      window.visualViewport?.removeEventListener('resize', updateSizes)
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
    const lookup: Record<number, { label: string; color?: string }> = {}
    for (const m of CONFIG.milestones) {
      const dayIndex = getDaysBetween(CONFIG.startDate, m.date)
      lookup[dayIndex] = { label: m.label, color: m.color }
    }
    return lookup
  }, [])

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
        isUncoloredMilestone: !!milestone && !color,
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
    setViewMode(prev => prev === 'fill' ? 'weekly' : 'fill')
  }, [])

  return (
    <div class="container">
      <div ref={contentRef} style={{ flex: 1, overflow: 'hidden' }}>
        {contentSize && (viewMode === 'fill' ? (
          <FillView
            days={days}
            windowSize={contentSize}
            showAnnotationDate={showAnnotationDate}
            selectedDayIndex={tooltip?.day.index ?? null}
            startDate={CONFIG.startDate}
            annotationEmojis={ANNOTATION_EMOJIS}
            onDayPointerDown={handleDayPointerDown}
          />
        ) : (
          <WeeklyView
            days={days}
            windowSize={contentSize}
            isLandscape={isLandscape}
            startDate={CONFIG.startDate}
            onDayPointerDown={handleDayPointerDown}
            selectedDayIndex={tooltip?.day.index ?? null}
            showDebug={showDebug}
          />
        ))}
      </div>
      <InfoBar
        viewMode={viewMode}
        currentWeek={currentWeek}
        currentDayInWeek={currentDayInWeek}
        progressPercent={progressPercent}
        timeRemaining={timeRemaining}
        onToggleView={toggleViewMode}
        onVersionTap={handleVersionTap}
        onDebugTap={() => setShowDebug(d => !d)}
      />
      {showVersion && (
        <VersionPopover onClose={() => setShowVersion(false)} />
      )}
      {tooltip && (
        <Tooltip
          day={tooltip.day}
          position={tooltip.position}
          windowSize={windowSize}
          startDate={CONFIG.startDate}
          annotationEmojis={ANNOTATION_EMOJIS}
          annotationDescriptions={ANNOTATION_DESCRIPTIONS}
        />
      )}
    </div>
  )
}

