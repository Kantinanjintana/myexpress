require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require("@supabase/supabase-js");
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const supabase = createClient(
  process.env.SUPABASE_URL,
    // process.env.SUPABASE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ตั้งค่าจาก LINE Developers Console
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || ""
};

// ตั้งค่า Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ใช้ middleware ของ LINE
app.use('/webhook', line.middleware(config));

// รับ webhook
app.post('/webhook', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch((err) => {
        console.error("Error processing events:", err);
        res.status(500).end();
    });
});

// ---------------------- ฟังก์ชันจำแนกรูป ----------------------
async function handleImageMessage(event) {
  const messageId = event.message.id;

  try {
    // ดึงไฟล์จาก LINE
    const stream = await client.getMessageContent(messageId);

    // แปลง stream → buffer
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // อัพโหลดเข้า Supabase Storage
    const fileName = `line_images/${messageId}.jpg`;
    const { data, error } = await supabase.storage
      .from("uploads") // bucket ชื่อ uploads
      .upload(fileName, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error("❌ Upload error:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "อัปโหลดรูปไป Supabase ไม่สำเร็จ",
      });
    }

    console.log("✅ Uploaded to Supabase:", data);

    // ดึง public URL ของไฟล์ที่อัพโหลด
    const { data: publicUrlData } = supabase.storage
      .from("uploads")
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;
    console.log("🔗 Image URL:", imageUrl);

    // ส่งไปให้ Gemini จำแนกสัตว์
    const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = "วิเคราะห์รูปนี้แล้วตอบมาเป็นชื่อสัตว์สั้นๆ ภาษาไทย เช่น 'สุนัข', 'แมว', 'ช้าง'";

    const result = await visionModel.generateContent([
      prompt,
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const animalName = response.text().trim();

    // ตอบกลับ User ด้วยชื่อสัตว์
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `🐾 นี่คือ: ${animalName}`,
    });

  } catch (err) {
    console.error("❌ Error:", err);
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "เกิดข้อผิดพลาดในการประมวลผลรูปภาพ 😔",
    });
  }
}

// ---------------------- ฟังก์ชันข้อความ ----------------------
async function handleEvent(event) {  

  // ถ้าเป็นรูป → ส่งไป handleImageMessage
  if (event.type === "message" && event.message.type === "image") {
    return handleImageMessage(event);
  }

  // ถ้าไม่ใช่ข้อความ → ข้าม
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;
  let geminiResponse;

  try {
    // ส่งข้อความไปให้ Gemini ตอบ
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(userMessage);
    const response = await result.response;
    geminiResponse = response.text();
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    geminiResponse = "ขออภัยค่ะ ไม่สามารถสร้างคำตอบได้ในตอนนี้ 😔";
  }

  // เก็บลง Supabase แล้วตอบกลับ
  return supabase
    .from("messages")
    .insert({
      user_id: event.source.userId,
      message_id: event.message.id,
      type: event.message.type,
      content: userMessage,
      reply_token: event.replyToken,
      reply_content: geminiResponse,
    })
    .then(({ error }) => {
      if (error) {
        console.error("Error inserting message:", error);
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "เกิดข้อผิดพลาดในการบันทึกข้อความ",
        });
      }
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: geminiResponse,
      });
    });
}

// ---------------------- LINE Client ----------------------
const client = new line.Client(config);

// ---------------------- Route ----------------------
app.get('/', (req, res) => {
  res.send('hello world, กันตินันท์');
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});