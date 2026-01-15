type ConfigJSON = {
	startDate: string;
	dueDate: string;
	todayEmoji: string;
	milestones: Array<{
		date: string;
		endDate?: string;
		label: string;
		emoji: string;
		color?: string;
		description?: string;
	}>;
};

type ValidationResult = {
	valid: boolean;
	error?: string;
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateConfig(configString: string): ValidationResult {
	// Try to parse as JSON
	let config: ConfigJSON;
	try {
		config = JSON.parse(configString);
	} catch (e) {
		return { valid: false, error: "Invalid JSON syntax" };
	}

	// Check required fields
	if (!config.startDate) {
		return { valid: false, error: "Missing startDate" };
	}
	if (!config.dueDate) {
		return { valid: false, error: "Missing dueDate" };
	}
	if (!config.todayEmoji) {
		return { valid: false, error: "Missing todayEmoji" };
	}
	if (!Array.isArray(config.milestones)) {
		return { valid: false, error: "milestones must be an array" };
	}

	// Validate date formats
	if (!ISO_DATE_REGEX.test(config.startDate)) {
		return {
			valid: false,
			error: `Invalid startDate format: ${config.startDate}. Expected YYYY-MM-DD`,
		};
	}
	if (!ISO_DATE_REGEX.test(config.dueDate)) {
		return {
			valid: false,
			error: `Invalid dueDate format: ${config.dueDate}. Expected YYYY-MM-DD`,
		};
	}

	// Validate each milestone
	for (let i = 0; i < config.milestones.length; i++) {
		const m = config.milestones[i];

		if (!m.date) {
			return { valid: false, error: `Milestone ${i + 1} missing date` };
		}
		if (!ISO_DATE_REGEX.test(m.date)) {
			return {
				valid: false,
				error: `Milestone ${i + 1} invalid date format: ${m.date}`,
			};
		}
		if (m.endDate && !ISO_DATE_REGEX.test(m.endDate)) {
			return {
				valid: false,
				error: `Milestone ${i + 1} invalid endDate format: ${m.endDate}`,
			};
		}
		if (!m.label) {
			return { valid: false, error: `Milestone ${i + 1} missing label` };
		}
		if (!m.emoji) {
			return { valid: false, error: `Milestone ${i + 1} missing emoji` };
		}
	}

	return { valid: true };
}
