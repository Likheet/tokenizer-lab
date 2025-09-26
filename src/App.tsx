import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Download, Eye, EyeOff, Loader2, Sparkles, ChevronsUpDown, Square, GitCompare, ListTree, Wand2 } from 'lucide-react'

import { ModeToggle } from './components/ui/theme-toggle'

import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from './components/ui/card'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'
import { ScrollArea } from './components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from './components/ui/table'
// Tabs removed from UI; keeping import commented if needed later
// import { Tabs, TabsContent } from './components/ui/tabs'
import { cn } from './lib/utils'
import { ButtonGroup } from './components/ui/button-group'
import { Textarea } from './components/ui/textarea'
import { Slider } from './components/ui/slider'
import { Switch } from './components/ui/switch'
import {
  AVAILABLE_MODELS,
  getHfTokenId,
  tokenizeOnce,
  type ModelCategory,
  type ModelInfo,
  type TokenizationResult
} from './tokenizers'
import {
  COMPARISON_REPOS,
  STARTER_DATASET,
  compareAll,
  downloadCSV,
  runBatch,
  summarize,
  toCSV,
  type Row
} from './compare'

const TokenBackground = lazy(() => import('./components/background/TokenBackground'))

type Mode = 'single' | 'compare' | 'batch'
type TokenView = 'human' | 'raw' | 'ids' | 'offsets'

const MODE_META: Record<Mode, { title: string; description: string; short: string }> = {
  single: {
    title: 'Single tokenizer run',
    description: 'Inspect segmentation for one model.',
    short: 'Single'
  },
  compare: {
    title: 'Compare models',
    description: 'Line up metrics across all tokenizers.',
    short: 'Compare'
  },
  batch: {
    title: 'Batch analytics',
    description: 'Benchmark many snippets & export.',
    short: 'Batch'
  }
}

// Segmented control replaced with custom SegmentGroup implementation

const TOKEN_VIEW_OPTIONS: { value: TokenView; label: string }[] = [
  { value: 'human', label: 'Readable slices' },
  { value: 'raw', label: 'Model tokens' },
  { value: 'ids', label: 'Token IDs' },
  { value: 'offsets', label: 'Offsets' }
]

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  basic: 'General purpose',
  indian: 'Indic language specialists',
  frontier: 'Frontier and production stacks'
}

const METRIC_FIELDS: {
  key: keyof TokenizationResult['metrics']
  label: string
  format?: (value: number) => string
}[] = [
  { key: 'tokenCount', label: 'Tokens' },
  { key: 'charCount', label: 'Characters' },
  { key: 'byteCount', label: 'Bytes' },
  { key: 'tokensPer100Chars', label: 'Tokens / 100 chars', format: (v) => v.toFixed(2) },
  { key: 'bytesPerToken', label: 'Bytes / token', format: (v) => v.toFixed(2) },
  { key: 'avgTokenLength', label: 'Avg. token length', format: (v) => v.toFixed(2) },
  {
    key: 'unkPercentage',
    label: 'UNK %',
    format: (v) => `${v.toFixed(2)}%`
  }
]

type SampleLanguage = 'hindi' | 'hinglish' | 'kannada' | 'english' | 'mixed'
type SampleLength = 'small' | 'medium' | 'long'

const SAMPLE_LANGUAGE_OPTIONS: { value: SampleLanguage; label: string }[] = [
  { value: 'hindi', label: 'Hindi' },
  { value: 'hinglish', label: 'Hinglish' },
  { value: 'kannada', label: 'Kannada' },
  { value: 'english', label: 'English' },
  { value: 'mixed', label: 'Mixed' }
]

