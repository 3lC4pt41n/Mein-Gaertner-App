import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@4.0.0";

// ─── Language utilities (inlined from _shared/language.ts) ───────────────────
type SupportedLanguage = "de" | "en" | "fr" | "it" | "es" | "ru" | "tr";

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  de: "de", deutsch: "de", german: "de",
  en: "en", english: "en", englisch: "en",
  fr: "fr", francais: "fr", "français": "fr", french: "fr",
  it: "it", italian: "it", italiano: "it", italienisch: "it",
  es: "es", espanol: "es", "español": "es", spanish: "es", spanisch: "es",
  ru: "ru", "русский": "ru", russian: "ru",
  tr: "tr", turkish: "tr", "türkçe": "tr", "türkisch": "tr",
};

function normalizeLanguage(input?: string | null): SupportedLanguage {
  if (!input) return "de";
  const raw = String(input).trim().toLowerCase();
  return LANGUAGE_ALIASES[raw] || "de";
}

// ─── Config ──────────────────────────────────────────────────────────────────
const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);
// Strip the "v1," prefix if present — standardwebhooks expects only "whsec_..."
const rawHookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") as string;
const hookSecret = rawHookSecret.replace(/^v1,/, "");

const FROM_EMAIL = Deno.env.get("SEND_EMAIL_FROM") || "FloraScout <noreply@florascout.app>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://florascout.app";
const PROJECT_REF = "tsllrwaixvhuadrfsskt";

