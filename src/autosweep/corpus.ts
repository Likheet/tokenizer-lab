import type { Slice } from '../compare'

type CorpusSlice = 'Hindi' | 'Hinglish' | 'Kannada' | 'Tamil' | 'English'

type CorpusMap = Record<CorpusSlice, string[]>

const VARIANT_MULTIPLIER = 8

type VariantFormatter = (baseIndex: number, variantIndex: number) => string

function expandVariants(base: readonly string[], variantProducer: VariantFormatter): string[] {
  const expanded: string[] = []
  base.forEach((sentence, baseIndex) => {
    for (let variantIndex = 0; variantIndex < VARIANT_MULTIPLIER; variantIndex += 1) {
      const suffix = variantProducer(baseIndex, variantIndex)
      expanded.push(`${sentence.trim()} ${suffix}`.trim())
    }
  })
  return expanded
}

const HINDI_BASE: readonly string[] = [
  'आज सुबह की मेट्रो यात्रा ने शहर की बदलती रफ्तार का एहसास कराया।',
  'कैंटीन की गरम जलेबी और चाय ने पूरे ऑफिस को खुश कर दिया।',
  'दिल्ली की सर्दियाँ कुछ खास होती हैं।',
  'रात की शांति में बैठकर उसने अपने शोध-पत्र की अंतिम पंक्तियाँ लिखीं।',
  'दादी ने रसोई में बैठकर आलू के परांठों की खुशबू से घर भर दिया।',
  'हल्की बारिश, धीमी ट्रैफिक और रेडियो पर बजती पुरानी गज़ल ने लंबी ड्राइव को सुखद बना दिया।',
  'आज बाजार में आम की बहार है।',
  'सप्ताहांत की सुबह योगा और शास्त्रीय संगीत के साथ शुरू हुई।',
  'पुस्तक मेले में भाषा, साहित्य और विज्ञान के स्टॉल ने पाठकों को मोहित कर लिया।',
  'गली के मोड़ पर बैठा बांसुरी वाला बच्चे को पुराने राग सुना रहा था।',
  'कृपया कल की मीटिंग समय पर शुरू करें।',
  'छत पर बैठकर परिवार के साथ शाम की चाय ने दिन भर की थकान दूर कर दी।'
]

const HINGLISH_BASE: readonly string[] = [
  'Sunday ko Indiranagar ke rooftop cafe mein बैठकर हमने roadmap pe brainstorm kiya।',
  'Goa trip wali playlist lagate hi pure roadtrip ke saare throwback moments yaad aa gaye।',
  'Kal raat ki drizzle aur neon lights ne late night coding session ko cinematic feel de diya।',
  'Festival season start होते ही society mein rangoli workshops aur live sets ka combo lit ho gaya।',
  'Weekend vibes already aa gaye 😄 चलो एक filter coffee ho जाए।',
  'Gym ke baad ek garam filter coffee ne mood set kar diya और हमne sprint plan discuss किया।',
  'Kal office mein bahut hustle tha but sabne chai break pe stories share ki।',
  'Client call pe strategy lock ho gayi, अब बस pitch deck polish karna hai।',
  'Late-night brainstorming ke baad doodle board pe emojis, Hinglish quotes aur sketches ka collage ban gaya।',
  'Townhall ke baad cafeteria mein biryani aur filter coffee ke saath next sprint ideas discuss hue।',
  'Morning commute mein metro announcements Kannada aur English dono mein sunke tourists comfortable feel kar rahe the।',
  'Kal raat ki drive pe lo-fi baj rahi thi aur Bangalore ka skyline dreamy lag raha tha।'
]

