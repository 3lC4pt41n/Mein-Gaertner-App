import { Resend } from "npm:resend@4.0.0";
import { getCorsHeaders, rejectDisallowedOrigin } from "../_shared/cors.ts";

type SupportedLanguage =
  | "de"
  | "en"
  | "fr"
  | "it"
  | "es"
  | "ru"
  | "tr"
  | "nl"
  | "da"
  | "pl"
  | "uk"
  | "pt-BR"
  | "pt-PT"
  | "hi"
  | "bn"
  | "ja"
  | "ko"
  | "zh-Hans"
  | "id"
  | "ar"
  | "he"
  | "fa"
  | "ur";

type WaitlistPayload = {
  email?: string;
  language?: string;
  source?: string;
  page_url?: string;
  website?: string;
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");
const FROM_EMAIL = Deno.env.get("SEND_EMAIL_FROM") ||
  "FloraScout <noreply@florascout.app>";
const WAITLIST_NOTIFY_TO = Deno.env.get("WAITLIST_NOTIFY_TO") ||
  "tim.mergenthaler@florascout.app";
const ANDROID_GOOGLE_GROUP_EMAIL = Deno.env.get("ANDROID_GOOGLE_GROUP_EMAIL") ||
  Deno.env.get("GOOGLE_GROUP_EMAIL") || "";
const ANDROID_INVITE_URL = Deno.env.get("ANDROID_INVITE_URL") || "";
const GOOGLE_DIRECTORY_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.group.member";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type GoogleServiceAccount = {
  client_email?: string;
  private_key?: string;
};

const COPY: Record<
  SupportedLanguage,
  {
    adminSubject: string;
    userSubject: string;
    userTitle: string;
    userBody: string;
    userCta: string;
    userNote: string;
    userFooter: string;
  }
