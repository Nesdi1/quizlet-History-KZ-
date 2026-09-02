// server.js
// Простой бэкенд-прокси для проверки эссе через Anthropic API.
// Запускается на вашем сервере, хранит API-ключ и не светит его в браузере.

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Ключ берём из переменной окружения — никогда не хардкодьте его в коде
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("Ошибка: не задана переменная окружения ANTHROPIC_API_KEY");
  process.exit(1);
}

app.post("/api/grade-essay", async (req, res) => {
  try {
    const { topic, essayText } = req.body;

    if (!topic || !essayText) {
      return res.status(400).json({ error: "Нужны поля topic и essayText" });
    }
    if (essayText.trim().split(/\s+/).length < 20) {
      return res.status(400).json({ error: "Эссе слишком короткое" });
    }

    const systemPrompt = `Ты — строгий, но справедливый преподаватель, проверяющий эссе.
Оцени эссе по теме "${topic}" по шкале от 0 до 100 баллов, учитывая: раскрытие темы, логичность аргументации, правдоподобность и обоснованность утверждений, структуру и связность текста.
Ответь ТОЛЬКО в формате JSON, без markdown-разметки и пояснений вне JSON:
{"score": число от 0 до 100, "feedback": "краткий комментарий на русском, 2-3 предложения"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: essayText }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return res.status(502).json({ error: "Ошибка при обращении к Anthropic API" });
    }

    const data = await response.json();
    const rawText = data.content.map(block => block.text || "").join("").trim();
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Не удалось распарсить ответ модели:", rawText);
      return res.status(502).json({ error: "Некорректный ответ модели" });
    }

    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const feedback = String(parsed.feedback || "");

    res.json({ score, feedback });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
