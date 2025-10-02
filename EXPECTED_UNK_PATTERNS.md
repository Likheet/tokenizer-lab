# Quick Reference: Expected UNK Patterns After Fix

## TL;DR
After the fix, you should see **non-zero UNK%** for tokenizers processing text outside their training domain.

---

## Expected UNK% by Tokenizer × Language

### English Text
| Tokenizer | Expected UNK% | Reason |
|-----------|---------------|---------|
| BERT-base-uncased | 0% | Native language |
| mBERT | 0% | Includes English |
| IndicBERT v2 | 0% | Includes English transliteration |
| o200k/cl100k | 0% | Byte-fallback (no UNK mechanism) |
| Llama 3.1 | 0% | Byte-fallback |

### Pure Hindi/Kannada/Tamil (No ASCII)
| Tokenizer | Expected UNK% | Reason |
|-----------|---------------|---------|
| **BERT-base-uncased** | **40-80%+** 🔴 | English-only vocab |
| IndicBERT v2 | 0-5% | Trained on Indic scripts |
| MuRIL | 0-5% | Trained on Indic scripts |
| mBERT | 5-20% | Multilingual but limited Indic vocab |
| XLM-RoBERTa | 5-15% | Similar to mBERT |
| o200k/cl100k | 0% | Byte-fallback handles all Unicode |
| Llama 3.1 | 0% | Byte-fallback |

### Hinglish/Code-Mix (50/50 ASCII + Devanagari)
| Tokenizer | Expected UNK% | Reason |
|-----------|---------------|---------|
| BERT-base-uncased | 20-40% 🟡 | Only Devanagari parts → UNK |
| IndicBERT v2 | 0-3% | Handles both |
| mBERT | 3-10% | Handles both reasonably |
| o200k/cl100k | 0% | Byte-fallback |

---

## Red Flags to Check

### 🚨 If you still see these patterns, UNK detection is still broken:

1. **All tokenizers showing 0% UNK across all languages**
   - Fix didn't apply or tokenizer loading issue

2. **BERT-base-uncased showing 0% UNK on pure Devanagari/Kannada/Tamil**
   - Most obvious sign of broken UNK detection
   - Should be 40-80%+

3. **BERT-base-uncased having similar tokens/100 AND 0% UNK as IndicBERT on Indic**
   - BERT is producing garbage but not being detected
   - IndicBERT should have similar token count but 0% UNK
   - BERT should have similar token count but HIGH UNK%

---

## Quick Validation Checklist

After re-exporting CSVs, verify:

- [ ] **BERT-uncased on Hindi**: UNK% > 40%
- [ ] **BERT-uncased on Kannada**: UNK% > 40%
- [ ] **BERT-uncased on Tamil**: UNK% > 40%
- [ ] **BERT-uncased on English**: UNK% ≈ 0%
- [ ] **IndicBERT on Hindi**: UNK% < 5%
- [ ] **o200k/cl100k on any language**: UNK% ≈ 0%
- [ ] **At least some tokenizers show "Rows with UNK>0" in summary**

---

## Example: Good Hindi Results Table

```
Language: Hindi (HI) - Baseline slice (n=25)

Tokenizer          | Family        | Tokens/100 | UNK%  | Rows w/ UNK
-------------------|---------------|------------|-------|-------------
IndicBERTv2        | WordPiece     | 44.2       | 0.8%  | 2/25
MuRIL              | WordPiece     | 45.1       | 1.2%  | 3/25
mBERT              | WordPiece     | 48.3       | 8.4%  | 18/25
BERT-uncased       | WordPiece     | 44.8       | 67.2% | 25/25 ⬅️
XLM-RoBERTa        | SentencePiece | 51.7       | 12.1% | 21/25
Llama 3.1          | SentencePiece | 59.4       | 0.0%  | 0/25
o200k              | Tiktoken      | 56.2       | 0.0%  | 0/25
cl100k             | Tiktoken      | 124.1      | 0.0%  | 0/25
```

Key observations:
- **BERT-uncased has the worst UNK%** (67.2%) - all rows affected
- **IndicBERT/MuRIL have minimal UNK** (<2%) - purpose-built for Indic
- **Byte-fallback models** (Llama, o200k, cl100k) show 0% UNK
- **mBERT/XLM-R** are in between (8-12%) - multilingual but limited

---

## CSV Column Reference

After fix, these columns will have accurate data:

### `unk_count`
- Integer: Number of tokens identified as UNK
- Range: 0 to token_count
- Example: `15` (out of 50 tokens)

### `unk_percent`
- Float: Percentage of tokens that are UNK
- Range: 0.0 to 100.0
- Formula: `(unk_count / token_count) * 100`
- Example: `30.0` (30% of tokens are UNK)

---

## Debugging: If Results Look Wrong

### Still seeing 0% UNK everywhere?

1. **Check browser console** - Look for "UNK detected" logs
2. **Run test suite** - Open `test-unk-detection.html`
3. **Manual test in Single mode**:
   ```
   Text: नमस्ते दुनिया
   Tokenizer: Xenova/bert-base-uncased
   View: Model tokens
   ```
   Should see [UNK] tokens highlighted

4. **Verify code changes applied**:
   - Search for "Strategy 1" in `src/tokenizers.ts`
   - Should find the 4-strategy UNK detection code

### Seeing unexpectedly HIGH UNK%?

This is actually good! It means detection is working. Examples:
- English text → 60% UNK in IndicBERT → IndicBERT isn't great at English
- Code with lots of symbols → UNK in many tokenizers → Expected

### Seeing UNK in byte-fallback tokenizers?

- o200k, cl100k, Llama should be **0% UNK** always
- If they show UNK%, there's a bug (false positive)
- Check what the actual token strings are (might be legitimate UNK-like strings in text)

---

## Next Steps After Verification

1. ✅ Verify UNK detection works (test suite + manual)
2. ✅ Re-export all CSVs from Auto mode
3. ✅ Update your tables with new UNK columns
4. ✅ Add interpretation:
   - "BERT-uncased produced 67% UNK on Hindi, confirming poor Indic support"
   - "IndicBERT showed <2% UNK, demonstrating effective vocabulary coverage"
5. ✅ Cite this as validation of tokenizer appropriateness for each language

---

## Final Check: One-Line Test

If you want to quickly verify the fix works:

**Before fix**: `bert-base-uncased` on `"नमस्ते"` → 0 UNK ❌

**After fix**: `bert-base-uncased` on `"नमस्ते"` → Multiple [UNK] tokens ✅

That's your litmus test.