> = {
  de: {
    adminSubject: "Neue Android-Warteliste",
    userSubject: "Deine FloraScout Android-Einladung",
    userTitle: "Du bist fuer die Android-Beta freigeschaltet.",
    userBody:
      "Ich habe deine E-Mail zur Google-Testergruppe hinzugefuegt. Oeffne den Link unten mit demselben Google-Konto, um der Beta beizutreten.",
    userCta: "Android-Beta oeffnen",
    userNote:
      "Wenn Google Play noch kurz synchronisiert, probiere den Link nach ein paar Minuten erneut.",
    userFooter:
      "Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.",
  },
  en: {
    adminSubject: "New Android waitlist signup",
    userSubject: "Your FloraScout Android invitation",
    userTitle: "You are enabled for the Android beta.",
    userBody:
      "I added your email to the Google tester group. Open the link below with the same Google account to join the beta.",
    userCta: "Open Android beta",
    userNote:
      "If Google Play still needs to sync, try the link again after a few minutes.",
    userFooter: "If this was not you, you can ignore this email.",
  },
  fr: {
    adminSubject: "Nouvelle inscription liste Android",
    userSubject: "Votre invitation Android FloraScout",
    userTitle: "Vous avez acces a la beta Android.",
    userBody:
      "Votre e-mail a ete ajoute au groupe de test Google. Ouvrez le lien ci-dessous avec le meme compte Google pour rejoindre la beta.",
    userCta: "Ouvrir la beta Android",
    userNote:
      "Si Google Play doit encore se synchroniser, reessayez le lien dans quelques minutes.",
    userFooter:
      "Si cette demande ne vient pas de vous, vous pouvez ignorer cet e-mail.",
  },
  it: {
    adminSubject: "Nuova iscrizione lista Android",
    userSubject: "Il tuo invito Android FloraScout",
    userTitle: "Hai accesso alla beta Android.",
    userBody:
      "Ho aggiunto la tua e-mail al gruppo tester di Google. Apri il link qui sotto con lo stesso account Google per entrare nella beta.",
    userCta: "Apri la beta Android",
    userNote:
      "Se Google Play deve ancora sincronizzarsi, riprova il link tra qualche minuto.",
    userFooter: "Se non sei stato tu, puoi ignorare questa e-mail.",
  },
  es: {
    adminSubject: "Nuevo registro en lista Android",
    userSubject: "Tu invitacion Android de FloraScout",
    userTitle: "Ya tienes acceso a la beta de Android.",
    userBody:
      "He añadido tu correo al grupo de testers de Google. Abre el enlace de abajo con la misma cuenta de Google para unirte a la beta.",
    userCta: "Abrir beta de Android",
    userNote:
      "Si Google Play aun se esta sincronizando, vuelve a probar el enlace en unos minutos.",
    userFooter: "Si esta solicitud no fue tuya, puedes ignorar este correo.",
  },
  ru: {
    adminSubject: "Новая заявка в лист ожидания Android",
    userSubject: "Ваше приглашение FloraScout Android",
    userTitle: "Вам открыт доступ к Android-бете.",
    userBody:
      "Я добавил ваш e-mail в Google-группу тестировщиков. Откройте ссылку ниже тем же Google-аккаунтом, чтобы присоединиться к бете.",
    userCta: "Открыть Android-бету",
    userNote:
      "Если Google Play еще синхронизируется, попробуйте ссылку снова через несколько минут.",
    userFooter: "Если это были не вы, просто проигнорируйте это письмо.",
  },
  tr: {
    adminSubject: "Yeni Android bekleme listesi kaydi",
    userSubject: "FloraScout Android davetin",
    userTitle: "Android betasi icin erisim actik.",
    userBody:
      "E-posta adresini Google tester grubuna ekledim. Betaya katilmak icin asagidaki baglantiyi ayni Google hesabi ile ac.",
    userCta: "Android betayi ac",
    userNote:
      "Google Play henuz senkronize olmadiysa baglantiyi birkac dakika sonra tekrar dene.",
    userFooter: "Bu talep senden gelmediyse bu e-postayi goz ardi edebilirsin.",
  },
  nl: {
    adminSubject: "Nieuwe Android-wachtlijst",
    userSubject: "Je FloraScout Android-uitnodiging",
    userTitle: "Je hebt toegang tot de Android-beta.",
    userBody:
      "Ik heb je e-mail toegevoegd aan de Google-testgroep. Open de link hieronder met hetzelfde Google-account om mee te doen aan de beta.",
    userCta: "Android-beta openen",
    userNote:
      "Als Google Play nog synchroniseert, probeer de link over een paar minuten opnieuw.",
    userFooter: "Als jij dit niet was, kun je deze e-mail negeren.",
  },
  da: {
    adminSubject: "Ny Android-venteliste",
    userSubject: "Din FloraScout Android-invitation",
    userTitle: "Du har adgang til Android-betaen.",
    userBody:
      "Jeg har tilfoejet din e-mail til Googles testgruppe. Aabn linket nedenfor med den samme Google-konto for at deltage i betaen.",
    userCta: "Aabn Android-beta",
    userNote:
      "Hvis Google Play stadig synkroniserer, saa proev linket igen om et par minutter.",
    userFooter: "Hvis det ikke var dig, kan du ignorere denne e-mail.",
  },
  pl: {
    adminSubject: "Nowy zapis na liste Android",
    userSubject: "Twoje zaproszenie Android FloraScout",
    userTitle: "Masz dostep do bety Android.",
    userBody:
      "Dodalam Twoj e-mail do grupy testerow Google. Otworz link ponizej tym samym kontem Google, aby dolaczyc do bety.",
    userCta: "Otworz bete Android",
    userNote:
      "Jesli Google Play nadal sie synchronizuje, sproboj ponownie za kilka minut.",
    userFooter:
      "Jesli to nie Ty wyslales te prosbe, mozesz zignorowac te wiadomosc.",
  },
  uk: {
    adminSubject: "Нова заявка Android",
    userSubject: "Ваше запрошення FloraScout Android",
    userTitle: "Вам відкрито доступ до Android-бети.",
    userBody:
      "Я додав вашу електронну адресу до Google-групи тестувальників. Відкрийте посилання нижче тим самим Google-акаунтом, щоб приєднатися до бети.",
    userCta: "Відкрити Android-бету",
    userNote:
      "Якщо Google Play ще синхронізується, спробуйте посилання ще раз за кілька хвилин.",
    userFooter: "Якщо це були не ви, просто проігноруйте цей лист.",
  },
  "pt-BR": {
    adminSubject: "Novo cadastro na lista Android",
    userSubject: "Seu convite Android do FloraScout",
    userTitle: "Voce tem acesso ao beta para Android.",
    userBody:
      "Adicionei seu e-mail ao grupo de testadores do Google. Abra o link abaixo com a mesma Conta Google para participar do beta.",
    userCta: "Abrir beta do Android",
    userNote:
      "Se o Google Play ainda estiver sincronizando, tente o link novamente em alguns minutos.",
    userFooter: "Se nao foi voce, pode ignorar este e-mail.",
  },
  "pt-PT": {
    adminSubject: "Novo registo na lista Android",
    userSubject: "O teu convite Android do FloraScout",
    userTitle: "Tens acesso ao beta para Android.",
    userBody:
      "Adicionei o teu e-mail ao grupo de testadores da Google. Abre o link abaixo com a mesma Conta Google para aderires ao beta.",
    userCta: "Abrir beta do Android",
    userNote:
      "Se o Google Play ainda estiver a sincronizar, tenta o link novamente dentro de alguns minutos.",
    userFooter: "Se nao foste tu, podes ignorar este e-mail.",
  },
  hi: {
    adminSubject: "नई Android प्रतीक्षा सूची",
    userSubject: "आपका FloraScout Android निमंत्रण",
    userTitle: "आपको Android beta के लिए सक्षम कर दिया गया है।",
    userBody:
      "आपका ईमेल Google tester group में जोड़ दिया गया है। beta में शामिल होने के लिए नीचे दिया गया लिंक उसी Google खाते से खोलें।",
    userCta: "Android beta खोलें",
    userNote:
      "अगर Google Play अभी sync कर रहा है, तो कुछ मिनट बाद लिंक फिर से खोलें।",
    userFooter: "अगर यह आपने नहीं किया, तो आप इस ईमेल को अनदेखा कर सकते हैं।",
  },
  bn: {
    adminSubject: "নতুন Android অপেক্ষা তালিকা",
    userSubject: "আপনার FloraScout Android আমন্ত্রণ",
    userTitle: "আপনাকে Android beta-এর জন্য সক্রিয় করা হয়েছে।",
    userBody:
      "আপনার ইমেল Google tester group-এ যোগ করা হয়েছে। beta-তে যোগ দিতে একই Google অ্যাকাউন্ট দিয়ে নিচের লিংকটি খুলুন।",
    userCta: "Android beta খুলুন",
    userNote: "Google Play sync করতে সময় নিলে কয়েক মিনিট পরে আবার চেষ্টা করুন।",
    userFooter: "এটি আপনি না করলে, এই ইমেলটি উপেক্ষা করতে পারেন।",
  },
  ja: {
    adminSubject: "新しいAndroid待機リスト登録",
    userSubject: "FloraScout Androidへの招待",
    userTitle: "Androidベータへのアクセスが有効になりました。",
    userBody:
      "あなたのメールアドレスをGoogleテスターグループに追加しました。下のリンクを同じGoogleアカウントで開いてベータに参加してください。",
    userCta: "Androidベータを開く",
    userNote:
      "Google Playの同期に少し時間がかかる場合は、数分後にもう一度お試しください。",
    userFooter: "心当たりがない場合は、このメールを無視してください。",
  },
  ko: {
    adminSubject: "새 Android 대기자 등록",
    userSubject: "FloraScout Android 초대장",
    userTitle: "Android 베타 접근 권한이 활성화되었습니다.",
    userBody:
      "이메일을 Google 테스터 그룹에 추가했습니다. 아래 링크를 같은 Google 계정으로 열어 베타에 참여하세요.",
    userCta: "Android 베타 열기",
    userNote: "Google Play 동기화가 아직 진행 중이면 몇 분 후 다시 시도하세요.",
    userFooter: "본인이 요청하지 않았다면 이 이메일을 무시해도 됩니다.",
  },
  "zh-Hans": {
    adminSubject: "新的 Android 候补名单",
    userSubject: "你的 FloraScout Android 邀请",
    userTitle: "你已获得 Android beta 测试资格。",
    userBody:
      "我已将你的邮箱加入 Google 测试者群组。请使用同一个 Google 账号打开下面的链接加入 beta。",
    userCta: "打开 Android beta",
    userNote: "如果 Google Play 仍在同步，请几分钟后再试一次。",
    userFooter: "如果这不是你本人操作，可以忽略这封邮件。",
  },
  id: {
    adminSubject: "Daftar tunggu Android baru",
    userSubject: "Undangan Android FloraScout Anda",
    userTitle: "Anda sudah mendapatkan akses beta Android.",
    userBody:
      "Email Anda sudah ditambahkan ke grup tester Google. Buka tautan di bawah dengan akun Google yang sama untuk bergabung ke beta.",
    userCta: "Buka beta Android",
    userNote:
      "Jika Google Play masih sinkronisasi, coba tautan ini lagi setelah beberapa menit.",
    userFooter: "Jika ini bukan Anda, abaikan email ini.",
  },
  ar: {
    adminSubject: "تسجيل جديد في قائمة Android",
    userSubject: "دعوتك إلى FloraScout Android",
    userTitle: "تم تفعيل وصولك إلى النسخة التجريبية على Android.",
    userBody:
      "تمت إضافة بريدك الإلكتروني إلى مجموعة مختبري Google. افتح الرابط أدناه باستخدام حساب Google نفسه للانضمام إلى النسخة التجريبية.",
    userCta: "فتح نسخة Android التجريبية",
    userNote:
      "إذا كان Google Play ما زال يزامن، جرّب الرابط مرة أخرى بعد بضع دقائق.",
    userFooter: "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.",
  },
  he: {
    adminSubject: "הרשמה חדשה לרשימת Android",
    userSubject: "ההזמנה שלך ל-FloraScout Android",
    userTitle: "הגישה שלך לבטא של Android הופעלה.",
    userBody:
      "הוספתי את כתובת האימייל שלך לקבוצת הבודקים של Google. פתח את הקישור למטה עם אותו חשבון Google כדי להצטרף לבטא.",
    userCta: "פתיחת בטא Android",
    userNote: "אם Google Play עדיין מסתנכרן, נסה שוב בעוד כמה דקות.",
    userFooter: "אם לא ביקשת זאת, אפשר להתעלם מהאימייל הזה.",
  },
  fa: {
    adminSubject: "ثبت‌نام جدید فهرست Android",
    userSubject: "دعوت FloraScout Android شما",
    userTitle: "دسترسی شما به نسخه بتای Android فعال شد.",
    userBody:
      "ایمیل شما به گروه آزمایش‌کنندگان Google اضافه شد. برای پیوستن به نسخه بتا، لینک زیر را با همان حساب Google باز کنید.",
    userCta: "باز کردن بتای Android",
    userNote:
      "اگر Google Play هنوز در حال همگام‌سازی است، چند دقیقه بعد دوباره لینک را امتحان کنید.",
    userFooter:
      "اگر شما این درخواست را نداده‌اید، می‌توانید این ایمیل را نادیده بگیرید.",
  },
  ur: {
    adminSubject: "نئی Android انتظار فہرست",
    userSubject: "آپ کی FloraScout Android دعوت",
    userTitle: "آپ کو Android beta کے لیے فعال کر دیا گیا ہے۔",
    userBody:
      "آپ کا ای میل Google tester group میں شامل کر دیا گیا ہے۔ beta میں شامل ہونے کے لیے نیچے والا لنک اسی Google اکاؤنٹ سے کھولیں۔",
    userCta: "Android beta کھولیں",
    userNote:
      "اگر Google Play ابھی sync کر رہا ہے تو چند منٹ بعد دوبارہ کوشش کریں۔",
    userFooter: "اگر یہ آپ نے نہیں کیا تو اس ای میل کو نظر انداز کر سکتے ہیں۔",
  },
};

