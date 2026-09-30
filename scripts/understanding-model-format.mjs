const string = { type: 'string' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = items => ({ type: 'array', items });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const comparison = nullable(object({ chinese: string, english: string, steps: array(object({ label: string, text: string, explanation: string })), takeaway: string }));
const fields = {
  chinese: string, intent: string, comparison,
  backbone: object({ text: string, meaning: string }),
  structureNotes: array(object({ title: string, text: string })),
  structures: array(object({ text: string, role: string, explanation: string })),
  words: array(object({ meaning: string, pos: string, phonetic: string }))
};
const parts = array(object({ startToken: { type: 'integer' }, endToken: { type: 'integer' }, meaning: string, relation: string }));
const reviewedParts = array(object({ text: string, meaning: string, relation: string }));
const format = (name, schema) => ({ type: 'json_schema', name, strict: true, schema });
export const generationFormat = format('sentence_understanding', object({ ...fields, parts }));
export const reviewFormat = format('sentence_understanding_review', object({
  approved: { type: 'boolean' }, reason: string,
  patch: object(Object.fromEntries(Object.entries({ ...fields, parts: reviewedParts, words: array(object({ text: string, meaning: string, pos: string, phonetic: string })) }).map(([key, schema]) => [key, key === 'comparison' ? schema : nullable(schema)])))
}));
