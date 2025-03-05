import {
  type IBrowser,
  type ICPU,
  type IDevice,
  type IEngine,
  type IOS,
  UAParser,
} from "ua-parser-js"

export type UA = {
  raw: string
  os: IOS
  device: IDevice
  cpu: ICPU
  engine: IEngine
  browser: IBrowser
}

let ua: UA | undefined

export function getUserAgent() {
  // Check we have already parsed the user agent and it has not changed
  if (navigator.userAgent === ua?.raw) {
    return ua
  }

  const parser = new UAParser(navigator.userAgent)

  const os = parser.getOS()
  const device = parser.getDevice()
  const browser = parser.getBrowser()
  const engine = parser.getEngine()
  const cpu = parser.getCPU()

  // the OS associated with iPads is macOS (not iOS)
  // so we must check for the number of touch points to determine
  // if it's an iPad
  if (
    os.name?.replace(/\s/g, "").toLowerCase() === "macos" &&
    navigator.maxTouchPoints &&
    navigator.maxTouchPoints > 2
  ) {
    device.model = "iPad"
    device.type = "tablet"
    os.name = "iOS"
  }

  ua = {
    raw: navigator.userAgent,
    os,
    device,
    browser,
    engine,
    cpu,
  }

  return ua
}

export const OS = {
  iOS: "iOS",
}

export const Browser = {
  Safari: "Safari",
  SafariMobile: "Mobile Safari",
}
