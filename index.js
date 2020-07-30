const fetch = require('node-fetch');
const { URL, URLSearchParams } = require('url');
const WebSocket = require('ws');
const config = require('./config.js');

const host = `https://racetime.gg`;
let token;
let regenTime;

const getAccessToken = () => {
  const params = new URLSearchParams({
    client_id: config.id,
    client_secret: config.secret,
    grant_type: 'client_credentials'
  });
  const authUrl = new URL('/o/token', host);
  fetch(authUrl, {method: 'POST', body: params})
  .then(res => res.json())
  .then(json => {
    token = json.access_token;
    regenTime = json.expires_in;
  });
}
