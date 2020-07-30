const fetch = require('node-fetch');
const { URL, URLSearchParams } = require('url');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('./config.js');

const host = 'https://racetime.gg';
const prefix = '!';
const category = '/sml2/data';
const goal = 'Randomizer';
let token;
let regenTime;
let currentRaces = [];

class RaceRoom {
  constructor (raceName, wsURL) {
    this.name = raceName;
    this.connection = new WebSocket(wsURL);
  }
  
  this.connection.onopen() {
    currentRaces.push(this.name);
    setTimeout(function() {
      this.connection.send({
        'action': 'message',
        'data': {
          'message': 'Hi! If you are in need of a seed, type !roll followed by one of the presets. Otherwise, use !set and paste the link to the seed.',
          'guid': uuidv4()
        }
      });
    }, 2e3);
  }
  
  this.connection.onmessage(data) {
    if (data.type === 'race.data') {
      const statusToClose = ['in_progress', 'finished', 'cancelled'];
      if (statusToClose.includes(data.race.status.value)) {
        currentRaces.splice(currentRaces.indexOf(this.name), 1);
        this.connection.close();
      }
      return;
    }
    
    if (data.type === 'error') {
      data.errors.forEach(e => console.log(e));
      return;
    }
    
    if (data.type === 'chat.message') {
      if (data.message.is_bot || data.message.is_system) return;
      if (!data.message.message.startsWith(prefix)) return;
      let terms = data.message.message.slice(1).split(' ');
      if (terms[0].toLowerCase() === 'roll') {
        let msg, seed, info;
        switch (terms[1].toLowerCase()) {
          case 'easy':
            seed = this.createSeed();
            msg = `http://sml2r.download/?s=` + seed + `&f=leum`;
            info = true;
            break;
          case 'medium':
            seed = this.createSeed();
            msg = `http://sml2r.download/?s=` + seed + `&f=lbceuBgsm`;
            info = true;
            break;
          case 'hard':
            seed = this.createSeed();
            msg = `http://sml2r.download/?s=` + seed + `&f=lbdceupBgisFmMh`;
            info = true;
            break;
          case 'weekly':
            seed = this.createSeed();
            msg = `http://sml2r.download/?s=` + seed + `&f=lbdceupBgixsfmMh`;
            info = true;
          default:
            msg = `Sorry, I didn't understand. The presets are: weekly, easy, medium, and hard.`;
            info = false;
        }
        this.connection.send({
          'action': 'message',
          'data': {
            'message': msg,
            'guid': uuidv4()
          }
        });
        if (info) {
          this.connection.send({
            'action': 'setinfo',
            'data': {
              'info': terms[1].toLowerCase().replace(/^\w/, c => c.toUpperCase()) + ': ' + msg
            }
          });
        }
      }
      if (terms[0].toLowerCase() === 'set') {
        let newInfo;
        try {
          newInfo = new URL(terms[1]);
        } catch (_) {
          this.connection.send({
            'action': 'message',
            'data': {
              'message': 'Not a valid URL.',
              'guid': uuidv4()
            }
          });
          return;
        }
        if (newInfo.host !== 'sml2r.download') {
          this.connection.send({
            'action': 'message',
            'data': {
              'message': 'Not a sml2r.download link.',
              'guid': uuidv4()
            }
          });
          return;
        }
        if (!newInfo.searchParams.has('s') || !newInfo.searchParams.has('f')) {
          this.connection.send({
            'action': 'message',
            'data': {
              'message': 'Missing seed and/or flags in link.',
              'guid': uuidv4()
            }
          });
          return;
        }
        this.connection.send({
          'action': 'setinfo',
          'data': {
            'info': newInfo
          }
        });
        this.connection.send({
          'action': 'message',
          'data': {
            'message': 'Updated race info!',
            'guid': uuidv4()
          }
        });
      }
      return;
    }
  }
  
  createSeed() {
    const a = (Math.floor(Math.random() * 3839) + 256).toString(16).toUpperCase();
    const b = Date.now().toString(16).toUpperCase().substr(-5,5);
    return a.concat(b);
  }
}

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
  //set interval self
}

// set interval (10sec), check for races -> new URL(category, host)
// check goal of race
// check status of race
// check if race is in currentRaces
