import { Injectable } from "@angular/core";
import type { LlmResponse, SitePlan } from "../models";

@Injectable({ providedIn: "root" })
export class LlmService {
  async generate(currentPlan: SitePlan | null, userPrompt: string): Promise<LlmResponse> {
    const timestamp = new Date().toISOString();
    const sitePlan: SitePlan = currentPlan ?? {
      theme: {
        primaryColor: "#2f6fed",
        accentColor: "#14b8a6",
        tone: "modern, friendly"
      },
      pages: [
        { name: "Home", sections: ["Hero", "Services", "Testimonials"] },
        { name: "About", sections: ["Story", "Team", "Values"] },
        { name: "Contact", sections: ["Form", "Map"] }
      ],
      navigation: ["Home", "About", "Services", "Contact"],
      components: ["Toolbar", "Hero", "FeatureCards", "Footer"],
      notes: "AI-generated plan based on prompt."
    };

    const patchContent = `<!-- AI patch generated at ${timestamp} -->
<section class="ai-banner">
  <h2>Update: ${userPrompt}</h2>
  <p>This section was inserted by the AI patch workflow.</p>
</section>`;

    return {
      sitePlan,
      patch: {
        id: crypto.randomUUID(),
        changes: [
          {
            action: "write",
            path: "generated-site/src/app/app.component.html",
            content: patchContent
          }
        ]
      }
    };
  }
}
