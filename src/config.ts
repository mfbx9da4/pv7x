export const CONFIG = {
  startDate: new Date(2025, 10, 20),  // November 20, 2025
  dueDate: new Date(2026, 7, 20),     // August 20, 2026
  todayEmoji: '📍',
  milestones: [
    { date: new Date(2025, 10, 20), label: 'Start', emoji: '🌱' },
    { date: new Date(2025, 11, 24), label: 'Discovery', emoji: '🕵️‍♀️', color: 'pink' },
    { date: new Date(2025, 11, 28), label: 'Hospital Scan', emoji: '🏥', description: 'Confirmed heartbeat and normal implantation' },
    { date: new Date(2026, 0, 6), label: 'Dr Rodin', emoji: '👨‍⚕️' },
    { date: new Date(2026, 0, 23), label: 'Blood Tests', emoji: '🩸', description: '10 week blood tests which should reveal gender and any adverse genetic issues' },
    { date: new Date(2026, 1, 5), label: 'Announce!', emoji: '📢', color: 'purple', description: 'Start of second trimester' },
    { date: new Date(2026, 3, 12), label: 'Engagement Party', emoji: '🎉', color: 'orange' },
    { date: new Date(2026, 4, 28), label: 'Third Trimester', emoji: '🤰', color: 'teal', description: 'Start of third trimester (week 28)' },
    { date: new Date(2026, 5, 7), label: 'Dan & Bex Wedding', emoji: '💒', color: 'gold' },
    { date: new Date(2026, 7, 13), label: 'C Section', emoji: '🥗', color: 'blue', description: 'Potential scheduled date of Caesarean section birth' },
    { date: new Date(2026, 7, 20), label: 'Due', emoji: '👶', color: 'red' },
  ],
}

export const ANNOTATION_EMOJIS: Record<string, string> = {
  Today: CONFIG.todayEmoji,
  ...Object.fromEntries(CONFIG.milestones.map(m => [m.label, m.emoji]))
}

export const ANNOTATION_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  CONFIG.milestones.filter(m => m.description).map(m => [m.label, m.description!])
)
