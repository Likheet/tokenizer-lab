import { AutoTokenizer } from '@xenova/transformers';

const text = 'आज धूप नहीं निकली है — aaj dhoop nahi nikli hai.';

const tokenizer = await AutoTokenizer.from_pretrained('Xenova/distilgpt2');
const encoding = await tokenizer.encode(text, undefined, {
  add_special_tokens: false,
  return_offsets_mapping: true
});

console.log('input_ids:', encoding.input_ids);
console.log('tokens:', encoding.tokens);

for (let i = 0; i < encoding.input_ids.length; i++) {
  const tokenId = encoding.input_ids[i];
  const token = encoding.tokens?.[i];
  const decodedSingle = tokenizer.decode([tokenId], {
    skip_special_tokens: false
  });
  console.log(
    `${i.toString().padStart(2, '0')} | id=${tokenId.toString().padStart(4)} | token=${token} | decoded=${decodedSingle}`
  );
}
