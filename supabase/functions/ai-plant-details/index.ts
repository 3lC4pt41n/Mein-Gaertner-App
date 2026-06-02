// Edge Function: Pflanzen-Details generieren (Name → Detail-JSON)
// POST Body: { name: string, note?: string, language?: string, species_id?: string }
//
// Phase 2: Cache-first mit species_details-Tabelle
// - Bei Cache-Hit: sofort zurückgeben, 0 Credits
// - Bei Cache-Miss: LLM-Call + Write-Through in species_details
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient } from '../_shared/supabase-client.ts';
import { callOpenAI } from '../_shared/openai.ts';
import {
  CREDIT_COSTS,
  deductCreditsAtomic,
  refundCredits,
  logUsage,
  getUserIdFromAuth,
} from '../_shared/credits.ts';
import {
  getLanguagePromptName,
  getUserLanguage,
  type SupportedLanguage,
} from '../_shared/language.ts';
import { validateText, validateLanguage, validationErrorResponse } from '../_shared/validate.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { buildGenerationContext } from './cache-flow.js';

// ── Detail-Schema pro Sprache ─────────────────────────────────────────

type DetailEntry = readonly [string, string];

interface DetailSchemaLabels {
  overview: readonly string[];
  care: readonly string[];
  dangersTitle: string;
  dangers: readonly DetailEntry[];
  benefitsTitle: string;
  benefits: readonly DetailEntry[];
  compoundsTitle: string;
  compounds: readonly DetailEntry[];
}

