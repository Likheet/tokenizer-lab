# Tokenizer Lab

Tokenizer Lab is an interactive React + Vite application for exploring how modern multilingual and frontier model tokenizers behave on real text. It lets you inspect token segmentation, compare models side-by-side, and batch-export metrics for downstream analysis without leaving the browser.

---

## ✨ What you can do

- **Run a single tokenizer** and inspect the generated tokens, offsets, and byte spans in multiple views (“Readable”, “Model tokens”, “Token IDs”, and “Offsets”).
- **Compare models instantly** across all supported tokenizers to understand how token counts, byte usage, and unknown token rates differ.
- **Batch process datasets** by pasting newline-delimited snippets and downloading aggregated metrics as CSV for further analysis.
- **Launch Auto sweeps** to stream tokenizer benchmarks with configurable presets, axes, and tokenizer selections, then download the provenance-rich CSV without leaving the browser.
- **Visualize whitespace and control characters** clearly thanks to custom rendering that converts spaces to `␣`, tabs to `⇥`, and newlines to `⏎`.
- **Decode byte-level BPE** tokens responsibly—fallbacks ensure you never see the `�` replacement character, and hex representations are used when decoding is impossible.
- **Work with gated models** by providing a Hugging Face access token; the app handles license preflight checks and stores the token only in your browser’s local storage.

---

## 🧠 Supported tokenizers

| Category | Model ID | Display name | Implementation |
| --- | --- | --- | --- |
| General purpose | `Xenova/bert-base-multilingual-uncased` | mBERT (Multilingual BERT) | Transformers.js |
| General purpose | `Xenova/t5-small` | T5 | Transformers.js |
| General purpose | `Xenova/xlm-roberta-base` | XLM-RoBERTa | Transformers.js |
| General purpose | `Xenova/bert-base-uncased` | BERT (English) | Transformers.js |
| General purpose | `Xenova/distilgpt2` | DistilGPT‑2 | Transformers.js |
| Indic specialists | `ai4bharat/IndicBERTv2-MLM-only` | IndicBERT v2 MLM | Transformers.js |
| Indic specialists | `InvincibleSloth/muril-tokenizer` | MuRIL | Transformers.js |
| Frontier / production | `openai/tiktoken/cl100k_base` | OpenAI GPT‑4 family (cl100k_base) | Tiktoken WASM |
| Frontier / production | `openai/tiktoken/o200k_base` | OpenAI GPT‑4o mini (o200k_base) | Tiktoken WASM |
| Frontier / production | `anthropic/claude-3-opus-20240229` | Anthropic Claude 3 Opus | Tiktoken WASM |
| Frontier / production | `meta-llama/Meta-Llama-3.1-8B-Instruct` | Meta Llama 3.1 8B Instruct | Transformers.js |
| Frontier / production | `mistralai/Mistral-7B-Instruct-v0.3` | Mistral 7B Instruct v0.3 | Transformers.js |

> **Note:** Meta and Mistral repositories are gated. You must visit their model page on Hugging Face with the same account as your access token and accept the terms before they will load successfully.

---

## 📊 Outputs & metrics

Every tokenization run surfaces:

- **Token IDs** and **string slices** with whitespace indicators.
- **Original tokenizer pieces** (when provided) plus a readable fallback that avoids replacement characters.
- **Character offsets** (`[start, end]`) whenever a tokenizer supports them.
- **Summary metrics:**
	- `tokenCount`
	- `charCount` (grapheme clusters)
	- `byteCount`
	- `tokensPer100Chars`
	- `bytesPerToken`
	- `avgTokenLength`
	- `unkPercentage`
- **Full provenance tracking** (JSON blob per run with tokenizer version, build info, git commit, OS/browser details)

In Batch mode, the application:
- Aggregates metrics across all comparison models and produces **two downloadable CSVs**:
  - **Detailed CSV**: Row-level data with full provenance for reproducibility
  - **Summary CSV**: Statistical aggregation by language slice with means, standard deviations, and 95% bootstrap confidence intervals
- Shows **variance analysis** in the UI with error bars (mean ± stddev) and confidence intervals on hover

---

## 🧭 Application modes

