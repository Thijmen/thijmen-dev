/**
 * Workers AI text models offered in the settings. Ids checked against
 * `wrangler ai models list` (Sep 2026). Chat-completions models answer with
 * `choices[]`, older ones `response`; workers-ai-provider handles both.
 */
export const MODELS = [
	{ value: "@cf/moonshotai/kimi-k2.6", label: "Kimi K2.6" },
	{ value: "@cf/deepseek-ai/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro" },
	{ value: "@cf/zai-org/glm-5.3", label: "GLM-5.3" },
	{ value: "@cf/openai/gpt-oss-120b", label: "gpt-oss-120b" },
	{ value: "@cf/deepseek-ai/deepseek-v4-flash-0731", label: "DeepSeek V4 Flash (fast)" },
	{ value: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (fast)" },
] as const;

export const DEFAULT_MODEL = MODELS[0].value;
export const DEFAULT_MAX_TOKENS = 8000;
