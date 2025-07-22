import { uuidv7 } from "uuidv7"
import { getStreamCompat } from "./browser/compatibility"
import errors from "./errors"
import { type TypedEvent, TypedEventTarget } from "./events"
import {
  buildGfnUrl,
  type GeforceStreamConfig,
  GFNClientNotInitialized,
  GFNTerminationError,
  getClient,
  getOrInitClient,
} from "./gfn"
import { SessionClient, type SessionState, type StreamConfig } from "./session"
import type { Fetch, Logger, Token } from "./types"

/**
 * Supported streaming service providers.
 */
export enum StreamProvider {
  /** Use the GeForce Now streaming service via the SDK or as a Redirect */
  GeforceNow = "gdn",
  /** Use the Ubitus streaming service (currently unsupported) */
  Ubitus = "ubitus",
}

/**
 * Available stream targets.
 */
export enum StreamTarget {
  /** Load stream into it's own window via a full-page redirect or new tab */
  Window = 0,
  /** Embed stream into an HTML Element in the DOM */
  Embedded = 1,
}

/**
 * Configuration settings for GeForce Now Digital Network.
 */
export type GDNSettings = {
  /** Client ID for authentication */
  clientId: string
  /** Catalog client ID for content access */
  catalogClientId: string
  /** Partner ID for service integration */
  partnerId: string
}

/** Default GDN configuration settings */
export const DEFAULT_GDN_SETTINGS: GDNSettings = {
  partnerId: "0Xg3tEsmQZqn-zsZgSTIQqJZn5f7X7kuBxE5C9KFsys",
  clientId: "7F2uPUC63HsHxn3wy51IhSmPyXMsr8Wru-mKOREmqfA",
  catalogClientId: "18e30568-63b3-43ae-8db6-078689b5705c",
}

type ClientAuth = {
  /** The bearer token or a factory to obtain one */
  token: Token
  /** The ID of organization to authenticate against */
  organizationId?: string
}

/**
 * Configuration options for initializing the streaming client.
 */
export type ClientOptions = {
  /** Morpheus Platform API credentials */
  auth: ClientAuth
  /** Custom GDN settings to override defaults for testing */
  gdn?: Partial<GDNSettings>
  /** Logger instance for debugging and monitoring */
  logger?: Logger
  /**
   * Ignore any browser incompatibilies and attempt to load the stream in all cases
   * @default false
   */
  skipBrowserSupportChecks?: boolean // Currently unused
  /**
   * Custom fetch implementation for testing.
   * @default {@link globalThis.fetch}
   */
  fetch?: Fetch
  /**
   * MSquared server that requests will be made to
   */
  server?: {
    /**
     * Server host. May include port.
     * @default the current window's origin
     */
    host?: string
    /**
     * Protocol.
     * @default "https"
     */
    protocol?: "http" | "https"
  }
}

/**
 * Provider-specific configuration options.
 */
export type ProviderOpts = {
  /** Streaming service provider */
  provider: StreamProvider.GeforceNow
  /** GeForce Now specific configuration */
  config: GeforceStreamConfig
}

/**
 * Target-specific configuration options.
 */
export type TargetOpts =
  | {
      /** Embedded target configuration */
      target: StreamTarget.Embedded
      /** DOM element or CSS selector for element in which to embed the stream */
      container: HTMLElement | string
    }
  | {
      /** Window target configuration */
      target: StreamTarget.Window
      /**
       * The Window in which to load the stream
       * @default {@link globalThis.window}
       */
      container?: Window
      /**
       * Whether the stream should run in fullscreen mode on load
       * @default true
       */
      fullscreen?: boolean
    }

/**
 * Configuration required to initiate a stream
 */
export type StartStreamConfig = {
  streamId: string
  projectId: string
  worldId: string
  sessionId: string
  config?: StreamConfig
}

/**
 * Stream configuration options
 */
export type StartOptions = StartStreamConfig & ProviderOpts & TargetOpts

/**
 * Base error class for errors returned from the StreamClient
 */
export class StreamingClientError extends Error {
  override readonly name: string = "StreamingClientError"
}

/**
 * Error produced when the element specified by the CSS selector is not found */
export const ElementNotFound = new StreamingClientError(
  "Stream container element not found in DOM",
)

/**
 * Error produced when the stream terminates unexpectedly
 */
export class StreamTerminationError extends StreamingClientError {
  override readonly name: string = "StreamTerminationError"
}

/**
 * Error produced when a popup/new tab is blocked by the browser
 */
export const PopupBlocked = new StreamingClientError(
  "Popup or new tab was blocked by the browser",
)

/** Error produced when requesting a stream for an unsupported provider */
export const UnsupportedProvider = new StreamingClientError(
  "only GeforceNow provider is currently supported",
)

/**
 * Possible states for the stream.
 */
