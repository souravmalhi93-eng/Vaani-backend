// index.js
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

/**
 * Environment variables:
 * - TELEGRAM_BOT_TOKEN  (already present)
 * - HF_API_KEY           (Hugging Face token)  <-- ADD THIS
 * - HF_MODEL             (optional, default used below)
 * - OPENAI_API_KEY       (optional fallback if HF not present)
 */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || "google/flan-t5-large";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // fallback (optional)

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in environment");
  process.exit(1);
}

const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function callHuggingFace(text) {
  try {
    const url = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
    const payload = {
      inputs: text,
      options: { wait_for_model: true }
    };

    const headers = { Authorization: `Bearer ${HF_API_KEY}` };
    const resp = await axios.post(url, payload, { headers, timeout: 120000 });

    // Hugging Face returns different shapes depending on model:
    // - sometimes an array of { generated_text: "..." }
    // - sometimes a plain string or object
    const data = resp.data;
    let replyText = "";

    if (Array.isArray(data) && data.length && data[0].generated_text) {
      replyText = data[0].generated_text;
    } else if (typeof data === "string") {
      replyText = data;
    } else if (data && typeof data === "object") {
      // try some common fields
      if (data.generated_text) replyText = data.generated_text;
      else if (data[0] && data[0].generated_text) replyText = data[0].generated_text;
      else replyText = JSON.stringify(data);
    } else {
      replyText = String(data);
    }

    return replyText.trim();
  } catch (err) {
    console.error("HuggingFace error:", err.response?.data || err.message);
    throw err;
  }
}

async function callOpenAI(text) {
  // Optional fallback — keep if you want to use OpenAI when HF not present
  try {
    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: text }],
        max_tokens: 500
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 120000
      }
    );
    return resp.data.choices[0].message.content.trim();
  } catch (err) {
    console.error("OpenAI error:", err.response?.data || err.message);
    throw err;
  }
}

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message || req.body || {};
    if (!message || !message.text) {
      // ignore non-text or empty messages
      return res.sendStatus(200);
    }

    const chatId = message.chat && message.chat.id;
    const userText = message.text;

    console.log("Received message:", userText, "from chat:", chatId);

    let reply = "";

    // Prefer Hugging Face if HF_API_KEY present
    if (HF_API_KEY) {
      try {
        console.log("Calling Hugging Face model:", HF_MODEL);
        reply = await callHuggingFace(userText);
      } catch (hfErr) {
        console.error("Hugging Face failed, trying OpenAI fallback if available.");
        if (OPENAI_API_KEY) {
          reply = await callOpenAI(userText);
        } else {
          reply = "Sorry, I'm temporarily unable to respond (model error).";
        }
      }
    } else if (OPENAI_API_KEY) {
      // fallback to OpenAI if HF not provided
      reply = await callOpenAI(userText);
    } else {
      reply = "Bot is not fully configured — missing HF_API_KEY or OPENAI_API_KEY.";
    }

    console.log("Replying:", reply);

    // send reply back to Telegram
    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: chatId,
      text: reply,
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error("Unhandled Error in /webhook:", err.response?.data || err.message || err);
    return res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("✅ Vaani backend is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
  
