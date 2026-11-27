import type { AiChatRequest } from "../contract.js";
import { demoTools } from "./demo.js";
import { githubTools } from "./github.js";
import { secretsTools } from "./secrets.js";
import type { Tool, ToolContext } from "./types.js";

export { truncateResult, ToolError } from "./types.js";
export type { Tool, ToolContext } from "./types.js";

export function selectTools(req: AiChatRequest, ctx: Omit<ToolContext, "signal">): { tools: Tool[]; notes: string[] } {
  const tools: Tool[] = [];
  const notes: string[] = [];
  if (req.provider === "mock") tools.push(...demoTools);
  if (req.tools_enabled?.github) {
    if (ctx.githubToken) tools.push(...githubTools);
    else notes.push("GitHub tools are enabled but no GitHub token was provided, so they are unavailable.");
  }
  if (req.tools_enabled?.secrets) {
    if (ctx.secretsToken && ctx.secretsApiUrl) tools.push(...secretsTools);
    else notes.push("Secrets tools are enabled but no Secrets session token / API URL was provided, so they are unavailable.");
  }
  return { tools, notes };
}
