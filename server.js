const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = 'claude-3.5';
const PORTFOLIO_FILE = path.join(__dirname, 'portfolio.html');

if (!CLAUDE_API_KEY) {
  console.warn('Warning: CLAUDE_API_KEY is not set. Claude requests will fail until it is provided.');
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function fetchClaude(payload, callback) {
  const requestBody = JSON.stringify(payload);
  const options = {
    hostname: 'api.anthropic.com',
    port: 443,
    path: '/v1/complete',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      'X-API-Key': CLAUDE_API_KEY
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (error) {
        callback(new Error('Invalid JSON response from Claude'), null);
        return;
      }
      if (res.statusCode >= 200 && res.statusCode < 300) {
        callback(null, parsed);
      } else {
        callback(new Error(`Claude API error ${res.statusCode}: ${data}`), null);
      }
    });
  });

  req.on('error', (error) => callback(error, null));
  req.write(requestBody);
  req.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/portfolio.html')) {
    sendFile(res, PORTFOLIO_FILE, 'text/html');
    return;
  }

  if (req.method === 'POST' && req.url === '/api/claude') {
    if (!CLAUDE_API_KEY) {
      sendJson(res, 500, { error: 'Claude API key is not configured on the server.' });
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      const request = {
        model: payload.model || CLAUDE_MODEL,
        prompt: payload.prompt,
        max_tokens_to_sample: payload.max_tokens_to_sample || 300,
        temperature: payload.temperature || 0.7,
        stop_sequences: payload.stop_sequences || ['Human:']
      };

      fetchClaude(request, (error, result) => {
        if (error) {
          sendJson(res, 502, { error: error.message });
          return;
        }
        sendJson(res, 200, result);
      });
    });
    return;
  }

  if (req.method === 'GET') {
    const filePath = path.join(__dirname, req.url === '/' ? '/portfolio.html' : req.url);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath, mimeTypes[ext] || 'application/octet-stream');
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
