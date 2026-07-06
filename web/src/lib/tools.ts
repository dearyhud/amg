export function toolsQueryKey(upstreamId: string) {
  return ["upstreams", upstreamId, "tools"] as const
}
