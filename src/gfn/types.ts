// Shim types based on the GFN client (https://developer.geforcenow.com/learn/client-sdk/latest)
// These types have been narrowed to only include properties and methods used by the Pixel Streaming Client.
// Please see the GCN Client SDK for full, accurate type definitions.

export interface Zone {
  name: string
  address: string
}

export interface ServerVersionEntity {
  name?: string
  buildVersion?: string
  buildDateTime?: string
  zoneVersion?: string
  protocolMinorVersion?: number
  protocolMajorVersion?: number
}

export declare enum ServerType {
  Unknown = -1,
  Nimbus = 0,
  GameStream = 1,
  GameStreamRoamingProxy = 2,
  CloudStation = 3,
  QuadroStation = 4,
  PassThrough = 51,
  Playback = 52,
  SecureSignallingPassThrough = 53,
}

export enum TerminationErrorCode {
  Success = 0x00f20000,
  // Common errors returned when a stream terminates.
  ServerDisconnectedIntended = 0x00f22320, // Game client terminated.
  ServerDisconnectedUserIdle = 0x00f22324, // No input received from user.
  ServerDisconnectedAnotherClient = 0x00f2232a, // User started another client.
  ServerDisconnectedConcurrentSessionLimitExceeded = 0x00f22344, // User started another session.
  ServerDisconnectedMultipleLogin = 0x00f22348, // User started another session.
  ServerDisconnectedMaintenanceMode = 0x00f22349, // Service is entering maintenance.
  ServerDisconnectedMultipleTab = 0x00f22350, // User started another session in another tab.
  // Common errors when starting a stream.
  NoNetwork = 0xc0f21001, // No network detected.
  NetworkError = 0xc0f21002, // Network connection failed.
  RequestLimitExceeded = 0xc0f2210a, // User started too many streams.
  SessionLimitExceeded = 0xc0f2210b, // User started too many streams.
  Maintenance = 0xc0f22118, // Service is in maintenance.
  AppPatching = 0xc0f22129, // The application is being updated.
  RegionBanned = 0xc0f22135, // The user is in an unsupported region.
  GuestModeCampaignDisabled = 0xc0f22149, // The application does not support guest mode.
  InvalidVideoElement = 0xc0f22400, // The supplied video element is invalid.
  InvalidAudioElement = 0xc0f22401, // The supplied audio element is invalid.
}

export interface ZoneTable {
  [key: string]: Zone
}

export interface MonitorSettingsEntity {
  monitorId?: number
  positionX?: number
  positionY?: number
  widthInPixels?: number
  heightInPixels?: number
  dpi?: number
  framesPerSecond?: number
  sdrHdrMode?: number
}

export interface ServerInfo {
  version: ServerVersionEntity
  vpcId: string
  serverType: ServerType
  defaultZone: Zone
  zones: ZoneTable
  monitorSettings: MonitorSettingsEntity[]
}

declare class Settings {
  constructor(descriptor?: {
    clientId?: string
    catalogClientId?: string
    partnerId?: string
    serviceUrl?: string
  })
}

export declare class API {
  readonly Settings: typeof Settings
  auth: {
    guestUser: {
      idToken: string
    } | null
    loginWithNonce(nonce: string, appId: number): Promise<void>
  }
  server: {
    getServerInfo: (
      serviceUrl?: string,
      skipLatencyBasedRouting?: boolean,
    ) => Promise<ServerInfo>
  }
  settings: {
    vpcId: string
  }
  streamer: {
    detectStreamingResolution: () => { width: number; height: number }
    start: (params: {
      server: Zone | string
      appId: number
      windowElementId?: string
      streamParams: {
        width: number
        height: number
        fps: number
      }
    }) => Promise<void>
    stop: () => void
    on: {
      (event: "started", callback: () => void): void
      (
        event: "terminated",
        callback: (e: { reason: number; code?: number }) => void,
      ): void
      (
        event: "diagnostic",
        callback: (e: {
          level?: number
          code?: number
          message?: string
        }) => void,
      ): void
    }
  }
  initialize(settings: Settings): Promise<void>
}
