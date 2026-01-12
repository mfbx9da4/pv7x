import { useState, useEffect } from 'preact/hooks'

export type ViewMode = 'fill' | 'weekly' | 'timeline'

const VIEW_MODE_KEY = 'pregnancy-visualizer-view-mode'
const ALL_MODES: ViewMode[] = ['fill', 'weekly', 'timeline']

function getStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === 'fill' || stored === 'weekly' || stored === 'timeline') {
      return stored
    }
  } catch {
    // localStorage not available
  }
  return 'fill'
}

export function getNextViewMode(current: ViewMode, _width: number): ViewMode {
  const idx = ALL_MODES.indexOf(current)
  return ALL_MODES[(idx + 1) % ALL_MODES.length]
}

export function useViewMode(_width: number) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => getStoredViewMode())

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode)
    } catch {
      // localStorage not available
    }
  }, [viewMode])

  return [viewMode, setViewMode] as const
}
