import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

const WEBHOOK_USER = "AI Arena Kibitz";
const WEBHOOK_AVATAR = "https://robobays.github.io/images/unit/Observer.webp";
const WEBHOOK_URL = "https://discord.com/api/webhooks/1481339169627308035/Z4B-mSNrZZ_ObwUMp-IpGK-uHkf3moGQXJxBmuOpShIi1KbXyKDwFIvmgCSk8GezSRul";

/**
 * Post a Discord webhook message with an embed and optional file attachment.
 *
 * @param {Object} options
 * @param {string} options.webhookUrl   - Discord Webhook URL
 * @param {string} options.title        - Embed title
 * @param {string} options.description  - Embed body text
 * @param {string} options.url          - Link appended after the description text
 * @param {string} [options.imageUrl]   - Remote image URL shown inside the embed
 * @param {string} [options.imageStyle]  - 'image' (full-width, bottom) or 'thumbnail' (top-right, beside text). Default: 'thumbnail'
 * @param {string} [options.imagePath]   - Local image file to attach and display in the embed.
 * @param {string} [options.filePath]   - Additional local file to attach (e.g. a replay).
 * @param {number} [options.color]      - Decimal color for the embed side-bar (default: blue)
 * @param {string} [options.username]   - Override the webhook's display name
 * @returns {Promise<void>}
 */
async function postWebhook({
  webhookUrl,
  title,
  description,
  url,
  imageUrl,
  imageStyle = 'thumbnail',
  imagePath,
  filePath,
  color = 0x5865f2, // Discord Blurple
  username,
}) {
  if (!webhookUrl) {
    throw new Error('webhookUrl is required');
  }

  // Build the embed object — url is placed in the description, not on the title
  const fullDescription = url
    ? (description ? `${description}\n${url}` : url)
    : description;

  const embed = {
    title,
    description: fullDescription,
    color,
  };

  // If a local image is provided, attach it and reference it in the embed
  const imageFilename = imagePath ? path.basename(imagePath) : null;

  if (imageUrl) {
    // Remote image takes priority when explicitly set
    embed[imageStyle] = { url: imageUrl };
  } else if (imageFilename) {
    embed[imageStyle] = { url: `attachment://${imageFilename}` };
  }

  const attachmentFilename = filePath ? path.basename(filePath) : null;

  const payload = {
    ...(username && { username }),
//    avatar_url: WEBHOOK_AVATAR,
    embeds: [embed],
  };

  if (imagePath || filePath) {
    // Multipart form-data request (required for file uploads)
    const form = new FormData();

    // Discord expects the JSON payload in a field called "payload_json"
    form.append('payload_json', JSON.stringify(payload), {
      contentType: 'application/json',
    });

    let fileIndex = 0;
    if (imagePath) {
      form.append(`files[${fileIndex++}]`, fs.createReadStream(imagePath), { filename: imageFilename });
    }
    if (filePath) {
      form.append(`files[${fileIndex++}]`, fs.createReadStream(filePath), { filename: attachmentFilename });
    }

    await axios.post(webhookUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });
  } else {
    // Simple JSON request when there is no file attachment
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('Webhook posted successfully.');
}

async function main() {
  const title = "The Swarm Standoff: Tech Supremacy vs. Economic Might";
  const description = [
    "Two Zerg swarms collide in a brutal 30-minute test of attrition and technical precision!",
    "Will the greedy economic expansion of the 72Tortoises hold firm,",
    "or will muravev's surgical late-game composition turn the tide of this back-and-forth slugfest?"
  ].join(" ");

  await postWebhook({
    webhookUrl: WEBHOOK_URL,
    username: WEBHOOK_USER,
    title,
    description,
    url: "https://aiarena.superskill.me/bot/72Tortoises/match/4683395",
    imageStyle: "image",
    imagePath: "C:\\git\\my\\aiarena\\picks\\poster.png",
    filePath: "C:\\git\\my\\aiarena\\picks\\4683395_muravev_72Tortoises_TorchesAIE_v4.SC2Replay",
    color: 0x5865f2,
  });
}

main().catch((err) => {
  console.error('Failed to post webhook:', err.message);
  if (err.response) {
    console.error('Discord response:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
});
