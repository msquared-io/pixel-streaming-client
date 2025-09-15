import { Browser, OS, getUserAgent } from "./ua"

type Compatibility = {
  minVer: number
  devices?: Set<Lowercase<string>>
}

/* TODO This doesn't look like it matches up with the supported platforms for the geforce now SDK,
 *  and it could be cleaned up to use the exported UA values directly rather than them being passed
 *  as arguments
 */
const GeforceNowBrowsers: Record<Lowercase<string>, Compatibility> = {
  chrome: { minVer: 77 },
  "chrome headless": { minVer: 77 },
  edge: { minVer: 91 },
  // version 14 is supported but 16 is required for navigator.permissions support
  safari: { minVer: 16, devices: new Set(["ipad" as Lowercase<string>]) },
  "mobile safari": { minVer: 16 },
}

const UbitusBrowsers: Record<Lowercase<string>, Compatibility> = {
  chrome: { minVer: 73 },
  "chrome headless": { minVer: 73 },
  firefox: { minVer: 66 },
  /* Although Safari desktop is supported by Ubitus, Safari has an unfavourable feature of dropping a banner at the top
   * whenever the pointer is captured. Therefore, it causes unnecessary flickering in the streaming.
   * Version 12 is supported but 16 is required for navigator.permissions support
   */
  safari: { minVer: 16, devices: new Set(["ipad" as Lowercase<string>]) },
  "mobile safari": { minVer: 16 },
}

function isSupported(
  supportedBrowsers: Record<Lowercase<string>, Compatibility>,
  name: string,
  version: number,
  device: string,
  os: string,
) {
  if (
    os === OS.iOS &&
    name !== Browser.Safari &&
    name !== Browser.SafariMobile
  ) {
    return false
  }
  const lowercaseName = name.toLowerCase() as Lowercase<string>
  const lowercaseDevice = device.toLowerCase() as Lowercase<string>
  const browser = supportedBrowsers[lowercaseName]
  if (typeof browser !== "undefined") {
    const isBrowserVersionSupported = browser.minVer <= version
    const supportedDevices = browser.devices
    const isDeviceSupported = supportedDevices
      ? supportedDevices.has(lowercaseDevice)
      : true
    return isBrowserVersionSupported && isDeviceSupported
  }
  return false
}

type BrowserSupport = {
  browserName: string
  browserVersion: number
  osName: string
  deviceModel: string
  deviceType: string
  ubitusSupported: boolean
  geforceSupported: boolean
}

const compatCache: Record<string, BrowserSupport> = {}

function getOrComputeCompat() {
  const { browser, os, device, raw } = getUserAgent()
  if (compatCache[raw]) {
    return compatCache[raw]
  }
  const browserVersion = Number.parseInt(browser?.version ?? "", 10)
  const deviceModel = device.model ?? ""
  const deviceType = device.type ?? ""
  const browserName = browser.name ?? ""
  const osName = os.name ?? ""
  const ubitusSupported = isSupported(
    UbitusBrowsers,
    browserName,
    browserVersion,
    deviceModel,
    osName,
  )
  const geforceSupported = isSupported(
    GeforceNowBrowsers,
    browserName,
    browserVersion,
    deviceModel,
    osName,
  )

  const compat = {
    browserName,
    browserVersion,
    osName,
    deviceModel,
    deviceType,
    ubitusSupported,
    geforceSupported,
  }

  compatCache[raw] = compat
  return compat
}

export function getStreamCompat(skipBrowserSupportChecks = false) {
  const compat = getOrComputeCompat()

  if (skipBrowserSupportChecks) {
    return { ...compat, geforceSupported: true, ubitusSupported: true }
  }

  return compat
}
