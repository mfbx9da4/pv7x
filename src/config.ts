import configData from "./config.json";

// Type for milestones in the JSON
type MilestoneJSON = {
	date: string;
	endDate?: string;
	label: string;
	emoji: string;
	color?: string;
	description?: string;
};

// Type for the parsed config
export type Milestone = {
	date: Date;
	endDate?: Date;
	label: string;
	emoji: string;
	color?: string;
	description?: string;
};

// Parse dates from JSON strings
export const CONFIG = {
	startDate: new Date(configData.startDate),
	dueDate: new Date(configData.dueDate),
	todayEmoji: configData.todayEmoji,
	milestones: (configData.milestones as MilestoneJSON[]).map((m) => ({
		...m,
		date: new Date(m.date),
		endDate: m.endDate ? new Date(m.endDate) : undefined,
	})) as Milestone[],
};

// Derived exports (computed from config data)
export const ANNOTATION_EMOJIS: Record<string, string> = {
	Today: CONFIG.todayEmoji,
	...Object.fromEntries(CONFIG.milestones.map((m) => [m.label, m.emoji])),
};

export const ANNOTATION_DESCRIPTIONS: Record<string, string> =
	Object.fromEntries(
		CONFIG.milestones
			.filter((m) => m.description)
			.map((m) => [m.label, m.description!]),
	);
