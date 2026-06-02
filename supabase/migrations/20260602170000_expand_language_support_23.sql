-- ============================================================
-- Expand AI language support to 23 locales
-- ============================================================
-- Keeps existing data intact, widens the language checks used by
-- species_details and plant_details, and centralizes SQL-side locale
-- alias normalization for future backfills/admin scripts.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_supported_language(input_language text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized text := lower(
    btrim(
      replace(
        regexp_replace(coalesce(input_language, ''), '[[:space:]]+', ' ', 'g'),
        '_',
        '-'
      )
    )
  );
  base_code text;
BEGIN
  IF normalized = '' THEN
    RETURN 'de';
  END IF;

  CASE normalized
    WHEN 'de', 'deutsch', 'german', 'deutschland' THEN RETURN 'de';
    WHEN 'en', 'english', 'englisch' THEN RETURN 'en';
    WHEN 'fr', 'francais', 'français', 'french', 'franzoesisch', 'französisch' THEN RETURN 'fr';
    WHEN 'it', 'italian', 'italiano', 'italienisch' THEN RETURN 'it';
    WHEN 'es', 'espanol', 'español', 'spanish', 'spanisch' THEN RETURN 'es';
    WHEN 'ru', 'русский', 'russian', 'russisch' THEN RETURN 'ru';
    WHEN 'tr', 'turkish', 'türkçe', 'turkce', 'türkisch', 'tuerkisch' THEN RETURN 'tr';
    WHEN 'nl', 'dutch', 'nederlands', 'niederländisch', 'niederlaendisch' THEN RETURN 'nl';
    WHEN 'da', 'danish', 'dansk', 'dänisch', 'daenisch' THEN RETURN 'da';
    WHEN 'pl', 'polish', 'polski', 'polnisch' THEN RETURN 'pl';
    WHEN 'uk', 'ua', 'ukrainian', 'ukrainisch', 'українська' THEN RETURN 'uk';
    WHEN 'pt', 'pt-br', 'pt br', 'pt-brazil', 'pt brazil', 'portuguese', 'portugiesisch', 'português', 'portugues', 'brasil', 'brazil' THEN RETURN 'pt-BR';
    WHEN 'pt-pt', 'pt pt', 'pt-portugal', 'pt portugal', 'portuguese portugal', 'portugiesisch portugal' THEN RETURN 'pt-PT';
    WHEN 'hi', 'hindi', 'hindī', 'हिन्दी' THEN RETURN 'hi';
    WHEN 'bn', 'bengali', 'bengalisch', 'bangla', 'বাংলা' THEN RETURN 'bn';
    WHEN 'ja', 'japanese', 'japanisch', '日本語' THEN RETURN 'ja';
    WHEN 'ko', 'korean', 'koreanisch', '한국어' THEN RETURN 'ko';
    WHEN 'zh', 'zh-cn', 'zh-hans', 'zh hans', 'chinese', 'chinesisch', 'simplified chinese', 'vereinfachtes chinesisch', '简体中文' THEN RETURN 'zh-Hans';
    WHEN 'id', 'indonesian', 'indonesisch', 'bahasa indonesia' THEN RETURN 'id';
    WHEN 'ar', 'arabic', 'arabisch', 'العربية' THEN RETURN 'ar';
    WHEN 'he', 'iw', 'hebrew', 'hebräisch', 'hebraeisch', 'עברית' THEN RETURN 'he';
    WHEN 'fa', 'persian', 'persisch', 'farsi', 'فارسی' THEN RETURN 'fa';
    WHEN 'ur', 'urdu', 'اردو' THEN RETURN 'ur';
    ELSE
      base_code := split_part(normalized, '-', 1);
      CASE base_code
        WHEN 'de' THEN RETURN 'de';
        WHEN 'en' THEN RETURN 'en';
        WHEN 'fr' THEN RETURN 'fr';
        WHEN 'it' THEN RETURN 'it';
        WHEN 'es' THEN RETURN 'es';
        WHEN 'ru' THEN RETURN 'ru';
        WHEN 'tr' THEN RETURN 'tr';
        WHEN 'nl' THEN RETURN 'nl';
        WHEN 'da' THEN RETURN 'da';
        WHEN 'pl' THEN RETURN 'pl';
        WHEN 'uk' THEN RETURN 'uk';
        WHEN 'ua' THEN RETURN 'uk';
        WHEN 'pt' THEN RETURN 'pt-BR';
        WHEN 'hi' THEN RETURN 'hi';
        WHEN 'bn' THEN RETURN 'bn';
        WHEN 'ja' THEN RETURN 'ja';
        WHEN 'ko' THEN RETURN 'ko';
        WHEN 'zh' THEN RETURN 'zh-Hans';
        WHEN 'id' THEN RETURN 'id';
        WHEN 'ar' THEN RETURN 'ar';
        WHEN 'he' THEN RETURN 'he';
        WHEN 'iw' THEN RETURN 'he';
        WHEN 'fa' THEN RETURN 'fa';
        WHEN 'ur' THEN RETURN 'ur';
        ELSE RETURN 'de';
      END CASE;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.normalize_supported_language(text)
  IS 'Normalizes supported FloraScout locale aliases to the 23 canonical app language codes.';

CREATE OR REPLACE FUNCTION public.infer_plant_details_language(
  details jsonb,
  profile_language text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF details IS NULL OR details = 'null'::jsonb OR details = '{}'::jsonb THEN
    RETURN public.normalize_supported_language(profile_language);
  END IF;

  RETURN CASE
    WHEN (details->'overview') ? 'Deutscher Name'
      OR (details->'overview') ? 'Botanischer Name' THEN 'de'
    WHEN (details->'overview') ? 'Common Name'
      OR (details->'overview') ? 'Botanical Name' THEN 'en'
    WHEN (details->'overview') ? 'Nom commun'
      OR (details->'overview') ? 'Nom botanique' THEN 'fr'
    WHEN (details->'overview') ? 'Nome comune'
      OR (details->'overview') ? 'Nome botanico' THEN 'it'
    WHEN (details->'overview') ? 'Nombre común'
      OR (details->'overview') ? 'Nombre comun'
      OR (details->'overview') ? 'Nombre botánico' THEN 'es'
    WHEN (details->'overview') ? 'Народное название'
      OR (details->'overview') ? 'Ботаническое название' THEN 'ru'
    WHEN (details->'overview') ? 'Yaygın ad'
      OR (details->'overview') ? 'Yaygın Ad'
      OR (details->'overview') ? 'Botanik ad'
      OR (details->'overview') ? 'Botanik Ad' THEN 'tr'
    WHEN (details->'overview') ? 'Algemene naam'
      OR (details->'overview') ? 'Botanische naam' THEN 'nl'
    WHEN (details->'overview') ? 'Almindeligt navn'
      OR (details->'overview') ? 'Botanisk navn' THEN 'da'
    WHEN (details->'overview') ? 'Nazwa zwyczajowa'
      OR (details->'overview') ? 'Nazwa botaniczna' THEN 'pl'
    WHEN (details->'overview') ? 'Поширена назва'
      OR (details->'overview') ? 'Ботанічна назва' THEN 'uk'
    WHEN (details->'overview') ? 'Nome comum' THEN 'pt-BR'
    WHEN (details->'overview') ? 'Nome vulgar' THEN 'pt-PT'
    WHEN (details->'overview') ? 'सामान्य नाम'
      OR (details->'overview') ? 'वनस्पति नाम' THEN 'hi'
    WHEN (details->'overview') ? 'সাধারণ নাম'
      OR (details->'overview') ? 'বোটানিক্যাল নাম' THEN 'bn'
    WHEN (details->'overview') ? '一般名' THEN 'ja'
    WHEN (details->'overview') ? '일반명'
      OR (details->'overview') ? '학명' THEN 'ko'
    WHEN (details->'overview') ? '常用名' THEN 'zh-Hans'
    WHEN (details->'overview') ? 'Nama umum'
      OR (details->'overview') ? 'Nama botani' THEN 'id'
    WHEN (details->'overview') ? 'الاسم الشائع'
      OR (details->'overview') ? 'الاسم النباتي' THEN 'ar'
    WHEN (details->'overview') ? 'שם נפוץ'
      OR (details->'overview') ? 'שם בוטני' THEN 'he'
    WHEN (details->'overview') ? 'نام رایج'
      OR (details->'overview') ? 'نام گیاه‌شناسی' THEN 'fa'
    WHEN (details->'overview') ? 'عام نام'
      OR (details->'overview') ? 'نباتاتی نام' THEN 'ur'
    ELSE public.normalize_supported_language(profile_language)
  END;
END;
$$;

COMMENT ON FUNCTION public.infer_plant_details_language(jsonb, text)
  IS 'Infers canonical plant details language from localized schema keys, falling back to profile language normalization.';

DO $$
DECLARE
  constraint_record record;
BEGIN
  IF to_regclass('public.species_details') IS NOT NULL THEN
    FOR constraint_record IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.species_details'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%language%'
    LOOP
      EXECUTE format('ALTER TABLE public.species_details DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;

    ALTER TABLE public.species_details
      ADD CONSTRAINT species_details_language_check
      CHECK (language IN (
        'de','en','fr','it','es','ru','tr','nl','da','pl','uk',
        'pt-BR','pt-PT','hi','bn','ja','ko','zh-Hans','id','ar','he','fa','ur'
      ));
  END IF;
END $$;

DO $$
DECLARE
  constraint_record record;
BEGIN
  IF to_regclass('public.plant_details') IS NOT NULL THEN
    FOR constraint_record IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.plant_details'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%language%'
    LOOP
      EXECUTE format('ALTER TABLE public.plant_details DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;

    ALTER TABLE public.plant_details
      ADD CONSTRAINT plant_details_language_check
      CHECK (language IN (
        'de','en','fr','it','es','ru','tr','nl','da','pl','uk',
        'pt-BR','pt-PT','hi','bn','ja','ko','zh-Hans','id','ar','he','fa','ur'
      ));
  END IF;
END $$;

COMMIT;
