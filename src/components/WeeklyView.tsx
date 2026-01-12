import type { JSX } from 'preact'
import { useMemo } from 'preact/hooks'
import type { DayInfo } from '../types'
import { LAYOUT } from '../constants'
import { highlightedDays } from './App'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Milestones that get view transitions
const VIEW_TRANSITION_LABELS = new Set(['Start', 'Announce!', 'Third Trimester', 'Due'])

const DAY_LABELS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']
const DAY_LABELS_SHORT = ['T', 'F', 'S', 'S', 'M', 'T', 'W']

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

type WeeklyViewProps = {
  days: DayInfo[]
  windowSize: { width: number; height: number }
  isLandscape: boolean
  startDate: Date
  onDayClick: (e: MouseEvent, day: DayInfo) => void
  selectedDayIndex: number | null
}

export function WeeklyView({
  days,
  windowSize,
  isLandscape,
  startDate,
  onDayClick,
  selectedDayIndex,
}: WeeklyViewProps) {
  const startDayOfWeek = (startDate.getDay() + 3) % 7
  const totalDays = days.length
  const totalWeeks = Math.ceil((startDayOfWeek + totalDays) / 7)

  const weekLabels = useMemo(() => {
    const monthStartsInWeek: Map<number, string> = new Map()
    let lastMonth = -1

    for (let i = 0; i < totalDays; i++) {
      const date = addDays(startDate, i)
      const month = date.getMonth()
      if (month !== lastMonth) {
        const weekIndex = Math.floor((startDayOfWeek + i) / 7)
        if (!monthStartsInWeek.has(weekIndex)) {
          monthStartsInWeek.set(weekIndex, MONTHS[month])
        }
        lastMonth = month
      }
    }

    const labels: { weekNum: number; month?: string; position: number }[] = []
    for (let week = 0; week < totalWeeks; week++) {
      labels.push({
        weekNum: week + 1,
        month: monthStartsInWeek.get(week),
        position: week,
      })
    }
    return labels
  }, [totalDays, startDayOfWeek, totalWeeks, startDate])

  const { cellSize, labelSize, gap } = useMemo(() => {
    const { padding, weeklyGridGap, weekLabelWidth, monthLabelHeight, dayLabelHeight } = LAYOUT

    let availableWidth: number
    let availableHeight: number
    let numCols: number
    let numRows: number

    if (isLandscape) {
      availableWidth = windowSize.width - padding * 2 - weekLabelWidth
      availableHeight = windowSize.height - padding * 2 - monthLabelHeight
      numCols = totalWeeks
      numRows = 7
    } else {
      // Portrait: grid has [auto, 7 cells, auto] columns and [auto header, N cell rows]
      // Account for both side columns (week nums + month labels ~same width)
      availableWidth = windowSize.width - padding * 2 - weekLabelWidth * 2
      // Only subtract dayLabelHeight for header row (month labels are in a column, not row)
      availableHeight = windowSize.height - padding * 2 - dayLabelHeight
      numCols = 7
      numRows = totalWeeks
    }

    const maxCellWidth = (availableWidth - weeklyGridGap * (numCols - 1)) / numCols
    const maxCellHeight = (availableHeight - weeklyGridGap * (numRows - 1)) / numRows
    const size = Math.min(maxCellWidth, maxCellHeight)

    return {
      cellSize: Math.max(size, 8),
      labelSize: Math.max(8, Math.min(11, size * 0.4)),
      gap: weeklyGridGap,
    }
  }, [windowSize, isLandscape, totalWeeks])

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
    const gridWidth = totalWeeks * cellSize + (totalWeeks - 1) * gap

    return (
      <div class="weekly-view landscape" style={{ padding: `${LAYOUT.padding}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div class="weekly-body">
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

          <div class="weekly-grid-wrapper">
            <div class="weekly-week-nums-row" style={{ height: `${labelSize + 4}px`, width: `${gridWidth}px` }}>
              {weekLabels.map((label, i) => (
                <span
                  key={i}
                  class="weekly-week-num"
                  style={{
                    left: `${label.position * (cellSize + gap) + cellSize / 2}px`,
                    fontSize: `${labelSize}px`,
                  }}
                >
                  {label.weekNum}
                </span>
              ))}
            </div>

            <div
              class="weekly-grid"
              style={{
                gridTemplateColumns: `repeat(${totalWeeks}, ${cellSize}px)`,
                gridTemplateRows: `repeat(7, ${cellSize}px)`,
                gap: `${gap}px`,
              }}
            >
              {Array.from({ length: 7 }, (_, dayOfWeek) =>
                weekData.map((week, weekIndex) => {
                  const day = week[dayOfWeek]
                  return day ? (
                    <div
                      key={`${weekIndex}-${dayOfWeek}`}
                      class={`weekly-cell ${day.passed ? 'passed' : 'future'} ${day.color ? 'milestone' : ''} ${day.isUncoloredMilestone ? 'uncolored-milestone' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''} ${selectedDayIndex === day.index ? 'selected' : ''} ${highlightedDays.value.indices.has(day.index) ? 'highlighted' : ''}`}
                      style={{
                        ...(VIEW_TRANSITION_LABELS.has(day.annotation) ? { viewTransitionName: `day-${day.index}` } : day.isToday ? { viewTransitionName: 'today-marker' } : {}),
                        gridColumn: weekIndex + 1,
                        gridRow: dayOfWeek + 1,
                        ...(day.color ? { background: `var(--color-${day.color})` } : {}),
                        ...(highlightedDays.value.indices.has(day.index) && highlightedDays.value.color ? { '--highlight-color': `var(--color-${highlightedDays.value.color})` } as JSX.CSSProperties : {}),
                      }}
                      onClick={(e) => onDayClick(e as unknown as MouseEvent, day)}
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

            <div class="weekly-month-labels-row" style={{ height: `${labelSize + 4}px`, width: `${gridWidth}px` }}>
              {weekLabels.filter(l => l.month).map((label, i) => (
                <span
                  key={i}
                  class="weekly-month-label"
                  style={{
                    left: `${label.position * (cellSize + gap) + cellSize / 2}px`,
                    fontSize: `${labelSize}px`,
                  }}
                >
                  {label.month}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  } else {
    const monthByWeek = new Map(weekLabels.filter(l => l.month).map(l => [l.position, l.month]))

    return (
      <div class="weekly-view portrait" style={{ padding: `${LAYOUT.padding}px` }}>
        <div
          class="weekly-unified-grid"
          style={{
            gap: `${gap}px`,
            fontSize: `${labelSize}px`,
            gridTemplateColumns: `auto repeat(7, ${cellSize}px) auto`,
            gridTemplateRows: `auto repeat(${totalWeeks}, ${cellSize}px)`,
          }}
        >
          <div class="weekly-corner" />
          {usedDayLabels.map((label, i) => (
            <div key={`day-${i}`} class="weekly-day-label">{label}</div>
          ))}
          <div class="weekly-corner" />

          {weekData.map((week, weekIndex) => (
            <>
              <div key={`week-${weekIndex}`} class="weekly-week-num">{weekIndex + 1}</div>
              {week.map((day, dayOfWeek) =>
                day ? (
                  <div
                    key={`${weekIndex}-${dayOfWeek}`}
                    class={`weekly-cell ${day.passed ? 'passed' : 'future'} ${day.color ? 'milestone' : ''} ${day.isUncoloredMilestone ? 'uncolored-milestone' : ''} ${day.isOddWeek ? 'odd-week' : 'even-week'} ${day.isToday ? 'today' : ''} ${selectedDayIndex === day.index ? 'selected' : ''} ${highlightedDays.value.indices.has(day.index) ? 'highlighted' : ''}`}
                    style={{
                      ...(VIEW_TRANSITION_LABELS.has(day.annotation) ? { viewTransitionName: `day-${day.index}` } : day.isToday ? { viewTransitionName: 'today-marker' } : {}),
                      ...(day.color ? { background: `var(--color-${day.color})` } : {}),
                      ...(highlightedDays.value.indices.has(day.index) && highlightedDays.value.color ? { '--highlight-color': `var(--color-${highlightedDays.value.color})` } as JSX.CSSProperties : {}),
                    }}
                    onClick={(e) => onDayClick(e as unknown as MouseEvent, day)}
                  />
                ) : (
                  <div
                    key={`${weekIndex}-${dayOfWeek}`}
                    class="weekly-cell empty"
                  />
                )
              )}
              <div key={`month-${weekIndex}`} class="weekly-month-label">
                {monthByWeek.get(weekIndex) || ''}
              </div>
            </>
          ))}
        </div>
      </div>
    )
  }
}
