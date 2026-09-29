const DISCORD_TOKEN = window.DISCORD_TOKEN || ""
const DISCORD_GUILD_ID = window.DISCORD_GUILD_ID || ""
const DISCORD_CATEGORY_IDS = Array.isArray(window.DISCORD_CATEGORY_IDS)
  ? window.DISCORD_CATEGORY_IDS.map(String)
  : []

function sendNotification(type, msg) {
  const notifications = document.querySelector(".notifications")
  const notif = document.createElement("div")
  notif.className = `notification ${type}`
  notif.textContent = msg
  notifications.appendChild(notif)
  setTimeout(() => {
    notifications.removeChild(notif)
  }, 6000);
}

class Display {
  static scrollThreshold = 120
  #columns = []
  #images = []

  constructor(columnCount = 5) {
    this.ref = document.querySelector("#display")
    this.html = document.querySelector("html")
    this.#recalculateColumns(columnCount)

    document.addEventListener("scroll", this.checkScrollBottom.bind(this))
  }

  set columnCount(newValue) {
    this.#recalculateColumns(newValue)
  }

  #recalculateColumns(columnCount) {
    this.#images.forEach(i => i.remove())
    Array.from(this.ref.children).forEach(c => c.remove())

    this.#columns = Array.from({ length: columnCount }).fill(0).map(() => {
      const e = document.createElement("div")
      e.className = "column"
      return e
    })
    this.#columns.forEach(e => this.ref.appendChild(e))
    this.#images.forEach(i => this.#appendToColumn(i))
    this.checkScrollBottom()
  }

  #convertImageSize(imageWidth, imageHeight) {
    const columnWidth = this.#columns[0].clientWidth
    const width = columnWidth;
    const height = parseInt(imageHeight / (imageWidth / width));
    return { width, height }
  }

  #appendToColumn(image) {
    const { width, height } = this.#convertImageSize(image.width, image.height)
    image.width = width
    image.height = height
    image.src = `${image.src.split("?")[0]}?width=${width}&height=${height}`;

    this.#getShortestColumn().appendChild(image)
  }

  #getShortestColumn() {
    return this.#columns.map(e => [e, e.clientHeight]).reduce((prev, curr) => prev[1] > curr[1] ? curr : prev)[0]
  }

  addImage(imageData) {
    let image = document.createElement("img")
    const { width, height } = this.#convertImageSize(imageData.width, imageData.height)
    image.width = width
    image.height = height
    image.src = `${imageData.url}?width=${width}&height=${height}`
    image.addEventListener("click", () => expandImage(imageData))

    this.#images.push(image)
    this.#getShortestColumn().appendChild(image)
  }

  checkScrollBottom() {
    const shortestColumn = this.#getShortestColumn()
    if (shortestColumn.scrollHeight - this.html.clientHeight - this.html.scrollTop < Display.scrollThreshold) {
      request()
    }
  }

  clear() {
    this.#images.forEach(i => i.remove())
    this.#images = []
  }
}

let display
let galleryImages = []
let selectedImageIndex = -1
let channelsByCategory = new Map()

window.addEventListener("load", () => {
  const expandedImageBg = document.querySelector("#expanded-image-bg")
  const expandedImage = document.querySelector("#expanded-image")
  expandedImageBg.addEventListener("click", e => e.target === expandedImageBg || e.target === expandedImage ? expandImage(null) : null)

  const categorySelect = document.querySelector("#category-select")
  const channelSelect = document.querySelector("#channel-select")
  categorySelect.addEventListener("change", () => {
    const selectedChannels = channelsByCategory.get(categorySelect.value) || []
    channelSelect.replaceChildren(new Option(
      selectedChannels.length ? "Select a channel" : "No channels in this category",
      ""
    ))
    selectedChannels.forEach(channel => channelSelect.add(new Option(channel.name, channel.id)))
    channelSelect.disabled = selectedChannels.length === 0
  })
  channelSelect.addEventListener("change", () => newSearch(channelSelect.value))

  document.querySelector("#previous-image").addEventListener("click", () => navigateCarousel(-1))
  document.querySelector("#next-image").addEventListener("click", () => navigateCarousel(1))
  const carouselStage = document.querySelector(".carousel-stage")
  let swipeStart = null
  carouselStage.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" || e.target.closest("button")) return
    swipeStart = { pointerId: e.pointerId, x: e.clientX, y: e.clientY }
  })
  window.addEventListener("pointerup", e => {
    if (!swipeStart || swipeStart.pointerId !== e.pointerId) return
    const deltaX = e.clientX - swipeStart.x
    const deltaY = e.clientY - swipeStart.y
    swipeStart = null
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return
    navigateCarousel(deltaX < 0 ? 1 : -1)
  })
  window.addEventListener("pointercancel", e => {
    if (swipeStart?.pointerId === e.pointerId) swipeStart = null
  })
  document.addEventListener("keydown", e => {
    if (selectedImageIndex < 0) return
    if (e.key === "ArrowLeft") navigateCarousel(-1)
    if (e.key === "ArrowRight") navigateCarousel(1)
    if (e.key === "Escape") expandImage(null)
  })

  display = new Display(5)
  loadGuildChannels(categorySelect, channelSelect)
})