export enum StreamState {
  /** Initial state, no stream active. */
  Idle = 0,
  /** Stream is being initialized and connection is being established */
  Loading = 1,
  /** Streaming is active and running */
  Streaming = 2,
  /** Stream has terminated, possibly in error */
  Terminated = 3,
  /** Stream is in an indeterminate state */
  Unknown = 4,
}

/**
 * The {@link CustomEvent} emitted when the state of the stream is updated
 */
export type StreamStateUpdatedEvent = TypedEvent<
  "streamStateUpdated",
  | {
      state: Exclude<StreamState, StreamState.Terminated>
    }
  | {
      state: StreamState.Terminated
      error?: StreamingClientError
    }
>

/**
 * The {@link CustomEvent} emitted when the state of the session is updated
 */
export type SessionStateUpdatedEvent = TypedEvent<
  "sessionStateUpdated",
  SessionState
>

/**
 * The {@link CustomEvent} emitted when an error occurs during streaming
 */
export type StreamingClientErrorEvent = TypedEvent<
  "error",
  StreamingClientError
>

type StreamingClientEvents = [
  StreamStateUpdatedEvent,
  StreamingClientErrorEvent,
  SessionStateUpdatedEvent,
]

/**
 * Main client class for managing game streaming sessions.
 * Handles stream lifecycle, state management, and error handling.
 *
 * @example
 * ```typescript
 * // Initialize client
 * const client = new StreamingClient({
 *   logger: console,
 *   gdn: { clientId: 'your-client-id' }
 * });
 *
 * // Listen for state changes
 * client.addEventListener('streamStateUpdated', (event) => {
 *   console.log('Stream state:', event.detail.state);
 * });
 *
 * // Start embedded stream
 * await client.start({
 *   provider: StreamProvider.GeforceNow,
 *   target: StreamTarget.Embedded,
 *   container: '#game-container',
 *   config: {
 *     cmsId: '12345',
 *     nonce: 'abc123'
 *   }
 * });
 * ```
 *
 * @fires {StreamStateUpdatedEvent} streamStateUpdated - Emitted when stream state changes
 * @fires {StreamingClientErrorEvent} error - Emitted when an error occurs during streaming
 *
 * @event streamStateUpdated - Fired when the stream state changes
 * Example payload:
 * ```typescript
 * {
 *   detail: {
 *     state: StreamState.Streaming
 *   }
 * }
 * ```
 *
 * @event error - Fired when a streaming error occurs
 * Example payload:
 * ```typescript
 * {
 *   detail: new StreamTerminationError("Stream terminated with error")
 * }
 * ```
 */
export class StreamingClient extends TypedEventTarget<StreamingClientEvents> {
  public readonly skipBrowserSupportChecks: boolean
  private readonly gdnSettings: GDNSettings
  private readonly logger: Logger
  private readonly sessionClient: SessionClient

  constructor(opts: ClientOptions) {
    super()

    this.logger = opts.logger ?? console
    this.gdnSettings = {
      ...DEFAULT_GDN_SETTINGS,
      ...opts.gdn,
    }
    this.sessionClient = new SessionClient({
      host: opts.server?.host ?? `${opts.auth.organizationId}.m2worlds.io`,
      protocol: opts.server?.protocol,
      fetch: opts.fetch,
      ...opts.auth,
    })
    this.skipBrowserSupportChecks = opts.skipBrowserSupportChecks ?? false
  }

  getBrowserSupport(): Record<StreamProvider, boolean> {
    const compat = getStreamCompat(this.skipBrowserSupportChecks)
    return {
      [StreamProvider.GeforceNow]: compat.geforceSupported,
      [StreamProvider.Ubitus]: compat.ubitusSupported,
    }
  }

  async setup({
    projectId,
    worldId,
    forceProvider,
  }: {
    projectId: string
    worldId: string
    forceProvider?: StreamProvider
  }): Promise<StartStreamConfig | undefined> {
    const compat = getStreamCompat(this.skipBrowserSupportChecks)
    const streamId = uuidv7()

    const session = await this.sessionClient.createSession({
      projectId,
      streamId,
      sessionMetadata: {
        ...compat,
        forceProvider,
      },
      worldId,
      onStateChange: (state) => {
        this.emit("sessionStateUpdated", state)
      },
    })

    if (!session) {
      return undefined
    }

    return {
      streamId,
      projectId,
      worldId,
      sessionId: session.sessionId,
      config: session.providerConfig,
    }
  }

