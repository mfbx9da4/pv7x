const REPO_OWNER = "mfbx9da4";
const REPO_NAME = "meanwhile";
const CONFIG_PATH = "src/config.json";
const BRANCH = "main";

type GitHubFileResponse = {
	sha: string;
	content: string;
	encoding: string;
};

export async function getConfig(token: string): Promise<string> {
	const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}?ref=${BRANCH}`;

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "meanwhile-config-editor",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch config: ${response.statusText}`);
	}

	const data = (await response.json()) as GitHubFileResponse;

	// GitHub returns base64 encoded content
	const content = atob(data.content.replace(/\n/g, ""));
	return content;
}

export async function commitConfig(
	token: string,
	newContent: string,
	commitMessage: string,
): Promise<string> {
	// First get the current file to get its SHA
	const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}?ref=${BRANCH}`;

	const getResponse = await fetch(getUrl, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "meanwhile-config-editor",
		},
	});

	if (!getResponse.ok) {
		throw new Error(`Failed to get current config: ${getResponse.statusText}`);
	}

	const currentFile = (await getResponse.json()) as GitHubFileResponse;

	// Update the file
	const updateUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONFIG_PATH}`;

	const updateResponse = await fetch(updateUrl, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "meanwhile-config-editor",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			message: `[Config Editor] ${commitMessage}`,
			content: btoa(newContent),
			sha: currentFile.sha,
			branch: BRANCH,
		}),
	});

	if (!updateResponse.ok) {
		const error = await updateResponse.text();
		throw new Error(`Failed to commit config: ${updateResponse.statusText} - ${error}`);
	}

	const result = (await updateResponse.json()) as { commit: { html_url: string } };
	return result.commit.html_url;
}