const DETAIL_SCHEMA_LABELS: Record<SupportedLanguage, DetailSchemaLabels> = {
  de: {
    overview: [
      'Deutscher Name',
      'Botanischer Name',
      'Familie',
      'Herkunft',
      'Lebensform',
      'Größe',
      'Blütezeit',
      'Lebensdauer',
      'Highlight',
    ],
    care: [
      'Licht',
      'Temperaturbereich',
      'Luftfeuchte',
      'Substrat / Boden',
      'Gießen',
      'Düngen',
      'Schnitt',
      'Umtopfen',
      'Rankhilfe',
      'Typische Schädlinge',
      'Krankheiten',
      'Besondere Hinweise',
    ],
    dangersTitle: '⚠️ Gefahren',
    dangers: [
      ['Giftigkeit', 'Giftigkeit für Menschen, Hunde, Katzen beschreiben'],
      ['Verwechslungsgefahr', 'Ähnliche Arten nennen, mit denen verwechselt werden kann'],
      ['Wucherverhalten', 'Ausbreitungsverhalten beschreiben'],
    ],
    benefitsTitle: '🌿 Nutzen',
    benefits: [
      ['Essbare Pflanze', "Essbare Teile und Zubereitung beschreiben, oder 'Nicht essbar'"],
      ['Nährstoffe', 'Wichtige Vitamine und Mineralstoffe'],
      ['Tierfutter', 'Eignung als Futter für Haustiere/Wildtiere'],
      ['Bodenindikator', 'Was die Pflanze über den Boden verrät'],
    ],
    compoundsTitle: '🧪 Wirkstoffe',
    compounds: [
      ['Wirkstoff 1 (Name)', 'Konzentration → Wirkung'],
      ['Wirkstoff 2 (Name)', 'Konzentration → Wirkung'],
      ['Mineralstoffe', 'Wichtige Mineralstoffe auflisten'],
    ],
  },
  en: {
    overview: [
      'Common Name',
      'Botanical Name',
      'Family',
      'Origin',
      'Growth Type',
      'Size',
      'Blooming Season',
      'Lifespan',
      'Highlight',
    ],
    care: [
      'Light',
      'Temperature Range',
      'Humidity',
      'Soil / Substrate',
      'Watering',
      'Fertilizing',
      'Pruning',
      'Repotting',
      'Support / Trellis',
      'Common Pests',
      'Diseases',
      'Special Notes',
    ],
    dangersTitle: '⚠️ Dangers',
    dangers: [
      ['Toxicity', 'Describe toxicity for humans, dogs and cats'],
      ['Confusion Risk', 'Name similar species that can be confused with this one'],
      ['Invasive Behavior', 'Describe spreading behavior'],
    ],
    benefitsTitle: '🌿 Benefits',
    benefits: [
      ['Edible Plant', "Describe edible parts and preparation, or 'Not edible'"],
      ['Nutrients', 'Important vitamins and minerals'],
      ['Animal Feed', 'Suitability as feed for pets or wildlife'],
      ['Soil Indicator', 'What the plant reveals about soil conditions'],
    ],
    compoundsTitle: '🧪 Active Compounds',
    compounds: [
      ['Compound 1 (Name)', 'Concentration → Effect'],
      ['Compound 2 (Name)', 'Concentration → Effect'],
      ['Minerals', 'List important minerals'],
    ],
  },
  fr: {
    overview: [
      'Nom commun',
      'Nom botanique',
      'Famille',
      'Origine',
      'Type de croissance',
      'Taille',
      'Période de floraison',
      'Durée de vie',
      'Atout principal',
    ],
    care: [
      'Lumière',
      'Plage de température',
      'Humidité',
      'Substrat / Sol',
      'Arrosage',
      'Fertilisation',
      'Taille',
      'Rempotage',
      'Tuteur / Support',
      'Ravageurs fréquents',
      'Maladies',
      'Remarques spéciales',
    ],
    dangersTitle: '⚠️ Dangers',
    dangers: [
      ['Toxicité', 'Décrire la toxicité pour les humains, chiens et chats'],
      ['Risque de confusion', 'Nommer les espèces similaires pouvant prêter à confusion'],
      ['Comportement envahissant', 'Décrire le comportement de propagation'],
    ],
    benefitsTitle: '🌿 Bienfaits',
    benefits: [
      ['Plante comestible', "Parties comestibles et préparation, ou 'Non comestible'"],
      ['Nutriments', 'Vitamines et minéraux importants'],
      ['Alimentation animale', 'Aptitude comme nourriture pour animaux domestiques ou sauvages'],
      ['Indicateur de sol', 'Ce que la plante révèle sur le sol'],
    ],
    compoundsTitle: '🧪 Principes actifs',
    compounds: [
      ['Principe actif 1 (Nom)', 'Concentration → Effet'],
      ['Principe actif 2 (Nom)', 'Concentration → Effet'],
      ['Minéraux', 'Lister les minéraux importants'],
    ],
  },
  it: {
    overview: [
      'Nome comune',
      'Nome botanico',
      'Famiglia',
      'Origine',
      'Tipo di crescita',
      'Dimensioni',
      'Periodo di fioritura',
      'Durata di vita',
      'Punto forte',
    ],
    care: [
      'Luce',
      'Intervallo di temperatura',
      'Umidità',
      'Substrato / Terreno',
      'Irrigazione',
      'Concimazione',
      'Potatura',
      'Rinvaso',
      'Sostegno / Tutore',
      'Parassiti comuni',
      'Malattie',
      'Note speciali',
    ],
    dangersTitle: '⚠️ Pericoli',
    dangers: [
      ['Tossicità', 'Descrivere la tossicità per umani, cani e gatti'],
      ['Rischio di confusione', 'Indicare specie simili con cui può essere confusa'],
      ['Comportamento invasivo', 'Descrivere il comportamento di diffusione'],
    ],
    benefitsTitle: '🌿 Benefici',
    benefits: [
      ['Pianta commestibile', "Parti commestibili e preparazione, oppure 'Non commestibile'"],
      ['Nutrienti', 'Vitamine e minerali importanti'],
      ['Alimentazione animale', 'Idoneità come alimento per animali domestici o selvatici'],
      ['Indicatore del suolo', 'Cosa rivela la pianta sul terreno'],
    ],
    compoundsTitle: '🧪 Principi attivi',
    compounds: [
      ['Principio attivo 1 (Nome)', 'Concentrazione → Effetto'],
      ['Principio attivo 2 (Nome)', 'Concentrazione → Effetto'],
      ['Minerali', 'Elencare i minerali importanti'],
    ],
  },
  es: {
    overview: [
      'Nombre común',
      'Nombre botánico',
      'Familia',
      'Origen',
      'Tipo de crecimiento',
      'Tamaño',
      'Época de floración',
      'Vida útil',
      'Punto destacado',
    ],
    care: [
      'Luz',
      'Rango de temperatura',
      'Humedad',
      'Sustrato / Suelo',
      'Riego',
      'Fertilización',
      'Poda',
      'Trasplante',
      'Soporte / Tutor',
      'Plagas comunes',
      'Enfermedades',
      'Notas especiales',
    ],
    dangersTitle: '⚠️ Peligros',
    dangers: [
      ['Toxicidad', 'Describir toxicidad para humanos, perros y gatos'],
      ['Riesgo de confusión', 'Nombrar especies similares con las que puede confundirse'],
      ['Comportamiento invasivo', 'Describir el comportamiento de propagación'],
    ],
    benefitsTitle: '🌿 Beneficios',
    benefits: [
      ['Planta comestible', "Partes comestibles y preparación, o 'No comestible'"],
      ['Nutrientes', 'Vitaminas y minerales importantes'],
      ['Alimento animal', 'Aptitud como alimento para mascotas o fauna silvestre'],
      ['Indicador del suelo', 'Lo que la planta revela sobre el suelo'],
    ],
    compoundsTitle: '🧪 Principios activos',
    compounds: [
      ['Principio activo 1 (Nombre)', 'Concentración → Efecto'],
      ['Principio activo 2 (Nombre)', 'Concentración → Efecto'],
      ['Minerales', 'Listar minerales importantes'],
    ],
  },
  ru: {
    overview: [
      'Народное название',
      'Ботаническое название',
      'Семейство',
      'Происхождение',
      'Жизненная форма',
      'Размер',
      'Период цветения',
      'Продолжительность жизни',
      'Особенность',
    ],
    care: [
      'Свет',
      'Температурный диапазон',
      'Влажность воздуха',
      'Субстрат / Почва',
      'Полив',
      'Удобрение',
      'Обрезка',
      'Пересадка',
      'Опора',
      'Типичные вредители',
      'Болезни',
      'Особые указания',
    ],
    dangersTitle: '⚠️ Опасности',
    dangers: [
      ['Токсичность', 'Описать токсичность для людей, собак и кошек'],
      ['Риск путаницы', 'Назвать похожие виды, с которыми можно спутать'],
      ['Инвазивное поведение', 'Описать поведение распространения'],
    ],
    benefitsTitle: '🌿 Польза',
    benefits: [
      ['Съедобное растение', "Съедобные части и приготовление, или 'Не съедобно'"],
      ['Питательные вещества', 'Важные витамины и минералы'],
      ['Корм для животных', 'Пригодность в качестве корма для домашних или диких животных'],
      ['Индикатор почвы', 'Что растение говорит о почве'],
    ],
    compoundsTitle: '🧪 Активные вещества',
    compounds: [
      ['Вещество 1 (Название)', 'Концентрация → Действие'],
      ['Вещество 2 (Название)', 'Концентрация → Действие'],
      ['Минералы', 'Перечислить важные минералы'],
    ],
  },
  tr: {
    overview: [
      'Yaygın Ad',
      'Botanik Adı',
      'Aile',
      'Anavatanı',
      'Büyüme Tipi',
      'Boyut',
      'Çiçeklenme Dönemi',
      'Ömür',
      'Öne Çıkan Özellik',
    ],
    care: [
      'Işık',
      'Sıcaklık Aralığı',
      'Hava Nemi',
      'Toprak / Substrat',
      'Sulama',
      'Gübreleme',
      'Budama',
      'Saksı Değişimi',
      'Destek / Herek',
      'Yaygın Zararlılar',
      'Hastalıklar',
      'Özel Notlar',
    ],
    dangersTitle: '⚠️ Tehlikeler',
    dangers: [
      ['Toksisite', 'İnsanlar, köpekler ve kediler için toksisiteyi açıklayın'],
      ['Karıştırma Riski', 'Karıştırılabilecek benzer türleri belirtin'],
      ['İstilacı Davranış', 'Yayılma davranışını açıklayın'],
    ],
    benefitsTitle: '🌿 Faydalar',
    benefits: [
      ['Yenilebilir Bitki', "Yenilebilir kısımları ve hazırlığını açıklayın veya 'Yenilemez'"],
      ['Besin Değerleri', 'Önemli vitaminler ve mineraller'],
      ['Hayvan Yemi', 'Evcil hayvanlar veya yaban hayatı için yem olarak uygunluk'],
      ['Toprak Göstergesi', 'Bitkinin toprak koşulları hakkında ne söylediği'],
    ],
    compoundsTitle: '🧪 Aktif Bileşenler',
    compounds: [
      ['Bileşen 1 (Adı)', 'Konsantrasyon → Etki'],
      ['Bileşen 2 (Adı)', 'Konsantrasyon → Etki'],
      ['Mineraller', 'Önemli mineralleri listeleyin'],
    ],
  },
  nl: {
    overview: [
      'Nederlandse naam',
      'Botanische naam',
      'Familie',
      'Herkomst',
      'Groeivorm',
      'Grootte',
      'Bloeitijd',
      'Levensduur',
      'Bijzonderheid',
    ],
    care: [
      'Licht',
      'Temperatuurbereik',
      'Luchtvochtigheid',
      'Substraat / Bodem',
      'Water geven',
      'Bemesten',
      'Snoeien',
      'Verpotten',
      'Steun / Klimhulp',
      'Veelvoorkomende plagen',
      'Ziekten',
      'Bijzondere aanwijzingen',
    ],
    dangersTitle: '⚠️ Gevaren',
    dangers: [
      ['Giftigheid', 'Giftigheid voor mensen, honden en katten beschrijven'],
      ['Verwarringsrisico', 'Vergelijkbare soorten noemen waarmee verwarring mogelijk is'],
      ['Woekergedrag', 'Verspreidingsgedrag beschrijven'],
    ],
    benefitsTitle: '🌿 Nut',
    benefits: [
      ['Eetbare plant', "Eetbare delen en bereiding beschrijven, of 'Niet eetbaar'"],
      ['Voedingsstoffen', 'Belangrijke vitaminen en mineralen'],
      ['Dierenvoer', 'Geschiktheid als voer voor huisdieren of wilde dieren'],
      ['Bodemindicator', 'Wat de plant over de bodem vertelt'],
    ],
    compoundsTitle: '🧪 Werkzame stoffen',
    compounds: [
      ['Werkzame stof 1 (Naam)', 'Concentratie → Effect'],
      ['Werkzame stof 2 (Naam)', 'Concentratie → Effect'],
      ['Mineralen', 'Belangrijke mineralen opsommen'],
    ],
  },
  da: {
    overview: [
      'Dansk navn',
      'Botanisk navn',
      'Familie',
      'Oprindelse',
      'Vækstform',
      'Størrelse',
      'Blomstringstid',
      'Levetid',
      'Særligt kendetegn',
    ],
    care: [
      'Lys',
      'Temperaturområde',
      'Luftfugtighed',
      'Substrat / Jord',
      'Vanding',
      'Gødskning',
      'Beskæring',
      'Ompotning',
      'Støtte / Espalier',
      'Almindelige skadedyr',
      'Sygdomme',
      'Særlige bemærkninger',
    ],
    dangersTitle: '⚠️ Farer',
    dangers: [
      ['Giftighed', 'Beskriv giftighed for mennesker, hunde og katte'],
      ['Forvekslingsrisiko', 'Nævn lignende arter, den kan forveksles med'],
      ['Invasiv adfærd', 'Beskriv spredningsadfærd'],
    ],
    benefitsTitle: '🌿 Nytte',
    benefits: [
      ['Spiselig plante', "Beskriv spiselige dele og tilberedning, eller 'Ikke spiselig'"],
      ['Næringsstoffer', 'Vigtige vitaminer og mineraler'],
      ['Dyrefoder', 'Egnethed som foder til kæledyr eller vilde dyr'],
      ['Jordindikator', 'Hvad planten fortæller om jorden'],
    ],
    compoundsTitle: '🧪 Virkestoffer',
    compounds: [
      ['Virkestof 1 (Navn)', 'Koncentration → Virkning'],
      ['Virkestof 2 (Navn)', 'Koncentration → Virkning'],
      ['Mineraler', 'Oplist vigtige mineraler'],
    ],
  },
  pl: {
    overview: [
      'Nazwa zwyczajowa',
      'Nazwa botaniczna',
      'Rodzina',
      'Pochodzenie',
      'Forma wzrostu',
      'Wielkość',
      'Okres kwitnienia',
      'Długość życia',
      'Cecha szczególna',
    ],
    care: [
      'Światło',
      'Zakres temperatur',
      'Wilgotność powietrza',
      'Podłoże / Gleba',
      'Podlewanie',
      'Nawożenie',
      'Przycinanie',
      'Przesadzanie',
      'Podpora / Palik',
      'Typowe szkodniki',
      'Choroby',
      'Szczególne wskazówki',
    ],
    dangersTitle: '⚠️ Zagrożenia',
    dangers: [
      ['Toksyczność', 'Opisać toksyczność dla ludzi, psów i kotów'],
      ['Ryzyko pomyłki', 'Wymienić podobne gatunki, z którymi można ją pomylić'],
      ['Zachowanie ekspansywne', 'Opisać sposób rozprzestrzeniania się'],
    ],
    benefitsTitle: '🌿 Korzyści',
    benefits: [
      ['Roślina jadalna', "Opisać jadalne części i przygotowanie albo 'Niejadalna'"],
      ['Składniki odżywcze', 'Ważne witaminy i minerały'],
      ['Pasza dla zwierząt', 'Przydatność jako pokarm dla zwierząt domowych lub dzikich'],
      ['Wskaźnik gleby', 'Co roślina mówi o glebie'],
    ],
    compoundsTitle: '🧪 Substancje czynne',
    compounds: [
      ['Substancja czynna 1 (Nazwa)', 'Stężenie → Działanie'],
      ['Substancja czynna 2 (Nazwa)', 'Stężenie → Działanie'],
      ['Minerały', 'Wymienić ważne minerały'],
    ],
  },
  uk: {
    overview: [
      'Народна назва',
      'Ботанічна назва',
      'Родина',
      'Походження',
      'Життєва форма',
      'Розмір',
      'Період цвітіння',
      'Тривалість життя',
      'Особливість',
    ],
    care: [
      'Світло',
      'Температурний діапазон',
      'Вологість повітря',
      'Субстрат / Ґрунт',
      'Полив',
      'Підживлення',
      'Обрізування',
      'Пересаджування',
      'Опора / Шпалера',
      'Типові шкідники',
      'Хвороби',
      'Особливі вказівки',
    ],
    dangersTitle: '⚠️ Небезпеки',
    dangers: [
      ['Токсичність', 'Описати токсичність для людей, собак і котів'],
      ['Ризик сплутування', 'Назвати схожі види, з якими можна сплутати'],
      ['Інвазивна поведінка', 'Описати характер поширення'],
    ],
    benefitsTitle: '🌿 Користь',
    benefits: [
      ['Їстівна рослина', "Описати їстівні частини й приготування або 'Неїстівна'"],
      ['Поживні речовини', 'Важливі вітаміни й мінерали'],
      ['Корм для тварин', 'Придатність як корм для домашніх або диких тварин'],
      ['Індикатор ґрунту', 'Що рослина показує про ґрунт'],
    ],
    compoundsTitle: '🧪 Активні речовини',
    compounds: [
      ['Активна речовина 1 (Назва)', 'Концентрація → Дія'],
      ['Активна речовина 2 (Назва)', 'Концентрація → Дія'],
      ['Мінерали', 'Перелічити важливі мінерали'],
    ],
  },
  'pt-BR': {
    overview: [
      'Nome comum',
      'Nome botânico',
      'Família',
      'Origem',
      'Forma de crescimento',
      'Tamanho',
      'Época de floração',
      'Ciclo de vida',
      'Destaque',
    ],
    care: [
      'Luz',
      'Faixa de temperatura',
      'Umidade do ar',
      'Substrato / Solo',
      'Rega',
      'Adubação',
      'Poda',
      'Replantio',
      'Suporte / Tutor',
      'Pragas comuns',
      'Doenças',
      'Observações especiais',
    ],
    dangersTitle: '⚠️ Perigos',
    dangers: [
      ['Toxicidade', 'Descrever toxicidade para humanos, cães e gatos'],
      ['Risco de confusão', 'Citar espécies semelhantes com as quais pode ser confundida'],
      ['Comportamento invasivo', 'Descrever o comportamento de propagação'],
    ],
    benefitsTitle: '🌿 Benefícios',
    benefits: [
      ['Planta comestível', "Descrever partes comestíveis e preparo, ou 'Não comestível'"],
      ['Nutrientes', 'Vitaminas e minerais importantes'],
      ['Alimento animal', 'Adequação como alimento para pets ou fauna silvestre'],
      ['Indicador de solo', 'O que a planta revela sobre o solo'],
    ],
    compoundsTitle: '🧪 Compostos ativos',
    compounds: [
      ['Composto ativo 1 (Nome)', 'Concentração → Efeito'],
      ['Composto ativo 2 (Nome)', 'Concentração → Efeito'],
      ['Minerais', 'Listar minerais importantes'],
    ],
  },
  'pt-PT': {
    overview: [
      'Nome comum',
      'Nome botânico',
      'Família',
      'Origem',
      'Forma de crescimento',
      'Tamanho',
      'Época de floração',
      'Ciclo de vida',
      'Destaque',
    ],
    care: [
      'Luz',
      'Intervalo de temperatura',
      'Humidade do ar',
      'Substrato / Solo',
      'Rega',
      'Adubação',
      'Poda',
      'Transplante',
      'Suporte / Tutor',
      'Pragas comuns',
      'Doenças',
      'Observações especiais',
    ],
    dangersTitle: '⚠️ Perigos',
    dangers: [
      ['Toxicidade', 'Descrever toxicidade para humanos, cães e gatos'],
      ['Risco de confusão', 'Indicar espécies semelhantes com as quais pode ser confundida'],
      ['Comportamento invasivo', 'Descrever o comportamento de propagação'],
    ],
    benefitsTitle: '🌿 Benefícios',
    benefits: [
      ['Planta comestível', "Descrever partes comestíveis e preparação, ou 'Não comestível'"],
      ['Nutrientes', 'Vitaminas e minerais importantes'],
      ['Alimento animal', 'Aptidão como alimento para animais de companhia ou fauna selvagem'],
      ['Indicador do solo', 'O que a planta revela sobre o solo'],
    ],
    compoundsTitle: '🧪 Compostos ativos',
    compounds: [
      ['Composto ativo 1 (Nome)', 'Concentração → Efeito'],
      ['Composto ativo 2 (Nome)', 'Concentração → Efeito'],
      ['Minerais', 'Listar minerais importantes'],
    ],
  },
  hi: {
    overview: [
      'सामान्य नाम',
      'वनस्पति नाम',
      'कुल',
      'उत्पत्ति',
      'विकास रूप',
      'आकार',
      'फूलने का समय',
      'जीवन अवधि',
      'मुख्य विशेषता',
    ],
    care: [
      'प्रकाश',
      'तापमान सीमा',
      'वायु आर्द्रता',
      'माध्यम / मिट्टी',
      'पानी देना',
      'खाद देना',
      'छंटाई',
      'दोबारा गमले में लगाना',
      'सहारा / ट्रेलिस',
      'सामान्य कीट',
      'रोग',
      'विशेष सुझाव',
    ],
    dangersTitle: '⚠️ जोखिम',
    dangers: [
      ['विषाक्तता', 'मनुष्यों, कुत्तों और बिल्लियों के लिए विषाक्तता बताएं'],
      ['भ्रम का जोखिम', 'उन मिलती-जुलती प्रजातियों का नाम दें जिनसे भ्रम हो सकता है'],
      ['आक्रामक फैलाव', 'फैलने के व्यवहार का वर्णन करें'],
    ],
    benefitsTitle: '🌿 लाभ',
    benefits: [
      ['खाद्य पौधा', "खाद्य भाग और तैयारी बताएं, या 'खाद्य नहीं'"],
      ['पोषक तत्व', 'महत्वपूर्ण विटामिन और खनिज'],
      ['पशु आहार', 'पालतू या वन्य जीवों के भोजन के रूप में उपयुक्तता'],
      ['मिट्टी संकेतक', 'यह पौधा मिट्टी के बारे में क्या बताता है'],
    ],
    compoundsTitle: '🧪 सक्रिय यौगिक',
    compounds: [
      ['सक्रिय यौगिक 1 (नाम)', 'सांद्रता → प्रभाव'],
      ['सक्रिय यौगिक 2 (नाम)', 'सांद्रता → प्रभाव'],
      ['खनिज', 'महत्वपूर्ण खनिज सूचीबद्ध करें'],
    ],
  },
  bn: {
    overview: [
      'সাধারণ নাম',
      'উদ্ভিদতাত্ত্বিক নাম',
      'পরিবার',
      'উৎপত্তি',
      'বৃদ্ধির ধরন',
      'আকার',
      'ফুলের সময়',
      'জীবনকাল',
      'বিশেষত্ব',
    ],
    care: [
      'আলো',
      'তাপমাত্রার পরিসর',
      'বাতাসের আর্দ্রতা',
      'সাবস্ট্রেট / মাটি',
      'পানি দেওয়া',
      'সার দেওয়া',
      'ছাঁটাই',
      'টব পরিবর্তন',
      'সহায়ক খুঁটি / ট্রেলিস',
      'সাধারণ পোকা',
      'রোগ',
      'বিশেষ নির্দেশনা',
    ],
    dangersTitle: '⚠️ ঝুঁকি',
    dangers: [
      ['বিষাক্ততা', 'মানুষ, কুকুর ও বিড়ালের জন্য বিষাক্ততা বর্ণনা করুন'],
      ['ভুল শনাক্তের ঝুঁকি', 'যেসব অনুরূপ প্রজাতির সঙ্গে গুলিয়ে যেতে পারে সেগুলোর নাম দিন'],
      ['আক্রমণাত্মক বিস্তার', 'বিস্তার আচরণ বর্ণনা করুন'],
    ],
    benefitsTitle: '🌿 উপকারিতা',
    benefits: [
      ['খাদ্যযোগ্য উদ্ভিদ', "খাদ্যযোগ্য অংশ ও প্রস্তুতি বর্ণনা করুন, অথবা 'খাদ্যযোগ্য নয়'"],
      ['পুষ্টি', 'গুরুত্বপূর্ণ ভিটামিন ও খনিজ'],
      ['প্রাণীর খাদ্য', 'পোষা বা বন্য প্রাণীর খাদ্য হিসেবে উপযোগিতা'],
      ['মাটির নির্দেশক', 'উদ্ভিদটি মাটি সম্পর্কে কী জানায়'],
    ],
    compoundsTitle: '🧪 সক্রিয় যৌগ',
    compounds: [
      ['সক্রিয় যৌগ ১ (নাম)', 'ঘনত্ব → প্রভাব'],
      ['সক্রিয় যৌগ ২ (নাম)', 'ঘনত্ব → প্রভাব'],
      ['খনিজ', 'গুরুত্বপূর্ণ খনিজ তালিকাভুক্ত করুন'],
    ],
  },
  ja: {
    overview: ['一般名', '学名', '科', '原産地', '生育型', '大きさ', '開花期', '寿命', '特徴'],
    care: [
      '光',
      '温度範囲',
      '湿度',
      '用土 / 土壌',
      '水やり',
      '施肥',
      '剪定',
      '植え替え',
      '支柱 / トレリス',
      'よくある害虫',
      '病気',
      '特記事項',
    ],
    dangersTitle: '⚠️ 注意点',
    dangers: [
      ['毒性', '人、犬、猫への毒性を説明する'],
      ['混同リスク', '混同しやすい類似種を挙げる'],
      ['侵略的な広がり', '広がり方を説明する'],
    ],
    benefitsTitle: '🌿 利点',
    benefits: [
      ['食用植物', '食べられる部位と調理法、または「食用不可」を説明する'],
      ['栄養素', '重要なビタミンとミネラル'],
      ['動物の餌', 'ペットや野生動物の餌としての適性'],
      ['土壌指標', 'その植物が土壌について示すこと'],
    ],
    compoundsTitle: '🧪 有効成分',
    compounds: [
      ['有効成分1（名称）', '濃度 → 作用'],
      ['有効成分2（名称）', '濃度 → 作用'],
      ['ミネラル', '重要なミネラルを列挙する'],
    ],
  },
  ko: {
    overview: ['일반명', '학명', '과', '원산지', '생장 형태', '크기', '개화 시기', '수명', '특징'],
    care: [
      '빛',
      '온도 범위',
      '습도',
      '배지 / 토양',
      '물주기',
      '비료 주기',
      '전정',
      '분갈이',
      '지지대 / 트렐리스',
      '흔한 해충',
      '질병',
      '특별 관리 사항',
    ],
    dangersTitle: '⚠️ 위험 요소',
    dangers: [
      ['독성', '사람, 개, 고양이에 대한 독성을 설명'],
      ['혼동 위험', '혼동하기 쉬운 유사 종을 언급'],
      ['침입성 생장', '퍼지는 행동을 설명'],
    ],
    benefitsTitle: '🌿 이점',
    benefits: [
      ['식용 식물', "식용 부위와 조리법 또는 '식용 불가' 설명"],
      ['영양소', '중요한 비타민과 미네랄'],
      ['동물 먹이', '반려동물 또는 야생동물 먹이로서의 적합성'],
      ['토양 지표', '식물이 토양 상태에 대해 알려주는 점'],
    ],
    compoundsTitle: '🧪 활성 성분',
    compounds: [
      ['활성 성분 1 (이름)', '농도 → 효과'],
      ['활성 성분 2 (이름)', '농도 → 효과'],
      ['미네랄', '중요한 미네랄 나열'],
    ],
  },
  'zh-Hans': {
    overview: ['常用名', '植物学名', '科属', '原产地', '生长类型', '大小', '花期', '寿命', '亮点'],
    care: [
      '光照',
      '温度范围',
      '空气湿度',
      '基质 / 土壤',
      '浇水',
      '施肥',
      '修剪',
      '换盆',
      '支撑 / 花架',
      '常见害虫',
      '病害',
      '特别提示',
    ],
    dangersTitle: '⚠️ 风险',
    dangers: [
      ['毒性', '描述对人、狗和猫的毒性'],
      ['混淆风险', '列出容易混淆的相似物种'],
      ['入侵性行为', '描述扩散行为'],
    ],
    benefitsTitle: '🌿 益处',
    benefits: [
      ['可食用植物', '描述可食用部位和做法，或注明“不可食用”'],
      ['营养成分', '重要维生素和矿物质'],
      ['动物饲料', '作为宠物或野生动物饲料的适宜性'],
      ['土壤指示植物', '该植物反映的土壤状况'],
    ],
    compoundsTitle: '🧪 活性成分',
    compounds: [
      ['活性成分1（名称）', '浓度 → 作用'],
      ['活性成分2（名称）', '浓度 → 作用'],
      ['矿物质', '列出重要矿物质'],
    ],
  },
  id: {
    overview: [
      'Nama umum',
      'Nama botani',
      'Famili',
      'Asal',
      'Tipe pertumbuhan',
      'Ukuran',
      'Musim berbunga',
      'Umur',
      'Sorotan',
    ],
    care: [
      'Cahaya',
      'Rentang suhu',
      'Kelembapan udara',
      'Media / Tanah',
      'Penyiraman',
      'Pemupukan',
      'Pemangkasan',
      'Pindah pot',
      'Penyangga / Terali',
      'Hama umum',
      'Penyakit',
      'Catatan khusus',
    ],
    dangersTitle: '⚠️ Bahaya',
    dangers: [
      ['Toksisitas', 'Jelaskan toksisitas bagi manusia, anjing, dan kucing'],
      ['Risiko tertukar', 'Sebutkan spesies mirip yang dapat tertukar'],
      ['Perilaku invasif', 'Jelaskan perilaku penyebaran'],
    ],
    benefitsTitle: '🌿 Manfaat',
    benefits: [
      [
        'Tanaman pangan',
        "Jelaskan bagian yang dapat dimakan dan persiapannya, atau 'Tidak dapat dimakan'",
      ],
      ['Nutrisi', 'Vitamin dan mineral penting'],
      ['Pakan hewan', 'Kesesuaian sebagai pakan untuk hewan peliharaan atau satwa liar'],
      ['Indikator tanah', 'Apa yang diungkapkan tanaman tentang tanah'],
    ],
    compoundsTitle: '🧪 Senyawa aktif',
    compounds: [
      ['Senyawa aktif 1 (Nama)', 'Konsentrasi → Efek'],
      ['Senyawa aktif 2 (Nama)', 'Konsentrasi → Efek'],
      ['Mineral', 'Daftar mineral penting'],
    ],
  },
  ar: {
    overview: [
      'الاسم الشائع',
      'الاسم النباتي',
      'الفصيلة',
      'الأصل',
      'شكل النمو',
      'الحجم',
      'موسم الإزهار',
      'مدة الحياة',
      'ميزة بارزة',
    ],
    care: [
      'الضوء',
      'نطاق الحرارة',
      'رطوبة الهواء',
      'الوسط / التربة',
      'الري',
      'التسميد',
      'التقليم',
      'إعادة الزراعة',
      'دعامة / تعريشة',
      'الآفات الشائعة',
      'الأمراض',
      'ملاحظات خاصة',
    ],
    dangersTitle: '⚠️ المخاطر',
    dangers: [
      ['السمية', 'وصف السمية للإنسان والكلاب والقطط'],
      ['خطر الالتباس', 'ذكر الأنواع المشابهة التي قد تختلط بها'],
      ['السلوك الغازي', 'وصف سلوك الانتشار'],
    ],
    benefitsTitle: '🌿 الفوائد',
    benefits: [
      ['نبات صالح للأكل', "وصف الأجزاء الصالحة للأكل وطريقة التحضير، أو 'غير صالح للأكل'"],
      ['العناصر الغذائية', 'الفيتامينات والمعادن المهمة'],
      ['علف للحيوانات', 'مدى ملاءمته كغذاء للحيوانات الأليفة أو البرية'],
      ['مؤشر للتربة', 'ما يكشفه النبات عن حالة التربة'],
    ],
    compoundsTitle: '🧪 المركبات الفعالة',
    compounds: [
      ['المركب الفعال 1 (الاسم)', 'التركيز → التأثير'],
      ['المركب الفعال 2 (الاسم)', 'التركيز → التأثير'],
      ['المعادن', 'سرد المعادن المهمة'],
    ],
  },
  he: {
    overview: [
      'שם נפוץ',
      'שם בוטני',
      'משפחה',
      'מוצא',
      'צורת צמיחה',
      'גודל',
      'עונת פריחה',
      'משך חיים',
      'מאפיין בולט',
    ],
    care: [
      'אור',
      'טווח טמפרטורות',
      'לחות אוויר',
      'מצע / קרקע',
      'השקיה',
      'דישון',
      'גיזום',
      'העברה לעציץ',
      'תמיכה / סבכה',
      'מזיקים נפוצים',
      'מחלות',
      'הערות מיוחדות',
    ],
    dangersTitle: '⚠️ סיכונים',
    dangers: [
      ['רעילות', 'לתאר רעילות לבני אדם, כלבים וחתולים'],
      ['סכנת בלבול', 'לציין מינים דומים שניתן לבלבל איתם'],
      ['התנהגות פולשנית', 'לתאר את אופן ההתפשטות'],
    ],
    benefitsTitle: '🌿 תועלות',
    benefits: [
      ['צמח אכיל', "לתאר חלקים אכילים והכנה, או 'לא אכיל'"],
      ['רכיבים תזונתיים', 'ויטמינים ומינרלים חשובים'],
      ['מזון לבעלי חיים', 'התאמה כמזון לחיות מחמד או לחיות בר'],
      ['מדד לקרקע', 'מה הצמח מגלה על הקרקע'],
    ],
    compoundsTitle: '🧪 חומרים פעילים',
    compounds: [
      ['חומר פעיל 1 (שם)', 'ריכוז → השפעה'],
      ['חומר פעיל 2 (שם)', 'ריכוז → השפעה'],
      ['מינרלים', 'לפרט מינרלים חשובים'],
    ],
  },
  fa: {
    overview: [
      'نام رایج',
      'نام گیاه‌شناسی',
      'تیره',
      'خاستگاه',
      'فرم رشد',
      'اندازه',
      'زمان گل‌دهی',
      'طول عمر',
      'ویژگی برجسته',
    ],
    care: [
      'نور',
      'دامنه دما',
      'رطوبت هوا',
      'بستر / خاک',
      'آبیاری',
      'کوددهی',
      'هرس',
      'تعویض گلدان',
      'تکیه‌گاه / داربست',
      'آفات رایج',
      'بیماری‌ها',
      'نکات ویژه',
    ],
    dangersTitle: '⚠️ خطرات',
    dangers: [
      ['سمیت', 'سمیت برای انسان، سگ و گربه را شرح دهید'],
      ['خطر اشتباه گرفتن', 'گونه‌های مشابهی را که ممکن است اشتباه گرفته شوند نام ببرید'],
      ['رفتار مهاجم', 'رفتار گسترش را توضیح دهید'],
    ],
    benefitsTitle: '🌿 فواید',
    benefits: [
      ['گیاه خوراکی', "بخش‌های خوراکی و روش آماده‌سازی را شرح دهید، یا 'خوراکی نیست'"],
      ['مواد مغذی', 'ویتامین‌ها و مواد معدنی مهم'],
      ['خوراک حیوانات', 'مناسب بودن به‌عنوان خوراک حیوانات خانگی یا حیات‌وحش'],
      ['شاخص خاک', 'این گیاه درباره خاک چه نشان می‌دهد'],
    ],
    compoundsTitle: '🧪 ترکیبات فعال',
    compounds: [
      ['ترکیب فعال ۱ (نام)', 'غلظت → اثر'],
      ['ترکیب فعال ۲ (نام)', 'غلظت → اثر'],
      ['مواد معدنی', 'مواد معدنی مهم را فهرست کنید'],
    ],
  },
  ur: {
    overview: [
      'عام نام',
      'نباتاتی نام',
      'خاندان',
      'اصل مقام',
      'نشوونما کی قسم',
      'سائز',
      'پھول آنے کا موسم',
      'عمر',
      'نمایاں خصوصیت',
    ],
    care: [
      'روشنی',
      'درجہ حرارت کی حد',
      'ہوا کی نمی',
      'سبسٹریٹ / مٹی',
      'پانی دینا',
      'کھاد دینا',
      'کٹائی',
      'گملا بدلنا',
      'سہارا / ٹریلس',
      'عام کیڑے',
      'بیماریاں',
      'خاص ہدایات',
    ],
    dangersTitle: '⚠️ خطرات',
    dangers: [
      ['زہریلا پن', 'انسانوں، کتوں اور بلیوں کے لیے زہریلا پن بیان کریں'],
      ['غلط شناخت کا خطرہ', 'ملتی جلتی اقسام بتائیں جن سے الجھن ہو سکتی ہے'],
      ['حملہ آور پھیلاؤ', 'پھیلنے کے رویے کی وضاحت کریں'],
    ],
    benefitsTitle: '🌿 فوائد',
    benefits: [
      ['خوراکی پودا', "خوراکی حصے اور تیاری بیان کریں، یا 'خوراکی نہیں'"],
      ['غذائی اجزا', 'اہم وٹامنز اور معدنیات'],
      ['جانوروں کی خوراک', 'پالتو یا جنگلی جانوروں کی خوراک کے طور پر موزونیت'],
      ['مٹی کا اشارہ', 'یہ پودا مٹی کے بارے میں کیا ظاہر کرتا ہے'],
    ],
    compoundsTitle: '🧪 فعال مرکبات',
    compounds: [
      ['فعال مرکب 1 (نام)', 'ارتکاز → اثر'],
      ['فعال مرکب 2 (نام)', 'ارتکاز → اثر'],
      ['معدنیات', 'اہم معدنیات درج کریں'],
    ],
  },
};

