module.exports = {
  id: 'FOUND ON RACETIME.GG',
  secret: 'FOUND ON RACETIME.GG',
  prefix: '!', // change to your preference
  host: 'https://racetime.gg', // do not change
  socket: 'wss://racetime.gg', // do not change
  category: '/GAME SLUG/data', // find on racetime
  goal: 'NAME', // lowercase!
  presets: [ // add as many as you'd like
    {"name": "", "flags": ""} // if "name" or "flags" is changed, must update in index.js
  ]
}