  /**
   * Requests a new streaming session.
   * @param {StartOptions} options - Configuration options for the streaming session
   * @returns {Promise<Window | HTMLElement | StreamingClientError>} A Promise that resolves to the stream container or an error
   * @throws {never} This method catches all errors and returns them
   * @emits streamStateUpdated
   * @emits error
   */
  async start({
    streamId,
    projectId,
    worldId,
    sessionId,
    provider,
    ...opts
  }: StartOptions): Promise<Window | HTMLElement | StreamingClientError> {
    if (provider !== StreamProvider.GeforceNow) {
      return UnsupportedProvider
    }

    this.emit("streamStateUpdated", { state: StreamState.Loading })

    let needsCleanup = true
    const onTerminated = (error?: Error) => {
      this.emit("error", error)
      this.emit("streamStateUpdated", { state: StreamState.Terminated, error })
      if (needsCleanup) {
        this.cleanup({ projectId, worldId, sessionId, reason: error })
        needsCleanup = false
      }
    }

    switch (opts.target) {
      case StreamTarget.Window: {
        const { fullscreen = true, config, container } = opts
        const target = `_stream:${streamId}`
        const href = buildGfnUrl(this.gdnSettings.partnerId, config, {
          fullscreen,
        })
        const result = this.open({ container, href, target })

        if (errors.is(result)) {
          if (errors.is(PopupBlocked)) {
            this.logger?.warn(
              "Popup was blocked. We cannot monitor the new window for close events or close it via the SDK",
            )
          }
          onTerminated(result)
        } else {
          this.emit("streamStateUpdated", {
            state: StreamState.Streaming,
          })
        }

        return result
      }

      case StreamTarget.Embedded: {
        const { config, container } = opts
        const element = resolveContainer(container)

        if (element instanceof Error) {
          onTerminated(element)
          return element
        }

        const gfnClient = await getOrInitClient({
          settings: this.gdnSettings,
          cmsId: Number.parseInt(config.cmsId),
          nonce: config.nonce,
        })

        if (errors.is(gfnClient)) {
          onTerminated(gfnClient)
          return gfnClient
        }

        gfnClient.listen({
          onStarted: () => {
            this.emit("streamStateUpdated", {
              state: StreamState.Streaming,
            })
          },
          onTerminated(cause?: GFNTerminationError) {
            onTerminated(
              new StreamTerminationError("Stream terminated with error", {
                cause,
              }),
            )
          },
        })

        const result = await gfnClient.start(element)
        if (errors.is(result)) {
          onTerminated(result)
          return result
        }

        return element
      }
    }
  }

  /**
   * Stops the current streaming session.
   * @returns {void | Error} Returns void if successful, or an error if the client cannot be retrieved
   * @throws {never} This method catches all errors and returns them
   */
  stop(): undefined | Error {
    const client = getClient()
    if (errors.is(client, GFNClientNotInitialized)) {
      return // Silently ignore
    }
    if (errors.is(client)) {
      return client
    }
    client.stop()
  }

  /**
   * Cleans up the remote streaming session.
   * @returns {void} Returns void.
   * @param projectId The Project ID for the current project.
   * @param worldId The World ID for the current session.
   * @param sessionId The Session ID for the current session.
   * @param reason An optional reason to report as the cause of the deletion.
   * @throws {never} This method does not throw any errors.
   */
  async cleanup({
    projectId,
    worldId,
    sessionId,
    reason,
  }: {
    projectId: string
    worldId: string
    sessionId: string
    reason?: Error | string
  }): Promise<undefined> {
    // Delete remote session with a useful deletion reason.
    let deletionReason = reason instanceof Error ? reason.message : reason
    const gfnTerminationError = errors.as(reason, GFNTerminationError)
    if (gfnTerminationError) {
      const message = `${gfnTerminationError.message || deletionReason}`
      const hexCode = `0x${gfnTerminationError.code.toString(16).toUpperCase()}`
      deletionReason = `GFN: ${message} (reason=${gfnTerminationError.reason}, code=${hexCode})`
    }

    return await this.sessionClient.deleteSession({
      projectId,
      worldId,
      sessionId,
      deletionReason,
    })
  }

  /**
   * Opens a new window or redirects existing window for streaming.
   * @param {Object} opts - Options for opening the stream window
   * @param {Window} [opts.container] - Existing window to use
   * @param {string} opts.href - URL to load
   * @param {string} opts.target - Target window name
   * @returns {Window | typeof PopupBlocked} Window object or PopupBlocked error
   */
  private open(opts: {
    container?: Window
    href: string
    target: string
  }): Window | typeof PopupBlocked {
    const { container, href, target } = opts
    if (container) {
      container.location.href = href
      return container
    }

    const tab = globalThis.open(href, target)

    if (!tab) {
      return PopupBlocked
    }

    const interval = setInterval(() => {
      if (tab.closed) {
        clearInterval(interval)
        this.emit("streamStateUpdated", {
          state: StreamState.Terminated,
        })
      }
    }, 2000)

    return tab
  }
}

/**
 * Helper to resolve the container element from string or HTMLElement.
 * @param {string | HTMLElement} container - Container element or CSS selector
 * @returns {HTMLElement | StreamingClientError} HTMLElement if found, or ElementNotFound error
 * @throws {never} This function catches all errors and returns them
 */
function resolveContainer(
  container: string | HTMLElement,
): HTMLElement | StreamingClientError {
  if (typeof container === "string") {
    const el = document.querySelector<HTMLElement>(container)
    if (!el) {
      return ElementNotFound
    }
    return el
  }

  return container
}

export { GFNTerminationError } from "./gfn"
