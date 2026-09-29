const http = require("node:http")
const path = require("node:path")
const { readFile } = require("node:fs/promises")
require("dotenv").config()

const PORT = Number(process.env.PORT) || 3000
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD_ID = process.env.DISCORD_GUILD_ID
const CATEGORY_IDS = new Set(parseCategoryIds(process.env.DISCORD_CATEGORY_IDS || ""))
const MESSAGE_CHANNEL_TYPES = new Set([0, 2, 5, 13, 15, 16])
const CHANNEL_CACHE_MS = 5 * 60_000
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/index.css", "index.css"],
  ["/index.js", "index.js"],
])
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
}

let cachedChannels
let channelCacheExpiresAt = 0
let channelRequest

function parseCategoryIds(value) {
  const normalized = value.trim()
  if (!normalized) return []

  if (normalized.startsWith("[")) {
    try {
      const ids = JSON.parse(normalized)
      if (Array.isArray(ids)) return ids.map(id => String(id).trim()).filter(Boolean)
    } catch {}
  }

  return normalized.split(",").map(id => id.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean)
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  })
  response.end(JSON.stringify(data))
}

async function discordRequest(endpoint) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "User-Agent": "DiscordBot (https://discord.com, 1.0)",
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (response.ok) return response.json()

    const discordError = await response.json().catch(() => null)
    const retryAfterSeconds = Number(discordError?.retry_after ?? response.headers.get("retry-after"))
    if (response.status === 429 && attempt === 0 && Number.isFinite(retryAfterSeconds)) {
      await new Promise(resolve => setTimeout(resolve, Math.ceil(retryAfterSeconds * 1000) + 100))
      continue
    }

    const error = new Error(`Discord returned ${response.status}`)
    error.status = response.status
    error.retryAfter = Number.isFinite(retryAfterSeconds) ? String(retryAfterSeconds) : response.headers.get("retry-after")
    error.discordCode = discordError?.code
    throw error
  }
}

async function getGuildChannels() {
  if (cachedChannels && Date.now() < channelCacheExpiresAt) return cachedChannels
  if (channelRequest) return channelRequest

  channelRequest = (async () => {
    const allChannels = await discordRequest(`/guilds/${GUILD_ID}/channels`)
    const availableCategoryIds = new Set(
      allChannels
        .filter(channel => channel.type === 4)
        .filter(channel => !CATEGORY_IDS.size || CATEGORY_IDS.has(channel.id))
        .map(channel => channel.id)
    )
    cachedChannels = allChannels.filter(channel => {
      if (channel.type === 4) return availableCategoryIds.has(channel.id)
      if (!MESSAGE_CHANNEL_TYPES.has(channel.type)) return false
      if (!CATEGORY_IDS.size) return true
      return availableCategoryIds.has(channel.parent_id)
    })
    channelCacheExpiresAt = Date.now() + CHANNEL_CACHE_MS
    return cachedChannels
  })()

  try {
    return await channelRequest
  } finally {
    channelRequest = undefined
  }
}

function isImageAttachment(attachment) {
  return attachment.content_type?.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)$/i.test(attachment.filename || "")
}

function imageFromAttachment(message, attachment) {
  const author = message.author || {}
  const avatarUrl = author.avatar && author.id
    ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=80`
    : "https://cdn.discordapp.com/embed/avatars/0.png"

  return {
    filename: attachment.filename,
    url: attachment.proxy_url || attachment.url,
    width: attachment.width,
    height: attachment.height,
    timestamp: message.timestamp,
    author_username: author.global_name || author.username || "Unknown user",
    author_pfp_url: avatarUrl,
    message_url: `https://discord.com/channels/${GUILD_ID}/${message.channel_id}/${message.id}`,
  }
}

async function handleApi(request, response, url) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." })
    return
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok" })
    return
  }

  try {
    if (url.pathname === "/api/channels") {
      sendJson(response, 200, await getGuildChannels())
      return
    }

    const imageRoute = url.pathname.match(/^\/api\/channels\/(\d+)\/images$/)
    if (imageRoute) {
      const channelId = imageRoute[1]
      const channels = await getGuildChannels()
      if (!channels.some(channel => channel.id === channelId && MESSAGE_CHANNEL_TYPES.has(channel.type))) {
        sendJson(response, 404, { error: "Channel not found in the configured gallery." })
        return
      }

      const after = url.searchParams.get("after") || "0"
      if (!/^\d{1,20}$/.test(after)) {
        sendJson(response, 400, { error: "Invalid image cursor." })
        return
      }
      const messages = await discordRequest(
        `/channels/${channelId}/messages?after=${after}&limit=100`
      )
      messages.sort((left, right) => {
        const leftId = BigInt(left.id)
        const rightId = BigInt(right.id)
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
      })

      const images = messages.flatMap(message =>
        (message.attachments || [])
          .filter(isImageAttachment)
          .map(attachment => imageFromAttachment(message, attachment))
      )
      sendJson(response, 200, {
        images,
        nextAfter: messages.at(-1)?.id || after,
        hasMore: messages.length === 100,
      })
      return
    }

    sendJson(response, 404, { error: "API route not found." })
  } catch (error) {
    console.error("Discord API request failed:", url.pathname, error.status, error.discordCode || "")
    const statusCode = [400, 403, 404, 429].includes(error.status) ? error.status : 502
    const errorMessage = error.status === 403
      ? url.pathname === "/api/channels"
        ? "Discord denied access to the configured server. Confirm the bot is in that server and DISCORD_GUILD_ID is its server ID."
        : "The bot cannot read this channel. Grant it View Channel and Read Message History access."
      : error.status === 401
        ? "Discord rejected the bot token. Check DISCORD_BOT_TOKEN in the server environment."
      : error.status === 429
        ? `Discord is rate limiting the bot. Wait ${error.retryAfter || "a little"} seconds, then retry.`
        : "Could not load Discord data. Check the bot permissions and server configuration."
    const headers = error.retryAfter ? { "Retry-After": error.retryAfter } : {}
    response.writeHead(statusCode, {
      ...headers,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    })
    response.end(JSON.stringify({ error: errorMessage }))
  }
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`)
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url)
      return
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405)
      response.end()
      return
    }

    const filename = publicFiles.get(url.pathname)
    if (!filename) {
      response.writeHead(404)
      response.end("Not found")
      return
    }

    try {
      const file = await readFile(path.join(__dirname, filename))
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": contentTypes[path.extname(filename)],
        "X-Content-Type-Options": "nosniff",
      })
      response.end(request.method === "HEAD" ? undefined : file)
    } catch (error) {
      console.error("Static file request failed:", error.message)
      response.writeHead(500)
      response.end("Unable to serve this page.")
    }
  })
}

if (require.main === module) {
  const missingVariables = [
    !BOT_TOKEN && "DISCORD_BOT_TOKEN",
    !GUILD_ID && "DISCORD_GUILD_ID",
  ].filter(Boolean)
  if (missingVariables.length) {
    console.error(`Missing required environment variables: ${missingVariables.join(", ")}`)
    process.exit(1)
  }

  createServer().listen(PORT, "0.0.0.0", () => {
    console.log(`Gallery server listening on port ${PORT}`)
  })
}

module.exports = { createServer, parseCategoryIds }