const KANNADA_BASE: readonly string[] = [
  'ಇಂದು ಬೆಂಗಳೂರಿನಲ್ಲಿ ತುಂತುರು ಮಳೆ ಬಿದ್ದಿತು ಮತ್ತು ರಸ್ತೆಗಳಲ್ಲಿ ಒಂದು ಶಾಂತಿ ತುಂಬಿತು.',
  'ಮೈಸೂರಿನ ದಸರಾ ಜಾತ್ರೆ ತನ್ನ ದೀಪಾಲಂಕಾರದಿಂದ ಎಲ್ಲರನ್ನೂ ಆಕರ್ಷಿಸುತ್ತದೆ.',
  'ಶನಿವಾರ ರಾತ್ರಿ ಮಾರುಕಟ್ಟೆಗೆ ಹೋದಾಗ ಹಬ್ಬದ ಬೆಳಕು ಮತ್ತು ಸಂಗೀತ ಒಟ್ಟಿಗೆ ಒಂದೇ ಅನುಭವ ನೀಡಿತು.',
  'ಮಲೆನಾಡಿನ ಮಂಜು, ಕಾಫಿ ತೋಟಗಳ ಪರಿಮಳ ಮತ್ತು ಹರಿವಿನ ಸದ್ದು ಮನಸ್ಸನ್ನು ಆವರಿಸುತ್ತದೆ.',
  'ಉದ್ಯಾನದಲ್ಲಿ ನಡೆಯುವಾಗ ಪಕ್ಕದ ಫೌಂಟನ್ ಶಬ್ದ ಮನಸ್ಸಿಗೆ ಶಾಂತಿ ನೀಡಿತು.',
  'ಬೆಳಗಿನ ವ್ಯಾಯಾಮದ ನಂತರ ಒಂದು ಸುಗಂಧ ಕಾಫಿ ದಿನವನ್ನು ಚೆನ್ನಾಗಿ ಆರಂಭಿಸಿತು.',
  'ಕಚೇರಿಯಲ್ಲಿ ಸ್ನೇಹಿತರೆಲ್ಲ ಸೇರಿ ಸಂಭ್ರಮದಿಂದ ಹುಟ್ಟುಹಬ್ಬ ಆಚರಿಸಿದರು.',
  'ಬೆಂಗಳೂರು ಸಂಜೆ ಗಾಳಿ ಮತ್ತು ಬಿಸಿ ಬೋಂಡಾ ಜೋಡಿ ಅದೆಂತಾ ಸವಿ.',
  'ನಗರದ ಓದು ಮೇಳದಲ್ಲಿ ವಿದ್ಯಾರ್ಥಿಗಳು ತಮ್ಮ ವಿಜ್ಞಾನ ಮಾದರಿಗಳನ್ನು ಹೆಮ್ಮೆಯಿಂದ ಪ್ರದರ್ಶಿಸಿದರು.',
  'ಪತ್ರಿಕೆಯ ಸಂಪಾದಕೀಯ ಓದಿದ ನಂತರ ಅವರು ಓದುಗರ ಕ್ಲಬ್ ಆರಂಭಿಸಲು ತೀರ್ಮಾನಿಸಿದರು.',
  'ಮಕ್ಕಳು ತರಗತಿಯಲ್ಲಿ ಕವನ ವಾಚನ ಮಾಡಿದಾಗ ಶಿಕ್ಷಕರು ತುಂಬ ಸಂತೋಷಪಟ್ಟರು.',
  'ಉತ್ಸವ ಸಂದರ್ಭದಲ್ಲಿ ಮನೆ ತುಂಬಾ ಹೂವುಗಳಿಂದ ಮತ್ತು ದೀಪಗಳಿಂದ ಅಲಂಕರಿಸಲ್ಪಟ್ಟಿತ್ತು.'
]

const TAMIL_BASE: readonly string[] = [
  'சென்னையின் மாலை காற்றில் மழைத் துளிகள் கலந்து மகிழ்ச்சி அளித்தது.',
  'திங்கள்கிழமை கூட்டம் நேரத்திற்கு துவங்கவேண்டும் என்று மேலாளர் நினைவுறுத்தினார்.',
  'கோடைக்கால இரவு வெப்பத்தில் ஒரு சிறு ஜிகர்தண்டா அனைவரையும் புத்துணர்ச்சி ஊட்டியது.',
  'குடும்பத்துடன் மெரினா கடற்கரையில் நடைபயிற்சி எடுத்த அனுபவம் மறக்க முடியாதது.',
  'புதிய நூலகத்தின் திறப்பு விழாவில் குழந்தைகள் கதைகள் வாசித்தனர்.',
  'மெல்லிய மழை, மெதுவான போக்குவரத்து, பழைய பாடல்கள்—இதுவே நம்மூர் சவாரியின் கவர்ச்சி.',
  'கோவில் திருவிழா ஊர்வலத்தில் நாடகரங்கம், நாதஸ்வரம், தாளங்கள் ஒலித்தன.',
  'கணினி ஆய்வகத்தில் மாணவர்கள் தங்களது முதல் நிரல் எழுதுவதில் மகிழ்ந்தனர்.',
  'அதிகாலை யோகா மற்றும் சூடான சாம்பார் இதோடு நாளை தொடங்கியது.',
  'கூடத்தில் நடைபெற்ற தொழில்நுட்ப கருத்தரங்கில் அனைவரும் புதிய தீர்வுகளை பகிர்ந்தனர்.',
  'நண்பர்களுடன் கூடி மதுரையில் ஜிகர்தண்டா சுவைத்தது நினைவில் நிற்கிறது.',
  'சென்னையின் இசை சீசனில் கச்சேரிகள், குயிலின் குரல் போல இனிமை தந்தன.'
]

