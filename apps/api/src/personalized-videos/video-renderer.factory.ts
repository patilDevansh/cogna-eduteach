import { LocalRenderQueue } from "./local-render-queue";
import { createMediaStorageFromEnv } from "./media-storage";
import {
  rendererConfigFromEnv,
  VideoRendererAdapter,
  type VideoRendererConfig,
} from "./video-renderer.adapter";

export function createVideoRendererFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): VideoRendererAdapter {
  const config: VideoRendererConfig = rendererConfigFromEnv(env);
  const queue = config.localRenderer ? new LocalRenderQueue(createMediaStorageFromEnv(env)) : undefined;
  return new VideoRendererAdapter(config, fetchImpl, queue);
}
