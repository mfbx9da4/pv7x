import type { JSX } from 'preact'
import { useMemo, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { DayInfo } from '../types'
import { LAYOUT } from '../constants'
import { highlightedDays } from './App'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Milestones that get view transitions
const VIEW_TRANSITION_LABELS = new Set(['Start', 'Announce!', 'Third Trimester', 'Due'])

function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

type AnnotationTextProps = {
  text: string
  emoji: string
  fontSize: number
  className: string
}

function AnnotationText({ text, emoji, fontSize, className }: AnnotationTextProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [useEmoji, setUseEmoji] = useState(false)

  useLayoutEffect(() => {
    if (ref.current) {
      const overflows = ref.current.scrollWidth > ref.current.clientWidth ||
        ref.current.scrollHeight > ref.current.clientHeight
      setUseEmoji(overflows)
    }
  }, [text, fontSize])

  return (
    <span
      ref={ref}
      class={className}
      style={{ fontSize: `${fontSize}px`, overflow: 'hidden', maxWidth: '100%' }}
    >
      {useEmoji ? emoji : text}
    </span>
  )
}

function calculateGrid(totalDays: number, width: number, height: number): { cols: number; rows: number } {
  const MIN_ASPECT = 0.5
  const MAX_ASPECT = 2.0

  let bestCols = 1
  let bestRows = totalDays
  let bestEmpty = totalDays - 1
  let bestAspectDiff = Infinity

  for (let cols = 1; cols <= totalDays; cols++) {
    const rows = Math.ceil(totalDays / cols)
    const cellAspect = (width / cols) / (height / rows)

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


type FillScreenViewProps = {
  days: DayInfo[]
  windowSize: { width: number; height: number }
  showAnnotationDate: boolean
  selectedDayIndex: number | null
  startDate: Date
  annotationEmojis: Record<string, string>
  onDayClick: (e: MouseEvent, day: DayInfo) => void
}

export function FillScreenView({
  days,
  windowSize,
  showAnnotationDate,
  selectedDayIndex,
  startDate,
  annotationEmojis,
  onDayClick,
}: FillScreenViewProps) {
  const totalDays = days.length
  const availableWidth = windowSize.width - LAYOUT.padding * 2
  const availableHeight = windowSize.height - LAYOUT.padding * 2

  const { cols, rows } = useMemo(
    () => calculateGrid(totalDays, availableWidth, availableHeight),
    [totalDays, availableWidth, availableHeight]
  )

  const cellSize = useMemo(() => {
    // Account for gaps between cells
    const totalGapWidth = LAYOUT.gridGap * (cols - 1)
    const totalGapHeight = LAYOUT.gridGap * (rows - 1)
    const cellWidth = (availableWidth - totalGapWidth) / cols
    const cellHeight = (availableHeight - totalGapHeight) / rows
    return Math.min(cellWidth, cellHeight)
  }, [availableWidth, availableHeight, cols, rows])

  const fontSize = useMemo(() => {
    const base = cellSize * 0.16
    return Math.max(7, Math.min(base, 13))
  }, [cellSize])

  return (
    <div
      class="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        padding: `${LAYOUT.padding}px`,
        gap: `${LAYOUT.gridGap}px`,
        height: '100%',
      }}
    >
      {days.map((day) => (
        <div
          key={day.index}
          class={`day ${day.passed ? 'passed' : 'future'} ${day.color ? 'milestone' : ''} ${day.isUncoloredMilestone ? 'uncolored-milestone' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''} ${day.annotation ? 'has-annotation' : ''} ${selectedDayIndex === day.index ? 'selected' : ''} ${highlightedDays.value.indices.has(day.index) ? 'highlighted' : ''}`}
          style={{
            ...(VIEW_TRANSITION_LABELS.has(day.annotation) ? { viewTransitionName: `day-${day.index}` } : day.isToday ? { viewTransitionName: 'today-marker' } : {}),
            ...(day.color ? { background: `var(--color-${day.color})`, color: `var(--color-${day.color}-text)` } : {}),
            ...(highlightedDays.value.indices.has(day.index) && highlightedDays.value.color ? { '--highlight-color': `var(--color-${highlightedDays.value.color})` } as JSX.CSSProperties : {}),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => onDayClick(e as unknown as MouseEvent, day)}
        >
          {day.annotation ? (
            cellSize >= 50 ? (
              <>
                <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{formatDate(addDays(startDate, day.index))}</span>
                <AnnotationText
                  text={day.annotation}
                  emoji={annotationEmojis[day.annotation] || day.annotation}
                  fontSize={fontSize}
                  className="annotation-text visible"
                />
              </>
            ) : (
              <span class="annotation-container" style={{ fontSize: `${fontSize}px` }}>
                <AnnotationText
                  text={day.annotation}
                  emoji={annotationEmojis[day.annotation] || day.annotation}
                  fontSize={fontSize}
                  className={`annotation-text ${showAnnotationDate ? 'hidden' : 'visible'}`}
                />
                <span class={`annotation-date ${showAnnotationDate ? 'visible' : 'hidden'}`}>{formatDate(addDays(startDate, day.index))}</span>
              </span>
            )
          ) : (
            <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{day.dateLabel}</span>
          )}
        </div>
      ))}
    </div>
  )
}
