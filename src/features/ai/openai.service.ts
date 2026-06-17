const API_URL = "https://api.openai.com/v1/chat/completions";

export async function askAI(prompt: string) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const data = await response.json();

  return data.choices?.[0]?.message?.content ?? "";
}