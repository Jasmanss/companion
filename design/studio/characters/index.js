// Characters shown in the studio, in order. Each id loads ./<id>.js. Add ?only=<id> to the URL to show just one.
export const CHARACTERS = new URLSearchParams(location.search).has('ref') ? ['_reference'] : ['lumen', 'pebble', 'steward', 'butler', 'visor-pro', 'mercury']
