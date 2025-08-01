// Streaming utilities (simplified for basic functionality)

export function shouldUseStreaming(articleCount: number, threshold: number): boolean {
  return false; // Disable streaming for simplicity
}

export class StreamingPerformanceMonitor {
  constructor() {}
}

export function createStreamingResponse(
  articles: any[],
  chunkSize: number,
  metadata: any
): Response {
  return new Response(JSON.stringify(articles), {
    headers: { 'Content-Type': 'application/json' }
  });
}