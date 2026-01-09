import { useEffect, useRef, useCallback, useState } from 'preact/hooks'
import { haptic } from 'ios-haptics'
import type { ViewMode } from '../hooks/useViewMode'

declare const __GIT_COMMIT__: string
declare const __GIT_DATE__: string
declare const __GIT_MESSAGE__: string

const VERSION_TAP_COUNT = 3
const VERSION_TAP_TIMEOUT = 500

export function useVersionTap(onShowVersion: () => void) {
  const versionTapCount = useRef(0)
  const versionTapTimer = useRef<number | null>(null)

  const handleVersionTap = useCallback(() => {
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current)
    }
    versionTapCount.current++
    if (versionTapCount.current >= VERSION_TAP_COUNT) {
      versionTapCount.current = 0
      haptic()
      onShowVersion()
    } else {
      versionTapTimer.current = window.setTimeout(() => {
        versionTapCount.current = 0
      }, VERSION_TAP_TIMEOUT)
    }
  }, [onShowVersion])

  return handleVersionTap
}

type InfoBarProps = {
  viewMode: ViewMode
  totalDays: number
  daysPassed: number
  onToggleView: () => void
}

export function InfoBar({
  viewMode,
  totalDays,
  daysPassed,
  onToggleView,
}: InfoBarProps) {
  const [showVersion, setShowVersion] = useState(false)
  const handleVersionTap = useVersionTap(() => setShowVersion(true))

  const daysRemaining = totalDays - daysPassed
  const weeksRemaining = Math.floor(daysRemaining / 7)
  const extraDays = daysRemaining % 7
  const timeRemaining = weeksRemaining > 0
    ? `Due in ${weeksRemaining} week${weeksRemaining !== 1 ? 's' : ''}${extraDays > 0 ? ` and ${extraDays} day${extraDays !== 1 ? 's' : ''}` : ''}`
    : `Due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
  const timeRemainingCompact = weeksRemaining > 0
    ? `Due in ${weeksRemaining}w${extraDays > 0 ? ` ${extraDays}d` : ''}`
    : `Due in ${daysRemaining}d`
  const daysElapsed = Math.max(0, daysPassed - 1)
  const currentWeek = Math.floor(daysElapsed / 7) + 1
  const currentDayInWeek = daysElapsed % 7
  const progressPercent = ((daysPassed / totalDays) * 100).toFixed(1)

  return (
    <div class="info">
      <button class="view-toggle" onClick={onToggleView} aria-label="Toggle view">
        {viewMode === 'fill' ? (
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="4" height="16" rx="1" fill="currentColor" opacity="0.3"/>
            <rect x="7" y="1" width="4" height="16" rx="1" fill="currentColor" opacity="0.5"/>
            <rect x="13" y="1" width="4" height="16" rx="1" fill="currentColor" opacity="0.7"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="7" y="1" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="13" y="1" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="1" y="7" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="7" y="7" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="13" y="7" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="1" y="13" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="7" y="13" width="4" height="4" rx="1" fill="currentColor"/>
            <rect x="13" y="13" width="4" height="4" rx="1" fill="currentColor"/>
          </svg>
        )}
      </button>
      <span class="info-text">
        <span class="info-full">Week {currentWeek}{currentDayInWeek > 0 ? ` + ${currentDayInWeek}` : ''}</span>
        <span class="info-compact">
          Wk {currentWeek}{currentDayInWeek > 0 ? ` + ${currentDayInWeek}` : ''}
        </span>
      </span>
      <span class="info-text" onClick={handleVersionTap}>{progressPercent}%</span>
      <span class="info-text">
        <span class="info-full">{timeRemaining}</span>
        <span class="info-compact">{timeRemainingCompact}</span>
      </span>
      {showVersion && (
        <VersionPopover onClose={() => setShowVersion(false)} />
      )}
    </div>
  )
}

function getTimeAgo(dateString: string): string {
  const isoString = dateString.replace(' ', 'T').replace(' ', '')
  const date = new Date(isoString)

  if (isNaN(date.getTime())) {
    return ''
  }

  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 0) {
    return ''
  }
  if (seconds < 60) {
    return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 30) {
    return days === 1 ? '1 day ago' : `${days} days ago`
  }
  const months = Math.floor(days / 30)
  if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.floor(months / 12)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

export function VersionPopover({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const timeAgo = getTimeAgo(__GIT_DATE__)

  return (
    <div class="version-popover" onClick={onClose}>
      <div class="version-content">
        <div class="version-row">
          <span class="version-label">Commit</span>
          <span class="version-value">{__GIT_COMMIT__}</span>
        </div>
        <div class="version-row">
          <span class="version-label">Date</span>
          <span class="version-value">{__GIT_DATE__}<br />{timeAgo && ` (${timeAgo})`}</span>
        </div>
        <div class="version-row">
          <span class="version-label">Message</span>
          <span class="version-value">{__GIT_MESSAGE__}</span>
        </div>
      </div>
    </div>
  )
}
