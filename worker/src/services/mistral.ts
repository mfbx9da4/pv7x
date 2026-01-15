import { Mistral } from "@mistralai/mistralai";
import { SYSTEM_PROMPT } from "../prompts/system";

type EditResult = {
	response: string;
	newConfig: string | null;
};

export async function editConfig(
	apiKey: string,
	currentConfig: string,
	userMessage: string,
): Promise<EditResult> {
	const client = new Mistral({ apiKey });

	const response = await client.chat.complete({
		model: "mistral-large-latest",
		messages: [
			{
				role: "system",
				content: SYSTEM_PROMPT,
			},
			{
				role: "user",
				content: `Current config.json:
\`\`\`json
${currentConfig}
\`\`\`

User request: ${userMessage}`,
			},
		],
	});

	const content =
		response.choices?.[0]?.message?.content || "No response generated";
	const text = typeof content === "string" ? content : JSON.stringify(content);

	// Check if response contains a JSON code block with updated config
	const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);

	if (jsonMatch) {
		// Extract the JSON and the explanation
		const newConfig = jsonMatch[1].trim();
		const explanation = text.replace(/```json\n[\s\S]*?\n```/, "").trim();

		return {
			response: explanation || "Config updated successfully!",
			newConfig,
		};
	}

	// No config update - just return the response
	return {
		response: text,
		newConfig: null,
	};
}
