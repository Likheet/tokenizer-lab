export type SampleLanguage = 'hindi' | 'hinglish' | 'kannada' | 'english' | 'mixed'
export type SampleLength = 'small' | 'medium' | 'long'

export const SAMPLE_LANGUAGE_OPTIONS: { value: SampleLanguage; label: string }[] = [
  { value: 'hindi', label: 'Hindi' },
  { value: 'hinglish', label: 'Hinglish' },
  { value: 'kannada', label: 'Kannada' },
  { value: 'english', label: 'English' },
  { value: 'mixed', label: 'Mixed' }
]

export const SAMPLE_LENGTH_ORDER: SampleLength[] = ['small', 'medium', 'long']
export const SAMPLE_LENGTH_LABELS: Record<SampleLength, string> = {
  small: 'Short',
  medium: 'Medium',
  long: 'Long'
}

const SAMPLE_SNIPPETS: Record<SampleLanguage, Record<SampleLength, string[]>> = {
  hindi: {
    small: [
      'आज बाजार में आम की बहार है।',
      'कृपया कल की मीटिंग समय पर शुरू करें।',
      'यह किताब मुझे बहुत प्रेरणा देती है।',
      'दिल्ली की सर्दियाँ कुछ खास होती हैं।',
      'बचपन की यादें आज भी ताज़ा हैं।'
    ],
    medium: [
      'आज सुबह की मेट्रो यात्रा ने शहर की बदलती रफ्तार का एहसास कराया।',
      'नए नीति दस्तावेज़ से उम्मीद है कि छोटे व्यवसायों को राहत मिलेगी।',
      'कैंटीन की गरम जलेबी और चाय ने पूरे ऑफिस को खुश कर दिया।',
      'गली के मोड़ पर बैठा बांसुरी वाला बच्चे को पुराने राग सुना रहा था।',
      'परिवार के साथ शाम की छत पर बैठकी ने पूरे दिन की थकान दूर कर दी।'
    ],
    long: [
      'पिछले हफ्ते की बरसात के बाद आज की हल्की धूप ने पूरे मोहल्ले को बाहर निकाल दिया, और लोग चाय की चुस्कियों के साथ पुरानी कहानियाँ याद कर रहे थे।',
      'रात की शांति में बैठकर उसने अपने शोध-पत्र की अंतिम पंक्तियाँ लिखीं, और अचानक उसे लगा कि वर्षों की मेहनत अब फल देने वाली है।',
      'दादी ने रसोई में बैठकर आलू के परांठों की खुशबू से घर भर दिया, जबकि बच्चे छत पर पतंगें उड़ाने की जिद कर रहे थे।',
      'हल्की बारिश, धीमी ट्रैफिक और रेडियो पर बजती पुरानी गज़ल ने लंबी ड्राइव को भी सुखद बना दिया।',
      'शहर के कोने में बने छोटे पुस्तक मेले में भाषा, साहित्य और विज्ञान के स्टॉल ने हर उम्र के पाठकों को मोहित कर लिया।'
    ]
  },
  hinglish: {
    small: [
      'Kal office mein bahut hustle tha!',
      'Aaj dinner ke liye kya plan hai?',
      'Mumbai ka traffic seriously wild hai yaar.',
      'Thoda sa break lete hain, chai peete hain.',
      'Weekend vibes already aa gaye 😄'
    ],
    medium: [
      'Gym ke baad ek garam filter coffee ne pura mood set kar diya.',
      'Client call pe strategy lock ho gayi, ab pitch deck polish karna hai.',
      'Ye naya coworking space itna cozy hai ki code likhte waqt time ka pata hi nahi chalta.',
      'Kal raat ki drive pe lo-fi baj rahi thi aur Bangalore ka skyline dreamy lag raha tha.',
      'Team standup mein sabne apni wins share ki, energy full on high thi.'
    ],
    long: [
      'Sunday ko Indiranagar ke rooftop cafe mein बैठकर हमने अगले quarter ke product roadmap pe detailed brainstorm kiya, aur end mein sab ne pani puri challenge bhi kiya.',
      'Goa trip wali playlist lagate hi purane roadtrip ke saare throwback moments yaad aa gaye, aur humne decide kiya ki iss baar vlog bhi shoot karenge.',
      'Kal ki drizzle aur neon lights ne late night coding session ko itna cinematic feel de diya ki github commits likhte waqt bhi smile aa rahi thi.',
      'Shaam ko parents ke saath video call pe poore hafte ka update diya, phir cousins ke saath Among Us ke chaos ne pura stress hila diya.',
      'Festival season start होते ही housing society mein rangoli workshops, taco stalls aur live acoustic sets ka combo literally lit ho gaya.'
    ]
  },
  kannada: {
    small: [
      'ಇಂದು ಬೆಂಗಳೂರಿನಲ್ಲಿ ತುಂತುರು ಮಳೆ ಬಿದ್ದಿತು.',
      'ನಾಳೆ ಬೆಳಿಗ್ಗೆ ಸಭೆ ಸಮಯಕ್ಕೆ ಆರಂಭವಾಗಲಿ.',
      'ಈ ಹಾಡು ಕೇಳಿದ್ರೆ ಮನಸು ಸಂತೋಷವಾಗುತ್ತೆ.',
      'ಮೈಸೂರಿನ ದಸರಾ ಜಾತ್ರೆ ಬಹಳ ಪ್ರಸಿದ್ಧ.',
      'ಕಾಫಿ ಕೂಡಿದರೆ ಕೆಲಸಕ್ಕೂ ಜೋಶ್ ಬರುತ್ತದೆ.'
    ],
    medium: [
      'ಬೆಂಗಳೂರು ಸಂಜೆ ಗಾಳಿ ಮತ್ತು ಬಿಸಿ ಬೋಂಡಾ ಜೋಡಿ ಅದೆಂತಾ ಸವಿ.',
      'ಸ್ನೇಹಿತರೊಂದಿಗೆ ನಂದಿಹಳ್ಳಿಯ ಟ್ರೆಕ್ ಒಂದು ಅದ್ಭುತ ಅನುಭವ ನೀಡಿತು.',
      'ಊಟದ ಮೇಲೆ ಅವರೆಕಾಳು ಸಾರು ಮತ್ತು ನೆಮ್ಮದಿಯ ಜತೆಯೂ ಸೇರಿತ್ತು.',
      'ಮಕ್ಕಳು ತರಗತಿಯಲ್ಲಿ ಕವನ ವಾಚನ ಮಾಡಿದಾಗ ಶಿಕ್ಷಕರು ತುಂಬ ಸಂತೋಷಪಟ್ಟರು.',
      'ಉದ್ಯಾನದಲ್ಲಿ ನಡೆಯುವಾಗ ಪಕ್ಕದ ಫೌಂಟನ್ ಶಬ್ದ ಮನಸ್ಸಿಗೆ ಶಾಂತಿ ನೀಡಿತು.'
    ],
    long: [
      'ಶನಿವಾರ ರಾತ್ರಿ ಮಾರುಕಟ್ಟೆಗೆ ಹೋದಾಗ ಹಬ್ಬದ ಬೆಳಕು, ಬಣ್ಣದ ಹೊದಿಕೆ ಮತ್ತು ಸಂಗೀತ ಎಲ್ಲವೂ ಸೇರಿ ಒಂದು ಜಾತ್ರೆಯಂತಾಗಿತ್ತು.',
      'ಪತ್ರಿಕೆಯ ಸಂಪಾದಕೀಯ ಓದಿದ ನಂತರ ಅವರು ತನ್ನ ಗ್ರಾಮದಲ್ಲಿಯೇ ಓದುಗರ ಕ್ಲಬ್ ಆರಂಭಿಸಲು ತೀರ್ಮಾನಿಸಿದರು.',
      'ಮಲೆನಾಡಿನ ಮಂಜು, ಕಾಫಿ ತೋಟಗಳ ಪರಿಮಳ ಮತ್ತು ಹತ್ತಿರದ ಹರಿವಿನ ಸದ್ದು ಒಟ್ಟಿಗೆ ಪ್ರತಿ ಯಾತ್ರಿಕರ ಮನಸ್ಸು ಕದ್ದುಕೊಳ್ಳುತ್ತವೆ.',
      'ಪರೀಕ್ಷೆಯ ಒತ್ತಡ ಮುಗಿದ ನಂತರ ಕಾಲೇಜ್ ಸ್ನೇಹಿತರು ಸೇರಿ ಚಿತ್ರಮಂದಿರಕ್ಕೆ ಹೋಗಿ ನೀರುಜ್ಜಿದಂತೆ ನಕ್ಕರು.',
      'ಹೊಸಾಗಿ ಉದ್ಘಾಟನೆಯಾದ ವಿಜ್ಞಾನ ಮೇಳದಲ್ಲಿ ವಿದ್ಯಾರ್ಥಿಗಳು ತಮ್ಮ ರೋಬೋಟಿಕ್ಸ್ ಯೋಜನೆಗಳನ್ನು ಹೆಮ್ಮೆಗಾಗಿ ಪ್ರದರ್ಶಿಸಿದರು.'
    ]
  },
  english: {
    small: [
      'The monsoon clouds rolled in with quiet drama.',
      'Tokenizers can make or break downstream tasks.',
      'She brewed a fresh cup of filter coffee and smiled.',
      'Benchmarks tell only part of the story.',
      'Every dataset has a hidden personality waiting to be explored.'
    ],
    medium: [
      'Morning standups feel lighter when someone shares a tiny win.',
      'The research paper argued that context windows reshape prompt design.',
      'Late-night debugging with lo-fi beats is its own kind of meditation.',
      'Walking past the lakeside, she drafted the keynote intro in her head.',
      'The design sprint ended with sticky notes covering every inch of the wall.'
    ],
    long: [
      'After hours of pair programming, the team finally watched the benchmark dashboard turn green and celebrated with impromptu samosas.',
      'The city library opened a new AI corner where students could tinker with datasets, ask questions, and leave sticky notes filled with dream projects.',
      'A warm summer storm rolled over the studio as the band layered synths, field recordings, and whispered vocals into their final track.',
      'She drafted a detailed blog post on tokenizer quirks, weaving in case studies, code snippets, and a gentle push for better evaluation metrics.',
      'In the middle of the hackathon night shift, someone brewed masala chai, and suddenly the whole room felt alive with ideas again.'
    ]
  },
  mixed: {
    small: [
      'Aaj 7:30 PM @ Indiranagar? Let’s grab dosas! 😋',
      'The report is ready—बस थोडा cleanup बाकी है.',
      'Namma metro ride + podcast = perfect commute.',
      'Pricing शुरू हो चुका है: Early bird ₹499 only.',
      'Weekend plans set: trek + chai + coding jam.'
    ],
    medium: [
      'Sprint wrap-up ke baad sabne terrace pe cutting chai share ki aur sunset literally golden tha.',
      'Code review ke doraan usne Kannada mein explain kiya aur English diagrams se sab instantly samajh gaye.',
      'Naye Kannada podcast ki playlist bana ke usne roomie ke saath long drive plan kiya.',
      'Product launch se pehle social captions Hindi, English aur emojis mix karke schedule ho gaye.',
      'Office foosball tournament mein Hinglish taunts aur cheering ne pura floor energize kar diya.'
    ],
    long: [
      'Morning commute mein metro announcements Kannada aur English dono mein sunke tourists bhi comfortable feel kar rahe the, aur humne insta story par pura vibe capture kiya.',
      'Weekend hackathon mein team ne Hindi notes, English commits aur Kannada jokes ke mix se pure 24 ghante freshly motivated feel kiye.',
      'Late-night brainstorming ke baad doodle board pe emojis, Hinglish quotes aur product sketches ka full collage tayar ho gaya.',
      'Townhall ke baad sab log cafeteria mein milke biryani aur filter coffee ke saath next sprint ke ideas discuss karne lage.',
      'Community meetup mein speaker ne Bengaluru tech scene, Delhi creator culture aur global AI trends ko ek saath weave kiya.'
    ]
  }
}

