import { useMemo, useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { signal } from '@preact/signals'
import { haptic } from 'ios-haptics'
import { FillScreenView } from './FillScreenView'
import { WeeklyView } from './WeeklyView'
import { TimelineView } from './TimelineView'
import { InfoBar } from './InfoBar'
import { Tooltip } from './Tooltip'
import { useViewMode, getNextViewMode } from '../hooks/useViewMode'
import { useContentSize } from '../hooks/useContentSize'
import { CONFIG, ANNOTATION_EMOJIS, ANNOTATION_DESCRIPTIONS } from '../config'
import type { DayInfo } from '../types'
import '../styles/app.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Signal for highlighted day indices when a range milestone is selected
export const highlightedDays = signal<{ indices: Set<number>; color?: string }>({ indices: new Set() })

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
  const contentRef = useRef<HTMLDivElement>(null)
  const contentSize = useContentSize(contentRef)
  const [showAnnotationDate, setShowAnnotationDate] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [viewMode, setViewMode] = useViewMode(windowSize.width)

  useEffect(() => {
    const updateSize = () => setWindowSize(getViewportSize())
    window.addEventListener('resize', updateSize)
    window.visualViewport?.addEventListener('resize', updateSize)
    return () => {
      window.removeEventListener('resize', updateSize)
      window.visualViewport?.removeEventListener('resize', updateSize)
    }
  }, [])

  // Dismiss tooltip on tap elsewhere
  useEffect(() => {
    if (!tooltip) return
    const dismiss = () => {
      setTooltip(null)
      highlightedDays.value = { indices: new Set() }
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [tooltip])

  // Auto-dismiss tooltip after 5 seconds
  useEffect(() => {
    if (!tooltip) return
    const timer = setTimeout(() => {
      setTooltip(null)
      highlightedDays.value = { indices: new Set() }
    }, 5000)
    return () => clearTimeout(timer)
  }, [tooltip])

  // Build milestone lookup by day index (needs to be before handleDayClick)
  const milestoneLookup = useMemo(() => {
    const lookup: Record<number, { label: string; color?: string; startIndex: number; endIndex: number }> = {}
    for (const m of CONFIG.milestones) {
      const startIndex = getDaysBetween(CONFIG.startDate, m.date)
      const endIndex = m.endDate ? getDaysBetween(CONFIG.startDate, m.endDate) : startIndex
      lookup[startIndex] = { label: m.label, color: m.color, startIndex, endIndex }
    }
    return lookup
  }, [])

  const handleDayClick = useCallback((e: MouseEvent, day: DayInfo) => {
    e.stopPropagation()
    // If tooltip is open, just close it
    if (tooltip) {
      setTooltip(null)
      highlightedDays.value = { indices: new Set() }
      return
    }
    haptic()
    highlightedDays.value = { indices: new Set() }

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

  const isLandscape = windowSize.width > windowSize.height
  const toggleViewMode = useCallback(() => {
    haptic()
    setViewMode(prev => getNextViewMode(prev, windowSize.width))
  }, [windowSize.width])

  return (
    <div class="container">
      <div ref={contentRef} style={{ flex: 1, overflow: 'hidden' }}>
        {contentSize && (
          viewMode === 'fill' ? (
            <FillScreenView
              days={days}
              windowSize={contentSize}
              showAnnotationDate={showAnnotationDate}
              selectedDayIndex={tooltip?.day.index ?? null}
              startDate={CONFIG.startDate}
              annotationEmojis={ANNOTATION_EMOJIS}
              onDayClick={handleDayClick}
            />
          ) : viewMode === 'weekly' ? (
            <WeeklyView
              days={days}
              windowSize={contentSize}
              isLandscape={isLandscape}
              startDate={CONFIG.startDate}
              onDayClick={handleDayClick}
              selectedDayIndex={tooltip?.day.index ?? null}
            />
          ) : (
            <TimelineView
              days={days}
              windowSize={contentSize}
              startDate={CONFIG.startDate}
              onDayClick={handleDayClick}
              selectedDayIndex={tooltip?.day.index ?? null}
              annotationEmojis={ANNOTATION_EMOJIS}
            />
          )
        )}
      </div>
      <InfoBar
        totalDays={totalDays}
        daysPassed={daysPassed}
        onToggleView={toggleViewMode}
      />
      {tooltip && (
        <Tooltip
          day={tooltip.day}
          position={tooltip.position}
          windowSize={windowSize}
          startDate={CONFIG.startDate}
          dueDate={CONFIG.dueDate}
          annotationEmojis={ANNOTATION_EMOJIS}
          annotationDescriptions={ANNOTATION_DESCRIPTIONS}
        />
      )}
    </div>
  )
}
