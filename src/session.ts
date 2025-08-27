/**
 * This is the minimal code and types needed to fetch Sessions from Morpheus Platform.
 *
 * The `sessionManager.clientFetch` code has been minimally reimplemeted in the
 * `doFetch` method and any of it's required external data is passed into the
 * SessionClient constructor. It has significantly less robust error handling,
 * however as the usage code just returns `undefined` on any error, we don't
 * need the all of that functionaily _yet_.
 *
 * @module
 */

import type { StreamProvider } from "./client"
import type { Fetch, Logger, Token } from "./types"

const SESSION_POLL_INTERVAL_MILLIS = 5000

enum HttpHeader {
  // M2 Headers
  // Set automatically by LB if request sent to project specific websites
  // Need to be set by client if request sent to project agnostic websites (e.g. api.m2worlds.io or admin.m2worlds.io)
  OrganizationId = "x-m2-organization-id",
  ProjectId = "x-m2-project-id",
  WorldId = "x-m2-world-id",
  ForwardedAuth = "x-forwarded-authorization",
  Authorization = "authorization",
  AuthType = "x-m2-auth-type",
  // Country code from GCP LB or Cloudflare
  CountryCode = "x-country-code",
}

export enum SessionState {
  // 'Waiting' states
  Queued = "QUEUED", // Session is new and waiting in a queue with other Sessions.
  Admitted = "ADMITTED", // Session has been manually admitted, pending available capacity.

  // 'Active' states
  Ready = "READY", // Session is clear to join the deployment; capacity is available.
  Pending = "PENDING", // Session is awaiting a streaming slot.
  Active = "ACTIVE", // Session is connected to the deployment and/or has streaming configuration data.

  // 'Terminal' states
  Replaced = "REPLACED", // Session has been replaced by a newer session for the same user.
  Expired = "EXPIRED", // Session expired.
  Failed = "FAILED", // Session failed unrecoverably.
  Deleted = "DELETED", // Session was explicitly deleted, either by the user or an operator.
}

type PostSessionRequest = {
  streamId: string
  metadata: {
    browserName: string
    browserVersion: number
    osName: string
    deviceModel: string
    deviceType: string
    ubitusSupported: boolean
    geforceSupported: boolean
    forceProvider?: StreamProvider
  }
}

type PostSessionResponse = Session & { signedSessionId?: string }

export type GeforceStreamConfig = {
  name: StreamProvider.GeforceNow
  cmsId: string
  nonce: string
  redirect: string
  partnerId: string
  zone?: string
  state?: string
  windowed?: boolean
  sessionId: string
}

export type UbitusStreamConfig = {
  name: StreamProvider.Ubitus
  keepAlivePath?: string
  launcherToken: string
  gameLabel: string
  token: string
  server: string
  gameChannel: string
  sessionId: string
}

export type StreamConfig = GeforceStreamConfig | UbitusStreamConfig

export type Session = {
  sessionId: string
  state: string
  providerConfig?: StreamConfig
}

export type FetchSessionConfigParameters = {
  projectId: string
  streamId: string
  sessionMetadata: PostSessionRequest["metadata"]
  worldId?: string
  onStateChange?: (state: SessionState) => void
}

export type SessionClientOptions = {
  organizationId?: string
  fetch?: Fetch
  host?: string
  protocol?: "http" | "https"
  token?: Token
  logger?: Logger
}

export class SessionClient {
  private organizationId?: string
  private token?: Token
  private fetch: Fetch
  private logger: Logger
  private baseURL?: string

  constructor(opts: SessionClientOptions) {
    this.organizationId = opts.organizationId
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.token = opts.token
    this.logger = opts.logger ?? console
    this.baseURL = opts.host
      ? `${opts.protocol ?? "https"}://${opts.host}`
      : undefined
  }

  /**
   * Sets or updates the authentication token used for requests.
   *
   * @param token A string token or a function that returns a string or a Promise resolving to a string.
   */
  public setAuthToken(token: Token): void {
    this.token = token
  }

  /**
   *  Refreshes an existing Session. This should be called on a regular basis until the session state becomes `READY`,
   *  at which point the streaming configuration data will be available.
   *
   *  @param projectId The Project ID for the current project.
   *  @param worldId The World ID for the current session.
   *  @param sessionId The Session ID for the current session.
   *
   *  @return The refreshed Session object, or undefined if the session could not be refreshed.
   */
  private async refreshSession({
    projectId,
    worldId,
    sessionId,
  }: {
    projectId: string
    worldId: string
    sessionId: string
  }): Promise<Session | undefined> {
    const headers = new Headers({
      [HttpHeader.ProjectId]: projectId,
      [HttpHeader.WorldId]: worldId,
    })

    try {
      const response = await this.doFetch(`/api/sessions/${sessionId}`, {
        method: "post",
        headers,
      })

      if (!response.ok) {
        this.logger.error("Failed to refresh session:", {
          body: await response.text(),
          status: response.status,
        })
        return
      }

      return await (response.json() as Promise<Session>)
    } catch (error) {
      this.logger.error("Failed to make refresh session request:", { error })
      return
    }
  }

