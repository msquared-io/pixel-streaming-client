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
    }
  }
  initialize(settings: Settings): Promise<void>
}
