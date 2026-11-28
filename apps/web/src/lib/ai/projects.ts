import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiProject, AiProjectInput } from "@secrets/shared";
import { uuid } from "../id";
import { bridge, bridgeEnabled, mirror } from "./bridge";

interface ProjectsState {
  projects: AiProject[];
  create: (p: AiProjectInput) => AiProject;
  update: (id: string, p: Partial<AiProjectInput>) => void;
  remove: (id: string) => void;
  sync: () => Promise<void>;
}

const now = () => new Date().toISOString();

export const useAiProjects = create<ProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      create: (p) => {
        const project: AiProject = { id: uuid(), ...p, name: p.name.trim() || "Untitled project", createdAt: now(), updatedAt: now() };
        set({ projects: [project, ...get().projects] });
        mirror("POST", "/v1/projects", project);
        return project;
      },
      update: (id, p) => {
        set({ projects: get().projects.map((x) => (x.id === id ? { ...x, ...p, updatedAt: now() } : x)) });
        mirror("PATCH", `/v1/projects/${encodeURIComponent(id)}`, p);
      },
      remove: (id) => {
        set({ projects: get().projects.filter((x) => x.id !== id) });
        mirror("DELETE", `/v1/projects/${encodeURIComponent(id)}`);
      },
      sync: async () => {
        if (!bridgeEnabled()) return;
        try {
          const r = await bridge<{ projects: AiProject[] }>("GET", "/v1/projects");
          set({ projects: r.projects });
        } catch {
          /* keep local */
        }
      },
    }),
    { name: "secrets.ai.projects", version: 1, partialize: ({ projects }) => ({ projects }) as ProjectsState },
  ),
);

export function getProject(id: string | undefined) {
  return id ? useAiProjects.getState().projects.find((p) => p.id === id) : undefined;
}
