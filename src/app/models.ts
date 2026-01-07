export type PatchAction = "write" | "delete";

export interface PatchChange {
  action: PatchAction;
  path: string;
  content?: string;
}

export interface PatchPayload {
  id: string;
  changes: PatchChange[];
}

export interface SitePlan {
  theme: {
    primaryColor: string;
    accentColor: string;
    tone: string;
  };
  pages: Array<{
    name: string;
    sections: string[];
  }>;
  navigation: string[];
  components: string[];
  notes: string;
}

export interface LlmResponse {
  sitePlan: SitePlan;
  patch: PatchPayload;
}

export interface Step {
  id: string;
  createdAt: string;
  userPrompt: string;
  sitePlan: SitePlan;
  patch: PatchPayload;
}

export interface FileSnapshot {
  path: string;
  content: string;
}
