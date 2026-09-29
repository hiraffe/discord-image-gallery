const assert = require("node:assert/strict")
const http = require("node:http")
const { after, before, test } = require("node:test")

process.env.DISCORD_BOT_TOKEN = "test-token"
process.env.DISCORD_GUILD_ID = "999999999999999999"
process.env.DISCORD_CATEGORY_IDS = "100000000000000001"

const originalFetch = global.fetch
const discordRequests = []
let rateLimitNextChannelList = false
global.fetch = async (url, options) => {
  const requestUrl = new URL(url)
  discordRequests.push(requestUrl)
  assert.equal(options.headers.Authorization, "Bot test-token")

  if (requestUrl.pathname.endsWith("/guilds/999999999999999999/channels")) {
    if (rateLimitNextChannelList) {
      rateLimitNextChannelList = false
      return Response.json({ retry_after: 0 }, { status: 429 })
    }
    return Response.json([
      { id: "100000000000000001", name: "Included", type: 4, position: 0 },
      { id: "100000000000000002", name: "Excluded", type: 4, position: 1 },
      { id: "200000000000000001", name: "inside-included", type: 0, parent_id: "100000000000000001", position: 0 },
      { id: "200000000000000002", name: "inside-excluded", type: 0, parent_id: "100000000000000002", position: 1 },
      { id: "200000000000000003", name: "uncategorized", type: 0, parent_id: null, position: 2 },
    ])
  }

  if (requestUrl.pathname.endsWith("/channels/200000000000000001/messages")) {
    return Response.json([
      {
        id: "300000000000000002",
        channel_id: "200000000000000001",
        timestamp: "2026-01-02T00:00:00.000Z",
        author: { id: "400000000000000001", username: "newer", avatar: null },
        attachments: [{ filename: "newer.png", content_type: "image/png", proxy_url: "https://cdn.example/newer.png", width: 20, height: 10 }],
      },
      {
        id: "300000000000000001",
        channel_id: "200000000000000001",
        timestamp: "2026-01-01T00:00:00.000Z",
        author: { id: "400000000000000001", username: "older", avatar: null },
        attachments: [{ filename: "older.png", content_type: "image/png", proxy_url: "https://cdn.example/older.png", width: 20, height: 10 }],
      },
    ])
  }

  throw new Error(`Unexpected Discord request: ${requestUrl.pathname}`)
}

const { createServer, parseCategoryIds } = require("./server")
const server = createServer()
let serverPort

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: serverPort, path }, response => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", chunk => { body += chunk })
      response.on("end", () => resolve({ status: response.statusCode, body }))
    }).on("error", reject)
  })
}

before(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  serverPort = server.address().port
})

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  global.fetch = originalFetch
})

test("serves the gallery without exposing local config", async () => {
  const page = await get("/")
  const config = await get("/config.js")

  assert.equal(page.status, 200)
  assert.equal(page.body.includes('src="config.js"'), false)
  assert.equal(config.status, 404)
})

test("parses category allowlists as JSON arrays or comma-separated IDs", () => {
  assert.deepEqual(parseCategoryIds('["cat-1", "cat-2"]'), ["cat-1", "cat-2"])
  assert.deepEqual(parseCategoryIds("cat-1, cat-2"), ["cat-1", "cat-2"])
  assert.deepEqual(parseCategoryIds(""), [])
})

test("retries a rate-limited channel list after Discord's wait time", async () => {
  rateLimitNextChannelList = true
  const requestCountBefore = discordRequests.length
  const response = await get("/api/channels")

  assert.equal(response.status, 200)
  assert.equal(discordRequests.length - requestCountBefore, 2)
})

test("filters channels and returns image messages oldest first", async () => {
  const channelsResponse = await get("/api/channels")
  const channels = JSON.parse(channelsResponse.body)
  assert.equal(channelsResponse.status, 200)
  assert.deepEqual(channels.map(channel => channel.id), [
    "100000000000000001",
    "200000000000000001",
  ])

  const imagesResponse = await get("/api/channels/200000000000000001/images?after=0")
  const images = JSON.parse(imagesResponse.body)
  assert.equal(imagesResponse.status, 200)
  assert.deepEqual(images.images.map(image => image.filename), ["older.png", "newer.png"])
  assert.equal(images.nextAfter, "300000000000000002")
  assert.equal(images.hasMore, false)
  assert.equal(discordRequests.at(-1).searchParams.get("after"), "0")

  const excludedChannel = await get("/api/channels/200000000000000002/images?after=0")
  assert.equal(excludedChannel.status, 404)
})