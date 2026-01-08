import { useMemo } from 'preact/hooks'
import type { DayInfo } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
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

function getAnnotationDisplay(
  text: string,
  cellSize: number,
  fontSize: number,
  annotationEmojis: Record<string, string>
): string {
  const longestWord = text.split(' ').reduce((a, b) => a.length > b.length ? a : b, '')
  const estimatedWidth = longestWord.length * fontSize * 0.55
  const availableWidth = cellSize * 0.85
  if (estimatedWidth <= availableWidth) {
    return text
  }
  return annotationEmojis[text] || text
}

type FillViewProps = {
  days: DayInfo[]
  windowSize: { width: number; height: number }
  showAnnotationDate: boolean
  selectedDayIndex: number | null
  startDate: Date
  annotationEmojis: Record<string, string>
  onDayPointerDown: (e: PointerEvent, day: DayInfo) => void
}

export function FillView({
  days,
  windowSize,
  showAnnotationDate,
  selectedDayIndex,
  startDate,
  annotationEmojis,
  onDayPointerDown,
}: FillViewProps) {
  const totalDays = days.length
  const availableWidth = windowSize.width - 20
  const availableHeight = windowSize.height

  const { cols, rows } = useMemo(
    () => calculateGrid(totalDays, availableWidth, availableHeight),
    [totalDays, availableWidth, availableHeight]
  )

  const cellSize = useMemo(() => {
    const cellWidth = availableWidth / cols
    const cellHeight = availableHeight / rows
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
      }}
    >
      {days.map((day) => (
        <div
          key={day.index}
          class={`day ${day.passed ? 'passed' : 'future'} ${day.color ? 'milestone' : ''} ${day.isUncoloredMilestone ? 'uncolored-milestone' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''} ${day.annotation ? 'has-annotation' : ''} ${selectedDayIndex === day.index ? 'selected' : ''}`}
          style={day.color ? { background: `var(--color-${day.color})`, color: `var(--color-${day.color}-text)` } : undefined}
          onPointerDown={(e) => onDayPointerDown(e as unknown as PointerEvent, day)}
        >
          {day.annotation ? (
            cellSize >= 50 ? (
              <>
                <span class="date-label" style={{ fontSize: `${fontSize}px` }}>{formatDate(addDays(startDate, day.index))}</span>
                <span class="annotation-text visible" style={{ fontSize: `${fontSize}px` }}>{getAnnotationDisplay(day.annotation, cellSize, fontSize, annotationEmojis)}</span>
              </>
            ) : (
              <span class="annotation-container" style={{ fontSize: `${fontSize}px` }}>
                <span class={`annotation-text ${showAnnotationDate ? 'hidden' : 'visible'}`}>{getAnnotationDisplay(day.annotation, cellSize, fontSize, annotationEmojis)}</span>
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
