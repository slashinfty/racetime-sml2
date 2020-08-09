# racetime-sml2
A racetime.gg Node.js bot for Super Mario Land 2 races

## Commands

`!roll {preset}` - generate a random seed and update race info. Valid presets: easy, medium, hard, weekly

`!set {url}` - set the race info to a specific seed. Must use the share link to a generated seed.

`!tracker` - get a link to the [SML2 tracker](https://mattbraddock.com/sml2tracker) (if you have done `!roll` or `!set`, it will give a link that will auto-populate the seed and flags).

## Forking

If you would like to fork this project for your own racetime.gg category bot, you will need to edit the `config.js` file to suit your category. You will also need to edit `index.js` and change how seeds are created and links to your randomizer.
