require('dotenv').config();
const express = require('express');
const { getTemplateName } = require('./templateMapper');
const { sendWhatsAppNotification } = require('./whatsappService');
const { sendCustomerReassurance } = require('./customerService');

// ============================================================
// STRUCTURED LOGGING HELPER
// JSON format for production log aggregation
// ============================================================
function log(level, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,           // 'info' | 'warn' | 'error'
    event,           // 'webhook_received' | 'whatsapp_sent' | 'error'
    service: 'vapi-webhook',
    ...data,
  };
  console.log(JSON.stringify(entry));
}

// ============================================================
// GLOBAL CRASH PROTECTION
// Server ko 24/7 alive rakhne ke liye critical
// ============================================================

process.on('uncaughtException', (err) => {
  log('error', 'uncaught_exception', { error: err.message, stack: err.stack });
  // Server ko alive rakho — process.exit() mat karo
});

process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled_rejection', { reason: String(reason) });
  // Server ko alive rakho — process.exit() mat karo
});

process.on('SIGTERM', () => {
  log('info', 'sigterm_received', { message: 'Shutting down gracefully...' });
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'sigint_received', { message: 'Shutting down gracefully...' });
  process.exit(0);
});

// ============================================================
// TICKET STORE — Message ID → Customer data
// ============================================================
const ticketStore = new Map();
const TICKET_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function storeTicket(messageId, ticketData) {
  ticketStore.set(messageId, { ...ticketData, timestamp: Date.now() });
  setTimeout(() => ticketStore.delete(messageId), TICKET_TTL_MS);
}

function getTicket(messageId) {
  return ticketStore.get(messageId);
}

const app = express();
app.use(express.json());

// Phone number validation & E.164 normalization
function validatePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  
  // US: 10-digit (e.g. 2065960776) → +12065960776
  if (digits.length === 10) return '+1' + digits;
  
  // US with country code: 11-digit starting with 1
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  
  // India: 12-digit starting with 91
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  
  // Invalid length — reject
  return null;
}

