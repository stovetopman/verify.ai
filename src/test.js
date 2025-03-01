import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: "",
});

const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: "Hello, how are you?" }],
  });

  console.log(response.choices[0].message.content);

