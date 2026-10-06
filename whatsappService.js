const axios = require('axios');

function formatE164(phone) {
  if (!phone) return '';
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
}

// Retry helper with exponential backoff
async function sendWithRetry(url, payload, headers, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: 3500, // 3.5 second timeout per attempt
      });
      
      if (attempt > 1) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          event: 'whatsapp_sent_on_retry',
          attempt,
          service: 'vapi-webhook'
        }));
      }
      
      return response.data;
      
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx) — only retry on 5xx/timeout/network/429
      const status = error.response?.status;
      const isRetryable = !status || status >= 500 || status === 429;
      
      if (!isRetryable) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          event: 'non_retryable_error',
          status,
          service: 'vapi-webhook'
        }));
        break;
      }
      
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          event: 'whatsapp_retry',
          attempt,
          maxRetries,
          backoffMs: backoff,
          service: 'vapi-webhook'
        }));
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  
  const apiError = lastError.response ? lastError.response.data : lastError.message;
  throw { status: lastError.response ? lastError.response.status : 500, apiError };
}

async function sendWhatsAppNotification({
  templateName,
  recipientPhone,
  driverName,
  issueDescription,
  location,
  driverPhone,
}) {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromPhone = process.env.TELNYX_WHATSAPP_PHONE_NUMBER;

  if (!apiKey || !fromPhone) {
    throw new Error('Telnyx WhatsApp credentials missing in .env');
  }

  const formattedPhone = formatE164(recipientPhone);
  const formattedDriverPhone = formatE164(driverPhone) || 'N/A';

  const payload = {
    from: fromPhone,
    to: formattedPhone,
    webhook_url: `${process.env.WEBHOOK_BASE_URL}/telnyx-webhook`, // Routes ACCEPT/REJECT clicks back to our server
    whatsapp_message: {
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: String(driverName || 'N/A') },
            { type: 'text', text: String(issueDescription || 'N/A') },
            { type: 'text', text: String(location || 'N/A') },
            { type: 'text', text: formattedDriverPhone }
          ]
        }]
      }
    }
  };

  const headers = {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  };

  // Use retry wrapper
  return await sendWithRetry(
    'https://api.telnyx.com/v2/messages/whatsapp',
    payload,
    headers,
    3
  );
}

module.exports = { sendWhatsAppNotification, formatE164 };
