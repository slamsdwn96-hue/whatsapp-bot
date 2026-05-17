const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

// ===== إعدادات البوت =====
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN    = process.env.VERIFY_TOKEN || 'bot_secret_123';

// ===== شخصية البوت - غيّرها كما تريد =====
const BOT_PERSONALITY = `أنت مساعد ذكي ودود يرد على الرسائل باللغة العربية.
كن مختصراً (٢-٤ جمل) ومفيداً وودوداً.
إذا سألك أحد عن نفسك قل إنك بوت مساعد.`;

// ===== تخزين سجل المحادثات (ذاكرة مؤقتة) =====
const conversations = new Map();

// ===== التحقق من Webhook =====
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ===== استقبال الرسائل =====
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // رد فوري على Meta

  const body    = req.body;
  const entry   = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value   = changes?.value;
  const message = value?.messages?.[0];

  if (!message || message.type !== 'text') return;

  const from    = message.from;
  const userMsg = message.text.body;

  console.log(`📩 رسالة من ${from}: ${userMsg}`);

  try {
    // احضر سجل المحادثة السابقة
    if (!conversations.has(from)) conversations.set(from, []);
    const history = conversations.get(from);

    // أضف رسالة المستخدم
    history.push({ role: 'user', content: userMsg });

    // احصل على رد Claude
    const aiReply = await getClaudeResponse(history);

    // أضف رد البوت للسجل
    history.push({ role: 'assistant', content: aiReply });

    // احتفظ بآخر 10 رسائل فقط (لتوفير الذاكرة)
    if (history.length > 10) history.splice(0, history.length - 10);

    // أرسل الرد
    await sendWhatsAppMessage(from, aiReply);
    console.log(`✅ تم إرسال الرد لـ ${from}`);

  } catch (err) {
    console.error('❌ خطأ:', err.message);
  }
});

// ===== الحصول على رد من Claude =====
async function getClaudeResponse(history) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: BOT_PERSONALITY,
    messages: history,
  });
  return response.content[0].text;
}

// ===== إرسال رسالة واتساب =====
async function sendWhatsAppMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: 'whatsapp', to, text: { body: text } },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// ===== تشغيل السيرفر =====
const PORT = process.env.PORT ||8080
;
app.listen(PORT, () => {
  console.log(`🚀 البوت شغال على البورت ${PORT}`);
  console.log(`📌 Webhook URL: https://YOUR_RENDER_URL/webhook`);
});
