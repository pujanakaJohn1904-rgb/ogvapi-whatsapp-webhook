# Vapi to WhatsApp Business Webhook Service

Production-ready Node.js Express webhook listener that processes dispatch details from Vapi voice call agents and sends automated, formatted WhatsApp Business alerts using the Meta Cloud API.

---

## 🛠️ Setup Instructions

### 1. Environment Configuration

Create a `.env` file in the project root based on `.env.example`:

```env
PORT=3000
WHATSAPP_PHONE_ID=your_whatsapp_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_meta_access_token
FLEET_OWNER_PHONE=15551234567
```

- **`PORT`**: Server port (defaults to 3000).
- **`WHATSAPP_PHONE_ID`**: Phone Number ID from Meta Developer Portal.
- **`WHATSAPP_ACCESS_TOKEN`**: System User Access Token / Temporary Access Token from Meta.
- **`FLEET_OWNER_PHONE`**: Recipient phone number in international format without `+` (e.g., `15551234567`).

---

## 🚀 Running the Server

```bash
# Start the server
node server.js
```

---

## 🧪 Testing the Webhook locally

You can send a POST request to `http://localhost:3000/vapi-webhook` using `curl` or Postman:

### Example `curl` Request

```bash
curl -X POST http://localhost:3000/vapi-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "serviceType": "Reefer Repair",
    "driverName": "John Doe",
    "issueDescription": "Reefer cooling unit temperature rising rapidly",
    "location": "I-95 North, Mile Marker 42, Richmond, VA",
    "driverPhone": "+15559876543"
  }'
```

---

## 📋 Template Mapping Rules

The service dynamically maps `serviceType` to pre-approved WhatsApp Business templates:

| Keywords in `serviceType` | WhatsApp Template |
| :--- | :--- |
| Contains `reefer` | `reefer_repair_alert_v1` |
| Contains `tire` or `otr` | `otr_tire_alert_v1` |
| Contains `hydraulic` | `hydraulic_repair_alert_v1` |
| Default / Any other | `diesel_fleet_alert_v1` |

---

## 📱 Meta WhatsApp Payload Structure

Sent to `POST https://graph.facebook.com/v17.0/{WHATSAPP_PHONE_ID}/messages`:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<FLEET_OWNER_PHONE>",
  "type": "template",
  "template": {
    "name": "<mapped_template_name>",
    "language": {
      "code": "en_US"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "driverName" },
          { "type": "text", "text": "issueDescription" },
          { "type": "text", "text": "location" },
          { "type": "text", "text": "driverPhone" }
        ]
      }
    ]
  }
}
```

*Note:* `driverPhone` ({{4}}) is passed as text in the template body so WhatsApp automatically renders it as a clickable dialer link for the fleet owner.
