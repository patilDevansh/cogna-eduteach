import type { LocalRenderQueue } from "./local-render-queue";

export interface VideoRendererConfig {
  endpoint?: string;
  token?: string;
  storageBucket?: string;
  cdnUrl?: string;
  /** When true, submit/poll the in-process Remotion renderer. Tests should leave this unset. */
  localRenderer?: boolean;
}

export interface VideoSceneManifest {
  assignmentId: string;
  title: string;
  captions: string[];
  scenes: Array<{
    eyebrow?: string;
    headline: string;
    equation: string;
    narration: string;
    durationSeconds: number;
    accent?: string;
  }>;
}

export interface VideoRenderSuccess {
  storageRef: string;
  transcriptRef: string;
  durationMs: number;
  integrity: {
    sha256?: string;
    provider?: string;
    providerJobId?: string;
    sceneCount: number;
  };
}

export type RendererPollResult =
  | { status: "RUNNING" }
  | { status: "FAILED"; retryable: boolean; message: string }
  | { status: "COMPLETED"; result: VideoRenderSuccess };

export class RendererUnavailableError extends Error {
  readonly retryable = true;

  constructor(message = "No video renderer provider is configured.") {
    super(message);
    this.name = "RendererUnavailableError";
  }
}

export function rendererConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VideoRendererConfig {
  const endpoint = env.COGNA_VIDEO_RENDER_ENDPOINT?.trim() || undefined;
  const flag = env.COGNA_VIDEO_LOCAL_RENDERER?.trim();
  const localRenderer = flag === "true" ? true : flag === "false" ? false : !endpoint;
  return {
    endpoint,
    token: env.COGNA_VIDEO_RENDER_TOKEN?.trim() || undefined,
    storageBucket: env.COGNA_MEDIA_STORAGE_BUCKET?.trim() || undefined,
    cdnUrl: env.COGNA_MEDIA_CDN_URL?.trim() || undefined,
    localRenderer,
  };
}

export class VideoRendererAdapter {
  constructor(
    private readonly config: VideoRendererConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly localQueue?: Pick<LocalRenderQueue, "submit" | "poll">,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.endpoint) || this.config.localRenderer === true;
  }

  usesLocalRenderer(): boolean {
    return this.config.localRenderer === true && !this.config.endpoint;
  }

  async submit(manifest: VideoSceneManifest): Promise<{ providerJobId: string }> {
    if (this.config.endpoint) {
      return this.submitRemote(manifest);
    }
    if (this.config.localRenderer && this.localQueue) {
      return this.localQueue.submit(manifest);
    }
    throw new RendererUnavailableError();
  }

  async poll(providerJobId: string): Promise<RendererPollResult> {
    if (this.config.endpoint) {
      return this.pollRemote(providerJobId);
    }
    if (this.config.localRenderer && this.localQueue) {
      return this.localQueue.poll(providerJobId);
    }
    throw new RendererUnavailableError();
  }

  private async submitRemote(manifest: VideoSceneManifest): Promise<{ providerJobId: string }> {
    const response = await this.fetchImpl(this.config.endpoint!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
      },
      body: JSON.stringify({
        assignmentId: manifest.assignmentId,
        title: manifest.title,
        captions: manifest.captions,
        scenes: manifest.scenes,
        storageBucket: this.config.storageBucket,
        cdnUrl: this.config.cdnUrl,
      }),
    });
    if (!response.ok) {
      throw new RendererUnavailableError(`Renderer submit failed with HTTP ${response.status}.`);
    }
    const body = (await response.json()) as { providerJobId?: string; id?: string };
    const providerJobId = body.providerJobId || body.id;
    if (!providerJobId) {
      throw new RendererUnavailableError("Renderer submit did not return a job id.");
    }
    return { providerJobId };
  }

  private async pollRemote(providerJobId: string): Promise<RendererPollResult> {
    const url = `${this.config.endpoint!.replace(/\/$/, "")}/${encodeURIComponent(providerJobId)}`;
    const response = await this.fetchImpl(url, {
      headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {},
    });
    if (!response.ok) {
      throw new RendererUnavailableError(`Renderer poll failed with HTTP ${response.status}.`);
    }
    const body = (await response.json()) as {
      status?: string;
      storageRef?: string;
      transcriptRef?: string;
      durationMs?: number;
      integrity?: Record<string, unknown>;
      message?: string;
    };
    const status = (body.status ?? "COMPLETED").toUpperCase();
    if (["RUNNING", "PENDING", "IN_PROGRESS", "QUEUED", "PROCESSING"].includes(status)) {
      return { status: "RUNNING" };
    }
    if (["FAILED", "ERROR", "CANCELLED"].includes(status)) {
      return {
        status: "FAILED",
        retryable: true,
        message: body.message || `Renderer job failed (${status}).`,
      };
    }
    if (!["COMPLETED", "READY", "SUCCEEDED"].includes(status)) {
      return { status: "RUNNING" };
    }
    if (!body.storageRef || !/^https?:\/\/|^s3:\/\//.test(body.storageRef)) {
      return {
        status: "FAILED",
        retryable: true,
        message: "Renderer did not return a permanent media storageRef.",
      };
    }
    return {
      status: "COMPLETED",
      result: {
        storageRef: body.storageRef,
        transcriptRef: body.transcriptRef || `${body.storageRef}.vtt`,
        durationMs: body.durationMs ?? 0,
        integrity: {
          ...body.integrity,
          provider: "external-adapter",
          providerJobId,
          sceneCount: 0,
        },
      },
    };
  }
}