// ─── Types ───────────────────────────────────────────────────────────────────
type EmailActionType =
  | "signup"
  | "recovery"
  | "invite"
  | "magiclink"
  | "email_change"
  | "reauthentication";

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
    signup: "Bestätige deine E-Mail-Adresse",
    recovery: "Neues Passwort festlegen",
    invite: "Du wurdest eingeladen",
    magiclink: "Dein Anmeldelink",
    email_change: "E-Mail-Adresse bestätigen",
    reauthentication: "Bestätigung erforderlich",
  },
  en: {
    signup: "Confirm your email address",
    recovery: "Set a new password",
    invite: "You've been invited",
    magiclink: "Your sign-in link",
    email_change: "Confirm your new email",
    reauthentication: "Confirmation required",
  },
  fr: {
    signup: "Confirme ton adresse e-mail",
    recovery: "Définir un nouveau mot de passe",
    invite: "Tu as été invité(e)",
    magiclink: "Ton lien de connexion",
    email_change: "Confirmer la nouvelle adresse e-mail",
    reauthentication: "Confirmation requise",
  },
  it: {
    signup: "Conferma il tuo indirizzo e-mail",
    recovery: "Imposta una nuova password",
    invite: "Sei stato invitato",
    magiclink: "Il tuo link di accesso",
    email_change: "Conferma il nuovo indirizzo e-mail",
    reauthentication: "Conferma necessaria",
  },
  es: {
    signup: "Confirma tu dirección de correo",
    recovery: "Establecer nueva contraseña",
    invite: "Has sido invitado",
    magiclink: "Tu enlace de inicio de sesión",
    email_change: "Confirmar nueva dirección de correo",
    reauthentication: "Confirmación requerida",
  },
  ru: {
    signup: "Подтвердите адрес электронной почты",
    recovery: "Установить новый пароль",
    invite: "Вас пригласили",
    magiclink: "Ваша ссылка для входа",
    email_change: "Подтвердите новый адрес электронной почты",
    reauthentication: "Требуется подтверждение",
  },
  tr: {
    signup: "E-posta adresini onayla",
    recovery: "Yeni şifre belirle",
    invite: "Davet edildiniz",
    magiclink: "Giriş bağlantınız",
    email_change: "Yeni e-posta adresini onayla",
    reauthentication: "Onay gerekli",
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

const i18n: Record<SupportedLanguage, Record<EmailActionType, I18nStrings>> = {
  de: {
    signup: {
      subtitle: "Dein smarter Pflanzenbegleiter",
      title: "Konto aktivieren",
      desc: "Willkommen im Garten. Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.",
      note: "Dieser Link ist zeitlich begrenzt.",
      cta: "Konto aktivieren",
      fallback: "Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:",
      footer: "Du hast kein Konto erstellt? Dann ignoriere diese E-Mail.",
      outside: "Wenn du diese E-Mail unerwartet erhalten hast, musst du nichts tun.",
    },
    recovery: {
      subtitle: "Dein smarter Pflanzenbegleiter",
      title: "Neues Passwort festlegen",
      desc: "Du hast ein Zurücksetzen deines Passworts angefordert. Klicke unten, um ein neues Passwort zu wählen.",
      note: "Wenn du das nicht warst, kannst du diese E-Mail ignorieren.",
      cta: "Passwort zurücksetzen",
      fallback: "Link manuell öffnen:",
      footer: "Sicherheitshinweis: Gib dein Passwort niemals weiter.",
      outside: "",
    },
    invite: {
      subtitle: "Dein smarter Pflanzenbegleiter",
      title: "Du wurdest eingeladen",
      desc: "Du kannst <strong>FloraScout</strong> nutzen – für einen übersichtlichen, gesunden und grünen Pflanzenalltag.",
      note: "Richte dein Konto ein, um loszulegen.",
      cta: "Einladung annehmen",
      fallback: "Link manuell öffnen:",
      footer: "Du kennst FloraScout nicht? Dann ignoriere diese E-Mail.",
      outside: "",
    },
    magiclink: {
      subtitle: "Dein smarter Pflanzenbegleiter",
      title: "Sicher anmelden",
      desc: "Verwende diesen Link, um dich anzumelden. Ein Klick genügt.",
      note: "Der Link ist nur einmal gültig und läuft nach kurzer Zeit ab.",
      cta: "Jetzt anmelden",
      fallback: "Link manuell öffnen:",
      footer: "Du hast diese Anmeldung nicht angefordert? Dann ignoriere diese E-Mail.",
      outside: "",
    },
    email_change: {
      subtitle: "Dein smarter Pflanzenbegleiter",
      title: "E-Mail-Adresse bestätigen",
      desc: "Du möchtest deine E-Mail-Adresse ändern. Bitte bestätige die Änderung über den Button.",
      note: "",
      cta: "E-Mail ändern",
      fallback: "Link manuell öffnen:",
      footer: "Du hast diese Änderung nicht angefordert? Dann ignoriere diese E-Mail.",
      outside: "",
    },
    reauthentication: {
      subtitle: "Dein smarter Pflanzenbegleiter",
      title: "Bestätigung erforderlich",
      desc: "Bitte gib den folgenden Code ein, um fortzufahren:",
      note: "",
      cta: "",
      fallback: "",
      footer: "Du hast das nicht angefordert? Dann ignoriere diese E-Mail.",
      outside: "",
    },
  },
  en: {
    signup: {
      subtitle: "Your smart plant companion",
      title: "Activate Account",
      desc: "Welcome to the garden. Please confirm your email address to activate your account.",
      note: "This link is time-limited.",
      cta: "Activate Account",
      fallback: "If the button doesn't work, copy this link into your browser:",
      footer: "Didn't create an account? Just ignore this email.",
      outside: "If you received this email unexpectedly, no action is required.",
    },
    recovery: {
      subtitle: "Your smart plant companion",
      title: "Set New Password",
      desc: "You requested a password reset. Click below to choose a new password.",
      note: "If this wasn't you, you can ignore this email.",
      cta: "Reset Password",
      fallback: "Open link manually:",
      footer: "Security notice: Never share your password with anyone.",
      outside: "",
    },
    invite: {
      subtitle: "Your smart plant companion",
      title: "You've Been Invited",
      desc: "You can use <strong>FloraScout</strong> – for a clear, healthy, and green plant routine.",
      note: "Set up your account to get started.",
      cta: "Accept Invitation",
      fallback: "Open link manually:",
      footer: "Don't know FloraScout? Just ignore this email.",
      outside: "",
    },
    magiclink: {
      subtitle: "Your smart plant companion",
      title: "Sign In Securely",
      desc: "Use this link to sign in. One click is all it takes.",
      note: "This link is single-use and expires shortly.",
      cta: "Sign In Now",
      fallback: "Open link manually:",
      footer: "Didn't request this sign-in? Just ignore this email.",
      outside: "",
    },
    email_change: {
      subtitle: "Your smart plant companion",
      title: "Confirm Email Address",
      desc: "You want to change your email address. Please confirm the change using the button below.",
      note: "",
      cta: "Change Email",
      fallback: "Open link manually:",
      footer: "Didn't request this change? Just ignore this email.",
      outside: "",
    },
    reauthentication: {
      subtitle: "Your smart plant companion",
      title: "Confirmation Required",
      desc: "Please enter the following code to continue:",
      note: "",
      cta: "",
      fallback: "",
      footer: "Didn't request this? Just ignore this email.",
      outside: "",
    },
  },
  fr: {
    signup: {
      subtitle: "Ton compagnon végétal intelligent",
      title: "Activer le compte",
      desc: "Bienvenue au jardin. Confirme ton adresse e-mail pour activer ton compte.",
      note: "Ce lien est limité dans le temps.",
      cta: "Activer le compte",
      fallback: "Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :",
      footer: "Tu n'as pas créé de compte ? Ignore cet e-mail.",
      outside: "Si tu as reçu cet e-mail par erreur, aucune action n'est requise.",
    },
    recovery: {
      subtitle: "Ton compagnon végétal intelligent",
      title: "Définir un nouveau mot de passe",
      desc: "Tu as demandé la réinitialisation de ton mot de passe. Clique ci-dessous pour en choisir un nouveau.",
      note: "Si ce n'était pas toi, tu peux ignorer cet e-mail.",
      cta: "Réinitialiser le mot de passe",
      fallback: "Ouvrir le lien manuellement :",
      footer: "Note de sécurité : Ne partage jamais ton mot de passe.",
      outside: "",
    },
    invite: {
      subtitle: "Ton compagnon végétal intelligent",
      title: "Tu as été invité(e)",
      desc: "Tu peux utiliser <strong>FloraScout</strong> – pour un quotidien végétal organisé, sain et verdoyant.",
      note: "Configure ton compte pour commencer.",
      cta: "Accepter l'invitation",
      fallback: "Ouvrir le lien manuellement :",
      footer: "Tu ne connais pas FloraScout ? Ignore cet e-mail.",
      outside: "",
    },
    magiclink: {
      subtitle: "Ton compagnon végétal intelligent",
      title: "Connexion sécurisée",
      desc: "Utilise ce lien pour te connecter. Un clic suffit.",
      note: "Ce lien est à usage unique et expire rapidement.",
      cta: "Se connecter",
      fallback: "Ouvrir le lien manuellement :",
      footer: "Tu n'as pas demandé cette connexion ? Ignore cet e-mail.",
      outside: "",
    },
    email_change: {
      subtitle: "Ton compagnon végétal intelligent",
      title: "Confirmer l'adresse e-mail",
      desc: "Tu souhaites changer ton adresse e-mail. Confirme la modification via le bouton ci-dessous.",
      note: "",
      cta: "Modifier l'e-mail",
      fallback: "Ouvrir le lien manuellement :",
      footer: "Tu n'as pas demandé cette modification ? Ignore cet e-mail.",
      outside: "",
    },
    reauthentication: {
      subtitle: "Ton compagnon végétal intelligent",
      title: "Confirmation requise",
      desc: "Entre le code suivant pour continuer :",
      note: "",
      cta: "",
      fallback: "",
      footer: "Tu n'as pas fait cette demande ? Ignore cet e-mail.",
      outside: "",
    },
  },
  it: {
    signup: {
      subtitle: "Il tuo compagno verde intelligente",
      title: "Attiva account",
      desc: "Benvenuto nel giardino. Conferma il tuo indirizzo e-mail per attivare il tuo account.",
      note: "Questo link è a tempo limitato.",
      cta: "Attiva account",
      fallback: "Se il pulsante non funziona, copia questo link nel tuo browser:",
      footer: "Non hai creato un account? Ignora questa e-mail.",
      outside: "Se hai ricevuto questa e-mail per errore, non devi fare nulla.",
    },
    recovery: {
      subtitle: "Il tuo compagno verde intelligente",
      title: "Imposta nuova password",
      desc: "Hai richiesto il ripristino della password. Clicca qui sotto per sceglierne una nuova.",
      note: "Se non sei stato tu, puoi ignorare questa e-mail.",
      cta: "Reimposta password",
      fallback: "Apri il link manualmente:",
      footer: "Nota di sicurezza: Non condividere mai la tua password.",
      outside: "",
    },
    invite: {
      subtitle: "Il tuo compagno verde intelligente",
      title: "Sei stato invitato",
      desc: "Puoi usare <strong>FloraScout</strong> – per una routine verde, organizzata e salutare.",
      note: "Configura il tuo account per iniziare.",
      cta: "Accetta invito",
      fallback: "Apri il link manualmente:",
      footer: "Non conosci FloraScout? Ignora questa e-mail.",
      outside: "",
    },
    magiclink: {
      subtitle: "Il tuo compagno verde intelligente",
      title: "Accesso sicuro",
      desc: "Usa questo link per accedere. Basta un clic.",
      note: "Il link è monouso e scade a breve.",
      cta: "Accedi ora",
      fallback: "Apri il link manualmente:",
      footer: "Non hai richiesto questo accesso? Ignora questa e-mail.",
      outside: "",
    },
    email_change: {
      subtitle: "Il tuo compagno verde intelligente",
      title: "Conferma indirizzo e-mail",
      desc: "Vuoi cambiare il tuo indirizzo e-mail. Conferma la modifica tramite il pulsante qui sotto.",
      note: "",
      cta: "Cambia e-mail",
      fallback: "Apri il link manualmente:",
      footer: "Non hai richiesto questa modifica? Ignora questa e-mail.",
      outside: "",
    },
    reauthentication: {
      subtitle: "Il tuo compagno verde intelligente",
      title: "Conferma necessaria",
      desc: "Inserisci il seguente codice per continuare:",
      note: "",
      cta: "",
      fallback: "",
      footer: "Non hai fatto questa richiesta? Ignora questa e-mail.",
      outside: "",
    },
  },
  es: {
    signup: {
      subtitle: "Tu compañero vegetal inteligente",
      title: "Activar cuenta",
      desc: "Bienvenido al jardín. Confirma tu dirección de correo electrónico para activar tu cuenta.",
      note: "Este enlace tiene un tiempo limitado.",
      cta: "Activar cuenta",
      fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
      footer: "¿No creaste una cuenta? Ignora este correo.",
      outside: "Si recibiste este correo inesperadamente, no necesitas hacer nada.",
    },
    recovery: {
      subtitle: "Tu compañero vegetal inteligente",
      title: "Establecer nueva contraseña",
      desc: "Solicitaste restablecer tu contraseña. Haz clic abajo para elegir una nueva.",
      note: "Si no fuiste tú, puedes ignorar este correo.",
      cta: "Restablecer contraseña",
      fallback: "Abrir enlace manualmente:",
      footer: "Aviso de seguridad: Nunca compartas tu contraseña.",
      outside: "",
    },
    invite: {
      subtitle: "Tu compañero vegetal inteligente",
      title: "Has sido invitado",
      desc: "Puedes usar <strong>FloraScout</strong> – para una rutina vegetal organizada, saludable y verde.",
      note: "Configura tu cuenta para comenzar.",
      cta: "Aceptar invitación",
      fallback: "Abrir enlace manualmente:",
      footer: "¿No conoces FloraScout? Ignora este correo.",
      outside: "",
    },
    magiclink: {
      subtitle: "Tu compañero vegetal inteligente",
      title: "Iniciar sesión de forma segura",
      desc: "Usa este enlace para iniciar sesión. Un clic es suficiente.",
      note: "Este enlace es de un solo uso y caduca pronto.",
      cta: "Iniciar sesión",
      fallback: "Abrir enlace manualmente:",
      footer: "¿No solicitaste este inicio de sesión? Ignora este correo.",
      outside: "",
    },
    email_change: {
      subtitle: "Tu compañero vegetal inteligente",
      title: "Confirmar dirección de correo",
      desc: "Quieres cambiar tu dirección de correo electrónico. Confirma el cambio con el botón de abajo.",
      note: "",
      cta: "Cambiar correo",
      fallback: "Abrir enlace manualmente:",
      footer: "¿No solicitaste este cambio? Ignora este correo.",
      outside: "",
    },
    reauthentication: {
      subtitle: "Tu compañero vegetal inteligente",
      title: "Confirmación requerida",
      desc: "Introduce el siguiente código para continuar:",
      note: "",
      cta: "",
      fallback: "",
      footer: "¿No solicitaste esto? Ignora este correo.",
      outside: "",
    },
  },
  ru: {
    signup: {
      subtitle: "Ваш умный помощник для растений",
      title: "Активировать аккаунт",
      desc: "Добро пожаловать в сад. Подтвердите свой адрес электронной почты, чтобы активировать аккаунт.",
      note: "Эта ссылка ограничена по времени.",
      cta: "Активировать аккаунт",
      fallback: "Если кнопка не работает, скопируйте эту ссылку в браузер:",
      footer: "Вы не создавали аккаунт? Просто проигнорируйте это письмо.",
      outside: "Если вы получили это письмо по ошибке, никаких действий не требуется.",
    },
    recovery: {
      subtitle: "Ваш умный помощник для растений",
      title: "Установить новый пароль",
      desc: "Вы запросили сброс пароля. Нажмите ниже, чтобы выбрать новый пароль.",
      note: "Если это были не вы, просто проигнорируйте это письмо.",
      cta: "Сбросить пароль",
      fallback: "Открыть ссылку вручную:",
      footer: "Примечание по безопасности: Никогда не сообщайте свой пароль другим.",
      outside: "",
    },
    invite: {
      subtitle: "Ваш умный помощник для растений",
      title: "Вас пригласили",
      desc: "Вы можете использовать <strong>FloraScout</strong> – для организованного, здорового и зелёного ухода за растениями.",
      note: "Настройте свой аккаунт, чтобы начать.",
      cta: "Принять приглашение",
      fallback: "Открыть ссылку вручную:",
      footer: "Не знакомы с FloraScout? Просто проигнорируйте это письмо.",
      outside: "",
    },
    magiclink: {
      subtitle: "Ваш умный помощник для растений",
      title: "Безопасный вход",
      desc: "Используйте эту ссылку для входа. Достаточно одного клика.",
      note: "Ссылка одноразовая и скоро истечёт.",
      cta: "Войти",
      fallback: "Открыть ссылку вручную:",
      footer: "Вы не запрашивали вход? Просто проигнорируйте это письмо.",
      outside: "",
    },
    email_change: {
      subtitle: "Ваш умный помощник для растений",
      title: "Подтвердите адрес электронной почты",
      desc: "Вы хотите изменить адрес электронной почты. Подтвердите изменение с помощью кнопки ниже.",
      note: "",
      cta: "Изменить e-mail",
      fallback: "Открыть ссылку вручную:",
      footer: "Вы не запрашивали это изменение? Просто проигнорируйте это письмо.",
      outside: "",
    },
    reauthentication: {
      subtitle: "Ваш умный помощник для растений",
      title: "Требуется подтверждение",
      desc: "Введите следующий код для продолжения:",
      note: "",
      cta: "",
      fallback: "",
      footer: "Вы не запрашивали это? Просто проигнорируйте это письмо.",
      outside: "",
    },
  },
  tr: {
    signup: {
      subtitle: "Akıllı bitki yardımcınız",
      title: "Hesabı Etkinleştir",
      desc: "Bahçeye hoş geldiniz. Hesabınızı etkinleştirmek için lütfen e-posta adresinizi onaylayın.",
      note: "Bu bağlantının süresi sınırlıdır.",
      cta: "Hesabı Etkinleştir",
      fallback: "Düğme çalışmıyorsa bu bağlantıyı tarayıcınıza kopyalayın:",
      footer: "Hesap oluşturmadınız mı? Bu e-postayı görmezden gelin.",
      outside: "Bu e-postayı beklemiyordunuz ise herhangi bir işlem yapmanız gerekmez.",
    },
    recovery: {
      subtitle: "Akıllı bitki yardımcınız",
      title: "Yeni Şifre Belirle",
      desc: "Şifrenizi sıfırlama talebinde bulundunuz. Yeni bir şifre seçmek için aşağıya tıklayın.",
      note: "Bu siz değilseniz bu e-postayı görmezden gelebilirsiniz.",
      cta: "Şifreyi Sıfırla",
      fallback: "Bağlantıyı manuel olarak açın:",
      footer: "Güvenlik notu: Şifrenizi asla kimseyle paylaşmayın.",
      outside: "",
    },
    invite: {
      subtitle: "Akıllı bitki yardımcınız",
      title: "Davet Edildiniz",
      desc: "<strong>FloraScout</strong>'u kullanabilirsiniz – düzenli, sağlıklı ve yeşil bir bitki bakımı için.",
      note: "Başlamak için hesabınızı ayarlayın.",
      cta: "Daveti Kabul Et",
      fallback: "Bağlantıyı manuel olarak açın:",
      footer: "FloraScout'u tanımıyor musunuz? Bu e-postayı görmezden gelin.",
      outside: "",
    },
    magiclink: {
      subtitle: "Akıllı bitki yardımcınız",
      title: "Güvenli Giriş",
      desc: "Giriş yapmak için bu bağlantıyı kullanın. Tek bir tıklama yeterli.",
      note: "Bu bağlantı tek kullanımlıktır ve kısa sürede sona erer.",
      cta: "Şimdi Giriş Yap",
      fallback: "Bağlantıyı manuel olarak açın:",
      footer: "Bu girişi talep etmediyseniz bu e-postayı görmezden gelin.",
      outside: "",
    },
    email_change: {
      subtitle: "Akıllı bitki yardımcınız",
      title: "E-posta Adresini Onayla",
      desc: "E-posta adresinizi değiştirmek istiyorsunuz. Lütfen aşağıdaki düğme ile değişikliği onaylayın.",
      note: "",
      cta: "E-postayı Değiştir",
      fallback: "Bağlantıyı manuel olarak açın:",
      footer: "Bu değişikliği talep etmediyseniz bu e-postayı görmezden gelin.",
      outside: "",
    },
    reauthentication: {
      subtitle: "Akıllı bitki yardımcınız",
      title: "Onay Gerekli",
      desc: "Devam etmek için aşağıdaki kodu girin:",
      note: "",
      cta: "",
      fallback: "",
      footer: "Bunu talep etmediyseniz bu e-postayı görmezden gelin.",
      outside: "",
    },
  },
};

// ─── Build confirmation URL ──────────────────────────────────────────────────
function buildConfirmationUrl(emailData: EmailData): string {
  const { token_hash, email_action_type, redirect_to } = emailData;
  const type =
    email_action_type === "signup"
      ? "email"
      : email_action_type === "recovery"
        ? "recovery"
        : email_action_type === "invite"
          ? "invite"
          : email_action_type === "magiclink"
            ? "magiclink"
            : email_action_type === "email_change"
              ? "email_change"
              : "email";

  const base = `https://${PROJECT_REF}.supabase.co/auth/v1/verify`;
  const params = new URLSearchParams({
    token: token_hash,
    type,
    redirect_to: redirect_to || SITE_URL,
  });
  return `${base}?${params.toString()}`;
}

// ─── Build HTML email ────────────────────────────────────────────────────────
function buildEmailHtml(
  lang: SupportedLanguage,
  actionType: EmailActionType,
  emailData: EmailData
): string {
  const strings = i18n[lang]?.[actionType] || i18n.de[actionType];
  const confirmationUrl = buildConfirmationUrl(emailData);

  // For reauthentication, show OTP code instead of link
  if (actionType === "reauthentication") {
    return `<!doctype html>
<html lang="${lang}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>FloraScout</title></head>
  <body style="margin:0;padding:0;background-color:#f5f5f7">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">
          <tr><td style="padding:28px 28px 18px;text-align:left">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:14px;letter-spacing:-0.01em">
              <span style="font-size:18px;vertical-align:-2px">🌱</span>
              <span style="font-weight:600;margin-left:8px">FloraScout</span>
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
    : "";

  const outsideHtml = strings.outside
    ? `<div style="height:18px;line-height:18px;font-size:18px">&nbsp;</div><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#9b9ba0;font-size:11px">${strings.outside}</div>`
    : "";

  return `<!doctype html>
<html lang="${lang}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>FloraScout</title></head>
  <body style="margin:0;padding:0;background-color:#f5f5f7">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5ea;border-radius:14px;overflow:hidden">
          <!-- Header -->
          <tr><td style="padding:28px 28px 18px;text-align:left">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;font-size:14px;letter-spacing:-0.01em">
              <span style="font-size:18px;vertical-align:-2px">🌱</span>
              <span style="font-weight:600;margin-left:8px">FloraScout</span>
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
              <tr><td align="left">
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
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  // Verify webhook signature
  const wh = new Webhook(hookSecret);
  let data: HookPayload;
  try {
    data = wh.verify(payload, headers) as HookPayload;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response(
      JSON.stringify({ error: { http_code: 401, message: "Invalid signature" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const { user, email_data } = data;
  const actionType = email_data.email_action_type as EmailActionType;

  // Determine user language from metadata
  const lang = normalizeLanguage(user.user_metadata?.language);

  // Get subject and build HTML
  const subject =
    subjects[lang]?.[actionType] || subjects.de[actionType] || "FloraScout";
  const html = buildEmailHtml(lang, actionType, email_data);

  console.log(
    `Sending ${actionType} email to ${user.email} in ${lang} — subject: "${subject}"`
  );

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [user.email],
      subject: `🌱 ${subject}`,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(
        JSON.stringify({
          error: { http_code: 500, message: `Email sending failed: ${error.message}` },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("Resend exception:", err);
    return new Response(
      JSON.stringify({
        error: { http_code: 500, message: `Email sending failed: ${(err as Error).message}` },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Return empty JSON = success, Supabase won't send its own email
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
