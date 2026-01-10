import { useState, useEffect } from 'preact/hooks'

type CountdownTimerProps = {
  targetDate: Date
}

function calculateTimeRemaining(target: Date) {
  const now = new Date()
  const diff = target.getTime() - now.getTime()

  if (diff <= 0) {
    return { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  const totalSeconds = Math.floor(diff / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)
  const weeks = Math.floor(totalDays / 7)

  const days = totalDays % 7
  const hours = totalHours % 24
  const minutes = totalMinutes % 60
  const seconds = totalSeconds % 60

  return { weeks, days, hours, minutes, seconds }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function CountdownTimer({ targetDate }: CountdownTimerProps) {
  const [time, setTime] = useState(() => calculateTimeRemaining(targetDate))

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(calculateTimeRemaining(targetDate))
    }, 1000)

    return () => clearInterval(interval)
  }, [targetDate])

  return (
    <div class="countdown-timer">
      <span class="countdown-value">{pad(time.weeks)}</span>
      <span class="countdown-label">w</span>
      <span class="countdown-value">{pad(time.days)}</span>
      <span class="countdown-label">d</span>
      <span class="countdown-value">{pad(time.hours)}</span>
      <span class="countdown-label">h</span>
      <span class="countdown-value">{pad(time.minutes)}</span>
      <span class="countdown-label">m</span>
      <span class="countdown-value">{pad(time.seconds)}</span>
      <span class="countdown-label">s</span>
    </div>
  )
}
