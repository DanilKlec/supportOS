export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
) {
  const response = await fetch(
    "http://localhost:3001/api/translate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        sourceLanguage,
        targetLanguage,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Translation failed");
  }

  const data = await response.json();

  return data.text;
}