function normalizeLanguage(input?: string | null): SupportedLanguage {
  const normalized = String(input || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();

  const aliases: Record<string, SupportedLanguage> = {
    de: "de",
    en: "en",
    fr: "fr",
    it: "it",
    es: "es",
    ru: "ru",
    tr: "tr",
    nl: "nl",
    da: "da",
    pl: "pl",
    uk: "uk",
    "pt-br": "pt-BR",
    "pt-pt": "pt-PT",
    pt: "pt-BR",
    hi: "hi",
    bn: "bn",
    ja: "ja",
    ko: "ko",
    "zh-hans": "zh-Hans",
    zh: "zh-Hans",
    id: "id",
    ar: "ar",
    he: "he",
    iw: "he",
    fa: "fa",
    ur: "ur",
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  const baseCode = normalized.split("-")[0];
  return aliases[baseCode] || "de";
}

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getGoogleServiceAccount(): GoogleServiceAccount {
  const rawJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

  if (rawJson) {
    try {
      return JSON.parse(rawJson) as GoogleServiceAccount;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  return {
    client_email: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") || undefined,
    private_key: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") ||
      undefined,
  };
}

function assertAndroidFlowConfigured() {
  const serviceAccount = getGoogleServiceAccount();
  const delegatedAdmin = Deno.env.get("GOOGLE_WORKSPACE_ADMIN_EMAIL");

  if (!ANDROID_GOOGLE_GROUP_EMAIL) {
    throw new Error("ANDROID_GOOGLE_GROUP_EMAIL is not configured");
  }

  if (!ANDROID_INVITE_URL) {
    throw new Error("ANDROID_INVITE_URL is not configured");
  }

  if (
    !serviceAccount.client_email || !serviceAccount.private_key ||
    !delegatedAdmin
  ) {
    throw new Error(
      "Google Workspace service account is not configured. Required: GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, plus GOOGLE_WORKSPACE_ADMIN_EMAIL.",
    );
  }

  return { serviceAccount, delegatedAdmin };
}

function base64UrlEncode(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function privateKeyToArrayBuffer(privateKey: string): ArrayBuffer {
  const normalizedKey = privateKey.replace(/\\n/g, "\n");
  const pemBody = normalizedKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(pemBody);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function signJwt(
  payload: Record<string, string | number>,
  privateKey: string,
): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken),
  );

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function getGoogleAccessToken(
  serviceAccount: GoogleServiceAccount,
  delegatedAdmin: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: serviceAccount.client_email as string,
      sub: delegatedAdmin,
      scope: GOOGLE_DIRECTORY_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key as string,
  );
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google OAuth token request failed (${response.status}): ${body}`,
    );
  }

  const token = (await response.json()) as { access_token?: string };

  if (!token.access_token) {
    throw new Error("Google OAuth token response did not include access_token");
  }

  return token.access_token;
}

async function addEmailToGoogleGroup(
  email: string,
): Promise<"added" | "already-member"> {
  const { serviceAccount, delegatedAdmin } = assertAndroidFlowConfigured();
  const accessToken = await getGoogleAccessToken(
    serviceAccount,
    delegatedAdmin,
  );
  const response = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/groups/${
      encodeURIComponent(
        ANDROID_GOOGLE_GROUP_EMAIL,
      )
    }/members`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, role: "MEMBER" }),
    },
  );

  if (response.status === 409) {
    return "already-member";
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google group member insert failed (${response.status}): ${body}`,
    );
  }

  return "added";
}

function consumeRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

function buildAdminHtml(
  email: string,
  language: SupportedLanguage,
  source: string,
  pageUrl: string,
  groupStatus: string,
) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#173420">
      <h1 style="margin:0 0 12px;">Neue Android-Beta-Einladung</h1>
      <p style="margin:0 0 8px;"><strong>E-Mail:</strong> ${
    escapeHtml(email)
  }</p>
      <p style="margin:0 0 8px;"><strong>Sprache:</strong> ${
    escapeHtml(language)
  }</p>
      <p style="margin:0 0 8px;"><strong>Google-Gruppe:</strong> ${
    escapeHtml(ANDROID_GOOGLE_GROUP_EMAIL)
  }</p>
      <p style="margin:0 0 8px;"><strong>Gruppenstatus:</strong> ${
    escapeHtml(groupStatus)
  }</p>
      <p style="margin:0 0 8px;"><strong>Invite-Link:</strong> ${
    escapeHtml(ANDROID_INVITE_URL)
  }</p>
      <p style="margin:0 0 8px;"><strong>Quelle:</strong> ${
    escapeHtml(source)
  }</p>
      <p style="margin:0 0 8px;"><strong>Seite:</strong> ${
    escapeHtml(pageUrl)
  }</p>
    </div>
  `;
}

