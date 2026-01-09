import { useEffect, useRef, useState } from 'preact/hooks'
import type { RefObject } from 'preact'

export function useContentSize(contentRef: RefObject<HTMLDivElement>) {
  const contentSizeRef = useRef<{ width: number; height: number } | null>(null)
  const [, setTick] = useState(false)
  const pollTimeoutRef = useRef<number | null>(null)

  const forceRender = () => {
    setTick((value) => !value)
  }

  useEffect(() => {
    const updateSize = () => {
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect()
        const nextSize = { width: rect.width, height: rect.height }
        const currentSize = contentSizeRef.current
        if (!currentSize || currentSize.width !== nextSize.width || currentSize.height !== nextSize.height) {
          contentSizeRef.current = nextSize
          forceRender()
        }
      }
    }
    const startTime = performance.now()
    const updateSizeAndScheduleNext = () => {
      updateSize()
      const elapsed = performance.now() - startTime
      const delay = elapsed < 3000 ? 50 : 500
      pollTimeoutRef.current = window.setTimeout(updateSizeAndScheduleNext, delay)
    }
    // Periodic recalc for standalone PWA mode where initial size can be wrong
    updateSizeAndScheduleNext()
    window.addEventListener('resize', updateSize)
    window.visualViewport?.addEventListener('resize', updateSize)
    return () => {
      if (pollTimeoutRef.current) {
        window.clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
      window.removeEventListener('resize', updateSize)
      window.visualViewport?.removeEventListener('resize', updateSize)
    }
  }, [contentRef])

  return contentSizeRef.current
}
