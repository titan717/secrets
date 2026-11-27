/** GitHub REST tools. Token comes per request from header x-github-token. Docs: https://docs.github.com/en/rest */
import { num, str, ToolError, type Tool, type ToolContext } from "./types.js";

const GH = "https://api.github.com";

async function gh(ctx: ToolContext, method: string, path: string, body?: unknown): Promise<any> {
  if (!ctx.githubToken) throw new ToolError("No GitHub token provided (header x-github-token). Add one in AI settings.");
  const res = await fetch(`${GH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ctx.githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai.secrets",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: ctx.signal,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let j: any = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {
    j = text;
  }
  if (!res.ok) {
    const msg = j?.message ?? text;
    const errs = Array.isArray(j?.errors) ? ` ${j.errors.map((e: any) => e.message ?? e.code).join("; ")}` : "";
    const hint =
      res.status === 401 ? " (token invalid or expired)" : res.status === 403 ? " (insufficient token scope or rate limited)" : res.status === 404 ? " (not found or no access)" : "";
    throw new ToolError(`GitHub ${method} ${path.split("?")[0]} failed: ${res.status}${hint} ${msg}${errs}`.trim());
  }
  return j;
}

const seg = (s: string) => s.split("/").map(encodeURIComponent).join("/");
const repoPath = (a: Record<string, unknown>) => `/repos/${encodeURIComponent(str(a, "owner"))}/${encodeURIComponent(str(a, "repo"))}`;
const ownerRepo = {
  owner: { type: "string" as const, description: "Repository owner (user or org)" },
  repo: { type: "string" as const, description: "Repository name" },
};

async function defaultBranch(ctx: ToolContext, a: Record<string, unknown>): Promise<string> {
  return (await gh(ctx, "GET", repoPath(a))).default_branch;
}

export const githubTools: Tool[] = [
  {
    name: "list_repos",
    description: "List repositories the authenticated GitHub user can access, most recently updated first.",
    writes: false,
    parameters: {
      type: "object",
      properties: { per_page: { type: "integer", description: "Max repos (1-100, default 30)" }, query: { type: "string", description: "Optional substring filter on full name" } },
    },
    async run(a, ctx) {
      const repos = await gh(ctx, "GET", `/user/repos?sort=updated&per_page=${num(a, "per_page", 30)}`);
      const q = str(a, "query", false).toLowerCase();
      return (repos as any[])
        .filter((r) => !q || r.full_name.toLowerCase().includes(q))
        .map((r) => ({ full_name: r.full_name, private: r.private, description: r.description, default_branch: r.default_branch, language: r.language, updated_at: r.updated_at }));
    },
  },
  {
    name: "read_file",
    description: "Read a file (or list a directory) from a GitHub repository.",
    writes: false,
    parameters: {
      type: "object",
      properties: { ...ownerRepo, path: { type: "string", description: "File or directory path; empty for repo root" }, ref: { type: "string", description: "Branch, tag or commit SHA (default branch if omitted)" } },
      required: ["owner", "repo"],
    },
    async run(a, ctx) {
      const ref = str(a, "ref", false);
      const j = await gh(ctx, "GET", `${repoPath(a)}/contents/${seg(str(a, "path", false))}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`);
      if (Array.isArray(j)) return { type: "dir", entries: j.map((e: any) => ({ name: e.name, path: e.path, type: e.type, size: e.size })) };
      if (j.type !== "file") return { type: j.type, path: j.path };
      if (j.encoding !== "base64" || !j.content) return { path: j.path, size: j.size, note: "File too large or not inline; use download_url", download_url: j.download_url };
      const content = Buffer.from(j.content, "base64").toString("utf8");
      const MAX = 20_000;
      return { path: j.path, sha: j.sha, size: j.size, content: content.length > MAX ? `${content.slice(0, MAX)}\n…[truncated ${content.length - MAX} chars]` : content };
    },
  },
  {
    name: "search_code",
    description: "Search code on GitHub using GitHub code search syntax, e.g. 'useState repo:owner/name' or 'TODO org:acme language:ts'.",
    writes: false,
    parameters: { type: "object", properties: { q: { type: "string", description: "Search query (GitHub search syntax)" }, per_page: { type: "integer", description: "1-50, default 20" } }, required: ["q"] },
    async run(a, ctx) {
      const j = await gh(ctx, "GET", `/search/code?q=${encodeURIComponent(str(a, "q"))}&per_page=${num(a, "per_page", 20, 1, 50)}`);
      return { total_count: j.total_count, items: (j.items ?? []).map((i: any) => ({ repo: i.repository?.full_name, path: i.path, url: i.html_url })) };
    },
  },
  {
    name: "list_issues",
    description: "List issues (not pull requests) in a repository.",
    writes: false,
    parameters: {
      type: "object",
      properties: { ...ownerRepo, state: { type: "string", enum: ["open", "closed", "all"], description: "default open" }, per_page: { type: "integer", description: "1-100, default 30" } },
      required: ["owner", "repo"],
    },
    async run(a, ctx) {
      const state = ["open", "closed", "all"].includes(String(a.state)) ? String(a.state) : "open";
      const j = await gh(ctx, "GET", `${repoPath(a)}/issues?state=${state}&per_page=${num(a, "per_page", 30)}`);
      return (j as any[])
        .filter((i) => !i.pull_request)
        .map((i) => ({ number: i.number, title: i.title, state: i.state, user: i.user?.login, labels: i.labels?.map((l: any) => l.name), comments: i.comments, url: i.html_url, body: i.body ? String(i.body).slice(0, 500) : "" }));
    },
  },
  {
    name: "create_branch",
    description: "Create a new branch in a repository from an existing branch (default branch if 'from' omitted).",
    writes: true,
    parameters: { type: "object", properties: { ...ownerRepo, branch: { type: "string", description: "New branch name" }, from: { type: "string", description: "Source branch" } }, required: ["owner", "repo", "branch"] },
    async run(a, ctx) {
      const from = str(a, "from", false) || (await defaultBranch(ctx, a));
      const ref = await gh(ctx, "GET", `${repoPath(a)}/git/ref/heads/${seg(from)}`);
      const created = await gh(ctx, "POST", `${repoPath(a)}/git/refs`, { ref: `refs/heads/${str(a, "branch")}`, sha: ref.object.sha });
      return { branch: str(a, "branch"), from, sha: created.object?.sha };
    },
  },
  {
    name: "commit_file",
    description: "Create or update a single file on a branch with a commit.",
    writes: true,
    parameters: {
      type: "object",
      properties: {
        ...ownerRepo,
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "Full new file content (UTF-8)" },
        message: { type: "string", description: "Commit message" },
        branch: { type: "string", description: "Target branch (default branch if omitted)" },
      },
      required: ["owner", "repo", "path", "content", "message"],
    },
    async run(a, ctx) {
      const branch = str(a, "branch", false) || (await defaultBranch(ctx, a));
      const path = `${repoPath(a)}/contents/${seg(str(a, "path"))}`;
      let sha: string | undefined;
      try {
        const existing = await gh(ctx, "GET", `${path}?ref=${encodeURIComponent(branch)}`);
        if (!Array.isArray(existing)) sha = existing.sha;
      } catch (e) {
        if (!/ 404/.test((e as Error).message)) throw e;
      }
      const j = await gh(ctx, "PUT", path, { message: str(a, "message"), content: Buffer.from(String(a.content ?? ""), "utf8").toString("base64"), branch, ...(sha ? { sha } : {}) });
      return { path: j.content?.path, branch, commit_sha: j.commit?.sha, commit_url: j.commit?.html_url, created: !sha };
    },
  },
  {
    name: "open_issue",
    description: "Open a new issue in a repository.",
    writes: true,
    parameters: { type: "object", properties: { ...ownerRepo, title: { type: "string" }, body: { type: "string", description: "Markdown body" } }, required: ["owner", "repo", "title"] },
    async run(a, ctx) {
      const j = await gh(ctx, "POST", `${repoPath(a)}/issues`, { title: str(a, "title"), body: str(a, "body", false) });
      return { number: j.number, url: j.html_url };
    },
  },
  {
    name: "open_pr",
    description: "Open a pull request from head branch into base branch (default branch if base omitted).",
    writes: true,
    parameters: {
      type: "object",
      properties: { ...ownerRepo, title: { type: "string" }, head: { type: "string", description: "Branch with changes" }, base: { type: "string", description: "Target branch" }, body: { type: "string" } },
      required: ["owner", "repo", "title", "head"],
    },
    async run(a, ctx) {
      const base = str(a, "base", false) || (await defaultBranch(ctx, a));
      const j = await gh(ctx, "POST", `${repoPath(a)}/pulls`, { title: str(a, "title"), head: str(a, "head"), base, body: str(a, "body", false) });
      return { number: j.number, url: j.html_url, base, head: str(a, "head") };
    },
  },
];