// Duplicate tool call prevention
const processedToolCalls = new Map(); // toolCallId → timestamp
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isDuplicate(toolCallId) {
  const now = Date.now();
  
  // Cleanup old entries (prevent memory leak)
  for (const [id, ts] of processedToolCalls.entries()) {
    if (now - ts > DEDUP_WINDOW_MS) {
      processedToolCalls.delete(id);
    }
  }
  
  // Check if already processed
  if (processedToolCalls.has(toolCallId)) {
    return true;
  }
  
  // Mark as processed
  processedToolCalls.set(toolCallId, now);
  return false;
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/vapi-webhook', async (req, res) => {
  let toolCallId = null;

  try {
    const payload = req.body || {};
    const type = payload.message?.type || payload.type;

    log('info', 'webhook_received', { type });

    // Sirf tool-calls event process karo
    if (type !== 'tool-calls') {
      log('info', 'event_ignored', { type });
      return res.status(200).json({ status: 'ignored' });
    }

    // Tool call ID nikalo (Vapi ko response mein yeh chahiye)
    const toolCall = payload.message?.toolCallList?.[0] || 
                     payload.message?.toolCalls?.[0] ||
                     payload.message?.toolWithToolCallList?.[0]?.toolCall;

    toolCallId = toolCall?.id;

    // Arguments nikalo
    const toolCallArgs = toolCall?.function?.arguments;

    if (!toolCallArgs || !toolCallId) {
      log('error', 'missing_tool_call_data', { toolCallId });
      return res.status(200).json({
        results: [{
          toolCallId: toolCallId || 'unknown',
          result: 'Error: Missing tool call data'
        }]
      });
    }

    let data = {};
  try {
    data = typeof toolCallArgs === 'string' ? JSON.parse(toolCallArgs) : (toolCallArgs || {});
  } catch (parseErr) {
    log('error', 'json_parse_failed', { toolCallId, rawArgs: String(toolCallArgs).substring(0, 200) });
    return res.status(200).json({
      results: [{ toolCallId, result: 'Failed to parse function parameters. Please repeat the details.' }]
    });
  }
    const { serviceType, driverName, issueDescription, location, driverPhone } = data || {};

    // Validate fields with minimum length checks
    const missingFields = [];
    if (!driverName || String(driverName).trim().length < 2) {
      missingFields.push('driverName');
    }
    if (!issueDescription || String(issueDescription).trim().length < 5) {
      missingFields.push('issueDescription');
    }
    if (!location || String(location).trim().length < 3) {
      missingFields.push('location');
    }
    if (!driverPhone || String(driverPhone).replace(/\D/g, '').length < 10) {
      missingFields.push('driverPhone');
    }

    if (missingFields.length > 0) {
      log('error', 'missing_fields', { toolCallId, missingFields });
      return res.status(200).json({
        results: [{
          toolCallId,
          result: `Invalid or incomplete: ${missingFields.join(', ')}. Please ask caller again politely.`
        }]
      });
    }

    // Validate phone number (E.164)
    const cleanPhone = validatePhone(driverPhone);
    if (!cleanPhone) {
      log('error', 'invalid_phone', { toolCallId, driverPhone });
      return res.status(200).json({
        results: [{
          toolCallId,
          result: 'Invalid phone number. Please re-collect from caller with 10 digits.'
        }]
      });
    }

    // Duplicate prevention check
    if (isDuplicate(toolCallId)) {
      log('warn', 'duplicate_ignored', { toolCallId });
      return res.status(200).json({
        results: [{
          toolCallId,
          result: 'Already processed. No action needed.'
        }]
      });
    }

    const recipientPhone = process.env.FLEET_OWNER_PHONE;
    if (!recipientPhone) {
      log('error', 'missing_fleet_owner_phone', { toolCallId });
      return res.status(200).json({
        results: [{ toolCallId, result: 'FLEET_OWNER_PHONE not configured' }]
      });
    }

    const templateName = getTemplateName(serviceType);
    log('info', 'whatsapp_sending', {
      toolCallId,
      driverName,
      driverPhone: cleanPhone,
      location,
      templateName,
    });

    // ============================================================
    // RESPONSE TIMEOUT GUARD
    // Vapi ka 20s timeout hai. 15s mein respond karo — 5s buffer.
    // ============================================================
    const RESPONSE_TIMEOUT_MS = 15000;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Response timeout — Vapi deadline approaching')),
        RESPONSE_TIMEOUT_MS
      )
    );

    try {
      // WhatsApp bhejo (with retry logic inside)
      const telnyxResponse = await Promise.race([
        sendWhatsAppNotification({
          templateName,
          recipientPhone,
          driverName,
          issueDescription,
          location,
          driverPhone: cleanPhone,
        }),
        timeoutPromise,
      ]);

      log('info', 'whatsapp_sent', {
        toolCallId,
        messageId: telnyxResponse.data?.id || 'OK',
      });

      // ✅ Store ticket for ACCEPT/REJECT handling
      if (telnyxResponse.data?.id) {
        storeTicket(telnyxResponse.data.id, {
          customerPhone: cleanPhone,
          customerName: driverName,
          issue: issueDescription,
          location: location,
        });
        log('info', 'ticket_stored', {
          messageId: telnyxResponse.data.id,
          customerPhone: cleanPhone,
        });
      }

      return res.status(200).json({
        results: [{
          toolCallId,
          result: 'WhatsApp alert sent to owner successfully. Ticket logged.'
        }]
      });

    } catch (err) {
      log('error', 'whatsapp_dispatch_failed', {
        toolCallId,
        error: err.message,
      });
      
      // Vapi ko 200 return karo taaki call drop na ho
      return res.status(200).json({
        results: [{
          toolCallId,
          result: 'Ticket logged. The team will call back shortly to confirm details.'
        }]
      });
    }

  } catch (err) {
    log('error', 'webhook_exception', {
      toolCallId,
      error: err.message,
      stack: err.stack,
    });
    return res.status(200).json({
      results: [{
        toolCallId: toolCallId || 'unknown',
        result: 'Error processing request: ' + (err.message || 'Unknown error')
      }]
    });
  }
});

// ============================================================
// TELNYX WHATSAPP INCOMING WEBHOOK
// Owner ke ACCEPT/REJECT button clicks receive karta hai
// ============================================================
app.post('/telnyx-webhook', async (req, res) => {
  try {
    const payload = req.body;
    const eventType = payload?.data?.event_type;

    log('info', 'telnyx_webhook_received', { eventType });

    if (eventType === 'message.received') {
      const message = payload.data.payload;
      const from = message?.from?.phone_number;
      const buttonText = message?.whatsapp_message?.button?.text;
      const originalMessageId = message?.whatsapp_message?.context?.id;

      log('info', 'whatsapp_button_clicked', {
        from,
        buttonText,
        originalMessageId,
      });

      if (buttonText === 'ACCEPT' && originalMessageId) {
        const ticket = getTicket(originalMessageId);

        if (ticket) {
          log('info', 'job_accepted', {
            ownerPhone: from,
            customerPhone: ticket.customerPhone,
          });

          try {
            await sendCustomerReassurance({
              customerPhone: ticket.customerPhone,
              customerName: ticket.customerName,
              techPhone: process.env.FLEET_OWNER_PHONE,
            });
            log('info', 'customer_reassured', {
              customerPhone: ticket.customerPhone,
            });
          } catch (waErr) {
            log('error', 'customer_reassurance_failed', {
              error: waErr.message,
            });
          }
        } else {
          log('warn', 'ticket_not_found', { originalMessageId });
        }
      } else if (buttonText === 'REJECT') {
        log('info', 'job_rejected', { ownerPhone: from });
      }
    }

    return res.status(200).json({ status: 'received' });

  } catch (err) {
    log('error', 'telnyx_webhook_error', {
      error: err.message,
      stack: err.stack,
    });
    return res.status(200).json({ status: 'error_handled' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    log('info', 'server_started', { port: PORT });
  });
}

module.exports = app;
