import express from "express";
import OpenAI from "openai";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/translate", async (req, res) => {
  try {
    const { text, sourceLanguage, targetLanguage } = req.body;

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: `Translate from ${sourceLanguage} to ${targetLanguage}.

Return only translated text.

Text:
${text}`,
    });

    res.json({
      text: response.output_text,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Translation failed",
    });
  }
});

export default router;