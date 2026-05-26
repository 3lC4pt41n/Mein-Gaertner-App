import { Resend } from 'npm:resend@4.0.0';
import { getCorsHeaders, rejectDisallowedOrigin } from '../_shared/cors.ts';

type SupportedLanguage = 'de' | 'en' | 'fr' | 'it' | 'es' | 'ru' | 'tr';

type WaitlistPayload = {
  email?: string;
  language?: string;
  source?: string;
  page_url?: string;
  website?: string;
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '');
const FROM_EMAIL = Deno.env.get('SEND_EMAIL_FROM') || 'FloraScout <noreply@florascout.app>';
const WAITLIST_NOTIFY_TO = Deno.env.get('WAITLIST_NOTIFY_TO') || 'timergenthaler@gmail.com';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const COPY: Record<
  SupportedLanguage,
  {
    adminSubject: string;
    userSubject: string;
    userTitle: string;
    userBody: string;
    userNote: string;
    userFooter: string;
  }
> = {
  de: {
    adminSubject: 'Neue Android-Warteliste',
    userSubject: 'Du bist auf der Android-Warteliste',
    userTitle: 'Danke fuer dein Interesse an FloraScout fuer Android.',
    userBody:
      'Ich habe deine E-Mail fuer die Android-Beta vorgemerkt und melde mich, sobald ich dich als Tester freischalten kann.',
    userNote:
      'Bis dahin kannst du FloraScout auf dem iPhone bereits ueber TestFlight ausprobieren.',
    userFooter: 'Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.',
  },
  en: {
    adminSubject: 'New Android waitlist signup',
    userSubject: 'You are on the Android waitlist',
    userTitle: 'Thanks for your interest in FloraScout for Android.',
    userBody:
      'I have added your email to the Android beta waitlist and will reach out as soon as I can grant tester access.',
    userNote: 'Until then, you can already try FloraScout on iPhone via TestFlight.',
    userFooter: 'If this was not you, you can ignore this email.',
  },
  fr: {
    adminSubject: 'Nouvelle inscription liste Android',
    userSubject: 'Vous etes sur la liste Android',
    userTitle: 'Merci pour votre interet pour FloraScout sur Android.',
    userBody:
      'Votre e-mail a bien ete ajoute a la liste d’attente de la beta Android. Je vous contacterai des que je pourrai vous ouvrir l’acces.',
    userNote: 'En attendant, FloraScout est deja disponible sur iPhone via TestFlight.',
    userFooter: 'Si cette demande ne vient pas de vous, vous pouvez ignorer cet e-mail.',
  },
  it: {
    adminSubject: 'Nuova iscrizione lista Android',
    userSubject: 'Sei nella lista Android',
    userTitle: 'Grazie per il tuo interesse in FloraScout per Android.',
    userBody:
      'Ho aggiunto la tua e-mail alla lista d’attesa della beta Android e ti contattero non appena potro abilitarti come tester.',
    userNote: 'Nel frattempo puoi gia provare FloraScout su iPhone tramite TestFlight.',
    userFooter: 'Se non sei stato tu, puoi ignorare questa e-mail.',
  },
  es: {
    adminSubject: 'Nuevo registro en lista Android',
    userSubject: 'Ya estas en la lista de Android',
    userTitle: 'Gracias por tu interes en FloraScout para Android.',
    userBody:
      'He añadido tu correo a la lista de espera de la beta de Android y te escribiré en cuanto pueda darte acceso como tester.',
    userNote: 'Mientras tanto, ya puedes probar FloraScout en iPhone a traves de TestFlight.',
    userFooter: 'Si esta solicitud no fue tuya, puedes ignorar este correo.',
  },
  ru: {
    adminSubject: 'Новая заявка в лист ожидания Android',
    userSubject: 'Вы в листе ожидания Android',
    userTitle: 'Спасибо за интерес к FloraScout для Android.',
    userBody:
      'Я добавил ваш e-mail в лист ожидания Android-беты и напишу вам, как только смогу открыть доступ тестировщика.',
    userNote: 'Пока что FloraScout уже можно попробовать на iPhone через TestFlight.',
    userFooter: 'Если это были не вы, просто проигнорируйте это письмо.',
  },
  tr: {
    adminSubject: 'Yeni Android bekleme listesi kaydi',
    userSubject: 'Android bekleme listesindesin',
    userTitle: 'Android icin FloraScout’a gosterdigin ilgi icin tesekkurler.',
    userBody:
      'E-posta adresini Android beta bekleme listesine ekledim. Test erisimi acabildigim anda sana yazacagim.',
    userNote: 'Bu arada FloraScout’u iPhone’da TestFlight uzerinden deneyebilirsin.',
    userFooter: 'Bu talep senden gelmediyse bu e-postayi goz ardi edebilirsin.',
  },
};

function normalizeLanguage(input?: string | null): SupportedLanguage {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'en' || value === 'fr' || value === 'it' || value === 'es' || value === 'ru' || value === 'tr') {
    return value;
  }
  return 'de';
}

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
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

function buildAdminHtml(email: string, language: SupportedLanguage, source: string, pageUrl: string) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#173420">
      <h1 style="margin:0 0 12px;">Neue Android-Warteliste</h1>
      <p style="margin:0 0 8px;"><strong>E-Mail:</strong> ${email}</p>
      <p style="margin:0 0 8px;"><strong>Sprache:</strong> ${language}</p>
      <p style="margin:0 0 8px;"><strong>Quelle:</strong> ${source}</p>
      <p style="margin:0 0 8px;"><strong>Seite:</strong> ${pageUrl}</p>
    </div>
  `;
}

function buildUserHtml(copy: (typeof COPY)[SupportedLanguage]) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#173420;background:#f7fbf5;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #dbe8d7;">
        <p style="margin:0 0 8px;color:#34863b;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">FloraScout</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.1;">${copy.userTitle}</h1>
        <p style="margin:0 0 12px;">${copy.userBody}</p>
        <p style="margin:0 0 18px;">${copy.userNote}</p>
        <p style="margin:0;color:#5e6b62;font-size:14px;">${copy.userFooter}</p>
      </div>
    </div>
  `;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, 'POST, OPTIONS');
  const blockedOrigin = rejectDisallowedOrigin(req, corsHeaders);
  if (blockedOrigin) return blockedOrigin;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!Deno.env.get('RESEND_API_KEY')) {
    return new Response(JSON.stringify({ error: 'Email service not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: WaitlistPayload;
  try {
    payload = (await req.json()) as WaitlistPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const source = String(payload.source || 'landing-page').trim();
  const pageUrl = String(payload.page_url || '').trim();
  const website = String(payload.website || '').trim();
  const language = normalizeLanguage(payload.language);
  const copy = COPY[language];

  if (website) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rateKey = `${req.headers.get('x-forwarded-for') || 'unknown'}:${email}`;
  if (!consumeRateLimit(rateKey)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminSend = await resend.emails.send({
    from: FROM_EMAIL,
    to: [WAITLIST_NOTIFY_TO],
    subject: `🌿 ${copy.adminSubject}: ${email}`,
    html: buildAdminHtml(email, language, source, pageUrl),
    replyTo: email,
  });

  if (adminSend.error) {
    console.error('Android waitlist admin email failed', adminSend.error);
    return new Response(JSON.stringify({ error: 'Could not save waitlist signup' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userSend = await resend.emails.send({
    from: FROM_EMAIL,
    to: [email],
    subject: `🌱 ${copy.userSubject}`,
    html: buildUserHtml(copy),
  });

  if (userSend.error) {
    console.warn('Android waitlist confirmation email failed', userSend.error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