1. **Single** – choose any supported model, enter text, and inspect token-by-token output with multiple visualization modes.
2. **Compare** – run the full roster of models on your current text and review a metrics table to spot divergence quickly.
3. **Batch** – paste newline-delimited snippets, run them through the comparison set, and export the summary for analysis or reporting.
4. **Auto** – configure sweep presets, mutation axes, and tokenizer subsets, stream results live, and export the AutoSweep CSV for downstream analysis.

Switching modes preserves your text input so you can iterate without retyping.

## 🚀 Auto sweeps

Auto mode runs inside a dedicated web worker that samples your pasted lines, applies the selected mutation axes, and streams results back as CSV chunks. You can cancel the worker at any point, keep the streamed rows for inspection, and download the accumulated CSV once a chunk has arrived. The download controls keep the exact config JSON so the provenance embedded in every row stays reproducible.

Numeric sweep axes (ascii_ratio, emoji_count, perturbations) emit numeric `x_value` entries to make downstream plotting easier.

### CSV schema

AutoSweep CSV rows are emitted in the following order:
- slice
- lang_tag
- template_id
- sweep_axis
- x_value
- text
- grapheme_count
- byte_count
- ascii_ratio_bytes
- tokenizer_id
- tokenizer_family
- tokenizer_vocab_size
- add_special_tokens
- token_count
- tokens_per_100_chars
- bytes_per_token
- avg_token_len_graphemes
- unk_count
- unk_percent
- timed_op
- time_ms_median
- time_ms_mad
- repeats
- normalization
- zwj_applied
- url_applied
- emoji_count
- perturbations
- browser_ua
- os_platform
- app_version
- transformersjs_version
- tiktoken_version
- wasm_hash
- commit_sha
- timestamp_utc
- provenance_json

---

## 🛠️ Tech stack

- **React 18 + TypeScript** powered by **Vite** for fast dev reloads and production builds.
- **Tailwind CSS** + custom components (Radix UI primitives, `@radix-ui/themes`, `clsx`, `class-variance-authority`) for styling.
- **Transformers.js** (via the global `hf` object) to load Hugging Face tokenizers in the browser.
- **@dqbd/tiktoken** WebAssembly bindings for high-performance OpenAI and Anthropic encoders.
- **Three.js** and React Three Fiber for the animated token background scene.

---

## 🚀 Getting started

### Prerequisites
- Node.js 18.x or newer (Node 20 LTS recommended)
- npm 9+

### Install dependencies

```bash
npm install
```

### Run the dev server

```bash
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`) to load the app.

### Build for production

```bash
npm run build
```

Preview the output with `npm run preview`.

---

## 🔐 Using gated Hugging Face models

1. Visit the model’s page on Hugging Face (e.g., `https://huggingface.co/meta-llama/Meta-Llama-3.1-8B-Instruct`).
2. Make sure you’re logged in with the account that owns your token, then click **“Agree and Access”** if prompted.
3. Generate a **read**-scoped token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
4. Paste the token into the **“Hugging Face access token”** card inside the app. The token is stored only in `localStorage`, never transmitted to any backend apart from the official model requests.

If a model returns 401/403, the app will surface a helpful message reminding you to accept the license or double-check scopes.

---

## 🧩 Project structure

- `src/tokenizers.ts` – core tokenization orchestration, model registry, and display helpers.
- `src/components/` – UI building blocks (SegmentGroup, background visualizations, cards, forms, etc.).
- `src/compare.ts` – batch/compare utilities, CSV export, and summary helpers.
- `public/` – static assets, including bundled tokenizer JSON for offline access where possible.

---

## 🧪 Tips for exploration

- Try multilingual sentences mixing Devanagari, Tamil, and Latin scripts to see how mBERT, MuRIL, and frontier tokenizers diverge.
- Toggle between **Readable** and **Model tokens** views to observe byte-level merges versus normalized slices.
- Use **Batch** mode with your production prompts to evaluate how token count changes between OpenAI’s `o200k` and `cl100k` encoders.
- Watch the **Token IDs** tab when investigating differences in special token handling or padding.

---

## 🤝 Contributing

Issues and pull requests are welcome! If you spot a tokenizer that should be added, include details on the loading mechanism (Transformers.js vs. Tiktoken) and any license requirements.

---

## 📄 License

This project is open-source under the MIT License. See [LICENSE](LICENSE) for details.