let currentOffset = 0
let currentChannelId
let currentGuildId = DISCORD_GUILD_ID
let requestAllowed = true;

let finished = false;
const setFinished = v => {
  finished = v
  document.querySelector("#image-end").hidden = !v;
}

async function request() {
  if (!currentGuildId || !currentChannelId) return
  if (!requestAllowed) return
  if (finished) return
  requestAllowed = false

  const query = new URLSearchParams({
    has: "image",
    offset: String(currentOffset),
    channel_id: currentChannelId,
    sort_by: "timestamp",
    sort_order: "asc",
  })

  const res = await fetch(
    `https://discord.com/api/v9/guilds/${currentGuildId}/messages/search?${query}`,
    {
      headers: {
        accept: "*/*",
        authorization:
          DISCORD_TOKEN,
      },
      body: null,
      method: "GET",
      mode: "cors",
      credentials: "include",
    }
  )

  if (res.status === 429) {
    sendNotification("error", "You are being rate limited!")
    const data = await res.json();
    setTimeout(() => {
      requestAllowed = true
      request()
    }, data.retry_after * 1000);
    return;
  } else if (res.status === 400) {
    sendNotification("warning", "Unknown fetch error.")
    requestAllowed = true
    return;
  } else if (!res.ok) {
    console.warn("unknown search fetch error")
    requestAllowed = true
    return;
  }
  requestAllowed = true
  const data = await res.json();
  const images = data.messages.flat().map(msg => msg.attachments.map(i => ({
    filename: i.filename,
    url: i.proxy_url,
    width: i.width,
    height: i.height,
    timestamp: msg.timestamp,
    author_username: `${msg.author.username}#${msg.author.discriminator}`,
    author_pfp_url: `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}?size=80`,
    message_url: `https://discord.com/channels/@me/${msg.channel_id}/${msg.id}`
  }))).flat();
  currentOffset += data.messages.length
  images.forEach(img => {
    galleryImages.push(img)
    display.addImage(img)
  })
  if (currentOffset >= data.total_results) {
    setFinished(true)
  }
  display.checkScrollBottom()
}

function newSearch(channelId) {
  display.clear()
  galleryImages = []
  selectedImageIndex = -1
  currentOffset = 0
  currentChannelId = channelId
  requestAllowed = true;
  setFinished(false)
  if (currentGuildId) request()
}

async function loadGuildChannels(categorySelect, channelSelect) {
  if (!DISCORD_GUILD_ID) {
    categorySelect.disabled = true
    channelSelect.disabled = true
    categorySelect.options[0].textContent = "Set server ID in config.js"
    sendNotification("warning", "Add window.DISCORD_GUILD_ID to config.js to load channels.")
    return
  }

  categorySelect.disabled = true
  channelSelect.disabled = true
  try {
    const response = await fetch(`https://discord.com/api/v9/guilds/${DISCORD_GUILD_ID}/channels`, {
      headers: {
        accept: "*/*",
        authorization: DISCORD_TOKEN,
      },
      method: "GET",
      mode: "cors",
      credentials: "include",
    })
    if (!response.ok) throw new Error(`Discord returned ${response.status}`)

    const channels = await response.json()
    const categories = new Map(channels.filter(channel => channel.type === 4).map(channel => [channel.id, channel]))
    const messageChannelTypes = new Set([0, 2, 5, 13, 15, 16])
    const uncategorizedId = "__uncategorized__"
    channelsByCategory = new Map()

    channels.filter(channel => messageChannelTypes.has(channel.type))
      .sort((left, right) => left.position - right.position)
      .forEach(channel => {
      const categoryId = categories.has(channel.parent_id) ? channel.parent_id : uncategorizedId
      if (DISCORD_CATEGORY_IDS.length && !DISCORD_CATEGORY_IDS.includes(categoryId)) return
      if (!channelsByCategory.has(categoryId)) channelsByCategory.set(categoryId, [])
      channelsByCategory.get(categoryId).push(channel)
    })

    categorySelect.replaceChildren(new Option("Select a category", ""))
    const categoryOptions = [...categories.values()]
      .filter(category => channelsByCategory.has(category.id))
      .map(category => ({ id: category.id, name: category.name, position: category.position }))
    if (channelsByCategory.has(uncategorizedId)) {
      categoryOptions.push({
        id: uncategorizedId,
        name: "Uncategorized",
        position: Math.min(...channelsByCategory.get(uncategorizedId).map(channel => channel.position)),
      })
    }
    categoryOptions.sort((left, right) => left.position - right.position)
    categoryOptions.forEach(category => categorySelect.add(new Option(category.name, category.id)))

    if (categorySelect.options.length === 1) {
      categorySelect.options[0].textContent = "No matching categories found"
      return
    }
    categorySelect.disabled = false
  } catch (error) {
    categorySelect.replaceChildren(new Option("Could not load categories", ""))
    channelSelect.replaceChildren(new Option("Could not load channels", ""))
    sendNotification("error", "Could not load server channels. Check the token, server ID, and your access.")
    console.warn("channel list request failed", error)
  }
}

