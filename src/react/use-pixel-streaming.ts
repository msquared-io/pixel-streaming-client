"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ClientOptions, StreamingClientErrorEvent } from "../client"
import {
  StreamProvider,
  StreamState,
  type StreamStateUpdatedEvent,
  StreamTarget,
  StreamingClient,
  StreamingClientError,
} from "../client"
import type { GeforceStreamConfig } from "../session"

type StartStreamingParams = Readonly<{
  ref: HTMLElement
  onError?: (error: Error) => void
}>

type UsePixelStreamingParams = Readonly<{
  organizationId: string
  projectId: string
  worldId: string
  authToken: string
  clientOptions?: ClientOptions
}>

type UsePixelStreamingResult = {
  streamState: StreamState
  startStreaming: (params: StartStreamingParams) => void
  stopStreaming: () => void
  getBrowserSupport: () => Record<StreamProvider, boolean>
}

export function usePixelStreaming({
  organizationId,
  projectId,
  worldId,
  authToken,
  clientOptions,
}: UsePixelStreamingParams): UsePixelStreamingResult {
  const [streamState, setStreamState] = useState<StreamState>(StreamState.Idle)
  const streamingClientRef = useRef<StreamingClient | null>(null)
  const eventHandlersRef = useRef<{
    onStateUpdate: (event: StreamStateUpdatedEvent) => void
    onErrorEvent: (error: StreamingClientErrorEvent) => void
  } | null>(null)

  useEffect(() => {
    const defaultClientOpts = {
      auth: {
        token: authToken,
        organizationId,
      },
    }

    if (!streamingClientRef.current) {
      streamingClientRef.current = new StreamingClient(
        clientOptions ?? defaultClientOpts,
      )
    }

    return () => {
      stopStreaming()
      streamingClientRef.current = null
    }
  }, [organizationId, authToken, clientOptions])

  const startStreaming = useCallback(
    async ({ ref, onError = () => {} }: StartStreamingParams) => {
      if (!streamingClientRef.current) {
        return
      }

      stopStreaming()

      const onStateUpdate = (event: StreamStateUpdatedEvent) => {
        setStreamState(event.detail.state)
      }

      const onErrorEvent = (error: StreamingClientErrorEvent) => {
        onError(error.detail)
      }

      eventHandlersRef.current = { onStateUpdate, onErrorEvent }

      streamingClientRef.current.addEventListener(
        "streamStateUpdated",
        onStateUpdate,
      )
      streamingClientRef.current.addEventListener("error", onErrorEvent)

      const config = await streamingClientRef.current.fetchStreamConfig({
        projectId,
        worldId,
        forceProvider: StreamProvider.GeforceNow,
      })

      if (!config) {
        onError(new Error("Failed to fetch stream config"))
      }

      const streamingContainerOrError = await streamingClientRef.current.start({
        ...(config as { streamId: string; config: GeforceStreamConfig }),
        provider: StreamProvider.GeforceNow,
        target: StreamTarget.Embedded,
        container: ref,
      })

      if (streamingContainerOrError instanceof StreamingClientError) {
        throw streamingContainerOrError
      }
    },
    [projectId, worldId],
  )

  const stopStreaming = useCallback(() => {
    if (!streamingClientRef.current) {
      return
    }

    if (eventHandlersRef.current) {
      const { onStateUpdate, onErrorEvent } = eventHandlersRef.current
      streamingClientRef.current.removeEventListener(
        "streamStateUpdated",
        onStateUpdate,
      )
      streamingClientRef.current.removeEventListener("error", onErrorEvent)
    }

    streamingClientRef.current.stop()
    setStreamState(StreamState.Idle)
  }, [])

  const getBrowserSupport = useCallback(() => {
    return streamingClientRef.current
      ? streamingClientRef.current.getBrowserSupport()
      : ({} as Record<StreamProvider, boolean>)
  }, [])

  return {
    streamState,
    startStreaming,
    stopStreaming,
    getBrowserSupport,
  }
}
