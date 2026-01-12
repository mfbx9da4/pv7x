import { useState, useEffect } from 'preact/hooks'

export type ViewMode = 'fill' | 'weekly' | 'timeline'

const VIEW_MODE_KEY = 'pregnancy-visualizer-view-mode'
const TIMELINE_MIN_WIDTH = 900

function getAvailableModes(width: number): ViewMode[] {
  return width >= TIMELINE_MIN_WIDTH
    ? ['fill', 'weekly', 'timeline']
    : ['fill', 'weekly']
}

function getStoredViewMode(width: number): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === 'fill' || stored === 'weekly') {
      return stored
    }
    if (stored === 'timeline' && width >= TIMELINE_MIN_WIDTH) {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return 'fill'
}

export function getNextViewMode(current: ViewMode, width: number): ViewMode {
  const modes = getAvailableModes(width)
  const idx = modes.indexOf(current)
  return modes[(idx + 1) % modes.length]
}

export function useViewMode(width: number) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => getStoredViewMode(width))

  // If timeline is selected but width is too narrow, switch to fill
  useEffect(() => {
    if (viewMode === 'timeline' && width < TIMELINE_MIN_WIDTH) {
      setViewMode('fill')
    }
  }, [width, viewMode])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      // localStorage not available
    }
  }, [viewMode])

  return [viewMode, setViewMode] as const
}