function entriesToObject(entries: readonly DetailEntry[]): Record<string, string> {
  return Object.fromEntries(entries);
}

function buildDetailsSchema(labels: DetailSchemaLabels): string {
  return JSON.stringify(
    {
      overview: Object.fromEntries(labels.overview.map((label) => [label, '...'])),
      care: Object.fromEntries(labels.care.map((label) => [label, '...'])),
      properties: {
        dangers: {
          _title: labels.dangersTitle,
          ...entriesToObject(labels.dangers),
        },
        benefits: {
          _title: labels.benefitsTitle,
          ...entriesToObject(labels.benefits),
        },
        compounds: {
          _title: labels.compoundsTitle,
          ...entriesToObject(labels.compounds),
        },
      },
    },
    null,
    2
  );
}

const DETAILS_SCHEMA_BY_LANGUAGE: Record<SupportedLanguage, string> = Object.fromEntries(
  Object.entries(DETAIL_SCHEMA_LABELS).map(([language, labels]) => [
    language,
    buildDetailsSchema(labels),
  ])
) as Record<SupportedLanguage, string>;

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(
  body: Record<string, any>,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Resolve species_id from direct input or by canonical_name lookup.
 * Returns { speciesId, canonical } or null if species not found.
 */
async function resolveSpecies(
  serviceClient: any,
  speciesIdInput: string | undefined,
  plantName: string
): Promise<{ speciesId: string; canonical: string } | null> {
  // 1. Direkt per species_id
  if (speciesIdInput) {
    const { data } = await serviceClient
      .from('species')
      .select('id, canonical_name')
      .eq('id', speciesIdInput)
      .maybeSingle();
    if (data) return { speciesId: data.id, canonical: data.canonical_name };
  }

  // 2. Fallback: canonical_name Lookup
  const canonical = plantName.trim().toLowerCase();
  if (!canonical) return null;

  const { data } = await serviceClient
    .from('species')
    .select('id, canonical_name')
    .eq('canonical_name', canonical)
    .maybeSingle();

  return data ? { speciesId: data.id, canonical: data.canonical_name } : null;
}

/**
 * Cache-Lookup in species_details.
 */
async function getCachedDetails(
  serviceClient: any,
  speciesId: string,
  language: SupportedLanguage
): Promise<any | null> {
  const { data } = await serviceClient
    .from('species_details')
    .select('details')
    .eq('species_id', speciesId)
    .eq('language', language)
    .maybeSingle();

  return data?.details ?? null;
}

/**
 * Write-Through: Upsert Details in species_details-Cache.
 * ON CONFLICT → DO NOTHING (erster Schreiber gewinnt).
 */
async function writeCacheEntry(
  serviceClient: any,
  speciesId: string,
  language: SupportedLanguage,
  details: any,
  model: string,
  overwrite = false
): Promise<void> {
  const { error } = await serviceClient.from('species_details').upsert(
    {
      species_id: speciesId,
      language,
      details,
      model,
      schema_version: 1,
      generated_at: new Date().toISOString(),
      generated_by: 'ai',
    },
    { onConflict: 'species_id,language', ignoreDuplicates: !overwrite }
  );

  if (error) {
    // Non-critical: Cache-Write scheitert → nächster User generiert erneut
    console.error('species_details cache write failed:', error.message);
  }
}

// ── Main Handler ────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const blockedOrigin = rejectDisallowedOrigin(req, corsHeaders);
  if (blockedOrigin) return blockedOrigin;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Nicht authentifiziert' }, corsHeaders, 401);
    }

    const serviceClient = getServiceClient();
    const userId = await getUserIdFromAuth(serviceClient, authHeader);

    const {
      name,
      note,
      language: requestedLanguage,
      species_id: speciesIdInput,
      force_refresh: forceRefresh,
    } = await req.json();

    // Input-Validierung (VOR Credit-Abzug)
    const vErr = validationErrorResponse(
      [validateText(name, 200, 'name'), validateText(note, 500, 'note')],
      corsHeaders
    );
    if (vErr) return vErr;

    if (!name) {
      return jsonResponse({ error: 'Pflanzenname fehlt' }, corsHeaders, 400);
    }

    const language = validateLanguage(requestedLanguage);
    const resolvedLanguage = await getUserLanguage(serviceClient, userId, language);

    // ── Step 1: Species auflösen ──────────────────────────────────────

    const species = await resolveSpecies(serviceClient, speciesIdInput, name);

    // ── Step 2: Cache-Lookup (VOR Credits, VOR Rate-Limit) ────────────
    // Skip cache when force_refresh is requested (e.g. schema migration)

    if (species && !forceRefresh) {
      const cached = await getCachedDetails(serviceClient, species.speciesId, resolvedLanguage);
      if (cached) {
        // Cache-Hit → sofort zurück, 0 Credits
        // Balance trotzdem lesen für UI-Konsistenz
        const { data: balRow } = await serviceClient
          .from('credit_balances')
          .select('balance')
          .eq('user_id', userId)
          .maybeSingle();

        return jsonResponse(
          {
            details: cached,
            balance: balRow?.balance ?? 0,
            credits_used: 0,
            source: 'dex_cache',
          },
          corsHeaders
        );
      }
    }

    // ── Step 3: Cache-Miss → Rate Limit + Credits ─────────────────────

    const rateLimitResp = await checkRateLimit(serviceClient, userId, 'plant_details', corsHeaders);
    if (rateLimitResp) return rateLimitResp;

    const cost = CREDIT_COSTS.plant_details;
    let newBalance: number;
    try {
      newBalance = await deductCreditsAtomic(serviceClient, userId, cost);
    } catch (e: any) {
      if (e.code === 'INSUFFICIENT_CREDITS') {
        return jsonResponse(
          {
            error: 'Nicht genügend Credits',
            balance: e.balance,
            required: e.required,
          },
          corsHeaders,
          402
        );
      }
      throw e;
    }

    // ── Step 4: Double-Check nach Deduct (Race-Condition-Schutz) ──────
    //
    // Zwischen Cache-Lookup und Credit-Deduct könnte ein paralleler
    // Request den Cache bereits gefüllt haben. Kurz prüfen.

    if (species && !forceRefresh) {
      const doubleCheck = await getCachedDetails(
        serviceClient,
        species.speciesId,
        resolvedLanguage
      );
      if (doubleCheck) {
        // Anderer Request hat zwischenzeitlich gecacht → Refund + Return
        await refundCredits(serviceClient, userId, cost);
        return jsonResponse(
          {
            details: doubleCheck,
            balance: newBalance + cost,
            credits_used: 0,
            source: 'dex_cache',
          },
          corsHeaders
        );
      }
    }

    // ── Step 5: OpenAI Call ────────────────────────────────────────────

    const languagePromptName = getLanguagePromptName(resolvedLanguage);
    const schema = DETAILS_SCHEMA_BY_LANGUAGE[resolvedLanguage];

    // Security/quality hardening:
    // If species is resolved, always generate against canonical species name
    // and ignore user note hints to avoid poisoning shared cache entries.
    const { generationName, generationHint, requestedName } = buildGenerationContext({
      requestedName: name,
      note,
      canonicalName: species?.canonical,
    });

    const prompt = `Create plant details for "${generationName}" (hint: "${generationHint}") and return ONLY one JSON object in EXACTLY this schema:

${schema}

Rules:
- Write all content strictly in ${languagePromptName}.
- Output one language only (no bilingual text, no translations).
- Keep top-level keys exactly: overview, care, properties.
- No markdown, no comments, no explanations.`;

    let result;
    try {
      result = await callOpenAI({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      });
    } catch (e) {
      await refundCredits(serviceClient, userId, cost);
      throw e;
    }

    // ── Step 6: Parse + Log ───────────────────────────────────────────

    await logUsage(serviceClient, {
      user_id: userId,
      action: 'plant_details',
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      total_tokens: result.total_tokens,
      cost_credits: cost,
      openai_cost_usd: result.cost_usd,
      model: result.model,
      metadata: {
        plant_name: generationName,
        requested_name: requestedName,
        language: resolvedLanguage,
        species_id: species?.speciesId ?? null,
        source: 'llm',
      },
    });

    let details;
    try {
      const cleaned = result.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      details = JSON.parse(cleaned);
    } catch {
      details = null;
    }

    // ── Step 7: Write-Through Cache ───────────────────────────────────

    if (species && details) {
      // Async, non-blocking – Fehler hier ist nicht kritisch
      writeCacheEntry(
        serviceClient,
        species.speciesId,
        resolvedLanguage,
        details,
        result.model,
        !!forceRefresh
      ).catch((e) => console.error('Cache write-through error:', e?.message));
    }

    // ── Step 8: Response ──────────────────────────────────────────────

    return jsonResponse(
      {
        details,
        balance: newBalance,
        credits_used: cost,
        source: 'llm',
      },
      corsHeaders
    );
  } catch (e: any) {
    const status = e?.code === 'UNAUTHORIZED' ? 401 : 500;
    return jsonResponse({ error: e.message || 'Unbekannter Fehler' }, corsHeaders, status);
  }
});
