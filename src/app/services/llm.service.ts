import { Injectable } from "@angular/core";
import type { LlmResponse, SitePlan } from "../models";

@Injectable({ providedIn: "root" })
export class LlmService {
  private apiKey: string | null = null;

  setApiKey(value: string): void {
    this.apiKey = value.trim() ? value.trim() : null;
  }

  async generate(currentPlan: SitePlan | null, userPrompt: string): Promise<LlmResponse> {
    if (!this.apiKey) {
      throw new Error("Add an OpenAI API key to generate code.");
    }

    const systemPrompt = `You are an AI that generates Angular code changes as JSON only.
Return ONLY valid JSON with schema:
{
  "sitePlan": {
    "theme": { "primaryColor": string, "accentColor": string, "tone": string },
    "pages": [ { "name": string, "sections": string[] } ],
    "navigation": string[],
    "components": string[],
    "notes": string
  },
  "patch": {
    "id": "uuid",
    "changes": [
      { "action": "write" | "delete", "path": "src/...", "content"?: "..." }
    ]
  }
}
Only return JSON. No markdown. Paths are relative to the generated Angular app root (e.g. src/app/...).
Ensure any Angular Material components referenced include module imports in the standalone component.`;

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            currentPlan,
            userPrompt
          })
        }
      ]
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI response was empty.");
    }

    try {
      return JSON.parse(content) as LlmResponse;
    } catch (error) {
      throw new Error("OpenAI response was not valid JSON.");
    }
  }
}
