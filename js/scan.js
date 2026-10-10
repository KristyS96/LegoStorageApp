// Read a whole storage unit from one photo: Claude looks at the cabinet,
// counts drawers per row and reads each drawer's Brick Architect label.
// The result is always shown for review before anything is saved.

import { parseNums } from './store.js';

export const SCAN_MODEL = 'claude-opus-5-5';

const PART = {
  type: 'object',
  properties: {
    partNum: { type: 'string', description: 'Main part number as printed, e.g. "3023". Empty if unreadable.' },
    altNums: { type: 'array', items: { type: 'string' }, description: 'Other numbers for the same part, e.g. "3794" in "15573 / 3794".' },
    name: { type: 'string', description: 'Short name, e.g. "Plate 1 x 2", "Tile 2 x 2 Corner", "Brick 1 x 1 x 3".' },
  },
  required: ['partNum', 'altNums', 'name'],
  additionalProperties: false,
};

export const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      description: 'Rows of drawers or compartments, top to bottom.',
      items: {
        type: 'object',
        properties: {
          drawers: {
            type: 'array',
            description: 'Every drawer position in the row, left to right, including empty or missing drawers.',
            items: {
              type: 'object',
              properties: {
                parts: { type: 'array', items: PART, description: 'One entry per part on the label. Empty if no label.' },
                uncertain: { type: 'boolean', description: 'True if any number on this label was hard to read.' },
              },
              required: ['parts', 'uncertain'],
              additionalProperties: false,
            },
          },
        },
        required: ['drawers'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'Anything the person should double-check, e.g. drawers cut off at the edge.' },
  },
  required: ['rows', 'notes'],
  additionalProperties: false,
};

export const SCAN_PROMPT = `This is a photo of one LEGO storage unit (a drawer cabinet, or a case with compartments). \
The collection is sorted by part, not color. Most drawers have a printed Brick Architect label: a small drawing \
of the part, its size (like "1x2" or "2x2 Corner") and its part number(s).

Describe the unit as a grid:
- List rows from top to bottom. In each row, list every drawer position from left to right, including empty \
spaces where a drawer is missing and drawers with no label. Rows can have different numbers of drawers \
(for example, small drawers on top and large drawers at the bottom).
- For each labeled drawer, list every part on its label. Some labels show two numbers for the same part \
("15573 / 3794"): put the first in partNum and the rest in altNums. Some labels list different parts \
("w/o Groove: 92593, w/ Groove: 41740"): those are separate parts.
- Name each part in the short style "Type W x L [detail]", e.g. "Plate 1 x 2", "Tile 1 x 6", "Brick 1 x 1 x 3", \
"Plate 2 x 2 Corner", "Tile 4 x 4 with Studs on Edge". When the label only gives a size, tell plate, tile and brick \
apart from the drawing: tiles are smooth on top, plates and bricks have studs, bricks are taller.
- Copy part numbers exactly. Never guess a digit: if a number can't be read, leave partNum empty, keep the name, \
and set uncertain to true.
- Leave parts empty for drawers without a label, even if you can see what is inside.`;

// Phone photos are large; shrink so labels stay readable but the upload stays small.
export async function prepareImage(file, maxSide = 2400) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: dataUrl };
}

/**
 * Send the photo to Claude and return the cleaned-up grid.
 * @param {{mediaType: string, data: string}} image base64 image
 * @param {string} apiKey the family's Anthropic API key (kept on this device)
 * @param {{loadSdk?: () => Promise<{Anthropic, betaJSONSchemaOutputFormat}>}} deps injectable for tests
 */
export async function scanUnit(image, apiKey, { loadSdk = () => import('./vendor/anthropic-sdk.js') } = {}) {
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings first.');
  const { Anthropic, betaJSONSchemaOutputFormat } = await loadSdk();
  // The key is the family's own and stays on their device; there is no server in between.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // The helper adapts the schema to what the API accepts. create() rather than parse(), so a refusal
  // or a cut-off answer is reported by stop_reason instead of failing as unparseable JSON.
  const { type, schema } = betaJSONSchemaOutputFormat(SCAN_SCHEMA);
  let response;
  try {
    response = await client.beta.messages.create({
      model: SCAN_MODEL,
      max_tokens: 16000,
      // If Claude declines (very unlikely for a photo of LEGO), let the API retry on another model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type, schema } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: SCAN_PROMPT },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Your Anthropic API key was not accepted. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('This API key is not allowed to use this model.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Too many requests right now. Wait a minute and try again.');
    if (err instanceof Anthropic.BadRequestError) throw new Error(`The photo could not be read (${err.message}).`);
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check your internet connection.');
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic error ${err.status}. Try again in a moment.`);
    throw err;
  }

  if (response.stop_reason === 'refusal') throw new Error('Claude could not read this photo. Try another one.');
  if (response.stop_reason === 'max_tokens') throw new Error('The cabinet was too big to read in one go. Try photographing half of it.');
  const text = response.content.find((block) => block.type === 'text')?.text;
  try {
    return normalizeScan(JSON.parse(text));
  } catch {
    throw new Error('Claude returned an unreadable answer. Try again.');
  }
}

/** Clean up Claude's answer into { rows: [[{parts, uncertain}]], notes }. */
export function normalizeScan(raw) {
  const rows = (raw?.rows ?? [])
    .map((row) =>
      (row?.drawers ?? []).map((d) => ({
        uncertain: Boolean(d?.uncertain),
        parts: (d?.parts ?? [])
          .map((p) => ({
            partNum: String(p?.partNum ?? '').trim(),
            altNums: parseNums(p?.altNums ?? []).filter((n) => n !== String(p?.partNum ?? '').trim()),
            name: String(p?.name ?? '').trim(),
          }))
          .filter((p) => p.partNum || p.name),
      })),
    )
    .filter((row) => row.length);
  return { rows, notes: String(raw?.notes ?? '').trim() };
}

// The review screen shows each drawer as editable text: "15573/3794, 3623".
export function cellToText(cell) {
  return cell.parts
    .filter((p) => p.partNum)
    .map((p) => [p.partNum, ...p.altNums].join('/'))
    .join(', ');
}

/** Parse review text back into parts, keeping names Claude read for known numbers. */
export function textToParts(text, previous = []) {
  const names = new Map(previous.filter((p) => p.partNum).map((p) => [p.partNum.toLowerCase(), p.name]));
  return String(text ?? '')
    .split(/[,;\n]+/)
    .map((group) => group.split('/').map((n) => n.trim()).filter(Boolean))
    .filter((nums) => nums.length)
    .map(([partNum, ...altNums]) => ({ partNum, altNums, name: names.get(partNum.toLowerCase()) ?? '' }));
}