const ENGLISH_BASE: readonly string[] = [
  'The monsoon clouds rolled in with quiet drama over the Bengaluru skyline.',
  'Late-night debugging with lo-fi beats felt like meditation and focus blended.',
  'Morning standups feel lighter when someone shares a tiny win.',
  'After hours of pair programming the benchmark dashboard finally turned green.',
  'She drafted a detailed blog post on tokenizer quirks with case studies and code.',
  'Walking past the lakeside she drafted the keynote introduction in her head.',
  'The city library opened a new AI corner with datasets and dream projects on sticky notes.',
  'A warm summer storm rolled over the studio as the band layered field recordings.',
  'In the hackathon night shift someone brewed masala chai and the room felt alive again.',
  'Benchmarks tell only part of the story so qualitative notes mattered too.',
  'Every dataset has a hidden personality waiting to be explored.',
  'A quiet coffee shop became the staging ground for the next tokenizer benchmark draft.'
]

const DEVANAGARI_SUFFIXES = ['श्रृंखला', 'खंड', 'टिप्पणी', 'संग्रह', 'ताल', 'चरण', 'राग', 'भाव'] as const
const HINGLISH_SUFFIXES = ['series', 'धारा', 'phase', 'नोट', 'story', 'रिदम', 'update', 'समय'] as const
const KANNADA_SUFFIXES = ['ಧಾರಾವಳಿ', 'ಸಂಚಿಕೆ', 'ಸೂಚನೆ', 'ಸರಮಾಲೆ', 'ಅಂಕ', 'ಸಾಗರ', 'ಚಲನ', 'ರಾಗಿ'] as const
const TAMIL_SUFFIXES = ['தொடர்', 'குறிப்பு', 'சுழற்சி', 'செய்தி', 'நேரம்', 'ரிதம்', 'குரல்', 'அலை'] as const
const ENGLISH_SUFFIXES = ['series', 'note', 'cycle', 'update', 'session', 'pulse', 'marker', 'focus'] as const

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'] as const
const KANNADA_DIGITS = ['೦', '೧', '೨', '೩', '೪', '೫', '೬', '೭', '೮', '೯'] as const
const TAMIL_DIGITS = ['௦', '௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯'] as const

const HINDI_VARIANT: VariantFormatter = (baseIndex, variantIndex) => {
  const suffix = DEVANAGARI_SUFFIXES[variantIndex % DEVANAGARI_SUFFIXES.length]
  const digit = DEVANAGARI_DIGITS[(baseIndex + variantIndex) % DEVANAGARI_DIGITS.length]
  return `${suffix} ${digit}`
}

const HINGLISH_VARIANT: VariantFormatter = (baseIndex, variantIndex) => {
  const suffix = HINGLISH_SUFFIXES[variantIndex % HINGLISH_SUFFIXES.length]
  const digit = DEVANAGARI_DIGITS[(baseIndex + variantIndex) % DEVANAGARI_DIGITS.length]
  return `${suffix} ${digit}`
}

const KANNADA_VARIANT: VariantFormatter = (baseIndex, variantIndex) => {
  const suffix = KANNADA_SUFFIXES[variantIndex % KANNADA_SUFFIXES.length]
  const digit = KANNADA_DIGITS[(baseIndex + variantIndex) % KANNADA_DIGITS.length]
  return `${suffix} ${digit}`
}

const TAMIL_VARIANT: VariantFormatter = (baseIndex, variantIndex) => {
  const suffix = TAMIL_SUFFIXES[variantIndex % TAMIL_SUFFIXES.length]
  const digit = TAMIL_DIGITS[(baseIndex + variantIndex) % TAMIL_DIGITS.length]
  return `${suffix} ${digit}`
}

const ENGLISH_VARIANT: VariantFormatter = (baseIndex, variantIndex) => {
  const suffix = ENGLISH_SUFFIXES[variantIndex % ENGLISH_SUFFIXES.length]
  const number = baseIndex * VARIANT_MULTIPLIER + variantIndex + 1
  return `${suffix} ${number}`
}

const corpus: CorpusMap = {
  Hindi: expandVariants(HINDI_BASE, HINDI_VARIANT),
  Hinglish: expandVariants(HINGLISH_BASE, HINGLISH_VARIANT),
  Kannada: expandVariants(KANNADA_BASE, KANNADA_VARIANT),
  Tamil: expandVariants(TAMIL_BASE, TAMIL_VARIANT),
  English: expandVariants(ENGLISH_BASE, ENGLISH_VARIANT)
}

export const PUBLICATION_CORPUS: Readonly<CorpusMap> = corpus

export function getPublicationLines(): string[] {
  return Object.values(PUBLICATION_CORPUS).flat().map((line) => line.trim())
}

export function getSliceLines(slice: Slice): string[] {
  const key = slice as CorpusSlice
  if (!PUBLICATION_CORPUS[key]) {
    return []
  }
  return PUBLICATION_CORPUS[key]
}
