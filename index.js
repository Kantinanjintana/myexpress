// index.js
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

// ตั้งค่าจาก LINE Developers Console
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || ""
};

app.use('/webhook', line.middleware(config));

// รับ webhook
app.post('/webhook', (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then(result => res.json(result));
});

// ตอบกลับข้อความ
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: 'ขอบคุณที่ส่งข้อความมาหาเรา 🙏'
  });
}

const client = new line.Client(config);

app.get('/', (req, res) => {
  res.send('hello world, กันตินันท์');
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
