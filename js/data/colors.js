// Common LEGO colors. IDs follow Rebrickable's color IDs so data can be
// matched against Rebrickable lookups later.
export const COLORS = [
  { id: -1, name: 'Unknown / Mixed', hex: '#cccccc' },
  { id: 0, name: 'Black', hex: '#05131D' },
  { id: 15, name: 'White', hex: '#FFFFFF' },
  { id: 71, name: 'Light Bluish Gray', hex: '#A0A5A9' },
  { id: 72, name: 'Dark Bluish Gray', hex: '#6C6E68' },
  { id: 4, name: 'Red', hex: '#C91A09' },
  { id: 320, name: 'Dark Red', hex: '#720E0F' },
  { id: 25, name: 'Orange', hex: '#FE8A18' },
  { id: 191, name: 'Bright Light Orange', hex: '#F8BB3D' },
  { id: 14, name: 'Yellow', hex: '#F2CD37' },
  { id: 326, name: 'Yellowish Green', hex: '#DFEEA5' },
  { id: 27, name: 'Lime', hex: '#BBE90B' },
  { id: 10, name: 'Bright Green', hex: '#4B9F4A' },
  { id: 2, name: 'Green', hex: '#237841' },
  { id: 288, name: 'Dark Green', hex: '#184632' },
  { id: 3, name: 'Dark Turquoise', hex: '#008F9B' },
  { id: 322, name: 'Medium Azure', hex: '#36AEBF' },
  { id: 321, name: 'Dark Azure', hex: '#078BC9' },
  { id: 212, name: 'Bright Light Blue', hex: '#9FC3E9' },
  { id: 73, name: 'Medium Blue', hex: '#5A93DB' },
  { id: 1, name: 'Blue', hex: '#0055BF' },
  { id: 272, name: 'Dark Blue', hex: '#0A3463' },
  { id: 85, name: 'Dark Purple', hex: '#3F3691' },
  { id: 26, name: 'Magenta', hex: '#923978' },
  { id: 5, name: 'Dark Pink', hex: '#C870A0' },
  { id: 29, name: 'Bright Pink', hex: '#E4ADC8' },
  { id: 19, name: 'Tan', hex: '#E4CD9E' },
  { id: 28, name: 'Dark Tan', hex: '#958A73' },
  { id: 84, name: 'Medium Nougat', hex: '#AA7D55' },
  { id: 70, name: 'Reddish Brown', hex: '#582A12' },
  { id: 6, name: 'Brown', hex: '#583927' },
  { id: 47, name: 'Trans-Clear', hex: '#FCFCFC' },
  { id: 36, name: 'Trans-Red', hex: '#C91A09' },
];

const byId = new Map(COLORS.map((c) => [c.id, c]));

export function getColor(id) {
  return byId.get(Number(id)) ?? COLORS[0];
}