  /**
   *  Handles polling of a session until it reaches a useable or failed state. Retries every few seconds.
   *
   *  @param projectId The Project ID for the current project.
   *  @param worldId The World ID for the current session.
   *  @param sessionId The Session ID for the current session.
   *  @param onStateChange An optional callback that will be provided with session state values.
   *
   *  @return The Session object, or undefined if the session could not be created.
   */
  private async pollSession(
    projectId: string,
    worldId: string,
    sessionId: string,
    onStateChange?: (state: SessionState) => void,
  ): Promise<Session | undefined> {
    let session: Session | undefined

    while (
      !session ||
      session.state === SessionState.Queued ||
      session.state === SessionState.Admitted ||
      session.state === SessionState.Pending ||
      session.state === SessionState.Ready
    ) {
      session = await this.refreshSession({
        projectId,
        worldId,
        sessionId,
      })

      if (!session) {
        // Failed to refresh session.
        return
      }

      if (session.state === SessionState.Active) {
        if (onStateChange) {
          onStateChange(session.state)
        }

        // Session is now ready!
        return session
      }

      await new Promise((res) =>
        globalThis.setTimeout(res, SESSION_POLL_INTERVAL_MILLIS),
      )
    }

    return session
  }

  /**
   *  Creates a Session configuration; may create a World-scoped session if the World ID is supplied _and_ the backend
   *  allows it.
   *
   *  @param projectId The Project ID for the current project.
   *  @param streamId The Stream ID for the current session.
   *  @param sessionMetadata The metadata for the current session.
   *  @param worldId The optional World ID for the current session.
   *  @param onStateChange An optional callback that will be provided with session state values.
   *
   *  @return The Session object, or undefined if the session could not be created.
   */
  async createSession({
    projectId,
    streamId,
    sessionMetadata,
    worldId,
    onStateChange,
  }: FetchSessionConfigParameters): Promise<Session | undefined> {
    const headers = new Headers({
      [HttpHeader.ProjectId]: projectId,
      [HttpHeader.WorldId]: worldId ?? "",
      "Content-Type": "application/json",
    })

    try {
      const response = await this.doFetch("/api/sessions", {
        method: "post",
        headers,
        body: JSON.stringify({
          streamId,
          metadata: sessionMetadata,
        }),
      })

      if (!response.ok) {
        this.logger.error("Failed to fetch session config:", {
          body: await response.text(),
          status: response.status,
        })
        return
      }

      const session: Session = (await response.json()) as PostSessionResponse
      if (
        worldId &&
        (session.state === SessionState.Queued ||
          session.state === SessionState.Ready)
      ) {
        if (onStateChange) {
          onStateChange(session.state)
        }

        // This is a World-scoped session, and needs to be polled at least once to receive the streaming
        // configuration.
        return await this.pollSession(
          projectId,
          worldId,
          session.sessionId,
          onStateChange,
        )
      }

      return session
    } catch (error) {
      this.logger.error("Failed to make fetch session config request:", {
        error,
      })
      return
    }
  }

  /**
   *  Deletes an existing Session.
   *
   *  @param projectId The Project ID for the current project.
   *  @param worldId The World ID for the current session.
   *  @param sessionId The Session ID for the current session.
   *  @param deletionReason An optional reason for the deletion, for example an error code from the streaming provider.
   *
   *  @return Undefined on success.
   */
  async deleteSession({
    projectId,
    worldId,
    sessionId,
    deletionReason,
  }: {
    projectId: string
    worldId: string
    sessionId: string
    deletionReason?: string
  }): Promise<undefined> {
    const headers = new Headers({
      [HttpHeader.ProjectId]: projectId,
      [HttpHeader.WorldId]: worldId,
    })

    try {
      const response = await this.doFetch(`/api/sessions/${sessionId}`, {
        method: "delete",
        headers,
        body: JSON.stringify({
          deletionReason,
        }),
      })
      if (!response.ok) {
        this.logger.error("Failed to delete session:", {
          body: await response.text(),
          status: response.status,
        })
        return
      }
    } catch (error) {
      this.logger.error("Failed to make refresh session request:", { error })
      return
    }
  }

  private async doFetch(
    input: RequestInfo | string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string" && this.baseURL
        ? new URL(input, this.baseURL)
        : input

    const headers = new Headers(init?.headers)

    if (!headers.has("Authorization") && this.token) {
      const token =
        typeof this.token === "function" ? await this.token() : this.token
      headers.set("Authorization", `Bearer ${token}`)
    }

    if (!headers.has(HttpHeader.OrganizationId) && this.organizationId) {
      headers.set(HttpHeader.OrganizationId, this.organizationId)
    }

    return this.fetch(url, { ...init, headers })
  }
}
