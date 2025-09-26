from transformers import BertTokenizer, BertTokenizerFast, BertModel

# Load the slow tokenizer from the model hub
slow_tokenizer = BertTokenizer.from_pretrained("google/muril-base-cased")

# Convert to fast tokenizer
fast_tokenizer = BertTokenizerFast.from_pretrained("google/muril-base-cased")

# Save the fast tokenizer (this will generate tokenizer.json)
fast_tokenizer.save_pretrained("./muril-fast-tokenizer")

# Load the fast tokenizer and model from local directory
tokenizer = BertTokenizerFast.from_pretrained("./muril-fast-tokenizer")
model = BertModel.from_pretrained("google/muril-base-cased")

# Example usage: encode and get model output
text = "यह एक परीक्षण वाक्य है।"  # This is a test sentence in Hindi
inputs = tokenizer(text, return_tensors="pt")
outputs = model(**inputs)
print("Tokenized input:", inputs)
print("Model output (last hidden state):", outputs.last_hidden_state)