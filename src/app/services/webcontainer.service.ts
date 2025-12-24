import { Injectable } from "@angular/core";
import { WebContainer } from "@webcontainer/api";
import type { FileSnapshot, PatchChange } from "../models";

type BootState = "idle" | "booting" | "ready" | "error";

@Injectable({ providedIn: "root" })
export class WebcontainerService {
  private container: WebContainer | null = null;
  private bootState: BootState = "idle";
  private previewUrl: string | null = null;
  private lastError: string | null = null;
  private baseSnapshot: FileSnapshot[] = [];

  get state(): BootState {
    return this.bootState;
  }

  get url(): string | null {
    return this.previewUrl;
  }

  get error(): string | null {
    return this.lastError;
  }

  get hasSnapshot(): boolean {
    return this.baseSnapshot.length > 0;
  }

  async boot(): Promise<void> {
    if (this.bootState === "ready" || this.bootState === "booting") {
      return;
    }
    this.bootState = "booting";
    try {
      this.container = await WebContainer.boot();
      await this.ensureGeneratedSite();
      await this.ensureBaseSnapshot();
      await this.startDevServer();
      this.bootState = "ready";
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.bootState = "error";
      throw error;
    }
  }

  async applyPatch(changes: PatchChange[]): Promise<void> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    for (const change of changes) {
      if (change.action === "write") {
        if (typeof change.content !== "string") {
          throw new Error(`Missing content for ${change.path}`);
        }
        await this.writeFile(change.path, change.content);
      } else if (change.action === "delete") {
        await this.container.fs.rm(change.path, { recursive: true, force: true });
      }
    }
  }

  async resetToBaseSnapshot(): Promise<void> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    await this.container.fs.rm("generated-site", { recursive: true, force: true });
    for (const file of this.baseSnapshot) {
      await this.writeFile(file.path, file.content);
    }
  }

  async captureSnapshot(): Promise<FileSnapshot[]> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    return this.readDirectory("generated-site");
  }

  async exportZip(): Promise<Blob> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const files = await this.readDirectory("generated-site");
    for (const file of files) {
      zip.file(file.path.replace(/^generated-site\//, ""), file.content);
    }
    return zip.generateAsync({ type: "blob" });
  }

  private async ensureGeneratedSite(): Promise<void> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    const exists = await this.pathExists("generated-site");
    if (!exists) {
      await this.runCommand(
        "npx",
        "-y",
        "@angular/cli@19",
        "new",
        "generated-site",
        "--routing",
        "--style=css",
        "--skip-git",
        "--skip-tests",
        "--ssr=false",
        "--defaults"
      );
      await this.runCommand(
        "npx",
        "-y",
        "ng",
        "add",
        "@angular/material",
        "--skip-confirmation",
        "--defaults",
        { cwd: "generated-site" }
      );
      await this.patchGeneratedHome();
      await this.runCommand("npm", "install", { cwd: "generated-site" });
    }
  }

  private async ensureBaseSnapshot(): Promise<void> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    if (this.baseSnapshot.length === 0) {
      this.baseSnapshot = await this.readDirectory("generated-site");
    }
  }

  private async startDevServer(): Promise<void> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    const process = await this.container.spawn("npm", ["start"], {
      cwd: "generated-site"
    });
    process.output.pipeTo(
      new WritableStream({
        write: (chunk) => {
          if (typeof chunk === "string") {
            const match = chunk.match(/(http:\/\/localhost:\d+)/);
            if (match) {
              this.previewUrl = match[1];
            }
          }
        }
      })
    );
    this.container.on("server-ready", (_port, url) => {
      this.previewUrl = url;
    });
  }

  private async patchGeneratedHome(): Promise<void> {
    const appComponentPath = "generated-site/src/app/app.component.ts";
    const appTemplatePath = "generated-site/src/app/app.component.html";
    const appStylesPath = "generated-site/src/app/app.component.css";

    await this.writeFile(
      appComponentPath,
      `import { Component } from "@angular/core";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [MatToolbarModule, MatButtonModule],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent {
  title = "Generated Site";
}
`
    );
    await this.writeFile(
      appTemplatePath,
      `<mat-toolbar color="primary">
  <span>{{ title }}</span>
  <span class="spacer"></span>
  <button mat-button>Get Started</button>
</mat-toolbar>
<main class="home">
  <h1>Welcome to your generated Angular site</h1>
  <p>Use the builder to customize this site with AI-powered changes.</p>
</main>
`
    );
    await this.writeFile(
      appStylesPath,
      `.spacer {
  flex: 1;
}

.home {
  padding: 48px;
  text-align: center;
  font-family: "Inter", sans-serif;
}
`
    );
  }

  private async runCommand(
    command: string,
    ...args: Array<string | { cwd: string }>
  ): Promise<void> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    const optionsArg = args[args.length - 1];
    const options = typeof optionsArg === "object" ? optionsArg : undefined;
    const params = typeof optionsArg === "object" ? args.slice(0, -1) : args;
    const process = await this.container.spawn(command, params as string[], options);
    const exitCode = await process.exit;
    if (exitCode !== 0) {
      throw new Error(`${command} ${params.join(" ")} failed with code ${exitCode}`);
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    const segments = path.split("/");
    const fileName = segments.pop();
    if (!fileName) {
      return;
    }
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const exists = await this.pathExists(current);
      if (!exists) {
        await this.container.fs.mkdir(current, { recursive: true });
      }
    }
    await this.container.fs.writeFile(path, content);
  }

  private async pathExists(path: string): Promise<boolean> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    try {
      await this.container.fs.readdir(path);
      return true;
    } catch {
      try {
        await this.container.fs.readFile(path, "utf-8");
        return true;
      } catch {
        return false;
      }
    }
  }

  private async readDirectory(root: string): Promise<FileSnapshot[]> {
    if (!this.container) {
      throw new Error("WebContainer not ready");
    }
    const entries = await this.container.fs.readdir(root, { withFileTypes: true });
    const files: FileSnapshot[] = [];
    for (const entry of entries) {
      if (["node_modules", "dist", ".angular"].includes(entry.name)) {
        continue;
      }
      const fullPath = `${root}/${entry.name}`;
      if (entry.isDirectory()) {
        files.push(...(await this.readDirectory(fullPath)));
      } else {
        const content = await this.container.fs.readFile(fullPath, "utf-8");
        files.push({ path: fullPath, content });
      }
    }
    return files;
  }
}
