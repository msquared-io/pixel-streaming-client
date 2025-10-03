import { invariant } from "../invariant"

import { type API, type ServerInfo, TerminationErrorCode } from "./types"

// HACK: Temporary downgrade to 1.1.39 due to suspected tab focus issue in 1.1.40
export const GFN_SDK_URL =
  "https://sdk.nvidia.com/gfn/client-sdk/1.1.39/gfn-client-sdk.js"
//"https://sdk.nvidia.com/gfn/client-sdk/1.x/gfn-client-sdk.js"

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace globalThis {
  const GFN: API
}

type Callbacks = {
  onStarted: () => void
  onTerminated: (e?: GFNTerminationError) => void
}

export class GFNClientError extends Error {
  override readonly name: string = "GFNClientError"
}

export const GFNClientNotInitialized = new GFNClientError("not-initialized")
export const GFNClientAlreadyInitialized = new GFNClientError(
  "already-initialized",
)

export class GFNTerminationError extends GFNClientError {
  override readonly name: string = "GFNTerminationError"

  constructor(
    public code: number,
    public reason: number,
    message?: string,
    opts?: ErrorOptions,
  ) {
    super(message, opts)
  }
}

type Config = {
  settings: {
    serviceUrl?: string
    clientId: string
    catalogClientId: string
    partnerId: string
  }
}

type Auth = {
  cmsId: number
  nonce: string
}

const GEFORCE_PLAYER_ELEMENT_ID = "geforce-container"

let client: GFNClient | undefined

class GFNClient {
  private player?: HTMLElement

  constructor(
    public readonly config: Config,
    readonly serverInfo: ServerInfo,
  ) {}

  async start(
    container: HTMLElement,
    auth: Auth,
  ): Promise<GFNClientError | undefined> {
    await globalThis.GFN.auth.loginWithNonce(auth.nonce, auth.cmsId)

    const token = globalThis.GFN.auth.guestUser?.idToken
    invariant(token, "guestUser ID token should exist")

    const resolution = globalThis.GFN.streamer.detectStreamingResolution()

    // HACK: widen the resolution to 1280x720 (16:9) if we got 1024x720 back, which is the default
    // for iPhone devices.
    // TODO allow this behaviour to be customised, ideally by specifing a GFN `StreamProfilePreset`, or a (constrained) custom resolution.
    if (resolution.width === 1024 && resolution.height === 720) {
      resolution.width = 1280
    }

    // Remove existing player element if it exists and reset the client state.
    if (this.player) {
      this.player?.remove()
      this.cancel()
    }

    this.player = document.createElement("div")
    this.player.setAttribute("id", GEFORCE_PLAYER_ELEMENT_ID)
    this.player.setAttribute(
      "style",
      "width: 100%; height: 100%; background: black;",
    )
    container.append(this.player)

    try {
      await globalThis.GFN.streamer.start({
        server: this.serverInfo.defaultZone.address,
        appId: auth.cmsId,
        windowElementId: GEFORCE_PLAYER_ELEMENT_ID,
        streamParams: {
          width: resolution.width,
          height: resolution.height,
          fps: 60,
        },
      })
    } catch (cause) {
      return new GFNClientError("failed to start stream", { cause })
    }
  }

  cancel() {
    globalThis.GFN.streamer.cancel()
  }

  stop() {
    globalThis.GFN.streamer.stop()
  }

  listen({ onTerminated, onStarted }: Callbacks) {
    globalThis.GFN.streamer.on("started", onStarted)
    globalThis.GFN.streamer.on("diagnostic", (e) => {
      switch (e.code) {
        case TerminationErrorCode.RequestLimitExceeded:
        case TerminationErrorCode.SessionLimitExceeded:
          onTerminated(new GFNTerminationError(e.code, -1, e.message))
      }
    })
    globalThis.GFN.streamer.on("terminated", (e) => {
      switch (e.code) {
        case TerminationErrorCode.ServerDisconnectedIntended:
        case undefined:
          // Normal termination, e.g. user closed the stream intentionally.
          onTerminated()
          break
        default:
          // Unexpected termination, e.g. network error.
          onTerminated(new GFNTerminationError(e.code, e.reason))
      }
    })
  }
}

/**
 * Configures the GFN client and logs in using the provided nonce.
 *
 * @returns the logged in client if successful, otherwise a {@link GFNClientError}
 */
export async function initClient(
  config: Config,
): Promise<GFNClient | GFNClientError> {
  if (client) {
    // TODO: Should we stop and invalidate any existing clients that were handed out with an out of date config, rather than returning an error here.
    // We shoud probably also remove the listeners in this case
    return GFNClientAlreadyInitialized
  }

  await loadGFNOnce()

  try {
    await globalThis.GFN.initialize(
      new globalThis.GFN.Settings(config.settings),
    )
    const server = await globalThis.GFN.server.getServerInfo()
    globalThis.GFN.settings.vpcId = server.vpcId

    client = new GFNClient(config, server)
    return client
  } catch (cause) {
    return new GFNClientError("GFN client initialization failed", { cause })
  }
}

export function getClient() {
  if (client) {
    return client
  }

  return GFNClientNotInitialized
}

export async function getOrInitClient(
  config: Config,
): Promise<GFNClient | GFNClientError> {
  if (client) {
    return client
  }

  return initClient(config)
}

function loadGFNOnce() {
  if (!globalThis.GFN) {
    return new Promise<void>((resolve) => {
      const script = document.createElement("script")
      script.src = GFN_SDK_URL
      script.addEventListener("load", function loadListener() {
        resolve()
        script.removeEventListener("load", loadListener)
      })
      document.head.append(script)
    })
  }
}

export type GeforceStreamConfig = {
  cmsId: string
  nonce: string
  redirect: string
  zone?: string
  state?: string
}

// TODO: understand if we can/should bundle partner ID as part of the config or not? If so it should be removed from the ClientOptions.
export function buildGfnUrl(
  partnerId: string,
  cfg: GeforceStreamConfig,
  { fullscreen = true }: { fullscreen?: boolean } = {},
) {
  const url = new URL("/apps", "https://gdn.nvidia.com")
  const q = url.searchParams
  const windowed = !fullscreen

  q.append("cms-id", cfg.cmsId)
  q.append("action", "play-game")
  q.append("nonce", cfg.nonce)
  q.append("redirect", cfg.redirect)
  q.append("partner-id", partnerId)
  q.append("utm_source", "Improbable")
  q.append("utm_campaign", "Streaming")
  q.append("windowed-mode", windowed.toString())

  if (cfg.zone) {
    q.append("zone", cfg.zone)
  }
  if (cfg.state) {
    q.append("state", cfg.state)
  }

  return url.href
}
