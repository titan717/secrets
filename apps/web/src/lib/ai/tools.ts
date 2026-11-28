const TOOL_LABEL: Record<string, string> = {
  read_conversation: "Reading conversation",
  summarize_dock_channel: "Summarizing channel",
  draft_message: "Drafting message",
  list_repos: "Listing repos",
  search_code: "Searching code",
  read_file: "Reading file",
  list_issues: "Listing issues",
  open_issue: "Opening issue",
  create_branch: "Creating branch",
  commit_file: "Committing file",
  open_pr: "Opening pull request",
  demo_search: "Searching the web",
  web_search: "Searching the web",
  webfetch: "Reading a page",
  demo_create_note: "Creating note",
  bash: "Running a command",
  edit: "Editing files",
  read: "Reading files",
};

export function toolLabel(name: string) {
  if (TOOL_LABEL[name]) return TOOL_LABEL[name];
  const n = name.replace(/^github_/, "GitHub · ").replace(/_/g, " ");
  return n.charAt(0).toUpperCase() + n.slice(1);
}