function buildUserHtml(copy: (typeof COPY)[SupportedLanguage]) {
  const safeInviteUrl = escapeHtml(ANDROID_INVITE_URL);

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#173420;background:#f7fbf5;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #dbe8d7;">
        <p style="margin:0 0 8px;color:#34863b;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">FloraScout</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.1;">${
    escapeHtml(copy.userTitle)
  }</h1>
        <p style="margin:0 0 12px;">${escapeHtml(copy.userBody)}</p>
        <p style="margin:24px 0;">
          <a href="${safeInviteUrl}" style="display:inline-block;padding:14px 20px;border-radius:999px;background:#1f5e28;color:#ffffff;text-decoration:none;font-weight:700;">${
    escapeHtml(copy.userCta)
  }</a>
        </p>
        <p style="margin:0 0 12px;color:#5e6b62;font-size:14px;">${
    escapeHtml(copy.userNote)
  }</p>
        <p style="margin:0 0 18px;color:#5e6b62;font-size:13px;word-break:break-all;">${safeInviteUrl}</p>
        <p style="margin:0;color:#5e6b62;font-size:14px;">${
    escapeHtml(copy.userFooter)
  }</p>
      </div>
    </div>
  `;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "POST, OPTIONS");
  const blockedOrigin = rejectDisallowedOrigin(req, corsHeaders);
  if (blockedOrigin) return blockedOrigin;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!Deno.env.get("RESEND_API_KEY")) {
    return new Response(
      JSON.stringify({ error: "Email service not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    assertAndroidFlowConfigured();
  } catch (error) {
    console.error("Android invite flow is not configured", error);
    return new Response(
      JSON.stringify({ error: "Android invite flow not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let payload: WaitlistPayload;
  try {
    payload = (await req.json()) as WaitlistPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const source = String(payload.source || "landing-page").trim();
  const pageUrl = String(payload.page_url || "").trim();
  const website = String(payload.website || "").trim();
  const language = normalizeLanguage(payload.language);
  const copy = COPY[language];

  if (website) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rateKey = `${req.headers.get("x-forwarded-for") || "unknown"}:${email}`;
  if (!consumeRateLimit(rateKey)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let groupStatus: "added" | "already-member";
  try {
    groupStatus = await addEmailToGoogleGroup(email);
  } catch (error) {
    console.error("Android waitlist Google group sync failed", error);
    return new Response(
      JSON.stringify({ error: "Could not save waitlist signup" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const userSend = await resend.emails.send({
    from: FROM_EMAIL,
    to: [email],
    subject: `🌱 ${copy.userSubject}`,
    html: buildUserHtml(copy),
  });

  if (userSend.error) {
    console.error("Android waitlist invitation email failed", userSend.error);
    return new Response(
      JSON.stringify({ error: "Could not send invite email" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const adminSend = await resend.emails.send({
    from: FROM_EMAIL,
    to: [WAITLIST_NOTIFY_TO],
    subject: `🌿 ${copy.adminSubject}: ${email}`,
    html: buildAdminHtml(email, language, source, pageUrl, groupStatus),
    replyTo: email,
  });

  if (adminSend.error) {
    console.warn("Android waitlist admin email failed", adminSend.error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
