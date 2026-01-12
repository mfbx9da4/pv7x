import type { DayInfo } from '../types'
import { CountdownTimer } from './CountdownTimer'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
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

// Colors that need a different text color for readability
const TEXT_COLOR_OVERRIDES = ['subtle', 'orange', 'gold', 'salmon']

function getAnnotationTextColor(day: DayInfo): string {
  if (day.color && TEXT_COLOR_OVERRIDES.includes(day.color)) {
    return getCssVar(`--color-${day.color}-text`) || getCssVar('--color-text-primary')
  }
  return getDayColor(day)
}

type TooltipProps = {
  day: DayInfo
  position: { x: number; y: number }
  windowSize: { width: number; height: number }
  startDate: Date
  dueDate: Date
  annotationEmojis: Record<string, string>
  annotationDescriptions: Record<string, string>
}

export function Tooltip({
  day,
  position,
  windowSize,
  startDate,
  dueDate,
  annotationEmojis,
  annotationDescriptions,
}: TooltipProps) {
  const date = addDays(startDate, day.index)
  const weekNum = Math.floor(day.index / 7) + 1
  const dayOffset = day.index % 7
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
  const fullDate = `${dayOfWeek}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
  const color = getDayColor(day)
  const annotationColor = getAnnotationTextColor(day)

  const tooltipWidth = 180
  const tooltipHeight = day.annotation ? 70 : 50
  const margin = 12

  let left = position.x - tooltipWidth / 2
  let top = position.y - tooltipHeight - margin

  if (left < margin) left = margin
  if (left + tooltipWidth > windowSize.width - margin) {
    left = windowSize.width - tooltipWidth - margin
  }

  if (top < margin) {
    top = position.y + margin
  }

  const emoji = day.annotation ? annotationEmojis[day.annotation] : null
  const description = day.annotation ? annotationDescriptions[day.annotation] : null

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
        <div class="tooltip-week">Week {weekNum}{dayOffset > 0 ? ` + ${dayOffset}` : ''}</div>
        {day.annotation && <div class="tooltip-annotation" style={{ color: annotationColor }}>{day.annotation}</div>}
        {description && <div class="tooltip-description">{description}</div>}
        {day.isToday && <CountdownTimer targetDate={dueDate} />}
      </div>
    </div>
  )
}
