# Discord Image Gallery

<img width="1864" height="1023" alt="image" src="https://github.com/user-attachments/assets/728585bb-5316-49e8-9d22-29deca14414b" />


Video example: https://imgur.com/a/AlQqhNo

Have you ever wanted to find that one image you remembered and wanted to show it to your friend, but you've been stuck searching for it for hours? Wait no more! Discord Image Gallery is for you! Instead of spending hours using `has:image`, you can just scroll down and look what you need and maybe even find something you completely forgotten.

## Run locally
1. Copy `.env.example` to `.env`.
2. Set `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` in `.env`. Optionally set `DISCORD_CATEGORY_IDS` to a comma-separated list of category IDs; leave it blank to include all categories.
3. Make sure the bot has **View Channels** and **Read Message History** permissions in the channels you want to show. Enable Message Content Intent for the bot in the Discord Developer Portal.
4. Run `npm install`, then `npm start`.
5. Open `http://localhost:3000`.

The `.env` file is ignored by Git. Never commit or share the bot token. The gallery has five columns; choose a category and channel, then click an image to open the carousel. Use the arrows, keyboard arrow keys, or horizontal swipe to navigate.

## Deploy on Render
1. Push the project to a GitHub repository. Do not commit `.env` or a bot token.
2. In Render, create a **Web Service** from the repository. Use build command `npm install` and start command `npm start`.
3. Add `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` in the service's environment variables. Optionally add `DISCORD_CATEGORY_IDS` as a comma-separated allowlist.
4. Deploy and share the service URL.

The service is public: anyone with its URL can view images from the categories it exposes. Configure `DISCORD_CATEGORY_IDS` to limit the gallery to selected categories. Render's free service may sleep while idle.

## Credits
Made by ELginas in 2 days 😎
