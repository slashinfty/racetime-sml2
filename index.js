const fetch = require('node-fetch');
const { URL, URLSearchParams } = require('url');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('./config.js');

const host = 'https://racetime.gg';
const socket = 'wss://racetime.gg';
const prefix = '!';
const category = '/sml2/data';
const goal = 'Randomizer';
let token;
let regenTime = 61e3;
let currentRaces = [];

class RaceRoom {
  constructor (raceName, wsURL, reconnect = false) {
    this.name = raceName;
    this.connection = new WebSocket(wsURL);
    this.reconnect = reconnect;
    this.seed = undefined;
    this.flags = undefined;
    let instance = this;
    
    this.connection.onopen = function() {
      console.log('Connected to ' + this.url);
      if(!instance.reconnect) {
        const introduction = 'Hi! If you are in need of a seed, type !roll followed by one of the presets. Otherwise, use !set and paste the link to the seed.';
        instance.sendMessage(introduction);
      }
    }
    
    this.connection.onmessage = function(obj) {
      const data = JSON.parse(obj.data);
      if (data.type == 'race.data') {
        const statusToClose = ['in_progress', 'finished', 'cancelled'];
        if (statusToClose.includes(data.race.status.value)) {
          currentRaces.splice(currentRaces.findIndex(r => r.name === instance.name), 1);
          this.close();
        }
        return;
      }
      
      if (data.type == 'error') {
        data.errors.forEach(e => console.log(e));
        return;
      }
      
      if (data.type == 'chat.message') {
        if (data.message.is_bot || data.message.is_system) return;
        if (!data.message.message_plain.startsWith(prefix)) return;
        let terms = data.message.message_plain.slice(1).split(' ');
        if (terms[0].toLowerCase() === 'roll') {
          let msg, newSeed, info;
          if (terms[1].toLowerCase() == 'easy') {
            newSeed = instance.createSeed();
            msg = 'http://sml2r.download/?s=' + newSeed + '&f=leum';
            instance.seed = newSeed;
            instance.flags = 'leum';
            info = true;
          } else if (terms[1].toLowerCase() == 'medium') {
            newSeed = instance.createSeed();
            msg = 'http://sml2r.download/?s=' + newSeed + '&f=lbceuBgsm';
            instance.seed = newSeed;
            instance.flags = 'lbceuBgsm';
            info = true;
          } else if (terms[1].toLowerCase() == 'hard') {
            newSeed = instance.createSeed();
            msg = 'http://sml2r.download/?s=' + newSeed + '&f=lbdceupBgisFmMh';
            instance.seed = newSeed;
            instance.flags = 'lbdceupBgisFmMh';
            info = true;
          } else if (terms[1].toLowerCase() == 'weekly') {
            newSeed = instance.createSeed();
            msg = 'http://sml2r.download/?s=' + newSeed + '&f=lbdceupBgixsfmMh';
            instance.seed = newSeed;
            instance.flags = 'lbdceupBgixsfmMh';
            info = true;
          } else {
            msg = "Sorry, I didn't understand. The presets are: weekly, easy, medium, and hard.";
            info = false;
          }
          instance.sendMessage(msg);
          if (info) {
            this.send(JSON.stringify({
              'action': 'setinfo',
              'data': {
                'info': terms[1].toLowerCase().replace(/^\w/, c => c.toUpperCase()) + ': ' + msg
              }
            }));
          }
        }
        if (terms[0].toLowerCase() === 'set') {
          let newInfo;
          try {
            newInfo = new URL(terms[1]);
          } catch (_) {
            instance.sendMessage('Not a valid URL.');
            return;
          }
          if (newInfo.host !== 'sml2r.download') {
            instance.sendMessage('Not a sml2r.download link.');
            return;
          }
          if (!newInfo.searchParams.has('s') || !newInfo.searchParams.has('f')) {
            instance.sendMessage('Missing seed and/or flags in link.');
            return;
          }
          this.send(JSON.stringify({
            'action': 'setinfo',
            'data': {
              'info': 'Custom: ' + newInfo
            }
          }));
          instance.seed = newInfo.searchParams.get('s');
          instance.flags = newInfo.searchParams.get('f');
          instance.sendMessage('Updated race info!');
        }
        if (terms[0].toLowerCase() === 'tracker') {
          if (instance.seed === undefined || instance.flags === undefined) {
            instance.sendMessage('No seed/flags set. Try !roll or !set first.');
            return;
          } else {
            instance.sendMessage('https://mattbraddock.com/sml2tracker/?s=' + instance.seed + '&f=' + instance.flags);
          }
        }
        return;
      }
    }
  }
  
  sendMessage(msg) {
    console.log(msg);
    this.connection.send(JSON.stringify({
      'action': 'message',
      'data': {
        'message': msg,
        'guid': uuidv4()
      }
    }));
  }
  
  createSeed() {
    const a = (Math.floor(Math.random() * 3839) + 256).toString(16).toUpperCase();
    const b = Date.now().toString(16).toUpperCase().substr(-5,5);
    return a.concat(b);
  }
}

const getAccessToken = async () => {
  const params = new URLSearchParams({
    client_id: config.id,
    client_secret: config.secret,
    grant_type: 'client_credentials'
  });
  const authUrl = new URL('/o/token', host);
  const response = await fetch(authUrl, {method: 'POST', body: params});
  const data = await response.json();
  token = data.access_token;
  regenTime = data.expires_in * 1e3;
  let reconnects = [];
  currentRaces.forEach((r, i) => {
    let wsURL = r.connection.url;
    let wsName = r.name;
    r.connection.close();
    const newConnection = new RaceRoom(wsName, wsURL, true);
    reconnects.push(newConnection);
  });
  currentRaces = reconnects;
  setTimeout(getAccessToken, regenTime - 6e4);
}

console.log('Started!');

setTimeout(getAccessToken);

setInterval(async () => {
  const lookupUrl = new URL(category, host);
  const response = await fetch(lookupUrl);
  const data = await response.json();
  const races = data.current_races;
  for (let i = 0; i < races.length; i++) {
    if (races[i].goal.name !== goal) continue;
    const statusToSkip = ['in_progress', 'finished', 'cancelled'];
    if (statusToSkip.includes(races[i].status.value)) continue;
    if (currentRaces.findIndex(r => r.name === races[i].name) > -1) continue;
    const raceUrl = new URL(races[i].data_url, host);
    const raceResponse = await fetch(raceUrl);
    const raceData = await raceResponse.json();
    const wsUrl = new URL(raceData.websocket_bot_url, socket);
    wsUrl.searchParams.set('token', token);
    const newConnection = new RaceRoom(races[i].name, wsUrl);
    currentRaces.push(newConnection);
  }
}, 1e4);
