import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env");
} catch {}
const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.env.APP_URL;
if (!token || !url?.startsWith("https://"))
  throw new Error("Нужны TELEGRAM_BOT_TOKEN и HTTPS APP_URL");
const response = await fetch(
  `https://api.telegram.org/bot${token}/setChatMenuButton`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: { type: "web_app", text: "Открыть WEARO", web_app: { url } },
    }),
  },
);
const result = await response.json();
if (!response.ok || !result.ok)
  throw new Error("Telegram не подтвердил настройку кнопки");
console.log("Telegram menu button configured");
