import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCardModule } from "@angular/material/card";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatDividerModule } from "@angular/material/divider";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { WebcontainerService } from "./services/webcontainer.service";
import { LlmService } from "./services/llm.service";
import type { SitePlan, Step } from "./models";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatDividerModule
  ],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent implements OnInit {
  title = "AI Angular Website Builder";
  prompt = "";
  apiKey = "";
  steps: Step[] = [];
  stepIndex = -1;
  isBusy = false;
  statusMessage = "Booting WebContainer…";
  errorMessage: string | null = null;
  crossOriginError: string | null = null;
  previewSrc: string | null = null;
  previewSafeUrl: SafeResourceUrl | null = null;
  examplePrompts = [
    "Create a dental clinic website with modern blue and white theme.",
    "Add appointment booking form with validation and success toast.",
    "Make the home hero section more premium with 3 feature cards.",
    "Undo last change and instead add a gallery section."
  ];

  constructor(
    private readonly webcontainer: WebcontainerService,
    private readonly llm: LlmService,
    private readonly sanitizer: DomSanitizer
  ) {}

  async ngOnInit(): Promise<void> {
    const storedKey = localStorage.getItem("openaiApiKey");
    if (storedKey) {
      this.apiKey = storedKey;
    }
    if (!self.crossOriginIsolated) {
      this.crossOriginError =
        "WebContainer requires crossOriginIsolated. " +
        "Serve this app with COOP/COEP headers (Cross-Origin-Opener-Policy: same-origin " +
        "and Cross-Origin-Embedder-Policy: require-corp) or use a compatible host.";
      this.statusMessage = "Cross-origin isolation required.";
      return;
    }
    try {
      await this.webcontainer.boot();
      await this.waitForPreview();
      this.statusMessage = "WebContainer ready";
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.statusMessage = "Boot failed";
    }
  }

  get canUndo(): boolean {
    return this.stepIndex > 0;
  }

  get canRedo(): boolean {
    return this.stepIndex < this.steps.length - 1;
  }

  get currentPlan(): SitePlan | null {
    if (this.stepIndex < 0) {
      return null;
    }
    return this.steps[this.stepIndex]?.sitePlan ?? null;
  }

  async sendPrompt(): Promise<void> {
    const userPrompt = this.prompt.trim();
    if (!userPrompt || this.isBusy) {
      return;
    }
    this.isBusy = true;
    this.errorMessage = null;
    try {
      this.llm.setApiKey(this.apiKey);
      const response = await this.llm.generate(this.currentPlan, userPrompt);
      const normalizedChanges = response.patch.changes.map((change) => ({
        ...change,
        path: change.path.startsWith("generated-site/")
          ? change.path
          : `generated-site/${change.path}`
      }));
      await this.webcontainer.applyPatch(normalizedChanges);
      const step: Step = {
        id: response.patch.id,
        createdAt: new Date().toISOString(),
        userPrompt,
        sitePlan: response.sitePlan,
        patch: {
          ...response.patch,
          changes: normalizedChanges
        }
      };
      this.steps = [...this.steps.slice(0, this.stepIndex + 1), step];
      this.stepIndex = this.steps.length - 1;
      this.prompt = "";
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.isBusy = false;
    }
  }

  async undo(): Promise<void> {
    if (!this.canUndo) {
      return;
    }
    await this.restoreToStep(this.stepIndex - 1);
  }

  async redo(): Promise<void> {
    if (!this.canRedo) {
      return;
    }
    await this.restoreToStep(this.stepIndex + 1);
  }

  async restoreToStep(index: number): Promise<void> {
    if (index < -1 || index >= this.steps.length) {
      return;
    }
    this.isBusy = true;
    this.errorMessage = null;
    try {
      await this.webcontainer.resetToBaseSnapshot();
      if (index >= 0) {
        const patches = this.steps.slice(0, index + 1);
        for (const step of patches) {
          await this.webcontainer.applyPatch(step.patch.changes);
        }
      }
      this.stepIndex = index;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.isBusy = false;
    }
  }

  async refreshPreview(): Promise<void> {
    if (!this.previewSrc) {
      return;
    }
    const url = new URL(this.previewSrc);
    url.searchParams.set("ts", Date.now().toString());
    this.setPreviewUrl(url.toString());
  }

  openPreview(): void {
    if (this.previewSrc) {
      window.open(this.previewSrc, "_blank", "noopener,noreferrer");
    }
  }

  async exportProject(): Promise<void> {
    this.isBusy = true;
    try {
      const zipBlob = await this.webcontainer.exportZip();
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "generated-site.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.isBusy = false;
    }
  }

  applyExample(prompt: string): void {
    this.prompt = prompt;
  }

  persistApiKey(): void {
    if (this.apiKey.trim()) {
      localStorage.setItem("openaiApiKey", this.apiKey.trim());
    } else {
      localStorage.removeItem("openaiApiKey");
    }
  }

  private setPreviewUrl(url: string | null): void {
    this.previewSrc = url;
    this.previewSafeUrl = url
      ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
      : null;
  }

  private async waitForPreview(): Promise<void> {
    const maxAttempts = 30;
    let attempts = 0;
    while (attempts < maxAttempts) {
      const url = this.webcontainer.url;
      if (url) {
        this.setPreviewUrl(url);
        return;
      }
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
