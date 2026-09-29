# Discord Image Gallery

<img width="1864" height="1023" alt="image" src="https://github.com/user-attachments/assets/728585bb-5316-49e8-9d22-29deca14414b" />


Video example: https://imgur.com/a/AlQqhNo

Have you ever wanted to find that one image you remembered and wanted to show it to your friend, but you've been stuck searching for it for hours? Wait no more! Discord Image Gallery is for you! Instead of spending hours using `has:image`, you can just scroll down and look what you need and maybe even find something you completely forgotten.

## Usage
1. If `config.js` does not exist, copy `config.example.js` to create it. Set `window.DISCORD_TOKEN` there, then add `window.DISCORD_GUILD_ID = "your server ID"`. Keep your existing token line if you already have a `config.js`. That file is ignored by Git; do not paste your token into chat or commit it.
  - Steps to get Discord token:
    1. Open Discord in the browser. Modded Discord client with Dev Tools enabled works too.
    2. Open browser Developer Tools in Discord (Ctrl+Shift+I)
    3. In Dev Tools, navigate to Network tab
    4. In Discord, navigate to a new channel
    5. In Dev Tools, click on a request called `messages` or anything similar
    6. Under request headers section, copy header value on the left of `Authorization` looking similarly to `eyJhbGciOiJIUzI1NiIsInR5c.e30.8VKCTiBegJPuPIZlp0wbV0Sbdn5BS6TE5DCx6oYN`
  - Treat this token like a password. This browser-only app must send it from the browser to Discord, so it can still be seen in DevTools. Use the app only on your own machine and never publish it with the token configured.
3. Open `index.html` in your favourite browser
Note: it only works on localhost due to how CORS is handled on localhost
4. Set `window.DISCORD_GUILD_ID` to your server's ID in `config.js`. The app loads categories into the first dropdown and their channels into the second. The gallery is fixed at five columns. To show only selected categories, set `window.DISCORD_CATEGORY_IDS = ["category ID", "another category ID"]` in `config.js`; leave it as `[]` to show all categories. You can copy IDs from Discord with Developer Mode enabled.

Click any result to open the carousel. Use the on-screen arrows, left and right arrow keys, or swipe horizontally on a touch screen to browse; the viewer loads more images as needed.

If you scroll too fast, Discord might rate limit you. What it means, is that you're too fast and you should wait a bit before scroll further.

## Credits
Made by ELginas in 2 days 😎