const LANGUAGE_EMOJI_POOL: Record<SampleLanguage, string[]> = {
  hindi: ['🌞', '📚', '🎶', '🪔', '☕'],
  hinglish: ['✨', '🛣️', '🎧', '🍜', '🤩'],
  kannada: ['🌧️', '🏞️', '🎉', '☕', '🪕'],
  english: ['🚀', '📈', '☕', '🎨', '🌆'],
  mixed: ['🔥', '💡', '🌈', '🎯', '🥳']
}

function decorateWithEmojis(text: string, language: SampleLanguage): string {
  const pool = LANGUAGE_EMOJI_POOL[language] ?? []
  if (!pool.length) return text

  const desired = text.length > 80 ? 2 : 1
  const selections = new Set<string>()

  while (selections.size < desired && selections.size < pool.length) {
    const candidate = pool[Math.floor(Math.random() * pool.length)]
    if (!text.includes(candidate)) {
      selections.add(candidate)
    } else if (selections.size + 1 >= pool.length) {
      selections.add(candidate)
    }
  }

  if (!selections.size) return text
  return `${text} ${Array.from(selections).join(' ')}`.trim()
}

function resolveSamplePool(language: SampleLanguage, length: SampleLength): string[] {
  const languageBank = SAMPLE_SNIPPETS[language]
  const pool = languageBank?.[length]
  if (pool && pool.length) return pool
  const fallback = languageBank?.small
  if (fallback && fallback.length) return fallback
  return SAMPLE_SNIPPETS.english.small
}

export function generateSample(
  language: SampleLanguage,
  variant: 'single' | 'batch' = 'single',
  length: SampleLength = 'small',
  withEmojis = false
): string {
  const pool = resolveSamplePool(language, length)
  if (!pool.length) return ''

  const pick = () => {
    const base = pool[Math.floor(Math.random() * pool.length)]
    return withEmojis ? decorateWithEmojis(base, language) : base
  }

  if (variant === 'batch') {
    const lines = Array.from({ length: 5 }, () => pick())
    return lines.join('\n')
  }

  return pick()
}
