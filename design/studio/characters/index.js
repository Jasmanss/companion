// Characters shown in the studio, in order. Each id loads ./<id>.js. Add ?only=<id> to the URL to show just one.
export const CHARACTERS = new URLSearchParams(location.search).has('ref') ? ['_reference'] : ['bao', 'reed', 'tofu', 'bell', 'cloche', 'bean', 'penguin', 'butler', 'steward', 'pebble', 'visor-pro', 'lumen', 'mercury']
