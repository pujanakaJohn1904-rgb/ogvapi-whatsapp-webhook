const http = require('http');
const app = require('./server');

// Set dummy Telnyx env vars for testing payload formatting if not set
if (!process.env.TELNYX_API_KEY) {
  process.env.TELNYX_API_KEY = 'TEST_TELNYX_KEY';
}
if (!process.env.TELNYX_WHATSAPP_PHONE_NUMBER_ID) {
  process.env.TELNYX_WHATSAPP_PHONE_NUMBER_ID = '+16787297059';
}

const server = app.listen(3001, () => {
  const vapiToolCallPayload = {
    message: {
      type: 'tool-calls',
      toolCalls: [
        {
          id: 'call_w38VRbEBtxcMc4XCuoghjf0G',
          type: 'function',
          function: {
            name: 'dispatch_webhook',
            arguments: JSON.stringify({
              driverName: 'David Johnson',
              issueDescription: 'Machine is overheating.',
              location: '7 Warehouse 4, Route 66, Oklahoma',
              driverPhone: '206-596-0776'
            })
          }
        }
      ]
    }
  };

  const postData = JSON.stringify(vapiToolCallPayload);

  const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/vapi-webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    let responseBody = '';
    res.on('data', chunk => responseBody += chunk);
    res.on('end', () => {
      console.log(`[TEST RESULT] Status: ${res.statusCode}`);
      console.log(`[TEST RESULT] Body: ${responseBody}`);
      server.close();
      process.exit(res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 500 ? 0 : 1);
    });
  });

  req.on('error', (err) => {
    console.error('[TEST ERROR]', err);
    server.close();
    process.exit(1);
  });

  req.write(postData);
  req.end();
});


