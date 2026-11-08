/**
 * GitHub device flow authentication.
 *
 * Uses the device authorization grant (RFC 8628) so OSSPilot can authenticate
 * without a web server or callback URL. Suitable for CLI tools.
 */

export interface DeviceCodeResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface DeviceFlowToken {
  accessToken: string
  tokenType: string
  scope: string
}

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"

export async function requestDeviceCode(clientId: string): Promise<DeviceCodeResponse> {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "repo read:user user:email" }),
  })
  if (!response.ok) {
    throw new Error(`device code request failed: ${response.status}`)
  }
  const data = (await response.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
  }
}

export async function pollForToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  expiresIn: number,
): Promise<DeviceFlowToken> {
  const deadline = Date.now() + expiresIn * 1000
  let currentInterval = interval

  while (Date.now() < deadline) {
    await sleep(currentInterval * 1000)
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    })
    const data = (await response.json()) as {
      access_token?: string
      token_type?: string
      scope?: string
      error?: string
      error_description?: string
      interval?: number
    }

    if (data.access_token) {
      return {
        accessToken: data.access_token,
        tokenType: data.token_type ?? "bearer",
        scope: data.scope ?? "",
      }
    }

    if (data.error === "authorization_pending") {
      continue
    }
    if (data.error === "slow_down") {
      currentInterval = data.interval ?? currentInterval + 5
      continue
    }
    if (data.error === "expired_token") {
      throw new Error("Device code expired. Please try again.")
    }
    if (data.error === "access_denied") {
      throw new Error("Authorization denied by user.")
    }
    if (data.error) {
      throw new Error(data.error_description ?? data.error)
    }
  }
  throw new Error("Device flow timed out.")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