const SAMPLE_LENGTH_ORDER: SampleLength[] = ['small', 'medium', 'long']
const SAMPLE_LENGTH_LABELS: Record<SampleLength, string> = {
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

function generateSample(
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

export default function App() {
  const [text, setText] = useState('आज धूप नहीं निकली है — aaj dhoop nahi nikli hai.')
  const [batchText, setBatchText] = useState(STARTER_DATASET)
  const [selectedModel, setSelectedModel] = useState('Xenova/bert-base-multilingual-uncased')
  const [mode, setMode] = useState<Mode>('single')
  const [result, setResult] = useState<TokenizationResult | null>(null)
  const [compareResults, setCompareResults] = useState<(TokenizationResult & { repo: string })[]>([])
  const [batchResults, setBatchResults] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)
  const [sampleLength, setSampleLength] = useState<SampleLength>('small')
  const [sampleIncludeEmojis, setSampleIncludeEmojis] = useState(false)
  const [lastSampleByTarget, setLastSampleByTarget] = useState<Record<'single' | 'compare' | 'batch', SampleLanguage | null>>({
    single: null,
    compare: null,
    batch: null
  })
  const [tokenView, setTokenView] = useState<TokenView>('human')
  const [hfToken, setHfToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      return window.localStorage?.getItem('hf_token') ?? ''
    } catch {
      return ''
    }
  })
  const [showToken, setShowToken] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelMenuHighlight, setModelMenuHighlight] = useState<string | null>(null)
  const modelButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const flatModelIds = useMemo(() => AVAILABLE_MODELS.map((model) => model.id), [])

  const handleSampleInsert = useCallback(
    (
      language: SampleLanguage,
      target: 'single' | 'compare' | 'batch',
      options?: { length?: SampleLength }
    ) => {
      const variant = target === 'batch' ? 'batch' : 'single'
      const effectiveLength = options?.length ?? sampleLength
      const sample = generateSample(language, variant, effectiveLength, sampleIncludeEmojis)
      if (target === 'batch') {
        setBatchText(sample)
      } else if (target === 'compare') {
        setText(sample)
      } else {
        setText(sample)
      }
      setLastSampleByTarget((prev) => ({ ...prev, [target]: language }))
    },
    [sampleIncludeEmojis, sampleLength, setBatchText, setLastSampleByTarget, setText]
  )

  const renderSampleControls = (target: 'single' | 'compare' | 'batch') => {
    const sliderIndex = Math.max(0, SAMPLE_LENGTH_ORDER.indexOf(sampleLength))
    const sliderLabel = SAMPLE_LENGTH_LABELS[sampleLength]
    const lastLanguage = lastSampleByTarget[target]
    const emojiToggleId = `emoji-toggle-${target}`
    return (
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-2.5 py-1 shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Size</span>
          <Slider
            value={[sliderIndex]}
            min={0}
            max={SAMPLE_LENGTH_ORDER.length - 1}
            step={1}
            onValueChange={(value) => {
              const nextIndex = value[0] ?? 0
              const nextLength = SAMPLE_LENGTH_ORDER[nextIndex] ?? 'small'
              if (nextLength !== sampleLength) {
                setSampleLength(nextLength)
                if (lastLanguage) {
                  handleSampleInsert(lastLanguage, target, { length: nextLength })
                }
              }
            }}
            className="w-24"
            aria-label="Sample length"
          />
          <span className="text-[11px] font-medium text-foreground">{sliderLabel}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-2.5 py-1 shadow-sm">
          <Switch
            id={emojiToggleId}
            checked={sampleIncludeEmojis}
            onCheckedChange={(checked) => setSampleIncludeEmojis(checked)}
            aria-label="Toggle emoji augmentation"
          />
          <label
            htmlFor={emojiToggleId}
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" /> Emoji
          </label>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex items-center gap-2 bg-background/90"
              aria-label="Insert sample text"
            >
              <Wand2 className="h-4 w-4" />
              <span className="text-xs font-semibold">Samples</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[8rem]">
            {SAMPLE_LANGUAGE_OPTIONS.map((option) => (
              <DropdownMenuItem key={`${target}-sample-${option.value}`} onSelect={() => handleSampleInsert(option.value, target)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const trimmed = hfToken.trim()
      if (trimmed) {
        window.localStorage.setItem('hf_token', trimmed)
      } else {
        window.localStorage.removeItem('hf_token')
      }
    } catch (error) {
      console.warn('Unable to persist HF token:', error)
    }
  }, [hfToken])

  useEffect(() => {
    if (!modelMenuOpen) {
      setModelMenuHighlight(null)
      return
    }
    const currentId = selectedModel
    setModelMenuHighlight(currentId)
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        modelButtonRefs.current[currentId]?.focus()
      })
    }
  }, [modelMenuOpen, selectedModel])

  const modelLookup = useMemo(() => {
    return AVAILABLE_MODELS.reduce<Record<string, ModelInfo>>((acc, model) => {
      acc[model.id] = model
      return acc
    }, {})
  }, [])

  const modelsByCategory = useMemo(() => {
    return AVAILABLE_MODELS.reduce<Record<ModelCategory, ModelInfo[]>>(
      (acc, model) => {
        acc[model.category] = acc[model.category] ?? []
        acc[model.category]!.push(model)
        return acc
      },
      { basic: [], indian: [], frontier: [] }
    )
  }, [])

  const selectedModelInfo = modelLookup[selectedModel]

  function selectModel(modelId: string) {
    setSelectedModel(modelId)
    setModelMenuOpen(false)
  }

  function focusModel(modelId: string) {
    setModelMenuHighlight(modelId)
    const node = modelButtonRefs.current[modelId]
    if (node) {
      node.focus()
      node.scrollIntoView({ block: 'nearest' })
    }
  }

  function handleModelKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentId: string) {
    const currentIndex = flatModelIds.indexOf(currentId)
    if (currentIndex === -1) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      const nextIndex = (currentIndex + 1) % flatModelIds.length
      focusModel(flatModelIds[nextIndex])
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const prevIndex = (currentIndex - 1 + flatModelIds.length) % flatModelIds.length
      focusModel(flatModelIds[prevIndex])
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusModel(flatModelIds[0])
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusModel(flatModelIds[flatModelIds.length - 1])
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectModel(currentId)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setModelMenuOpen(false)
      return
    }
  }

  async function runSingle() {
    setErr(null)
    setResult(null)
    setLoading(true)
    try {
      const tokenizationResult = await tokenizeOnce(selectedModel, text)
      setResult(tokenizationResult)
    } catch (e: any) {
      setErr(e?.message || 'Tokenization failed')
    } finally {
      setLoading(false)
    }
  }

  async function runCompare() {
    setErr(null)
    setCompareResults([])
    setCompareLoading(true)
    try {
      const results = await compareAll(text)
      setCompareResults(results)
    } catch (e: any) {
      setErr(e?.message || 'Comparison failed')
    } finally {
      setCompareLoading(false)
    }
  }

  async function runBatchAnalysis() {
    setErr(null)
    setBatchResults([])
    setBatchLoading(true)
    try {
      const lines = batchText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (!lines.length) {
        throw new Error('Add at least one non-empty line before running a batch analysis.')
      }
      const results = await runBatch(COMPARISON_REPOS, lines)
      setBatchResults(results)
    } catch (e: any) {
      setErr(e?.message || 'Batch analysis failed')
    } finally {
      setBatchLoading(false)
    }
  }

  function exportToCSV() {
    if (batchResults.length === 0) return
    const csv = toCSV(batchResults)
    downloadCSV('tokenizer-lab-batch.csv', csv)
  }

  const batchSummary = useMemo(() => (batchResults.length ? summarize(batchResults) : []), [batchResults])

  return (
    <div className="relative min-h-screen bg-background pb-24">
      {/* 3D Background Layer */}
      <div className="fixed inset-0 -z-40">
        <Suspense
          fallback={
            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.22),transparent_60%),radial-gradient(circle_at_70%_35%,rgba(14,165,233,0.18),transparent_60%)]" />
          }
        >
          <TokenBackground />
        </Suspense>
      </div>
      {/* Gradient & darkening overlays above the canvas */}
      <div className="pointer-events-none absolute inset-0 -z-30 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.18),transparent_65%)]" />
      <div className="absolute inset-x-0 top-0 -z-20 h-[520px] bg-gradient-to-b from-background/20 via-background/70 to-background" />
      <div className="absolute inset-0 -z-10 backdrop-blur-[2px]" />

      <div className="absolute right-6 top-6 z-40">
        <ModeToggle />
      </div>

      <main className="container space-y-10 py-12">
        <Card className="border border-border/70 bg-card/70 shadow-xl shadow-primary/5">
          <CardHeader className="pb-5">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">Workspace</CardTitle>
                <CardDescription className="text-sm">Select a model & switch modes. Smooth animated slider below.</CardDescription>
              </div>
              <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
                <ButtonGroup
                  value={mode}
                  onChange={(value) => setMode(value as Mode)}
                  options={[
                    {
                      label: (
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
                          <Square className="h-4 w-4" /> Single
                        </span>
                      ),
                      value: 'single'
                    },
                    {
                      label: (
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
                          <GitCompare className="h-4 w-4" /> Compare
                        </span>
                      ),
                      value: 'compare'
                    },
                    {
                      label: (
                        <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
                          <ListTree className="h-4 w-4" /> Batch
                        </span>
                      ),
                      value: 'batch'
                    }
                  ]}
                  className="min-w-[280px]"
                />
                <div className="relative">
                  <button
                    onClick={() => setModelMenuOpen(o => !o)}
                    className="flex w-[280px] items-center justify-between rounded-md border border-border/60 bg-background/70 px-4 py-2.5 text-left text-sm font-medium shadow-sm hover:bg-background/90"
                    aria-expanded={modelMenuOpen}
                  >
                    <span className="truncate">{selectedModelInfo?.name || 'Select tokenizer'}</span>
                    <ChevronsUpDown className="ml-2 h-4.5 w-4.5 opacity-60" />
                  </button>
                  {modelMenuOpen && (
                    <div
                      className="absolute z-50 mt-2 max-h-[340px] w-[320px] overflow-auto overscroll-contain rounded-lg border border-border/60 bg-popover p-2 shadow-xl scrollbar-hidden"
                      role="menu"
                      aria-label="Tokenizer models"
                      aria-orientation="vertical"
                      aria-activedescendant={
                        modelMenuHighlight
                          ? `model-option-${modelMenuHighlight.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                          : undefined
                      }
                    >
                      <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Tokenizers</span>
                      </div>
                      <div className="space-y-4 pr-1">
                        {(Object.entries(modelsByCategory) as [ModelCategory, ModelInfo[]][]).map(([cat, models]) => (
                          <div key={cat} className="space-y-1">
                            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-primary/70">{CATEGORY_LABELS[cat]}</p>
                            <ul className="grid gap-1">
                              {models.map((model) => {
                                const buttonId = `model-option-${model.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                                const isSelected = selectedModel === model.id
                                const isHighlighted = modelMenuHighlight === model.id && !isSelected
                                return (
                                  <li key={model.id}>
                                    <button
                                      id={buttonId}
                                      ref={(node) => {
                                        modelButtonRefs.current[model.id] = node
                                      }}
                                      role="menuitemradio"
                                      aria-checked={isSelected}
                                      tabIndex={isSelected ? 0 : -1}
                                      onClick={() => selectModel(model.id)}
                                      onKeyDown={(event) => handleModelKeyDown(event, model.id)}
                                      onMouseEnter={() => setModelMenuHighlight(model.id)}
                                      onFocus={() => setModelMenuHighlight(model.id)}
                                      className={cn(
                                        'flex w-full flex-col rounded-md px-2 py-1.5 text-left text-xs transition outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                                        isSelected
                                          ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/60'
                                          : 'text-foreground/90 hover:bg-muted/70',
                                        isHighlighted && 'bg-muted/60 ring-1 ring-border/60'
                                      )}
                                    >
                                      <span className="block truncate font-medium">{model.name}</span>
                                      <span className="block truncate text-[10px] text-muted-foreground">{model.id}</span>
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardFooter className="pt-0">
            {selectedModelInfo?.category === 'indian' && (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-secondary-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Indic-optimized tokenizer.
              </div>
            )}
          </CardFooter>
        </Card>

        <Card className="bg-card/80 shadow-2xl shadow-primary/10">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl leading-tight">{MODE_META[mode].title}</CardTitle>
                <CardDescription className="mt-1">{MODE_META[mode].description}</CardDescription>
              </div>
              <div className="hidden sm:block text-xs text-muted-foreground">Mode: {MODE_META[mode].short}</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-7">
            {mode === 'single' && (
              <div className="space-y-5">
                <div className="relative">
                  <Textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Paste or type the text you want to tokenize…"
                    className="min-h-[160px] bg-background/70 p-4"
                  />
                  {renderSampleControls('single')}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Button onClick={runSingle} disabled={loading} className="px-5 py-2.5 h-auto">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2.5 h-4.5 w-4.5 animate-spin" />Generating tokens…
                      </>
                    ) : (
                      'Tokenize sample'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Tokens are rendered with visible whitespace markers so you can track segmentation precisely.
                  </p>
                </div>
              </div>
            )}
            {mode === 'compare' && (
              <div className="space-y-4">
                <div className="relative">
                  <Textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Single snippet to compare across all tokenizers"
                    className="min-h-[140px] bg-background/70"
                  />
                  {renderSampleControls('compare')}
                </div>
                <Button onClick={runCompare} disabled={compareLoading}>
                  {compareLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />Comparing tokenizers…
                    </>
                  ) : (
                    'Compare every tokenizer'
                  )}
                </Button>
              </div>
            )}
            {mode === 'batch' && (
              <div className="space-y-4">
                <div className="relative">
                  <Textarea
                    value={batchText}
                    onChange={(event) => setBatchText(event.target.value)}
                    placeholder="One sample per line—mix Indic scripts, emoji and URLs to stress-test tokenizers."
                    className="min-h-[220px] bg-background/70"
                  />
                  {renderSampleControls('batch')}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={runBatchAnalysis} disabled={batchLoading}>
                    {batchLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />Running batch analysis…
                      </>
                    ) : (
                      'Run batch analysis'
                    )}
                  </Button>
                  {batchResults.length > 0 && (
                    <Button type="button" variant="outline" onClick={exportToCSV}>
                      <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Batch mode runs every snippet against each tokenizer. Results stream back immediately once
                    ready.
                  </p>
                </div>
              </div>
            )}

            {err ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {err}
              </div>
            ) : null}

            {result && mode === 'single' ? (
              <SingleResultView
                result={result}
                tokenView={tokenView}
                onTokenViewChange={setTokenView}
              />
            ) : null}

            {compareResults.length > 0 && mode === 'compare' ? (
              <CompareResultsView results={compareResults} />
            ) : null}

            {batchResults.length > 0 && mode === 'batch' ? (
              <BatchResultsView rows={batchResults} summary={batchSummary} onExport={exportToCSV} />
            ) : null}
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-border/60 bg-background/60 backdrop-blur mt-16">
        <div className="container flex flex-col gap-10 py-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-5">
            <Badge variant="secondary" className="w-max gap-2.5 px-3 py-1.5 bg-secondary/60 text-secondary-foreground">
              <Sparkles className="h-4.5 w-4.5" />
              Tokenizer Lab
            </Badge>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Multilingual tokenization workbench
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground">
                Explore how cutting-edge tokenizers behave on Indic and multilingual samples. Track metrics,
                compare models, and export structured results in seconds.
              </p>
            </div>
            {selectedModelInfo ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="outline" className="bg-background/60">
                  {CATEGORY_LABELS[selectedModelInfo.category]}
                </Badge>
                <span>
                  <span className="font-semibold text-foreground">{selectedModelInfo.name}</span>
                  {selectedModelInfo.shortName && (
                    <span className="text-muted-foreground"> · {selectedModelInfo.shortName}</span>
                  )}
                </span>
              </div>
            ) : null}
          </div>

          <Card className="max-w-sm bg-card/70 shadow-lg shadow-primary/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Hugging Face access token</CardTitle>
              <CardDescription>
                Stored locally in your browser. Required for gated models like Meta Llama 3 and Mistral.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="hf-token" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Access token
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="hf-token"
                    type={showToken ? 'text' : 'password'}
                    value={hfToken}
                    onChange={(event) => setHfToken(event.target.value)}
                    placeholder="hf_..."
                    className="bg-background/80"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setShowToken((s) => !s)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Need one? Visit{' '}
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary"
                >
                  huggingface.co/settings/tokens
                </a>{' '}
                and create a <strong>read</strong>-only token. Currently cached token ID: {getHfTokenId() || '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      </footer>
    </div>
  )
}

interface SingleResultViewProps {
  result: TokenizationResult
  tokenView: TokenView
  onTokenViewChange: (view: TokenView) => void
}

function SingleResultView({ result, tokenView, onTokenViewChange }: SingleResultViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-card/70">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-semibold">
                Tokenization metrics
              </CardTitle>
              <CardDescription className="text-base">High-level stats for the current tokenizer run.</CardDescription>
            </div>
              <Badge variant="outline" className="px-4 py-2 text-sm">
                <span className="font-bold">{result.metrics.tokenCount}</span>&nbsp;tokens in total
              </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {METRIC_FIELDS.map(({ key, label, format }) => {
              const value = result.metrics[key]
              const formatted = typeof value === 'number' ? (format ? format(value) : value.toString()) : '—'
              const isDestructive = key === 'unkPercentage' && value > 0
              
              // Add icons for better identification
              // Removed icons for cleaner UI

              return (
                <div
                  key={key}
                  className={cn(
                    "flex flex-col rounded-lg border bg-background/60 px-4 py-3",
                    isDestructive ? "border-destructive/30" : "border-border/60",
                    isDestructive && "bg-destructive/5"
                  )}
                >
                  <div className="mb-1">
                    <span className={cn(
                      "text-sm font-medium uppercase tracking-wide",
                      isDestructive ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {label}
                    </span>
                  </div>
                  <span className={cn(
                    "text-xl tabular-nums font-semibold",
                    isDestructive ? "text-destructive" : "text-foreground"
                  )}>
                    {formatted}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold">
              Token explorer
            </CardTitle>
            <CardDescription className="text-base">Switch views to inspect IDs, source offsets, or raw model tokens.</CardDescription>
          </div>
          <Badge variant="outline" className="px-3 py-2 text-sm">
            Tokens: <span className="font-bold ml-1">{result.tokens.length}</span>
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select value={tokenView} onValueChange={(value) => onTokenViewChange(value as TokenView)}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TOKEN_VIEW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="h-[280px] w-full rounded-lg border border-border/60 bg-background/70">
            <div className="flex flex-wrap gap-2 p-4">
              {result.tokens.map((token, index) => {
                const id = result.ids[index]
                const raw = result.tokenStrings?.[index]
                const offsets = result.offsets?.[index]
                let display = token

                if (tokenView === 'raw') {
                  display = raw ?? String(id)
                } else if (tokenView === 'ids') {
                  display = String(id)
                } else if (tokenView === 'offsets') {
                  const label = offsets ? `${offsets[0]}-${offsets[1]}` : '—'
                  display = `${token}  [${label}]`
                }

                const isUnk = raw === '[UNK]' || token.includes('[UNK]')
                const title: string[] = [`ID: ${id}`]
                if (raw) title.push(`raw: ${raw}`)
                if (offsets) title.push(`offset: ${offsets[0]}-${offsets[1]}`)

                return (
                  <Badge
                    key={`${token}-${index}`}
                    variant={isUnk ? 'destructive' : 'outline'}
                    className="cursor-default whitespace-pre bg-background/70 px-3 py-2 font-mono text-sm tracking-tight shadow-sm border border-border/40"
                    title={title.join(' | ')}
                  >
                    {display}
                  </Badge>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

interface CompareResultsViewProps {
  results: (TokenizationResult & { repo: string })[]
}

function CompareResultsView({ results }: CompareResultsViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold">Side-by-side comparison</h3>
        <p className="text-sm text-muted-foreground">
          Metrics and token streams for every tokenizer are displayed below. Hover a token chip to inspect IDs and
          offsets.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {results.map((result) => {
          const modelInfo = AVAILABLE_MODELS.find((model) => model.id === result.repo)
          return (
            <Card key={result.repo} className="bg-card/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{modelInfo?.shortName ?? result.repo.split('/')[1]}</span>
                  <Badge variant="outline" className="text-xs">
                    {modelInfo?.category ? CATEGORY_LABELS[modelInfo.category] : 'Tokenizer'}
                  </Badge>
                </CardTitle>
                <CardDescription>{modelInfo?.name ?? result.repo}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm">
                  <MetricRow label="Tokens" value={result.metrics.tokenCount} />
                  <MetricRow label="Tokens / 100" value={result.metrics.tokensPer100Chars.toFixed(2)} />
                  <MetricRow label="Bytes / token" value={result.metrics.bytesPerToken.toFixed(2)} />
                  <MetricRow
                    label="UNK %"
                    value={`${result.metrics.unkPercentage.toFixed(2)}%`}
                    highlight={result.metrics.unkPercentage > 0}
                  />
                </div>
                <ScrollArea className="h-[180px] w-full rounded-md border border-border/60 bg-background/70">
                  <div className="flex flex-wrap gap-2 p-3">
                    {result.tokens.map((token, index) => {
                      const raw = result.tokenStrings?.[index]
                      const isUnk = raw === '[UNK]' || token.includes('[UNK]')
                      const id = result.ids[index]
                      return (
                        <Badge
                          key={`${result.repo}-${index}`}
                          variant={isUnk ? 'destructive' : 'outline'}
                          className="cursor-default whitespace-pre bg-background/70 px-2.5 py-1 font-mono text-[10px] tracking-tight shadow-sm ring-1 ring-inset ring-border/40 hover:ring-border/60 transition"
                          title={`ID: ${id}${raw ? ` | raw: ${raw}` : ''}`}
                        >
                          {token}
                        </Badge>
                      )
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

interface BatchResultsViewProps {
  rows: Row[]
  summary: ReturnType<typeof summarize>
  onExport: () => void
}

function BatchResultsView({ rows, summary, onExport }: BatchResultsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold">Batch results</h3>
          <p className="text-sm text-muted-foreground">
            {rows.length} tokenizer×snippet combinations. Scroll to inspect everything or export the CSV snapshot.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <ScrollArea className="h-[360px] w-full rounded-lg border border-border/60 bg-background/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Slice</TableHead>
              <TableHead className="w-[90px]">Tokens</TableHead>
              <TableHead className="w-[120px]">Tokens / 100</TableHead>
              <TableHead className="w-[120px]">Bytes / token</TableHead>
              <TableHead className="w-[90px]">UNK %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.repo}-${index}`}>
                <TableCell className="font-medium text-foreground">{row.repo.split('/')[1]}</TableCell>
                <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                  {row.text}
                </TableCell>
                <TableCell className="tabular-nums font-medium">{row.tokens}</TableCell>
                <TableCell className="tabular-nums font-medium">{row.tokens_per_100_chars.toFixed(2)}</TableCell>
                <TableCell className="tabular-nums font-medium">{row.bytes_per_token.toFixed(2)}</TableCell>
                <TableCell className={cn('tabular-nums font-medium', row.unk_rate > 0 && 'text-destructive')}>
                  {row.unk_rate.toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      {summary.length > 0 && (
        <Card className="bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Slice-level summary</CardTitle>
            <CardDescription>
              Average metrics grouped by inferred language slice. Handy for spotting regressions on a segment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {summary.map((item) => (
                <div key={`${item.repo}-${item.slice}`} className="rounded-lg border border-border/60 bg-background/60 p-4">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{item.repo.split('/')[1]}</h4>
                    <Badge variant="outline" className="text-xs uppercase tracking-wide">
                      {item.slice}
                    </Badge>
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <SummaryMetric label="Mean tokens" value={item.mean_tokens.toFixed(1)} />
                    <SummaryMetric label="Tokens / 100" value={item.mean_tokens_per_100.toFixed(2)} />
                    <SummaryMetric label="Bytes / token" value={item.mean_bytes_per_token.toFixed(2)} />
                    <SummaryMetric
                      label="UNK %"
                      value={`${item.mean_unk.toFixed(2)}%`}
                      highlight={item.mean_unk > 0}
                    />
                  </dl>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface MetricRowProps {
  label: string
  value: string | number
  highlight?: boolean
}

function MetricRow({ label, value, highlight }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums font-medium', highlight ? 'text-destructive' : 'text-foreground')}>
        {value}
      </span>
    </div>
  )
}

interface SummaryMetricProps {
  label: string
  value: string
  highlight?: boolean
}

function SummaryMetric({ label, value, highlight }: SummaryMetricProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-destructive' : 'font-semibold text-foreground'}>
        {value}
      </span>
    </div>
  )
}
