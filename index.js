const fetch = require('node-fetch');
const { URL, URLSearchParams } = require('url');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('./config.js');

let regen = 61e3; // tracks time between regenerating access token
let token; // the access token
let currentRaces = []; // array of current races

const getAccessToken = async () => {
  const params = new URLSearchParams({
    client_id: config.id,
    client_secret: config.secret,
    grant_type: 'client_credentials'
  });
  const authUrl = new URL('/o/token', config.host);
  const response = await fetch(authUrl, {method: 'POST', body: params}).catch(e => console.log(e));
  const data = await response.json();
  token = data.access_token;
  regen = data.expires_in * 1e3;
  currentRaces = []; // reset the current races
  setTimeout(getAccessToken, regen - 6e4);
}

console.log('Bot is up and running!');

// get initial token immediately
setTimeout(getAccessToken);

// race handler
class RaceRoom {
  constructor (raceName, wsURL) {
    this.name = raceName;
    this.connection = new WebSocket(wsURL);
    this.seed = undefined;
    this.flags = undefined;
    this.entrants = [];
    const room = this;
    
    this.connection.onopen = function() {
      console.log('Connected to ' + this.url);
      const introduction = 'Hi! If you are in need of a seed, type !roll followed by one of the presets. Otherwise, use !set and paste the link to the seed.';
      room.sendMessage(introduction);
    }
    
    this.connection.onmessage = function(obj) {
      const data = JSON.parse(obj.data);
      if (data.type == 'race.data') {
        const statusToClose = ['in_progress', 'finished', 'cancelled'];
        // close connection to room once it has started/finished/cancelled
        if (statusToClose.includes(data.race.status.value)) {
          currentRaces.splice(currentRaces.findIndex(r => r.name === room.name), 1);
          this.close();
        } else {
          // update list of entrants, also race opener
          room.entrants = data.race.entrants.map(e => e.user.id);
          if (!room.entrants.includes(data.race.opened_by.id)) room.entrants.push(data.race.opened_by.id);
        }
        return;
      }
      
      if (data.type == 'error') {
        data.errors.forEach(e => console.log(e));
        return;
      }
      
      if (data.type == 'chat.message') {
        // ignore system and bot messages
        if (data.message.is_bot || data.message.is_system) return;
        // ignore if it doesn't start with prefix
        if (!data.message.message_plain.startsWith(config.prefix)) return;
        // ignore if the user is not in the race and not a moderator
        if (!room.entrants.includes(data.message.user.id) && !data.message.user.can_moderate) return;
        let terms = data.message.message_plain.slice(1).split(' ');
        
        // roll seed given preset
        if (terms[0].toLowerCase() === 'roll') {
          let msg, newSeed, info;
          // find preset
          const preset = config.presets.find(p => p.name === terms[1].toLowerCase());
          if (preset === undefined) {
            let list = '';
            // list presets if invalid one provided
            config.presets.forEach(p => list += list === '' ? p.name : ', ' + p.name);
            room.sendMessage("Sorry, that's not a valid preset. The presets are: " + list + '.');
            return;
          }
          room.seed = room.createSeed();
          room.flags = preset.flags;
          const link = 'http://sml2r.download/?s=' + room.seed + '&f=' + room.flags;
          // send message and update info
          room.sendMessage(link);
          this.send(JSON.stringify({
              'action': 'setinfo',
              'data': {
                'info': terms[1].toLowerCase().replace(/^\w/, c => c.toUpperCase()) + ': ' + link
              }
          }));
        }
        
        // set seed given url
        if (terms[0].toLowerCase() === 'set') {
          let newInfo;
          try {
            newInfo = new URL(terms[1]);
          } catch (_) {
            room.sendMessage('Not a valid URL.');
            return;
          }
          if (newInfo.host !== 'sml2r.download') {
            room.sendMessage('Not a sml2r.download link.');
            return;
          }
          if (!newInfo.searchParams.has('s') || !newInfo.searchParams.has('f')) {
            room.sendMessage('Missing seed and/or flags in link.');
            return;
          }
          // update info
          this.send(JSON.stringify({
            'action': 'setinfo',
            'data': {
              'info': 'Custom: ' + newInfo
            }
          }));
          room.seed = newInfo.searchParams.get('s');
          room.flags = newInfo.searchParams.get('f');
          room.sendMessage('Updated race info!');
        }
        
        // link to tracker
        if (terms[0].toLowerCase() === 'tracker') {
          if (room.seed === undefined || room.flags === undefined) {
            room.sendMessage('https://mattbraddock.com/sml2tracker/');
            return;
          } else {
            room.sendMessage('https://mattbraddock.com/sml2tracker/?s=' + room.seed + '&f=' + room.flags);
          }
        }
        return;
      }
    }
  }
  
  // send message function
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
  
  // random seed function
  createSeed() {
    const a = (Math.floor(Math.random() * 3839) + 256).toString(16).toUpperCase();
    const b = Date.now().toString(16).toUpperCase().substr(-5,5);
    return a.concat(b);
  }
}

// check for new races every 10 seconds
setInterval(async () => {
  // get current races
  const lookupUrl = new URL(config.category, config.host);
  const response = await fetch(lookupUrl).catch(e => {if (e.type == 'FetchError') console.log('Could not fetch ' + lookupUrl.toString())});
  const data = await response.json();
  const races = data.current_races;
  for (let i = 0; i < races.length; i++) {
    // ignore any that aren't the correct goal
    if (races[i].goal.name.toLowerCase() !== config.goal) continue;
    // ignore any that have already started/finished/cancelled
    const statusToSkip = ['in_progress', 'finished', 'cancelled'];
    if (statusToSkip.includes(races[i].status.value)) continue;
    // ignore any races already connected to
    if (currentRaces.findIndex(r => r.name === races[i].name) > -1) continue;
    // get websocket url for race
    const raceUrl = new URL(races[i].data_url, config.host);
    const raceResponse = await fetch(raceUrl).catch(e => {if (e.type == 'FetchError') console.log('Could not fetch ' + raceUrl.toString())});
    const raceData = await raceResponse.json();
    const wsUrl = new URL(raceData.websocket_bot_url, config.socket);
    wsUrl.searchParams.set('token', token);
    // create connection
    const newConnection = new RaceRoom(races[i].name, wsUrl);
    currentRaces.push(newConnection);
  }
}, 1e4);
