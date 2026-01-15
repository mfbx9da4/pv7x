import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { editConfig } from "./services/mistral";
import { getConfig, commitConfig } from "./services/github";
import { validateConfig } from "./services/validator";

type Bindings = {
	PIN: string;
	MISTRAL_API_KEY: string;
	GITHUB_TOKEN: string;
};

const app = new OpenAPIHono<{ Bindings: Bindings }>();

// Enable CORS for the frontend
app.use(
	"*",
	cors({
		origin: [
			"https://mfbx9da4.github.io",
			"http://localhost:5173",
			"http://localhost:4173",
		],
	}),
);

// Health check route
const healthRoute = createRoute({
	method: "get",
	path: "/",
	responses: {
		200: {
			description: "Service is healthy",
			content: {
				"application/json": {
					schema: z.object({ status: z.string().openapi({ example: "ok" }) }),
				},
			},
		},
	},
});

app.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));

// Chat route
const chatRoute = createRoute({
	method: "post",
	path: "/api/chat",
	summary: "Edit config via chat",
	description:
		"Send a natural language message to edit the config.json file",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						pin: z.string().openapi({ description: "4-digit authentication PIN" }),
						message: z
							.string()
							.min(1)
							.openapi({ description: "Natural language instruction for editing the config" }),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			description: "Successful response",
			content: {
				"application/json": {
					schema: z.object({
						response: z
							.string()
							.openapi({ description: "LLM response explaining what was done" }),
						configUpdated: z
							.boolean()
							.openapi({ description: "Whether the config was modified" }),
						commitUrl: z
							.string()
							.optional()
							.openapi({ description: "GitHub commit URL (only if configUpdated is true)" }),
					}),
				},
			},
		},
		400: {
			description: "Bad request - missing or invalid message",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		401: {
			description: "Unauthorized - invalid PIN",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		500: {
			description: "Server error",
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
						details: z.string().optional(),
					}),
				},
			},
		},
	},
});

app.openapi(chatRoute, async (c) => {
	const { pin, message } = c.req.valid("json");

	// Validate PIN
	if (pin !== c.env.PIN) {
		return c.json({ error: "Invalid PIN" }, 401);
	}

	try {
		// Get current config from GitHub
		const currentConfig = await getConfig(c.env.GITHUB_TOKEN);

		// Ask Mistral to edit the config
		const result = await editConfig(
			c.env.MISTRAL_API_KEY,
			currentConfig,
			message,
		);

		// If no changes needed, return just the response
		if (!result.newConfig) {
			return c.json({
				response: result.response,
				configUpdated: false,
			}, 200);
		}

		// Validate the new config before committing
		const validation = validateConfig(result.newConfig);
		if (!validation.valid) {
			return c.json({
				response: `I tried to update the config but it failed validation: ${validation.error}`,
				configUpdated: false,
			}, 200);
		}

		// Commit the new config to GitHub
		const commitUrl = await commitConfig(
			c.env.GITHUB_TOKEN,
			result.newConfig,
			message,
		);

		return c.json({
			response: result.response,
			configUpdated: true,
			commitUrl,
		}, 200);
	} catch (error) {
		console.error("Error processing chat:", error);
		return c.json(
			{
				error: "Failed to process request",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
});

// OpenAPI doc endpoint
app.doc("/openapi.json", {
	openapi: "3.1.0",
	info: {
		title: "Meanwhile Config Editor API",
		version: "1.0.0",
		description:
			"Chat-based API for editing the Meanwhile pregnancy tracker config via natural language",
	},
});

export default app;
