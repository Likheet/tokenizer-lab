#!/usr/bin/env python3
"""
Quick verification script to check if BERT-base-uncased produces UNK tokens on Hindi text.
This serves as a reference to compare against the JavaScript implementation.

Usage:
    python verify_unk_bert.py
"""

try:
    from transformers import AutoTokenizer
except ImportError:
    print("ERROR: transformers not installed")
    print("Install with: pip install transformers")
    exit(1)

def test_tokenizer(model_name, text, language):
    """Test a tokenizer and report UNK statistics."""
    print(f"\n{'='*60}")
    print(f"Model: {model_name}")
    print(f"Language: {language}")
    print(f"Text: {text}")
    print(f"{'='*60}")
    
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # Get UNK token info
    unk_token = tokenizer.unk_token
    unk_token_id = tokenizer.unk_token_id
    
    print(f"\nUNK Token: '{unk_token}' (ID: {unk_token_id})")
    
    # Tokenize without special tokens
    encoded = tokenizer.encode(text, add_special_tokens=False)
    tokens = tokenizer.convert_ids_to_tokens(encoded)
    
    # Count UNK tokens
    unk_count = sum(1 for t in tokens if t == unk_token)
    unk_percentage = (unk_count / len(tokens) * 100) if tokens else 0
    
    print(f"\nResults:")
    print(f"  Total tokens: {len(tokens)}")
    print(f"  UNK count: {unk_count}")
    print(f"  UNK percentage: {unk_percentage:.2f}%")
    print(f"\nFirst 20 tokens:")
    for i, (token_id, token) in enumerate(zip(encoded[:20], tokens[:20])):
        unk_marker = " ⬅️ UNK" if token == unk_token else ""
        print(f"  [{i}] ID={token_id:5d} → '{token}'{unk_marker}")
    
    if len(tokens) > 20:
        print(f"  ... ({len(tokens) - 20} more tokens)")
    
    return {
        'model': model_name,
        'language': language,
        'token_count': len(tokens),
        'unk_count': unk_count,
        'unk_percentage': unk_percentage
    }

def main():
    """Run tests on various tokenizers and languages."""
    print("🔍 UNK Token Detection Verification Script")
    print("="*60)
    
    test_cases = [
        {
            'model': 'bert-base-uncased',
            'text': 'नमस्ते दुनिया। यह एक परीक्षण है।',
            'language': 'Hindi (Devanagari)',
            'expect_unk': True
        },
        {
            'model': 'bert-base-uncased',
            'text': 'ಹಲೋ ಜಗತ್ತು। ಇದು ಒಂದು ಪರೀಕ್ಷೆ.',
            'language': 'Kannada',
            'expect_unk': True
        },
        {
            'model': 'bert-base-uncased',
            'text': 'வணக்கம் உலகம். இது ஒரு சோதனை.',
            'language': 'Tamil',
            'expect_unk': True
        },
        {
            'model': 'bert-base-uncased',
            'text': 'Hello world. This is a test.',
            'language': 'English',
            'expect_unk': False
        },
        {
            'model': 'bert-base-multilingual-uncased',
            'text': 'नमस्ते दुनिया। यह एक परीक्षण है।',
            'language': 'Hindi (Devanagari)',
            'expect_unk': False  # mBERT should handle Hindi better
        },
    ]
    
    results = []
    for test_case in test_cases:
        try:
            result = test_tokenizer(
                test_case['model'],
                test_case['text'],
                test_case['language']
            )
            result['expect_unk'] = test_case['expect_unk']
            results.append(result)
        except Exception as e:
            print(f"\n❌ ERROR: {e}")
            continue
    
    # Summary
    print(f"\n\n{'='*60}")
    print("📊 SUMMARY")
    print(f"{'='*60}\n")
    
    for result in results:
        expect = "Should have UNK" if result['expect_unk'] else "Should NOT have UNK"
        has_unk = result['unk_count'] > 0
        status = "✅ PASS" if has_unk == result['expect_unk'] else "❌ FAIL"
        
        print(f"{status} {result['model']} on {result['language']}")
        print(f"     Tokens: {result['token_count']}, UNK: {result['unk_count']} ({result['unk_percentage']:.1f}%)")
        print(f"     Expected: {expect}, Got: {'UNK found' if has_unk else 'No UNK'}")
        print()
    
    print("="*60)
    print("✅ Verification complete!")
    print("\nCompare these results with your JavaScript implementation.")
    print("BERT-base-uncased should show high UNK% on Hindi/Kannada/Tamil.")

if __name__ == '__main__':
    main()
