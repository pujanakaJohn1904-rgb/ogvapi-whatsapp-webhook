// customerService.js
const axios = require('axios');

async function sendCustomerReassurance({ customerPhone, customerName, techPhone }) {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromPhone = process.env.TELNYX_WHATSAPP_PHONE_NUMBER;

  if (!apiKey || !fromPhone) {
    throw new Error('Telnyx WhatsApp credentials missing');
  }

  const payload = {
    from: fromPhone,
    to: customerPhone,
    whatsapp_message: {
      type: 'template',
      template: {
        name: 'customer_reassurance_v1',
        language: { code: 'en_US' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: String(customerName || 'there') },
            { type: 'text', text: String(techPhone || '+1-XXX-XXX-XXXX') }
          ]
        }]
      }
    }
  };

  const response = await axios.post(
    'https://api.telnyx.com/v2/messages/whatsapp',
    payload,
    {
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  return response.data;
}

module.exports = { sendCustomerReassurance };
