import { useState, useEffect } from 'preact/hooks'
import type { RefObject } from 'preact'

export function useContentSize(contentRef: RefObject<HTMLDivElement>) {
    const scheduleNext = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(tick, delay)
    }
    const tick = () => {
      updateSize()
      scheduleNext()
    }
    const handleResize = () => {
      updateSize()
      scheduleNext()
    scheduleNext()
    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
    updateSize()
    // Periodic recalc for standalone PWA mode where initial size can be wrong
    let timeoutId: number | null = null
    let startTime = window.performance.now()
    const scheduleUpdate = () => {
      updateSize()
      const elapsed = window.performance.now() - startTime
      const delay = elapsed < 3000 ? 50 : 500
      timeoutId = window.setTimeout(scheduleUpdate, delay)
    }
    timeoutId = window.setTimeout(scheduleUpdate, 50)
    window.addEventListener('resize', updateSize)
    window.visualViewport?.addEventListener('resize', updateSize)
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      window.removeEventListener('resize', updateSize)
      window.visualViewport?.removeEventListener('resize', updateSize)
    }
  }, [contentRef])

  return contentSize
}
