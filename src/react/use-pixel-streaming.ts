"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ClientOptions,
  SessionStateUpdatedEvent,
  StreamingClientErrorEvent,
} from "../client"
import {
  StreamProvider,
  StreamState,
  type StreamStateUpdatedEvent,
  StreamTarget,
  StreamingClient,
  StreamingClientError,
} from "../client"
import type { GeforceStreamConfig, SessionState } from "../session"

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
  sessionState: SessionState | undefined
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
  const [sessionState, setSessionState] = useState<SessionState | undefined>()

  const streamingClientRef = useRef<StreamingClient | null>(null)
  const eventHandlersRef = useRef<{
    onStreamStateUpdate: (event: StreamStateUpdatedEvent) => void
    onSessionStateUpdate: (event: SessionStateUpdatedEvent) => void
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

      const onStreamStateUpdate = (event: StreamStateUpdatedEvent) => {
        setStreamState(event.detail.state)
      }

      const onSessionStateUpdate = (event: SessionStateUpdatedEvent) => {
        setSessionState(event.detail)
      }

      const onErrorEvent = (error: StreamingClientErrorEvent) => {
        onError(error.detail)
      }

      eventHandlersRef.current = {
        onStreamStateUpdate,
        onSessionStateUpdate,
        onErrorEvent,
      }

      streamingClientRef.current.addEventListener(
        "streamStateUpdated",
        onStreamStateUpdate,
      )
      streamingClientRef.current.addEventListener(
        "sessionStateUpdated",
        onSessionStateUpdate,
      )
      streamingClientRef.current.addEventListener("error", onErrorEvent)

      const config = await streamingClientRef.current.setup({
        projectId,
        worldId,
        forceProvider: StreamProvider.GeforceNow,
      })

      if (!config) {
        onError(new Error("Failed to fetch stream config"))
      }

      const streamingContainerOrError = await streamingClientRef.current.start({
        ...(config as {
          streamId: string
          config: GeforceStreamConfig
          sessionId: string
          projectId: string
          worldId: string
        }),
        provider: StreamProvider.GeforceNow,
        target: StreamTarget.Embedded,
        container: ref,
      })

      if (streamingContainerOrError instanceof StreamingClientError) {
        if (config) {
          await streamingClientRef.current.cleanup({
            reason: streamingContainerOrError,
            ...config,
          })
        }
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
      const { onStreamStateUpdate, onSessionStateUpdate, onErrorEvent } =
        eventHandlersRef.current
      streamingClientRef.current.removeEventListener(
        "streamStateUpdated",
        onStreamStateUpdate,
      )
      streamingClientRef.current.removeEventListener(
        "sessionStateUpdated",
        onSessionStateUpdate,
      )
      streamingClientRef.current.removeEventListener("error", onErrorEvent)
    }

    streamingClientRef.current.stop()
    setStreamState(StreamState.Idle)
    setSessionState(undefined)
  }, [])

  const getBrowserSupport = useCallback(() => {
    return streamingClientRef.current
      ? streamingClientRef.current.getBrowserSupport()
      : ({} as Record<StreamProvider, boolean>)
  }, [])

  return {
    streamState,
    sessionState,
    startStreaming,
    stopStreaming,
    getBrowserSupport,
  }
}
