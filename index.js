
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!TELEGRAM_BOT_TOKEN || !GROQ_API_KEY) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN or GROQ_API_KEY in environment variables");
  process.exit(1);
}

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

app.post("/webhook", async (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const userText = message.text;

  console.log(`📩 User (${chatId}): ${userText}`);

  try {
    const aiResponse = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: userText }],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = aiResponse.data.choices[0].message.content;
    console.log(`🤖 Vaani: ${reply}`);

    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: reply,
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error from Groq or Telegram:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("✅ Vaani backend is running (Groq LLM)");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server started on port", PORT);
});
