# Tokenizer Lab

A minimal web app that tokenizes text using GPT-2 in the browser. Built with Vite + React + TypeScript and @huggingface/transformers v3.

## Features

- **Browser-based tokenization**: No server required - everything runs in the browser
- **GPT-2 tokenizer**: Uses the official GPT-2 tokenizer from Hugging Face
- **Real-time metrics**: Shows token count, character count, byte count, and efficiency metrics
- **Visual token display**: See exactly how text is broken into tokens
- **CDN-powered**: Loads @huggingface/transformers directly from CDN

## Metrics Displayed

- **Tokens**: Number of tokens in the input text
- **Characters**: Total character count
- **Bytes**: Total byte count (UTF-8 encoded)
- **Tokens per 100 chars**: Tokenization efficiency metric
- **Bytes per token**: Average bytes per token
- **Avg token length**: Average character length of tokens

## Usage

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Open http://localhost:5173 in your browser
5. Paste text in the textarea and click "Tokenize"

## Technical Details

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **ML Library**: @huggingface/transformers v3 (CDN import)
- **Tokenizer**: Xenova/gpt2 (GPT-2 byte-pair encoding)
- **Environment Config**:
  - `allowLocalModels: false` - Never try localhost paths
  - `allowRemoteModels: true` - Fetch from Hugging Face Hub
  - `useBrowserCache: true` - Cache models in browser

## Browser Compatibility

Requires a modern browser with WebAssembly support for ONNX runtime.
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