async function navigateCarousel(direction) {
  let targetIndex = selectedImageIndex + direction
  if (targetIndex >= galleryImages.length && !finished) {
    await request()
  }
  if (targetIndex >= 0 && targetIndex < galleryImages.length) {
    expandImage(galleryImages[targetIndex])
  }
}

let originalLinkOnClick
let messageLinkOnClick
function expandImage(imageData) {
  console.log(imageData)
  const html = document.querySelector("html")
  const expandedImage = document.querySelector("#expanded-image")
  const expandedImageBg = document.querySelector("#expanded-image-bg")
  const authorPfp = document.querySelector("#author-pfp")
  const authorUsername = document.querySelector("#author-username")
  const creationDate = document.querySelector("#creation-date")
  const expandedImg = document.querySelector("#expanded-img")
  const imageFilename = document.querySelector("#image-filename")
  const originalImageSize = document.querySelector("#original-image-size")
  const originalLink = document.querySelector("#original-link")
  const messageLink = document.querySelector("#message-link")
  const imagePosition = document.querySelector("#image-position")
  const previousButton = document.querySelector("#previous-image")
  const nextButton = document.querySelector("#next-image")

  if (imageData) {
    selectedImageIndex = galleryImages.indexOf(imageData)
    imagePosition.textContent = `${selectedImageIndex + 1} / ${galleryImages.length}${finished ? "" : "+"}`
    previousButton.disabled = selectedImageIndex <= 0
    nextButton.disabled = finished && selectedImageIndex >= galleryImages.length - 1
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }; 
    const date = new Date(imageData.timestamp)

    originalLinkOnClick = () => {
      window.open(imageData.url, "_blank")
    }
    messageLinkOnClick = () => {
      window.open(imageData.message_url, "_blank")
    }

    authorPfp.src = imageData.author_pfp_url
    authorUsername.textContent = imageData.author_username
    creationDate.textContent = date.toLocaleDateString(navigator.language, options)
    expandedImg.width = imageData.width
    expandedImg.height = imageData.height
    expandedImg.src = imageData.url
    imageFilename.textContent = imageData.filename
    originalImageSize.textContent = `${imageData.width}x${imageData.height}`
    originalLink.addEventListener("click", originalLinkOnClick)
    messageLink.addEventListener("click", messageLinkOnClick)
  } else {
    selectedImageIndex = -1
    imagePosition.textContent = ""
    previousButton.disabled = true
    nextButton.disabled = true
    setTimeout(() => {
      expandedImg.width = 0
      expandedImg.height = 0
      expandedImg.src = ""
      originalLink.removeEventListener("click", originalLinkOnClick)
      messageLink.removeEventListener("click", messageLinkOnClick)
    }, 200);
  }

  if (imageData) {
    expandedImage.classList.add("expanded-image-active")
    expandedImageBg.classList.add("expanded-image-bg-active")
    html.style.overflow = "hidden";
    expandedImageBg.style.visibility = "visible"
  } else {
    expandedImage.classList.remove("expanded-image-active")
    expandedImageBg.classList.remove("expanded-image-bg-active")
    setTimeout(() => {
      html.style.overflow = "auto";
      expandedImageBg.style.visibility = "hidden"
    }, 200);
  }
}