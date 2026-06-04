import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { Resend } from 'npm:resend@4.0.0';
import { normalizeLanguage, type SupportedLanguage } from '../_shared/language.ts';

// ─── Config ──────────────────────────────────────────────────────────────────
const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);
// Strip the "v1," prefix if present — standardwebhooks expects only "whsec_..."
const rawHookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string;
const hookSecret = rawHookSecret.replace(/^v1,/, '');

const FROM_EMAIL = Deno.env.get('SEND_EMAIL_FROM') || 'FloraScout <noreply@florapilot.app>';
const SITE_URL = Deno.env.get('SITE_URL') || 'https://florapilot.app';
const PROJECT_REF = 'tsllrwaixvhuadrfsskt';

// ─── Types ───────────────────────────────────────────────────────────────────
type EmailActionType =
  | 'signup'
  | 'recovery'
  | 'invite'
  | 'magiclink'
  | 'email_change'
  | 'reauthentication';

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: EmailActionType;
  site_url: string;
  token_new: string;
  token_hash_new: string;
  old_email: string;
  old_phone: string;
  provider: string;
  factor_type: string;
}

interface HookPayload {
  user: {
    id: string;
    email: string;
    user_metadata?: {
      language?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  email_data: EmailData;
}

// ─── Multilingual subjects ───────────────────────────────────────────────────
const subjects: Record<SupportedLanguage, Record<EmailActionType, string>> = {
  de: {
    signup: 'Bestätige deine E-Mail-Adresse',
    recovery: 'Neues Passwort festlegen',
    invite: 'Du wurdest eingeladen',
    magiclink: 'Dein Anmeldelink',
    email_change: 'E-Mail-Adresse bestätigen',
    reauthentication: 'Bestätigung erforderlich',
  },
  en: {
    signup: 'Confirm your email address',
    recovery: 'Set a new password',
    invite: "You've been invited",
    magiclink: 'Your sign-in link',
    email_change: 'Confirm your new email',
    reauthentication: 'Confirmation required',
  },
  fr: {
    signup: 'Confirme ton adresse e-mail',
    recovery: 'Définir un nouveau mot de passe',
    invite: 'Tu as été invité(e)',
    magiclink: 'Ton lien de connexion',
    email_change: 'Confirmer la nouvelle adresse e-mail',
    reauthentication: 'Confirmation requise',
  },
  it: {
    signup: 'Conferma il tuo indirizzo e-mail',
    recovery: 'Imposta una nuova password',
    invite: 'Sei stato invitato',
    magiclink: 'Il tuo link di accesso',
    email_change: 'Conferma il nuovo indirizzo e-mail',
    reauthentication: 'Conferma necessaria',
  },
  es: {
    signup: 'Confirma tu dirección de correo',
    recovery: 'Establecer nueva contraseña',
    invite: 'Has sido invitado',
    magiclink: 'Tu enlace de inicio de sesión',
    email_change: 'Confirmar nueva dirección de correo',
    reauthentication: 'Confirmación requerida',
  },
  ru: {
    signup: 'Подтвердите адрес электронной почты',
    recovery: 'Установить новый пароль',
    invite: 'Вас пригласили',
    magiclink: 'Ваша ссылка для входа',
    email_change: 'Подтвердите новый адрес электронной почты',
    reauthentication: 'Требуется подтверждение',
  },
  tr: {
    signup: 'E-posta adresini onayla',
    recovery: 'Yeni şifre belirle',
    invite: 'Davet edildiniz',
    magiclink: 'Giriş bağlantınız',
    email_change: 'Yeni e-posta adresini onayla',
    reauthentication: 'Onay gerekli',
  },
  nl: {
    signup: 'Bevestig je e-mailadres',
    recovery: 'Stel een nieuw wachtwoord in',
    invite: 'Je bent uitgenodigd',
    magiclink: 'Je aanmeldlink',
    email_change: 'Bevestig je nieuwe e-mailadres',
    reauthentication: 'Bevestiging vereist',
  },
  da: {
    signup: 'Bekræft din e-mailadresse',
    recovery: 'Angiv en ny adgangskode',
    invite: 'Du er blevet inviteret',
    magiclink: 'Dit loginlink',
    email_change: 'Bekræft din nye e-mailadresse',
    reauthentication: 'Bekræftelse kræves',
  },
  pl: {
    signup: 'Potwierdź swój adres e-mail',
    recovery: 'Ustaw nowe hasło',
    invite: 'Masz zaproszenie',
    magiclink: 'Twój link logowania',
    email_change: 'Potwierdź nowy adres e-mail',
    reauthentication: 'Wymagane potwierdzenie',
  },
  uk: {
    signup: 'Підтвердьте адресу електронної пошти',
    recovery: 'Установіть новий пароль',
    invite: 'Вас запрошено',
    magiclink: 'Ваше посилання для входу',
    email_change: 'Підтвердьте нову адресу електронної пошти',
    reauthentication: 'Потрібне підтвердження',
  },
  'pt-BR': {
    signup: 'Confirme seu e-mail',
    recovery: 'Defina uma nova senha',
    invite: 'Você recebeu um convite',
    magiclink: 'Seu link de acesso',
    email_change: 'Confirme seu novo e-mail',
    reauthentication: 'Confirmação necessária',
  },
  'pt-PT': {
    signup: 'Confirme o seu e-mail',
    recovery: 'Defina uma nova palavra-passe',
    invite: 'Recebeu um convite',
    magiclink: 'A sua ligação de acesso',
    email_change: 'Confirme o seu novo e-mail',
    reauthentication: 'Confirmação necessária',
  },
  hi: {
    signup: 'अपना ईमेल पता पुष्टि करें',
    recovery: 'नया पासवर्ड सेट करें',
    invite: 'आपको आमंत्रित किया गया है',
    magiclink: 'आपका साइन-इन लिंक',
    email_change: 'नया ईमेल पता पुष्टि करें',
    reauthentication: 'पुष्टि आवश्यक है',
  },
  bn: {
    signup: 'আপনার ই-মেইল ঠিকানা নিশ্চিত করুন',
    recovery: 'নতুন পাসওয়ার্ড সেট করুন',
    invite: 'আপনাকে আমন্ত্রণ জানানো হয়েছে',
    magiclink: 'আপনার সাইন-ইন লিংক',
    email_change: 'নতুন ই-মেইল ঠিকানা নিশ্চিত করুন',
    reauthentication: 'নিশ্চিতকরণ প্রয়োজন',
  },
  ja: {
    signup: 'メールアドレスを確認してください',
    recovery: '新しいパスワードを設定',
    invite: '招待されました',
    magiclink: 'サインインリンク',
    email_change: '新しいメールアドレスを確認',
    reauthentication: '確認が必要です',
  },
  ko: {
    signup: '이메일 주소를 확인하세요',
    recovery: '새 비밀번호 설정',
    invite: '초대를 받았습니다',
    magiclink: '로그인 링크',
    email_change: '새 이메일 주소 확인',
    reauthentication: '확인이 필요합니다',
  },
  'zh-Hans': {
    signup: '确认你的电子邮件地址',
    recovery: '设置新密码',
    invite: '你已收到邀请',
    magiclink: '你的登录链接',
    email_change: '确认新的电子邮件地址',
    reauthentication: '需要确认',
  },
  id: {
    signup: 'Konfirmasi alamat email Anda',
    recovery: 'Atur kata sandi baru',
    invite: 'Anda telah diundang',
    magiclink: 'Tautan masuk Anda',
    email_change: 'Konfirmasi email baru Anda',
    reauthentication: 'Konfirmasi diperlukan',
  },
  ar: {
    signup: 'أكّد عنوان بريدك الإلكتروني',
    recovery: 'عيّن كلمة مرور جديدة',
    invite: 'تمت دعوتك',
    magiclink: 'رابط تسجيل الدخول الخاص بك',
    email_change: 'أكّد بريدك الإلكتروني الجديد',
    reauthentication: 'التأكيد مطلوب',
  },
  he: {
    signup: 'אמת את כתובת האימייל שלך',
    recovery: 'הגדר סיסמה חדשה',
    invite: 'הוזמנת',
    magiclink: 'קישור הכניסה שלך',
    email_change: 'אמת את כתובת האימייל החדשה',
    reauthentication: 'נדרש אימות',
  },
  fa: {
    signup: 'نشانی ایمیل خود را تأیید کنید',
    recovery: 'گذرواژه جدید تنظیم کنید',
    invite: 'دعوت شده‌اید',
    magiclink: 'پیوند ورود شما',
    email_change: 'ایمیل جدید خود را تأیید کنید',
    reauthentication: 'تأیید لازم است',
  },
  ur: {
    signup: 'اپنا ای میل پتہ تصدیق کریں',
    recovery: 'نیا پاس ورڈ مقرر کریں',
    invite: 'آپ کو دعوت دی گئی ہے',
    magiclink: 'آپ کا سائن اِن لنک',
    email_change: 'نیا ای میل پتہ تصدیق کریں',
    reauthentication: 'تصدیق ضروری ہے',
  },
};

// ─── Multilingual text strings ───────────────────────────────────────────────
interface I18nStrings {
  subtitle: string;
  title: string;
  desc: string;
  note: string;
  cta: string;
  fallback: string;
  footer: string;
  outside: string;
}

type ActionStrings = Omit<I18nStrings, 'subtitle'>;

function buildI18nSet(
  subtitle: string,
  actions: Record<EmailActionType, ActionStrings>
): Record<EmailActionType, I18nStrings> {
  return {
    signup: { subtitle, ...actions.signup },
    recovery: { subtitle, ...actions.recovery },
    invite: { subtitle, ...actions.invite },
    magiclink: { subtitle, ...actions.magiclink },
    email_change: { subtitle, ...actions.email_change },
    reauthentication: { subtitle, ...actions.reauthentication },
  };
}

const i18n: Record<SupportedLanguage, Record<EmailActionType, I18nStrings>> = {
  de: {
    signup: {
      subtitle: 'Dein smarter Pflanzenbegleiter',
      title: 'Konto aktivieren',
      desc: 'Willkommen im Garten. Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.',
      note: 'Dieser Link ist zeitlich begrenzt.',
      cta: 'Konto aktivieren',
      fallback: 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:',
      footer: 'Du hast kein Konto erstellt? Dann ignoriere diese E-Mail.',
      outside: 'Wenn du diese E-Mail unerwartet erhalten hast, musst du nichts tun.',
    },
    recovery: {
      subtitle: 'Dein smarter Pflanzenbegleiter',
      title: 'Neues Passwort festlegen',
      desc: 'Du hast ein Zurücksetzen deines Passworts angefordert. Klicke unten, um ein neues Passwort zu wählen.',
      note: 'Wenn du das nicht warst, kannst du diese E-Mail ignorieren.',
      cta: 'Passwort zurücksetzen',
      fallback: 'Link manuell öffnen:',
      footer: 'Sicherheitshinweis: Gib dein Passwort niemals weiter.',
      outside: '',
    },
    invite: {
      subtitle: 'Dein smarter Pflanzenbegleiter',
      title: 'Du wurdest eingeladen',
      desc: 'Du kannst <strong>FloraScout</strong> nutzen – für einen übersichtlichen, gesunden und grünen Pflanzenalltag.',
      note: 'Richte dein Konto ein, um loszulegen.',
      cta: 'Einladung annehmen',
      fallback: 'Link manuell öffnen:',
      footer: 'Du kennst FloraScout nicht? Dann ignoriere diese E-Mail.',
      outside: '',
    },
    magiclink: {
      subtitle: 'Dein smarter Pflanzenbegleiter',
      title: 'Sicher anmelden',
      desc: 'Verwende diesen Link, um dich anzumelden. Ein Klick genügt.',
      note: 'Der Link ist nur einmal gültig und läuft nach kurzer Zeit ab.',
      cta: 'Jetzt anmelden',
      fallback: 'Link manuell öffnen:',
      footer: 'Du hast diese Anmeldung nicht angefordert? Dann ignoriere diese E-Mail.',
      outside: '',
    },
    email_change: {
      subtitle: 'Dein smarter Pflanzenbegleiter',
      title: 'E-Mail-Adresse bestätigen',
      desc: 'Du möchtest deine E-Mail-Adresse ändern. Bitte bestätige die Änderung über den Button.',
      note: '',
      cta: 'E-Mail ändern',
      fallback: 'Link manuell öffnen:',
      footer: 'Du hast diese Änderung nicht angefordert? Dann ignoriere diese E-Mail.',
      outside: '',
    },
    reauthentication: {
      subtitle: 'Dein smarter Pflanzenbegleiter',
      title: 'Bestätigung erforderlich',
      desc: 'Bitte gib den folgenden Code ein, um fortzufahren:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Du hast das nicht angefordert? Dann ignoriere diese E-Mail.',
      outside: '',
    },
  },
  en: {
    signup: {
      subtitle: 'Your smart plant companion',
      title: 'Activate Account',
      desc: 'Welcome to the garden. Please confirm your email address to activate your account.',
      note: 'This link is time-limited.',
      cta: 'Activate Account',
      fallback: "If the button doesn't work, copy this link into your browser:",
      footer: "Didn't create an account? Just ignore this email.",
      outside: 'If you received this email unexpectedly, no action is required.',
    },
    recovery: {
      subtitle: 'Your smart plant companion',
      title: 'Set New Password',
      desc: 'You requested a password reset. Click below to choose a new password.',
      note: "If this wasn't you, you can ignore this email.",
      cta: 'Reset Password',
      fallback: 'Open link manually:',
      footer: 'Security notice: Never share your password with anyone.',
      outside: '',
    },
    invite: {
      subtitle: 'Your smart plant companion',
      title: "You've Been Invited",
      desc: 'You can use <strong>FloraScout</strong> – for a clear, healthy, and green plant routine.',
      note: 'Set up your account to get started.',
      cta: 'Accept Invitation',
      fallback: 'Open link manually:',
      footer: "Don't know FloraScout? Just ignore this email.",
      outside: '',
    },
    magiclink: {
      subtitle: 'Your smart plant companion',
      title: 'Sign In Securely',
      desc: 'Use this link to sign in. One click is all it takes.',
      note: 'This link is single-use and expires shortly.',
      cta: 'Sign In Now',
      fallback: 'Open link manually:',
      footer: "Didn't request this sign-in? Just ignore this email.",
      outside: '',
    },
    email_change: {
      subtitle: 'Your smart plant companion',
      title: 'Confirm Email Address',
      desc: 'You want to change your email address. Please confirm the change using the button below.',
      note: '',
      cta: 'Change Email',
      fallback: 'Open link manually:',
      footer: "Didn't request this change? Just ignore this email.",
      outside: '',
    },
    reauthentication: {
      subtitle: 'Your smart plant companion',
      title: 'Confirmation Required',
      desc: 'Please enter the following code to continue:',
      note: '',
      cta: '',
      fallback: '',
      footer: "Didn't request this? Just ignore this email.",
      outside: '',
    },
  },
  fr: {
    signup: {
      subtitle: 'Ton compagnon végétal intelligent',
      title: 'Activer le compte',
      desc: 'Bienvenue au jardin. Confirme ton adresse e-mail pour activer ton compte.',
      note: 'Ce lien est limité dans le temps.',
      cta: 'Activer le compte',
      fallback: 'Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :',
      footer: "Tu n'as pas créé de compte ? Ignore cet e-mail.",
      outside: "Si tu as reçu cet e-mail par erreur, aucune action n'est requise.",
    },
    recovery: {
      subtitle: 'Ton compagnon végétal intelligent',
      title: 'Définir un nouveau mot de passe',
      desc: 'Tu as demandé la réinitialisation de ton mot de passe. Clique ci-dessous pour en choisir un nouveau.',
      note: "Si ce n'était pas toi, tu peux ignorer cet e-mail.",
      cta: 'Réinitialiser le mot de passe',
      fallback: 'Ouvrir le lien manuellement :',
      footer: 'Note de sécurité : Ne partage jamais ton mot de passe.',
      outside: '',
    },
    invite: {
      subtitle: 'Ton compagnon végétal intelligent',
      title: 'Tu as été invité(e)',
      desc: 'Tu peux utiliser <strong>FloraScout</strong> – pour un quotidien végétal organisé, sain et verdoyant.',
      note: 'Configure ton compte pour commencer.',
      cta: "Accepter l'invitation",
      fallback: 'Ouvrir le lien manuellement :',
      footer: 'Tu ne connais pas FloraScout ? Ignore cet e-mail.',
      outside: '',
    },
    magiclink: {
      subtitle: 'Ton compagnon végétal intelligent',
      title: 'Connexion sécurisée',
      desc: 'Utilise ce lien pour te connecter. Un clic suffit.',
      note: 'Ce lien est à usage unique et expire rapidement.',
      cta: 'Se connecter',
      fallback: 'Ouvrir le lien manuellement :',
      footer: "Tu n'as pas demandé cette connexion ? Ignore cet e-mail.",
      outside: '',
    },
    email_change: {
      subtitle: 'Ton compagnon végétal intelligent',
      title: "Confirmer l'adresse e-mail",
      desc: 'Tu souhaites changer ton adresse e-mail. Confirme la modification via le bouton ci-dessous.',
      note: '',
      cta: "Modifier l'e-mail",
      fallback: 'Ouvrir le lien manuellement :',
      footer: "Tu n'as pas demandé cette modification ? Ignore cet e-mail.",
      outside: '',
    },
    reauthentication: {
      subtitle: 'Ton compagnon végétal intelligent',
      title: 'Confirmation requise',
      desc: 'Entre le code suivant pour continuer :',
      note: '',
      cta: '',
      fallback: '',
      footer: "Tu n'as pas fait cette demande ? Ignore cet e-mail.",
      outside: '',
    },
  },
  it: {
    signup: {
      subtitle: 'Il tuo compagno verde intelligente',
      title: 'Attiva account',
      desc: 'Benvenuto nel giardino. Conferma il tuo indirizzo e-mail per attivare il tuo account.',
      note: 'Questo link è a tempo limitato.',
      cta: 'Attiva account',
      fallback: 'Se il pulsante non funziona, copia questo link nel tuo browser:',
      footer: 'Non hai creato un account? Ignora questa e-mail.',
      outside: 'Se hai ricevuto questa e-mail per errore, non devi fare nulla.',
    },
    recovery: {
      subtitle: 'Il tuo compagno verde intelligente',
      title: 'Imposta nuova password',
      desc: 'Hai richiesto il ripristino della password. Clicca qui sotto per sceglierne una nuova.',
      note: 'Se non sei stato tu, puoi ignorare questa e-mail.',
      cta: 'Reimposta password',
      fallback: 'Apri il link manualmente:',
      footer: 'Nota di sicurezza: Non condividere mai la tua password.',
      outside: '',
    },
    invite: {
      subtitle: 'Il tuo compagno verde intelligente',
      title: 'Sei stato invitato',
      desc: 'Puoi usare <strong>FloraScout</strong> – per una routine verde, organizzata e salutare.',
      note: 'Configura il tuo account per iniziare.',
      cta: 'Accetta invito',
      fallback: 'Apri il link manualmente:',
      footer: 'Non conosci FloraScout? Ignora questa e-mail.',
      outside: '',
    },
    magiclink: {
      subtitle: 'Il tuo compagno verde intelligente',
      title: 'Accesso sicuro',
      desc: 'Usa questo link per accedere. Basta un clic.',
      note: 'Il link è monouso e scade a breve.',
      cta: 'Accedi ora',
      fallback: 'Apri il link manualmente:',
      footer: 'Non hai richiesto questo accesso? Ignora questa e-mail.',
      outside: '',
    },
    email_change: {
      subtitle: 'Il tuo compagno verde intelligente',
      title: 'Conferma indirizzo e-mail',
      desc: 'Vuoi cambiare il tuo indirizzo e-mail. Conferma la modifica tramite il pulsante qui sotto.',
      note: '',
      cta: 'Cambia e-mail',
      fallback: 'Apri il link manualmente:',
      footer: 'Non hai richiesto questa modifica? Ignora questa e-mail.',
      outside: '',
    },
    reauthentication: {
      subtitle: 'Il tuo compagno verde intelligente',
      title: 'Conferma necessaria',
      desc: 'Inserisci il seguente codice per continuare:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Non hai fatto questa richiesta? Ignora questa e-mail.',
      outside: '',
    },
  },
  es: {
    signup: {
      subtitle: 'Tu compañero vegetal inteligente',
      title: 'Activar cuenta',
      desc: 'Bienvenido al jardín. Confirma tu dirección de correo electrónico para activar tu cuenta.',
      note: 'Este enlace tiene un tiempo limitado.',
      cta: 'Activar cuenta',
      fallback: 'Si el botón no funciona, copia este enlace en tu navegador:',
      footer: '¿No creaste una cuenta? Ignora este correo.',
      outside: 'Si recibiste este correo inesperadamente, no necesitas hacer nada.',
    },
    recovery: {
      subtitle: 'Tu compañero vegetal inteligente',
      title: 'Establecer nueva contraseña',
      desc: 'Solicitaste restablecer tu contraseña. Haz clic abajo para elegir una nueva.',
      note: 'Si no fuiste tú, puedes ignorar este correo.',
      cta: 'Restablecer contraseña',
      fallback: 'Abrir enlace manualmente:',
      footer: 'Aviso de seguridad: Nunca compartas tu contraseña.',
      outside: '',
    },
    invite: {
      subtitle: 'Tu compañero vegetal inteligente',
      title: 'Has sido invitado',
      desc: 'Puedes usar <strong>FloraScout</strong> – para una rutina vegetal organizada, saludable y verde.',
      note: 'Configura tu cuenta para comenzar.',
      cta: 'Aceptar invitación',
      fallback: 'Abrir enlace manualmente:',
      footer: '¿No conoces FloraScout? Ignora este correo.',
      outside: '',
    },
    magiclink: {
      subtitle: 'Tu compañero vegetal inteligente',
      title: 'Iniciar sesión de forma segura',
      desc: 'Usa este enlace para iniciar sesión. Un clic es suficiente.',
      note: 'Este enlace es de un solo uso y caduca pronto.',
      cta: 'Iniciar sesión',
      fallback: 'Abrir enlace manualmente:',
      footer: '¿No solicitaste este inicio de sesión? Ignora este correo.',
      outside: '',
    },
    email_change: {
      subtitle: 'Tu compañero vegetal inteligente',
      title: 'Confirmar dirección de correo',
      desc: 'Quieres cambiar tu dirección de correo electrónico. Confirma el cambio con el botón de abajo.',
      note: '',
      cta: 'Cambiar correo',
      fallback: 'Abrir enlace manualmente:',
      footer: '¿No solicitaste este cambio? Ignora este correo.',
      outside: '',
    },
    reauthentication: {
      subtitle: 'Tu compañero vegetal inteligente',
      title: 'Confirmación requerida',
      desc: 'Introduce el siguiente código para continuar:',
      note: '',
      cta: '',
      fallback: '',
      footer: '¿No solicitaste esto? Ignora este correo.',
      outside: '',
    },
  },
  ru: {
    signup: {
      subtitle: 'Ваш умный помощник для растений',
      title: 'Активировать аккаунт',
      desc: 'Добро пожаловать в сад. Подтвердите свой адрес электронной почты, чтобы активировать аккаунт.',
      note: 'Эта ссылка ограничена по времени.',
      cta: 'Активировать аккаунт',
      fallback: 'Если кнопка не работает, скопируйте эту ссылку в браузер:',
      footer: 'Вы не создавали аккаунт? Просто проигнорируйте это письмо.',
      outside: 'Если вы получили это письмо по ошибке, никаких действий не требуется.',
    },
    recovery: {
      subtitle: 'Ваш умный помощник для растений',
      title: 'Установить новый пароль',
      desc: 'Вы запросили сброс пароля. Нажмите ниже, чтобы выбрать новый пароль.',
      note: 'Если это были не вы, просто проигнорируйте это письмо.',
      cta: 'Сбросить пароль',
      fallback: 'Открыть ссылку вручную:',
      footer: 'Примечание по безопасности: Никогда не сообщайте свой пароль другим.',
      outside: '',
    },
    invite: {
      subtitle: 'Ваш умный помощник для растений',
      title: 'Вас пригласили',
      desc: 'Вы можете использовать <strong>FloraScout</strong> – для организованного, здорового и зелёного ухода за растениями.',
      note: 'Настройте свой аккаунт, чтобы начать.',
      cta: 'Принять приглашение',
      fallback: 'Открыть ссылку вручную:',
      footer: 'Не знакомы с FloraScout? Просто проигнорируйте это письмо.',
      outside: '',
    },
    magiclink: {
      subtitle: 'Ваш умный помощник для растений',
      title: 'Безопасный вход',
      desc: 'Используйте эту ссылку для входа. Достаточно одного клика.',
      note: 'Ссылка одноразовая и скоро истечёт.',
      cta: 'Войти',
      fallback: 'Открыть ссылку вручную:',
      footer: 'Вы не запрашивали вход? Просто проигнорируйте это письмо.',
      outside: '',
    },
    email_change: {
      subtitle: 'Ваш умный помощник для растений',
      title: 'Подтвердите адрес электронной почты',
      desc: 'Вы хотите изменить адрес электронной почты. Подтвердите изменение с помощью кнопки ниже.',
      note: '',
      cta: 'Изменить e-mail',
      fallback: 'Открыть ссылку вручную:',
      footer: 'Вы не запрашивали это изменение? Просто проигнорируйте это письмо.',
      outside: '',
    },
    reauthentication: {
      subtitle: 'Ваш умный помощник для растений',
      title: 'Требуется подтверждение',
      desc: 'Введите следующий код для продолжения:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Вы не запрашивали это? Просто проигнорируйте это письмо.',
      outside: '',
    },
  },
  tr: {
    signup: {
      subtitle: 'Akıllı bitki yardımcınız',
      title: 'Hesabı Etkinleştir',
      desc: 'Bahçeye hoş geldiniz. Hesabınızı etkinleştirmek için lütfen e-posta adresinizi onaylayın.',
      note: 'Bu bağlantının süresi sınırlıdır.',
      cta: 'Hesabı Etkinleştir',
      fallback: 'Düğme çalışmıyorsa bu bağlantıyı tarayıcınıza kopyalayın:',
      footer: 'Hesap oluşturmadınız mı? Bu e-postayı görmezden gelin.',
      outside: 'Bu e-postayı beklemiyordunuz ise herhangi bir işlem yapmanız gerekmez.',
    },
    recovery: {
      subtitle: 'Akıllı bitki yardımcınız',
      title: 'Yeni Şifre Belirle',
      desc: 'Şifrenizi sıfırlama talebinde bulundunuz. Yeni bir şifre seçmek için aşağıya tıklayın.',
      note: 'Bu siz değilseniz bu e-postayı görmezden gelebilirsiniz.',
      cta: 'Şifreyi Sıfırla',
      fallback: 'Bağlantıyı manuel olarak açın:',
      footer: 'Güvenlik notu: Şifrenizi asla kimseyle paylaşmayın.',
      outside: '',
    },
    invite: {
      subtitle: 'Akıllı bitki yardımcınız',
      title: 'Davet Edildiniz',
      desc: "<strong>FloraScout</strong>'u kullanabilirsiniz – düzenli, sağlıklı ve yeşil bir bitki bakımı için.",
      note: 'Başlamak için hesabınızı ayarlayın.',
      cta: 'Daveti Kabul Et',
      fallback: 'Bağlantıyı manuel olarak açın:',
      footer: "FloraScout'u tanımıyor musunuz? Bu e-postayı görmezden gelin.",
      outside: '',
    },
    magiclink: {
      subtitle: 'Akıllı bitki yardımcınız',
      title: 'Güvenli Giriş',
      desc: 'Giriş yapmak için bu bağlantıyı kullanın. Tek bir tıklama yeterli.',
      note: 'Bu bağlantı tek kullanımlıktır ve kısa sürede sona erer.',
      cta: 'Şimdi Giriş Yap',
      fallback: 'Bağlantıyı manuel olarak açın:',
      footer: 'Bu girişi talep etmediyseniz bu e-postayı görmezden gelin.',
      outside: '',
    },
    email_change: {
      subtitle: 'Akıllı bitki yardımcınız',
      title: 'E-posta Adresini Onayla',
      desc: 'E-posta adresinizi değiştirmek istiyorsunuz. Lütfen aşağıdaki düğme ile değişikliği onaylayın.',
      note: '',
      cta: 'E-postayı Değiştir',
      fallback: 'Bağlantıyı manuel olarak açın:',
      footer: 'Bu değişikliği talep etmediyseniz bu e-postayı görmezden gelin.',
      outside: '',
    },
    reauthentication: {
      subtitle: 'Akıllı bitki yardımcınız',
      title: 'Onay Gerekli',
      desc: 'Devam etmek için aşağıdaki kodu girin:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Bunu talep etmediyseniz bu e-postayı görmezden gelin.',
      outside: '',
    },
  },
  nl: buildI18nSet('Je slimme plantenpartner', {
    signup: {
      title: 'Account activeren',
      desc: 'Welkom in de tuin. Bevestig je e-mailadres om je account te activeren.',
      note: 'Deze link is tijdelijk geldig.',
      cta: 'Account activeren',
      fallback: 'Als de knop niet werkt, kopieer deze link naar je browser:',
      footer: 'Geen account aangemaakt? Negeer deze e-mail.',
      outside: 'Als je deze e-mail onverwacht hebt ontvangen, hoef je niets te doen.',
    },
    recovery: {
      title: 'Nieuw wachtwoord instellen',
      desc: 'Je hebt gevraagd om je wachtwoord opnieuw in te stellen. Klik hieronder om een nieuw wachtwoord te kiezen.',
      note: 'Was jij dit niet? Dan kun je deze e-mail negeren.',
      cta: 'Wachtwoord resetten',
      fallback: 'Link handmatig openen:',
      footer: 'Veiligheidsmelding: Deel je wachtwoord nooit met anderen.',
      outside: '',
    },
    invite: {
      title: 'Je bent uitgenodigd',
      desc: 'Je kunt <strong>FloraScout</strong> gebruiken – voor een overzichtelijke, gezonde en groene plantenroutine.',
      note: 'Stel je account in om te beginnen.',
      cta: 'Uitnodiging accepteren',
      fallback: 'Link handmatig openen:',
      footer: 'Ken je FloraScout niet? Negeer deze e-mail.',
      outside: '',
    },
    magiclink: {
      title: 'Veilig aanmelden',
      desc: 'Gebruik deze link om je aan te melden. Eén klik is genoeg.',
      note: 'Deze link is eenmalig geldig en verloopt binnenkort.',
      cta: 'Nu aanmelden',
      fallback: 'Link handmatig openen:',
      footer: 'Deze aanmelding niet aangevraagd? Negeer deze e-mail.',
      outside: '',
    },
    email_change: {
      title: 'E-mailadres bevestigen',
      desc: 'Je wilt je e-mailadres wijzigen. Bevestig de wijziging via de knop hieronder.',
      note: '',
      cta: 'E-mail wijzigen',
      fallback: 'Link handmatig openen:',
      footer: 'Deze wijziging niet aangevraagd? Negeer deze e-mail.',
      outside: '',
    },
    reauthentication: {
      title: 'Bevestiging vereist',
      desc: 'Voer de volgende code in om door te gaan:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Dit niet aangevraagd? Negeer deze e-mail.',
      outside: '',
    },
  }),
  da: buildI18nSet('Din smarte plantehjælper', {
    signup: {
      title: 'Aktivér konto',
      desc: 'Velkommen i haven. Bekræft din e-mailadresse for at aktivere din konto.',
      note: 'Dette link er tidsbegrænset.',
      cta: 'Aktivér konto',
      fallback: 'Hvis knappen ikke virker, kan du kopiere dette link til din browser:',
      footer: 'Har du ikke oprettet en konto? Ignorer denne e-mail.',
      outside: 'Hvis du har modtaget denne e-mail uventet, behøver du ikke gøre noget.',
    },
    recovery: {
      title: 'Angiv en ny adgangskode',
      desc: 'Du har bedt om at nulstille din adgangskode. Klik nedenfor for at vælge en ny.',
      note: 'Hvis det ikke var dig, kan du ignorere denne e-mail.',
      cta: 'Nulstil adgangskode',
      fallback: 'Åbn linket manuelt:',
      footer: 'Sikkerhed: Del aldrig din adgangskode med andre.',
      outside: '',
    },
    invite: {
      title: 'Du er blevet inviteret',
      desc: 'Du kan bruge <strong>FloraScout</strong> – til en overskuelig, sund og grøn planterutine.',
      note: 'Opret din konto for at komme i gang.',
      cta: 'Accepter invitation',
      fallback: 'Åbn linket manuelt:',
      footer: 'Kender du ikke FloraScout? Ignorer denne e-mail.',
      outside: '',
    },
    magiclink: {
      title: 'Log sikkert ind',
      desc: 'Brug dette link til at logge ind. Ét klik er nok.',
      note: 'Linket kan kun bruges én gang og udløber snart.',
      cta: 'Log ind nu',
      fallback: 'Åbn linket manuelt:',
      footer: 'Har du ikke bedt om dette login? Ignorer denne e-mail.',
      outside: '',
    },
    email_change: {
      title: 'Bekræft e-mailadresse',
      desc: 'Du vil ændre din e-mailadresse. Bekræft ændringen med knappen nedenfor.',
      note: '',
      cta: 'Skift e-mail',
      fallback: 'Åbn linket manuelt:',
      footer: 'Har du ikke bedt om denne ændring? Ignorer denne e-mail.',
      outside: '',
    },
    reauthentication: {
      title: 'Bekræftelse kræves',
      desc: 'Indtast følgende kode for at fortsætte:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Har du ikke bedt om dette? Ignorer denne e-mail.',
      outside: '',
    },
  }),
  pl: buildI18nSet('Twój inteligentny opiekun roślin', {
    signup: {
      title: 'Aktywuj konto',
      desc: 'Witaj w ogrodzie. Potwierdź adres e-mail, aby aktywować konto.',
      note: 'Ten link jest ważny przez ograniczony czas.',
      cta: 'Aktywuj konto',
      fallback: 'Jeśli przycisk nie działa, skopiuj ten link do przeglądarki:',
      footer: 'Nie zakładałeś konta? Zignoruj tę wiadomość.',
      outside: 'Jeśli ta wiadomość przyszła niespodziewanie, nie musisz nic robić.',
    },
    recovery: {
      title: 'Ustaw nowe hasło',
      desc: 'Poprosiłeś o zresetowanie hasła. Kliknij poniżej, aby wybrać nowe hasło.',
      note: 'Jeśli to nie Ty, możesz zignorować tę wiadomość.',
      cta: 'Zresetuj hasło',
      fallback: 'Otwórz link ręcznie:',
      footer: 'Uwaga bezpieczeństwa: Nigdy nikomu nie udostępniaj hasła.',
      outside: '',
    },
    invite: {
      title: 'Masz zaproszenie',
      desc: 'Możesz korzystać z <strong>FloraScout</strong> – dla uporządkowanej, zdrowej i zielonej rutyny pielęgnacji roślin.',
      note: 'Skonfiguruj konto, aby zacząć.',
      cta: 'Przyjmij zaproszenie',
      fallback: 'Otwórz link ręcznie:',
      footer: 'Nie znasz FloraScout? Zignoruj tę wiadomość.',
      outside: '',
    },
    magiclink: {
      title: 'Bezpieczne logowanie',
      desc: 'Użyj tego linku, aby się zalogować. Wystarczy jedno kliknięcie.',
      note: 'Link jest jednorazowy i wkrótce wygaśnie.',
      cta: 'Zaloguj się teraz',
      fallback: 'Otwórz link ręcznie:',
      footer: 'Nie prosiłeś o logowanie? Zignoruj tę wiadomość.',
      outside: '',
    },
    email_change: {
      title: 'Potwierdź adres e-mail',
      desc: 'Chcesz zmienić adres e-mail. Potwierdź zmianę przyciskiem poniżej.',
      note: '',
      cta: 'Zmień e-mail',
      fallback: 'Otwórz link ręcznie:',
      footer: 'Nie prosiłeś o tę zmianę? Zignoruj tę wiadomość.',
      outside: '',
    },
    reauthentication: {
      title: 'Wymagane potwierdzenie',
      desc: 'Wpisz poniższy kod, aby kontynuować:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Nie prosiłeś o to? Zignoruj tę wiadomość.',
      outside: '',
    },
  }),
  uk: buildI18nSet('Ваш розумний помічник для рослин', {
    signup: {
      title: 'Активувати обліковий запис',
      desc: 'Вітаємо в саду. Підтвердьте адресу електронної пошти, щоб активувати обліковий запис.',
      note: 'Це посилання діє обмежений час.',
      cta: 'Активувати обліковий запис',
      fallback: 'Якщо кнопка не працює, скопіюйте це посилання в браузер:',
      footer: 'Ви не створювали обліковий запис? Просто проігноруйте цей лист.',
      outside: 'Якщо ви отримали цей лист несподівано, нічого робити не потрібно.',
    },
    recovery: {
      title: 'Установити новий пароль',
      desc: 'Ви запросили скидання пароля. Натисніть нижче, щоб вибрати новий пароль.',
      note: 'Якщо це були не ви, проігноруйте цей лист.',
      cta: 'Скинути пароль',
      fallback: 'Відкрити посилання вручну:',
      footer: 'Порада з безпеки: Ніколи нікому не передавайте свій пароль.',
      outside: '',
    },
    invite: {
      title: 'Вас запрошено',
      desc: 'Ви можете користуватися <strong>FloraScout</strong> – для впорядкованого, здорового й зеленого догляду за рослинами.',
      note: 'Налаштуйте обліковий запис, щоб почати.',
      cta: 'Прийняти запрошення',
      fallback: 'Відкрити посилання вручну:',
      footer: 'Не знаєте FloraScout? Проігноруйте цей лист.',
      outside: '',
    },
    magiclink: {
      title: 'Безпечний вхід',
      desc: 'Скористайтеся цим посиланням, щоб увійти. Достатньо одного кліку.',
      note: 'Посилання одноразове й незабаром закінчиться.',
      cta: 'Увійти зараз',
      fallback: 'Відкрити посилання вручну:',
      footer: 'Не запитували цей вхід? Проігноруйте цей лист.',
      outside: '',
    },
    email_change: {
      title: 'Підтвердьте адресу електронної пошти',
      desc: 'Ви хочете змінити адресу електронної пошти. Підтвердьте зміну кнопкою нижче.',
      note: '',
      cta: 'Змінити e-mail',
      fallback: 'Відкрити посилання вручну:',
      footer: 'Не запитували цю зміну? Проігноруйте цей лист.',
      outside: '',
    },
    reauthentication: {
      title: 'Потрібне підтвердження',
      desc: 'Введіть наведений нижче код, щоб продовжити:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Не запитували це? Проігноруйте цей лист.',
      outside: '',
    },
  }),
  'pt-BR': buildI18nSet('Seu companheiro inteligente de plantas', {
    signup: {
      title: 'Ativar conta',
      desc: 'Boas-vindas ao jardim. Confirme seu e-mail para ativar sua conta.',
      note: 'Este link é válido por tempo limitado.',
      cta: 'Ativar conta',
      fallback: 'Se o botão não funcionar, copie este link para o navegador:',
      footer: 'Não criou uma conta? Ignore este e-mail.',
      outside: 'Se você recebeu este e-mail por engano, nenhuma ação é necessária.',
    },
    recovery: {
      title: 'Definir nova senha',
      desc: 'Você solicitou a redefinição da senha. Clique abaixo para escolher uma nova.',
      note: 'Se não foi você, pode ignorar este e-mail.',
      cta: 'Redefinir senha',
      fallback: 'Abrir link manualmente:',
      footer: 'Aviso de segurança: Nunca compartilhe sua senha.',
      outside: '',
    },
    invite: {
      title: 'Você recebeu um convite',
      desc: 'Você pode usar <strong>FloraScout</strong> – para uma rotina de plantas organizada, saudável e verde.',
      note: 'Configure sua conta para começar.',
      cta: 'Aceitar convite',
      fallback: 'Abrir link manualmente:',
      footer: 'Não conhece o FloraScout? Ignore este e-mail.',
      outside: '',
    },
    magiclink: {
      title: 'Entrar com segurança',
      desc: 'Use este link para entrar. Um clique é suficiente.',
      note: 'Este link é de uso único e expira em breve.',
      cta: 'Entrar agora',
      fallback: 'Abrir link manualmente:',
      footer: 'Não solicitou este acesso? Ignore este e-mail.',
      outside: '',
    },
    email_change: {
      title: 'Confirmar e-mail',
      desc: 'Você quer alterar seu e-mail. Confirme a mudança pelo botão abaixo.',
      note: '',
      cta: 'Alterar e-mail',
      fallback: 'Abrir link manualmente:',
      footer: 'Não solicitou esta alteração? Ignore este e-mail.',
      outside: '',
    },
    reauthentication: {
      title: 'Confirmação necessária',
      desc: 'Digite o código abaixo para continuar:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Não solicitou isso? Ignore este e-mail.',
      outside: '',
    },
  }),
  'pt-PT': buildI18nSet('O seu companheiro inteligente de plantas', {
    signup: {
      title: 'Ativar conta',
      desc: 'Bem-vindo ao jardim. Confirme o seu e-mail para ativar a conta.',
      note: 'Esta ligação é válida por tempo limitado.',
      cta: 'Ativar conta',
      fallback: 'Se o botão não funcionar, copie esta ligação para o navegador:',
      footer: 'Não criou uma conta? Ignore este e-mail.',
      outside: 'Se recebeu este e-mail por engano, não precisa de fazer nada.',
    },
    recovery: {
      title: 'Definir nova palavra-passe',
      desc: 'Pediu a reposição da palavra-passe. Clique abaixo para escolher uma nova.',
      note: 'Se não foi você, pode ignorar este e-mail.',
      cta: 'Repor palavra-passe',
      fallback: 'Abrir ligação manualmente:',
      footer: 'Aviso de segurança: Nunca partilhe a sua palavra-passe.',
      outside: '',
    },
    invite: {
      title: 'Recebeu um convite',
      desc: 'Pode usar o <strong>FloraScout</strong> – para uma rotina de plantas organizada, saudável e verde.',
      note: 'Configure a sua conta para começar.',
      cta: 'Aceitar convite',
      fallback: 'Abrir ligação manualmente:',
      footer: 'Não conhece o FloraScout? Ignore este e-mail.',
      outside: '',
    },
    magiclink: {
      title: 'Entrar em segurança',
      desc: 'Use esta ligação para entrar. Basta um clique.',
      note: 'Esta ligação é de utilização única e expira em breve.',
      cta: 'Entrar agora',
      fallback: 'Abrir ligação manualmente:',
      footer: 'Não pediu este acesso? Ignore este e-mail.',
      outside: '',
    },
    email_change: {
      title: 'Confirmar e-mail',
      desc: 'Quer alterar o seu e-mail. Confirme a alteração com o botão abaixo.',
      note: '',
      cta: 'Alterar e-mail',
      fallback: 'Abrir ligação manualmente:',
      footer: 'Não pediu esta alteração? Ignore este e-mail.',
      outside: '',
    },
    reauthentication: {
      title: 'Confirmação necessária',
      desc: 'Introduza o código abaixo para continuar:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Não pediu isto? Ignore este e-mail.',
      outside: '',
    },
  }),
  hi: buildI18nSet('आपका स्मार्ट पौधा साथी', {
    signup: {
      title: 'खाता सक्रिय करें',
      desc: 'बगीचे में आपका स्वागत है। अपना खाता सक्रिय करने के लिए ईमेल पता पुष्टि करें।',
      note: 'यह लिंक सीमित समय के लिए मान्य है।',
      cta: 'खाता सक्रिय करें',
      fallback: 'यदि बटन काम नहीं करता, तो यह लिंक अपने ब्राउज़र में कॉपी करें:',
      footer: 'खाता नहीं बनाया? इस ईमेल को अनदेखा करें।',
      outside: 'यदि यह ईमेल अप्रत्याशित रूप से मिला है, तो आपको कुछ करने की आवश्यकता नहीं है।',
    },
    recovery: {
      title: 'नया पासवर्ड सेट करें',
      desc: 'आपने पासवर्ड रीसेट का अनुरोध किया है। नया पासवर्ड चुनने के लिए नीचे क्लिक करें।',
      note: 'यदि यह आपने नहीं किया, तो इस ईमेल को अनदेखा करें।',
      cta: 'पासवर्ड रीसेट करें',
      fallback: 'लिंक मैन्युअली खोलें:',
      footer: 'सुरक्षा सूचना: अपना पासवर्ड कभी साझा न करें।',
      outside: '',
    },
    invite: {
      title: 'आपको आमंत्रित किया गया है',
      desc: 'आप <strong>FloraScout</strong> का उपयोग कर सकते हैं – साफ, स्वस्थ और हरी पौधा-देखभाल दिनचर्या के लिए।',
      note: 'शुरू करने के लिए अपना खाता सेट करें।',
      cta: 'आमंत्रण स्वीकार करें',
      fallback: 'लिंक मैन्युअली खोलें:',
      footer: 'FloraScout को नहीं जानते? इस ईमेल को अनदेखा करें।',
      outside: '',
    },
    magiclink: {
      title: 'सुरक्षित साइन इन',
      desc: 'साइन इन करने के लिए इस लिंक का उपयोग करें। एक क्लिक काफी है।',
      note: 'यह लिंक एक बार उपयोग के लिए है और जल्द समाप्त हो जाएगा।',
      cta: 'अभी साइन इन करें',
      fallback: 'लिंक मैन्युअली खोलें:',
      footer: 'यह साइन-इन अनुरोध नहीं किया? इस ईमेल को अनदेखा करें।',
      outside: '',
    },
    email_change: {
      title: 'ईमेल पता पुष्टि करें',
      desc: 'आप अपना ईमेल पता बदलना चाहते हैं। नीचे दिए बटन से बदलाव की पुष्टि करें।',
      note: '',
      cta: 'ईमेल बदलें',
      fallback: 'लिंक मैन्युअली खोलें:',
      footer: 'यह बदलाव अनुरोध नहीं किया? इस ईमेल को अनदेखा करें।',
      outside: '',
    },
    reauthentication: {
      title: 'पुष्टि आवश्यक है',
      desc: 'जारी रखने के लिए निम्न कोड दर्ज करें:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'यह अनुरोध नहीं किया? इस ईमेल को अनदेखा करें।',
      outside: '',
    },
  }),
  bn: buildI18nSet('আপনার স্মার্ট উদ্ভিদ সহায়ক', {
    signup: {
      title: 'অ্যাকাউন্ট সক্রিয় করুন',
      desc: 'বাগানে স্বাগতম। অ্যাকাউন্ট সক্রিয় করতে আপনার ই-মেইল ঠিকানা নিশ্চিত করুন।',
      note: 'এই লিংকটি সীমিত সময়ের জন্য কার্যকর।',
      cta: 'অ্যাকাউন্ট সক্রিয় করুন',
      fallback: 'বাটন কাজ না করলে এই লিংকটি ব্রাউজারে কপি করুন:',
      footer: 'আপনি কি অ্যাকাউন্ট তৈরি করেননি? এই ই-মেইল উপেক্ষা করুন।',
      outside: 'আপনি যদি অপ্রত্যাশিতভাবে এই ই-মেইল পেয়ে থাকেন, কিছু করার দরকার নেই।',
    },
    recovery: {
      title: 'নতুন পাসওয়ার্ড সেট করুন',
      desc: 'আপনি পাসওয়ার্ড রিসেটের অনুরোধ করেছেন। নতুন পাসওয়ার্ড বেছে নিতে নিচে ক্লিক করুন।',
      note: 'এটি আপনি না হলে এই ই-মেইল উপেক্ষা করুন।',
      cta: 'পাসওয়ার্ড রিসেট করুন',
      fallback: 'লিংক ম্যানুয়ালি খুলুন:',
      footer: 'নিরাপত্তা নোট: কখনও আপনার পাসওয়ার্ড শেয়ার করবেন না।',
      outside: '',
    },
    invite: {
      title: 'আপনাকে আমন্ত্রণ জানানো হয়েছে',
      desc: 'আপনি <strong>FloraScout</strong> ব্যবহার করতে পারেন – একটি পরিষ্কার, স্বাস্থ্যকর ও সবুজ উদ্ভিদ রুটিনের জন্য।',
      note: 'শুরু করতে আপনার অ্যাকাউন্ট সেট করুন।',
      cta: 'আমন্ত্রণ গ্রহণ করুন',
      fallback: 'লিংক ম্যানুয়ালি খুলুন:',
      footer: 'FloraScout চেনেন না? এই ই-মেইল উপেক্ষা করুন।',
      outside: '',
    },
    magiclink: {
      title: 'নিরাপদে সাইন ইন করুন',
      desc: 'সাইন ইন করতে এই লিংক ব্যবহার করুন। এক ক্লিকই যথেষ্ট।',
      note: 'এই লিংক একবার ব্যবহারযোগ্য এবং শিগগির মেয়াদ শেষ হবে।',
      cta: 'এখন সাইন ইন করুন',
      fallback: 'লিংক ম্যানুয়ালি খুলুন:',
      footer: 'এই সাইন-ইন অনুরোধ করেননি? এই ই-মেইল উপেক্ষা করুন।',
      outside: '',
    },
    email_change: {
      title: 'ই-মেইল ঠিকানা নিশ্চিত করুন',
      desc: 'আপনি আপনার ই-মেইল ঠিকানা পরিবর্তন করতে চান। নিচের বাটন দিয়ে পরিবর্তন নিশ্চিত করুন।',
      note: '',
      cta: 'ই-মেইল পরিবর্তন করুন',
      fallback: 'লিংক ম্যানুয়ালি খুলুন:',
      footer: 'এই পরিবর্তন অনুরোধ করেননি? এই ই-মেইল উপেক্ষা করুন।',
      outside: '',
    },
    reauthentication: {
      title: 'নিশ্চিতকরণ প্রয়োজন',
      desc: 'চালিয়ে যেতে নিচের কোডটি লিখুন:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'এটি অনুরোধ করেননি? এই ই-মেইল উপেক্ষা করুন।',
      outside: '',
    },
  }),
  ja: buildI18nSet('スマートな植物パートナー', {
    signup: {
      title: 'アカウントを有効化',
      desc: '庭へようこそ。アカウントを有効化するにはメールアドレスを確認してください。',
      note: 'このリンクには有効期限があります。',
      cta: 'アカウントを有効化',
      fallback: 'ボタンが動作しない場合は、このリンクをブラウザにコピーしてください:',
      footer: 'アカウントを作成していない場合は、このメールを無視してください。',
      outside: 'このメールを予期せず受け取った場合、操作は不要です。',
    },
    recovery: {
      title: '新しいパスワードを設定',
      desc: 'パスワードのリセットがリクエストされました。下のボタンから新しいパスワードを選択してください。',
      note: 'ご自身の操作でない場合は、このメールを無視できます。',
      cta: 'パスワードをリセット',
      fallback: 'リンクを手動で開く:',
      footer: 'セキュリティ: パスワードを他人に共有しないでください。',
      outside: '',
    },
    invite: {
      title: '招待されました',
      desc: '<strong>FloraScout</strong> を利用できます – 整理された健康的な植物管理のために。',
      note: '開始するにはアカウントを設定してください。',
      cta: '招待を承諾',
      fallback: 'リンクを手動で開く:',
      footer: 'FloraScout に心当たりがない場合は、このメールを無視してください。',
      outside: '',
    },
    magiclink: {
      title: '安全にサインイン',
      desc: 'このリンクからサインインできます。ワンクリックで完了します。',
      note: 'このリンクは一度だけ有効で、まもなく期限切れになります。',
      cta: '今すぐサインイン',
      fallback: 'リンクを手動で開く:',
      footer: 'このサインインをリクエストしていない場合は、このメールを無視してください。',
      outside: '',
    },
    email_change: {
      title: 'メールアドレスを確認',
      desc: 'メールアドレスを変更しようとしています。下のボタンで変更を確認してください。',
      note: '',
      cta: 'メールを変更',
      fallback: 'リンクを手動で開く:',
      footer: 'この変更をリクエストしていない場合は、このメールを無視してください。',
      outside: '',
    },
    reauthentication: {
      title: '確認が必要です',
      desc: '続行するには次のコードを入力してください:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'この操作をリクエストしていない場合は、このメールを無視してください。',
      outside: '',
    },
  }),
  ko: buildI18nSet('스마트한 식물 파트너', {
    signup: {
      title: '계정 활성화',
      desc: '정원에 오신 것을 환영합니다. 계정을 활성화하려면 이메일 주소를 확인하세요.',
      note: '이 링크는 제한된 시간 동안만 유효합니다.',
      cta: '계정 활성화',
      fallback: '버튼이 작동하지 않으면 이 링크를 브라우저에 복사하세요:',
      footer: '계정을 만들지 않았다면 이 이메일을 무시하세요.',
      outside: '이 이메일을 예상치 못하게 받았다면 아무 조치도 필요하지 않습니다.',
    },
    recovery: {
      title: '새 비밀번호 설정',
      desc: '비밀번호 재설정을 요청했습니다. 아래를 클릭해 새 비밀번호를 선택하세요.',
      note: '본인이 요청한 것이 아니라면 이 이메일을 무시하세요.',
      cta: '비밀번호 재설정',
      fallback: '링크를 직접 열기:',
      footer: '보안 안내: 비밀번호를 절대 다른 사람과 공유하지 마세요.',
      outside: '',
    },
    invite: {
      title: '초대를 받았습니다',
      desc: '<strong>FloraScout</strong>를 사용할 수 있습니다 – 체계적이고 건강한 식물 루틴을 위해.',
      note: '시작하려면 계정을 설정하세요.',
      cta: '초대 수락',
      fallback: '링크를 직접 열기:',
      footer: 'FloraScout를 모른다면 이 이메일을 무시하세요.',
      outside: '',
    },
    magiclink: {
      title: '안전하게 로그인',
      desc: '이 링크로 로그인하세요. 한 번의 클릭이면 됩니다.',
      note: '이 링크는 1회용이며 곧 만료됩니다.',
      cta: '지금 로그인',
      fallback: '링크를 직접 열기:',
      footer: '이 로그인을 요청하지 않았다면 이 이메일을 무시하세요.',
      outside: '',
    },
    email_change: {
      title: '이메일 주소 확인',
      desc: '이메일 주소를 변경하려고 합니다. 아래 버튼으로 변경을 확인하세요.',
      note: '',
      cta: '이메일 변경',
      fallback: '링크를 직접 열기:',
      footer: '이 변경을 요청하지 않았다면 이 이메일을 무시하세요.',
      outside: '',
    },
    reauthentication: {
      title: '확인이 필요합니다',
      desc: '계속하려면 다음 코드를 입력하세요:',
      note: '',
      cta: '',
      fallback: '',
      footer: '요청하지 않았다면 이 이메일을 무시하세요.',
      outside: '',
    },
  }),
  'zh-Hans': buildI18nSet('你的智能植物伙伴', {
    signup: {
      title: '激活账户',
      desc: '欢迎来到花园。请确认你的电子邮件地址以激活账户。',
      note: '此链接有时间限制。',
      cta: '激活账户',
      fallback: '如果按钮无法使用，请将此链接复制到浏览器中：',
      footer: '没有创建账户？请忽略这封邮件。',
      outside: '如果你意外收到这封邮件，无需执行任何操作。',
    },
    recovery: {
      title: '设置新密码',
      desc: '你请求重置密码。点击下方按钮选择新密码。',
      note: '如果这不是你本人操作，可以忽略这封邮件。',
      cta: '重置密码',
      fallback: '手动打开链接：',
      footer: '安全提示：请勿与任何人分享你的密码。',
      outside: '',
    },
    invite: {
      title: '你已收到邀请',
      desc: '你可以使用 <strong>FloraScout</strong> – 打理清晰、健康、绿色的植物日常。',
      note: '设置账户即可开始。',
      cta: '接受邀请',
      fallback: '手动打开链接：',
      footer: '不认识 FloraScout？请忽略这封邮件。',
      outside: '',
    },
    magiclink: {
      title: '安全登录',
      desc: '使用此链接登录。点击一次即可。',
      note: '此链接只能使用一次，并会很快过期。',
      cta: '立即登录',
      fallback: '手动打开链接：',
      footer: '没有请求此次登录？请忽略这封邮件。',
      outside: '',
    },
    email_change: {
      title: '确认电子邮件地址',
      desc: '你想更改电子邮件地址。请通过下方按钮确认更改。',
      note: '',
      cta: '更改电子邮件',
      fallback: '手动打开链接：',
      footer: '没有请求此更改？请忽略这封邮件。',
      outside: '',
    },
    reauthentication: {
      title: '需要确认',
      desc: '请输入以下代码以继续：',
      note: '',
      cta: '',
      fallback: '',
      footer: '没有请求此操作？请忽略这封邮件。',
      outside: '',
    },
  }),
  id: buildI18nSet('Pendamping tanaman pintar Anda', {
    signup: {
      title: 'Aktifkan akun',
      desc: 'Selamat datang di kebun. Konfirmasi alamat email Anda untuk mengaktifkan akun.',
      note: 'Tautan ini berlaku untuk waktu terbatas.',
      cta: 'Aktifkan akun',
      fallback: 'Jika tombol tidak berfungsi, salin tautan ini ke browser Anda:',
      footer: 'Tidak membuat akun? Abaikan email ini.',
      outside: 'Jika Anda menerima email ini tanpa mengharapkannya, tidak perlu melakukan apa pun.',
    },
    recovery: {
      title: 'Atur kata sandi baru',
      desc: 'Anda meminta reset kata sandi. Klik di bawah untuk memilih kata sandi baru.',
      note: 'Jika bukan Anda, abaikan email ini.',
      cta: 'Reset kata sandi',
      fallback: 'Buka tautan secara manual:',
      footer: 'Catatan keamanan: Jangan pernah membagikan kata sandi Anda.',
      outside: '',
    },
    invite: {
      title: 'Anda telah diundang',
      desc: 'Anda dapat menggunakan <strong>FloraScout</strong> – untuk rutinitas tanaman yang rapi, sehat, dan hijau.',
      note: 'Siapkan akun Anda untuk memulai.',
      cta: 'Terima undangan',
      fallback: 'Buka tautan secara manual:',
      footer: 'Tidak mengenal FloraScout? Abaikan email ini.',
      outside: '',
    },
    magiclink: {
      title: 'Masuk dengan aman',
      desc: 'Gunakan tautan ini untuk masuk. Satu klik sudah cukup.',
      note: 'Tautan ini hanya sekali pakai dan segera kedaluwarsa.',
      cta: 'Masuk sekarang',
      fallback: 'Buka tautan secara manual:',
      footer: 'Tidak meminta masuk? Abaikan email ini.',
      outside: '',
    },
    email_change: {
      title: 'Konfirmasi alamat email',
      desc: 'Anda ingin mengubah alamat email. Konfirmasi perubahan dengan tombol di bawah.',
      note: '',
      cta: 'Ubah email',
      fallback: 'Buka tautan secara manual:',
      footer: 'Tidak meminta perubahan ini? Abaikan email ini.',
      outside: '',
    },
    reauthentication: {
      title: 'Konfirmasi diperlukan',
      desc: 'Masukkan kode berikut untuk melanjutkan:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'Tidak meminta ini? Abaikan email ini.',
      outside: '',
    },
  }),
  ar: buildI18nSet('رفيقك الذكي للنباتات', {
    signup: {
      title: 'تفعيل الحساب',
      desc: 'مرحبًا بك في الحديقة. يرجى تأكيد بريدك الإلكتروني لتفعيل حسابك.',
      note: 'هذا الرابط صالح لمدة محدودة.',
      cta: 'تفعيل الحساب',
      fallback: 'إذا لم يعمل الزر، انسخ هذا الرابط إلى المتصفح:',
      footer: 'لم تنشئ حسابًا؟ تجاهل هذه الرسالة.',
      outside: 'إذا وصلتك هذه الرسالة دون توقع، فلا يلزمك فعل أي شيء.',
    },
    recovery: {
      title: 'تعيين كلمة مرور جديدة',
      desc: 'طلبت إعادة تعيين كلمة المرور. انقر أدناه لاختيار كلمة مرور جديدة.',
      note: 'إذا لم تكن أنت، يمكنك تجاهل هذه الرسالة.',
      cta: 'إعادة تعيين كلمة المرور',
      fallback: 'افتح الرابط يدويًا:',
      footer: 'تنبيه أمان: لا تشارك كلمة مرورك أبدًا.',
      outside: '',
    },
    invite: {
      title: 'تمت دعوتك',
      desc: 'يمكنك استخدام <strong>FloraScout</strong> – لروتين نباتات واضح وصحي وأخضر.',
      note: 'قم بإعداد حسابك للبدء.',
      cta: 'قبول الدعوة',
      fallback: 'افتح الرابط يدويًا:',
      footer: 'لا تعرف FloraScout؟ تجاهل هذه الرسالة.',
      outside: '',
    },
    magiclink: {
      title: 'تسجيل دخول آمن',
      desc: 'استخدم هذا الرابط لتسجيل الدخول. نقرة واحدة تكفي.',
      note: 'هذا الرابط للاستخدام مرة واحدة وينتهي قريبًا.',
      cta: 'تسجيل الدخول الآن',
      fallback: 'افتح الرابط يدويًا:',
      footer: 'لم تطلب تسجيل الدخول؟ تجاهل هذه الرسالة.',
      outside: '',
    },
    email_change: {
      title: 'تأكيد البريد الإلكتروني',
      desc: 'تريد تغيير بريدك الإلكتروني. أكّد التغيير باستخدام الزر أدناه.',
      note: '',
      cta: 'تغيير البريد الإلكتروني',
      fallback: 'افتح الرابط يدويًا:',
      footer: 'لم تطلب هذا التغيير؟ تجاهل هذه الرسالة.',
      outside: '',
    },
    reauthentication: {
      title: 'التأكيد مطلوب',
      desc: 'أدخل الرمز التالي للمتابعة:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'لم تطلب ذلك؟ تجاهل هذه الرسالة.',
      outside: '',
    },
  }),
  he: buildI18nSet('השותף החכם שלך לצמחים', {
    signup: {
      title: 'הפעלת חשבון',
      desc: 'ברוך הבא לגינה. אשר את כתובת האימייל שלך כדי להפעיל את החשבון.',
      note: 'הקישור תקף לזמן מוגבל.',
      cta: 'הפעל חשבון',
      fallback: 'אם הכפתור לא עובד, העתק את הקישור לדפדפן:',
      footer: 'לא יצרת חשבון? אפשר להתעלם מהאימייל הזה.',
      outside: 'אם קיבלת את האימייל הזה ללא ציפייה, אין צורך לעשות דבר.',
    },
    recovery: {
      title: 'הגדרת סיסמה חדשה',
      desc: 'ביקשת לאפס את הסיסמה. לחץ למטה כדי לבחור סיסמה חדשה.',
      note: 'אם זה לא היית אתה, אפשר להתעלם מהאימייל.',
      cta: 'אפס סיסמה',
      fallback: 'פתח את הקישור ידנית:',
      footer: 'הודעת אבטחה: לעולם אל תשתף את הסיסמה שלך.',
      outside: '',
    },
    invite: {
      title: 'הוזמנת',
      desc: 'אפשר להשתמש ב-<strong>FloraScout</strong> – לשגרת צמחים ברורה, בריאה וירוקה.',
      note: 'הגדר את החשבון כדי להתחיל.',
      cta: 'קבל הזמנה',
      fallback: 'פתח את הקישור ידנית:',
      footer: 'לא מכיר את FloraScout? אפשר להתעלם מהאימייל.',
      outside: '',
    },
    magiclink: {
      title: 'כניסה מאובטחת',
      desc: 'השתמש בקישור הזה כדי להיכנס. לחיצה אחת מספיקה.',
      note: 'הקישור חד-פעמי ויפוג בקרוב.',
      cta: 'היכנס עכשיו',
      fallback: 'פתח את הקישור ידנית:',
      footer: 'לא ביקשת כניסה? אפשר להתעלם מהאימייל.',
      outside: '',
    },
    email_change: {
      title: 'אימות כתובת אימייל',
      desc: 'ברצונך לשנות את כתובת האימייל. אשר את השינוי באמצעות הכפתור למטה.',
      note: '',
      cta: 'שנה אימייל',
      fallback: 'פתח את הקישור ידנית:',
      footer: 'לא ביקשת את השינוי הזה? אפשר להתעלם מהאימייל.',
      outside: '',
    },
    reauthentication: {
      title: 'נדרש אימות',
      desc: 'הזן את הקוד הבא כדי להמשיך:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'לא ביקשת זאת? אפשר להתעלם מהאימייל.',
      outside: '',
    },
  }),
  fa: buildI18nSet('همراه هوشمند گیاهان شما', {
    signup: {
      title: 'فعال‌سازی حساب',
      desc: 'به باغ خوش آمدید. برای فعال‌سازی حساب، ایمیل خود را تأیید کنید.',
      note: 'این پیوند برای مدت محدودی معتبر است.',
      cta: 'فعال‌سازی حساب',
      fallback: 'اگر دکمه کار نمی‌کند، این پیوند را در مرورگر خود کپی کنید:',
      footer: 'حسابی ایجاد نکرده‌اید؟ این ایمیل را نادیده بگیرید.',
      outside: 'اگر این ایمیل را غیرمنتظره دریافت کرده‌اید، لازم نیست کاری انجام دهید.',
    },
    recovery: {
      title: 'تنظیم گذرواژه جدید',
      desc: 'درخواست بازنشانی گذرواژه داده‌اید. برای انتخاب گذرواژه جدید روی دکمه زیر کلیک کنید.',
      note: 'اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید.',
      cta: 'بازنشانی گذرواژه',
      fallback: 'باز کردن دستی پیوند:',
      footer: 'نکته امنیتی: گذرواژه خود را هرگز با کسی به اشتراک نگذارید.',
      outside: '',
    },
    invite: {
      title: 'دعوت شده‌اید',
      desc: 'می‌توانید از <strong>FloraScout</strong> استفاده کنید – برای یک روتین گیاهی منظم، سالم و سبز.',
      note: 'برای شروع، حساب خود را تنظیم کنید.',
      cta: 'پذیرش دعوت',
      fallback: 'باز کردن دستی پیوند:',
      footer: 'FloraScout را نمی‌شناسید؟ این ایمیل را نادیده بگیرید.',
      outside: '',
    },
    magiclink: {
      title: 'ورود امن',
      desc: 'برای ورود از این پیوند استفاده کنید. یک کلیک کافی است.',
      note: 'این پیوند یک‌بارمصرف است و به‌زودی منقضی می‌شود.',
      cta: 'اکنون وارد شوید',
      fallback: 'باز کردن دستی پیوند:',
      footer: 'این ورود را درخواست نکرده‌اید؟ این ایمیل را نادیده بگیرید.',
      outside: '',
    },
    email_change: {
      title: 'تأیید ایمیل',
      desc: 'می‌خواهید ایمیل خود را تغییر دهید. تغییر را با دکمه زیر تأیید کنید.',
      note: '',
      cta: 'تغییر ایمیل',
      fallback: 'باز کردن دستی پیوند:',
      footer: 'این تغییر را درخواست نکرده‌اید؟ این ایمیل را نادیده بگیرید.',
      outside: '',
    },
    reauthentication: {
      title: 'تأیید لازم است',
      desc: 'برای ادامه، کد زیر را وارد کنید:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'این را درخواست نکرده‌اید؟ این ایمیل را نادیده بگیرید.',
      outside: '',
    },
  }),
  ur: buildI18nSet('آپ کا اسمارٹ پودوں کا ساتھی', {
    signup: {
      title: 'اکاؤنٹ فعال کریں',
      desc: 'باغ میں خوش آمدید۔ اپنا اکاؤنٹ فعال کرنے کے لیے ای میل پتہ تصدیق کریں۔',
      note: 'یہ لنک محدود وقت کے لیے کارآمد ہے۔',
      cta: 'اکاؤنٹ فعال کریں',
      fallback: 'اگر بٹن کام نہ کرے تو یہ لنک اپنے براؤزر میں کاپی کریں:',
      footer: 'اکاؤنٹ نہیں بنایا؟ اس ای میل کو نظر انداز کریں۔',
      outside: 'اگر یہ ای میل غیر متوقع طور پر ملی ہے تو آپ کو کچھ کرنے کی ضرورت نہیں۔',
    },
    recovery: {
      title: 'نیا پاس ورڈ مقرر کریں',
      desc: 'آپ نے پاس ورڈ ری سیٹ کرنے کی درخواست کی ہے۔ نیا پاس ورڈ منتخب کرنے کے لیے نیچے کلک کریں۔',
      note: 'اگر یہ آپ نہیں تھے تو اس ای میل کو نظر انداز کریں۔',
      cta: 'پاس ورڈ ری سیٹ کریں',
      fallback: 'لنک دستی طور پر کھولیں:',
      footer: 'حفاظتی نوٹ: اپنا پاس ورڈ کبھی کسی سے شیئر نہ کریں۔',
      outside: '',
    },
    invite: {
      title: 'آپ کو دعوت دی گئی ہے',
      desc: 'آپ <strong>FloraScout</strong> استعمال کر سکتے ہیں – صاف، صحت مند اور سبز پودوں کی روٹین کے لیے۔',
      note: 'شروع کرنے کے لیے اپنا اکاؤنٹ سیٹ کریں۔',
      cta: 'دعوت قبول کریں',
      fallback: 'لنک دستی طور پر کھولیں:',
      footer: 'FloraScout کو نہیں جانتے؟ اس ای میل کو نظر انداز کریں۔',
      outside: '',
    },
    magiclink: {
      title: 'محفوظ سائن اِن',
      desc: 'سائن اِن کرنے کے لیے یہ لنک استعمال کریں۔ ایک کلک کافی ہے۔',
      note: 'یہ لنک صرف ایک بار استعمال ہو سکتا ہے اور جلد ختم ہو جائے گا۔',
      cta: 'ابھی سائن اِن کریں',
      fallback: 'لنک دستی طور پر کھولیں:',
      footer: 'یہ سائن اِن درخواست نہیں کی؟ اس ای میل کو نظر انداز کریں۔',
      outside: '',
    },
    email_change: {
      title: 'ای میل پتہ تصدیق کریں',
      desc: 'آپ اپنا ای میل پتہ تبدیل کرنا چاہتے ہیں۔ نیچے بٹن سے تبدیلی کی تصدیق کریں۔',
      note: '',
      cta: 'ای میل تبدیل کریں',
      fallback: 'لنک دستی طور پر کھولیں:',
      footer: 'یہ تبدیلی درخواست نہیں کی؟ اس ای میل کو نظر انداز کریں۔',
      outside: '',
    },
    reauthentication: {
      title: 'تصدیق ضروری ہے',
      desc: 'جاری رکھنے کے لیے درج ذیل کوڈ درج کریں:',
      note: '',
      cta: '',
      fallback: '',
      footer: 'یہ درخواست نہیں کی؟ اس ای میل کو نظر انداز کریں۔',
      outside: '',
    },
  }),
};

// ─── Build confirmation URL ──────────────────────────────────────────────────
function buildConfirmationUrl(emailData: EmailData): string {
  const { token_hash, email_action_type, redirect_to } = emailData;
  const type =
    email_action_type === 'signup'
      ? 'email'
      : email_action_type === 'recovery'
        ? 'recovery'
        : email_action_type === 'invite'
          ? 'invite'
          : email_action_type === 'magiclink'
            ? 'magiclink'
            : email_action_type === 'email_change'
              ? 'email_change'
              : 'email';

  const base = `https://${PROJECT_REF}.supabase.co/auth/v1/verify`;
  const params = new URLSearchParams({
    token: token_hash,
    type,
    redirect_to: redirect_to || SITE_URL,
  });
  return `${base}?${params.toString()}`;
}

const RTL_LANGUAGES = new Set<SupportedLanguage>(['ar', 'he', 'fa', 'ur']);

function getEmailDirection(lang: SupportedLanguage): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr';
}

// ─── Build HTML email ────────────────────────────────────────────────────────
function buildEmailHtml(
  lang: SupportedLanguage,
  actionType: EmailActionType,
  emailData: EmailData
): string {
  const strings = i18n[lang]?.[actionType] || i18n.de[actionType];
  const confirmationUrl = buildConfirmationUrl(emailData);
  const direction = getEmailDirection(lang);
  const textAlign = direction === 'rtl' ? 'right' : 'left';
  const brandSpacing = direction === 'rtl' ? 'margin-right:8px' : 'margin-left:8px';

  // For reauthentication, show OTP code instead of link
  if (actionType === 'reauthentication') {
    return `<!doctype html>
<html lang="${lang}" dir="${direction}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>FloraScout</title></head>
  <body style="margin:0;padding:0;background-color:#f5f5f7;direction:${direction};text-align:${textAlign}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">
          <tr><td style="padding:28px 28px 18px;text-align:${textAlign}">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:14px;letter-spacing:-0.01em">
              <span style="font-size:18px;vertical-align:-2px">🌱</span>
              <span style="font-weight:600;${brandSpacing}">FloraScout</span>
            </div>
            <div style="margin-top:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:13px">${strings.subtitle}</div>
          </td></tr>
          <tr><td style="padding:0 28px"><hr style="border:none;border-top:1px solid #e5e5ea;margin:0" /></td></tr>
          <tr><td style="padding:22px 28px 10px">
            <h1 style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:22px;line-height:1.25;letter-spacing:-0.02em">${strings.title}</h1>
            <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:16px;line-height:1.6">${strings.desc}</p>
            <div style="margin:16px 0;padding:16px 20px;background:#f5f5f7;border-radius:10px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:6px;color:#1d1d1f">${emailData.token}</div>
          </td></tr>
          <tr><td style="padding:18px 28px"><hr style="border:none;border-top:1px solid #e5e5ea;margin:0" /></td></tr>
          <tr><td style="padding:0 28px 26px">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:12px;line-height:1.6">${strings.footer}</p>
            <p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9b9ba0;font-size:11px">&copy; 2026 FloraScout</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }

  // Standard template with CTA button
  const noteHtml = strings.note
    ? `<p style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:14px;line-height:1.6">${strings.note}</p>`
    : '';

  const outsideHtml = strings.outside
    ? `<div style="height:18px;line-height:18px;font-size:18px">&nbsp;</div><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9b9ba0;font-size:11px">${strings.outside}</div>`
    : '';

  return `<!doctype html>
<html lang="${lang}" dir="${direction}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>FloraScout</title></head>
  <body style="margin:0;padding:0;background-color:#f5f5f7;direction:${direction};text-align:${textAlign}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">
          <!-- Header -->
          <tr><td style="padding:28px 28px 18px;text-align:${textAlign}">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:14px;letter-spacing:-0.01em">
              <span style="font-size:18px;vertical-align:-2px">🌱</span>
              <span style="font-weight:600;${brandSpacing}">FloraScout</span>
            </div>
            <div style="margin-top:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:13px">${strings.subtitle}</div>
          </td></tr>
          <tr><td style="padding:0 28px"><hr style="border:none;border-top:1px solid #e5e5ea;margin:0" /></td></tr>
          <!-- Body -->
          <tr><td style="padding:22px 28px 10px">
            <h1 style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:22px;line-height:1.25;letter-spacing:-0.02em">${strings.title}</h1>
            <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:16px;line-height:1.6">${strings.desc}</p>
            ${noteHtml}
            <!-- CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 10px">
              <tr><td align="${textAlign}">
                <a href="${confirmationUrl}" style="display:inline-block;background:#2e7d32;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;padding:12px 18px;border-radius:10px">${strings.cta}</a>
              </td></tr>
            </table>
            <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:12px;line-height:1.6">
              ${strings.fallback}<br />
              <a href="${confirmationUrl}" style="color:#2e7d32;text-decoration:none;word-break:break-all">${confirmationUrl}</a>
            </p>
          </td></tr>
          <tr><td style="padding:18px 28px"><hr style="border:none;border-top:1px solid #e5e5ea;margin:0" /></td></tr>
          <!-- Footer -->
          <tr><td style="padding:0 28px 26px">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#6e6e73;font-size:12px;line-height:1.6">${strings.footer}</p>
            <p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9b9ba0;font-size:11px">&copy; 2026 FloraScout</p>
          </td></tr>
        </table>
        ${outsideHtml}
      </td></tr>
    </table>
  </body>
</html>`;
}

// ─── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  // Verify webhook signature
  const wh = new Webhook(hookSecret);
  let data: HookPayload;
  try {
    data = wh.verify(payload, headers) as HookPayload;
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return new Response(
      JSON.stringify({ error: { http_code: 401, message: 'Invalid signature' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { user, email_data } = data;
  const actionType = email_data.email_action_type as EmailActionType;

  // Determine user language from metadata
  const lang = normalizeLanguage(user.user_metadata?.language);

  // Get subject and build HTML
  const subject = subjects[lang]?.[actionType] || subjects.de[actionType] || 'FloraScout';
  const html = buildEmailHtml(lang, actionType, email_data);

  console.log(`Sending ${actionType} email to ${user.email} in ${lang} — subject: "${subject}"`);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [user.email],
      subject: `🌱 ${subject}`,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return new Response(
        JSON.stringify({
          error: { http_code: 500, message: `Email sending failed: ${error.message}` },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('Resend exception:', err);
    return new Response(
      JSON.stringify({
        error: { http_code: 500, message: `Email sending failed: ${(err as Error).message}` },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Return empty JSON = success, Supabase won't send its own email
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
