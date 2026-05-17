# LLM-Prompt-Analyse & Optimierungsreport

## 0) Scope & Ergebnis

- Analysiert wurden alle **Runtime-LLM-Aufrufe** im Repository (Edge Functions + Client-Aufrufpfade).
- Gefundene Provider: **nur OpenAI** (kein Anthropic/Claude im Runtime-Code).
- Gefunden: **7 unterschiedliche Prompt-Templates** in **8 LLM-Calls** (Chat hat 2 Calls mit gleichem Haupt-Prompt) + **2 Tool-Definitionen**.

Relevante Dateien:

- [\_shared/openai.ts](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/_shared/openai.ts)
- [ai-plant-scan/index.ts](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-plant-scan/index.ts)
- [ai-plant-details/index.ts](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-plant-details/index.ts)
- [ai-healthcheck/index.ts](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-healthcheck/index.ts)
- [ai-chat/index.ts](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts)
- [ai-gardener-avatar/index.ts](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-gardener-avatar/index.ts)
- [services/aiService.js](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/services/aiService.js)

---

## 1) Schritt 1: Inventar

### 1.1 Übersicht aller LLM-Interaktionen

| ID  | Datei & Zeile                                                                                                                              | Zweck                                                    | Model                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------- |
| P1  | [ai-plant-scan/index.ts:88](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-plant-scan/index.ts:88)             | Pflanze aus Foto erkennen (Name + kurzer Tipp)           | `gpt-4o` (Default aus Helper) |
| P2  | [ai-plant-details/index.ts:468](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-plant-details/index.ts:468)     | Steckbrief/Details generieren (JSON)                     | `gpt-4o` (Default)            |
| P3  | [ai-healthcheck/index.ts:195](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-healthcheck/index.ts:195)         | Bildbasierter Healthcheck (Score + Tabelle + Empfehlung) | `gpt-4o` (Default)            |
| P4  | [ai-chat/index.ts:629](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts:629)                       | Ben-Chat Antwortgenerierung mit Garden-Kontext + History | `gpt-4o` (Default)            |
| P4b | [ai-chat/index.ts:657](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts:657)                       | Finale Antwort nach Tool-Execution                       | `gpt-4o` (Default)            |
| P5  | [ai-chat/index.ts:504](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts:504)                       | Rolling Conversation Summary für Memory                  | `gpt-4o-mini`                 |
| P6  | [ai-gardener-avatar/index.ts:90](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-gardener-avatar/index.ts:90)   | Gesichtsbeschreibung aus User-Foto (Vision-Schritt)      | `gpt-4o`                      |
| P7  | [ai-gardener-avatar/index.ts:115](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-gardener-avatar/index.ts:115) | Avatar-Bild erzeugen                                     | `dall-e-3`                    |

Tool-Definitionen:

- [ai-chat/index.ts:155](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts:155) `create_task`, `create_recurring_task`

---

### 1.2 Detail-Inventar je Prompt

### P1) Plant Scan

Datei: [ai-plant-scan/index.ts:95](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-plant-scan/index.ts:95)

System-Prompt:

- keiner

User-Prompt-Template (vollständig):

```text
Identify the plant in this photo and return JSON in exactly this format:
{
  "name": "Botanical name",
  "note": "One concise care tip sentence"
}
Rules:
- Write the note in ${languagePromptName}.
- Output one language only, no extra text.
- If uncertain, still provide your best estimate.
```

Kontext, der übergeben wird:

- `base64`-Bild als `image_url` Content
- `languagePromptName` (aus Profilsprache/requested language)

Kontext verfügbar, aber nicht übergeben:

- `userId` ist vorhanden, wird aber nicht zur Disambiguierung genutzt
- vorhandene User-Pflanzen/Arten-Historie (über `plants`, `discovery_events`) wird nicht genutzt
- Standort-/Klima-Kontext (`profiles.location_lat/location_lon` aus Migration) wird nicht genutzt

---

### P2) Plant Details

Datei: [ai-plant-details/index.ts:456](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-plant-details/index.ts:456)

System-Prompt:

- keiner

User-Prompt-Template (vollständig):

```text
Create plant details for "${generationName}" (hint: "${generationHint}") and return ONLY one JSON object in EXACTLY this schema:

${schema}

Rules:
- Write all content strictly in ${languagePromptName}.
- Output one language only (no bilingual text, no translations).
- Keep top-level keys exactly: overview, care, extras.
- No markdown, no comments, no explanations.
```

`schema`-Quelle:

- `DETAILS_SCHEMA_BY_LANGUAGE[resolvedLanguage]` in [ai-plant-details/index.ts:29](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-plant-details/index.ts:29)

Kontext, der übergeben wird:

- `generationName` (canonical species name falls vorhanden, sonst requested name)
- `generationHint` (nur wenn keine canonical species)
- Sprache (`languagePromptName`)
- sprachspezifisches JSON-Schema

Kontext verfügbar, aber nicht übergeben:

- zusätzliche Species-Metadaten (`species.plant_type`, `description`, `care_summary`) werden nicht mitpromptet
- Benutzerkontext (Zone, Standort, Wetter, Erfahrungslevel) wird nicht einbezogen
- Verlauf/Healthcheck-History der konkreten Pflanze wird nicht einbezogen

---

### P3) Healthcheck

Datei: [ai-healthcheck/index.ts:84](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-healthcheck/index.ts:84)

System-Prompt (vollständig):

```text
You are a plant health analyst. Always respond with valid JSON only.
```

User-Prompt-Template (vollständig, aus `buildHealthcheckPrompt`):

```text
Analyze the provided plant photo and run a plant health check. Return ONLY this JSON:

{
  "healthscore": <Ganzzahl 0-100, gewichtetes Mittel der Bewertungen>,
  "table": [
    { "Kriterium": "${c[0]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[1]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[2]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[3]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[4]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[5]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" },
    { "Kriterium": "${c[6]}", "Beobachtung": "", "Bewertung": <0-100>, "Begründung": "" }
  ],
  "summary": "<2-3 sentences total assessment>",
  "recommendation": "<max 2 sentences with specific care tips>"
}

Rules:
- Write all user-facing text values in ${languagePromptName}.
- Use only one language.
- Keep all JSON keys exactly as shown.
- Rating scale: 0 = critical, 100 = excellent.
- Return only valid JSON (no markdown, comments or explanation).
```

Zusätzlicher User-Content:

- optional `Die Pflanze heißt: ${plant_name}`
- `image_url`

Kontext, der übergeben wird:

- Bild-URL
- optional Pflanzenname
- Sprache
- lokalisierte Kriterienliste

Kontext verfügbar, aber nicht übergeben:

- Plant-ID, Zone, letzte Healthchecks, letzte Pflege-Tasks
- Wetter- und Saisonkontext
- in `PlantDetailScreen` wird Sprache aktuell teils gar nicht übergeben (Aufruf ohne `language`)

---

### P4) Ben Chat (Hauptprompt)

Datei: [ai-chat/index.ts:120](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts:120)

System-Prompt (vollständig):

```text
## ROLE
You are "Ben", a smart, witty and charming plant coach. Expert in plants and gardening.
Playful but always respectful, friendly and encouraging.

## STYLE
- Chat style (like WhatsApp), concise (max 5 sentences).
- Respond strictly in ${languagePromptName}. Use exactly one language only.
- If the user sends an image, react specifically to what is visible.

## ${gardenContext}

## BEHAVIOR
- Reference the user's specific plants by name when relevant.
- If they ask about a plant problem, check if a healthcheck exists and reference it.
- If tasks are overdue, gently remind them.
- If they have no plants yet, encourage them to add their first plant via the scan feature.
- For plant diagnosis: ask about light, watering frequency, and recent changes before guessing.
- Never recommend chemical pesticides without first suggesting natural alternatives.
- If unsure, ask a follow-up question rather than guessing.

## TOOLS
- You can create tasks for the user using the create_task and create_recurring_task functions.
- When the user asks you to remind them, schedule something, or create a care plan, use these tools.
- After creating a task, confirm what you created in a friendly message.
- For recurring tasks, suggest reasonable intervals based on plant type and season.
```

Optionaler Zusatz:

```text
## PREVIOUS CONVERSATION CONTEXT
${memorySummary}
```

User-Prompt-Template:

- kein einzelner statischer User-String; stattdessen serverseitig geladene History-Messages aus `messages`:
  - Text-only: `content: msg.content || "[Bild]"`
  - Bildmessage: `content: [{type:"text",...},{type:"image_url",...}]`

Kontext, der übergeben wird:

- Gartenkontext (`plants`, letzte `plant_healthchecks`, offene `tasks`, `zones`)
- Chat-History (token-budgetiert)
- Memory-Summary
- User-Sprache
- Tool-Definitionen

Kontext verfügbar, aber nicht übergeben:

- Wetter/Forecast
- explizite Saison
- User-Profilsignale (z.B. Erfahrungslevel)
- dedizierte Pflanzen-Detaildaten (`plants.details` / `species_details`) werden nicht geladen

---

### P5) Chat-Memory Summary

Datei: [ai-chat/index.ts:509](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts:509)

System-Prompt (vollständig):

```text
Summarize this gardening chat conversation into 3-5 bullet points.
Focus on: plant problems discussed, advice given, user preferences learned, important facts about the user's garden.
Keep under 200 words. Write in the same language as the conversation.
Previous summary to update/extend: ${previousSummary}
```

User-Prompt-Template:

```text
${sender}: ${content}
${sender}: ${content}
...
```

Kontext, der übergeben wird:

- letzte 20 Nachrichten
- bisherige Summary

Kontext verfügbar, aber nicht übergeben:

- strukturierte Metadaten (Zeit, Sprache explizit, tool outcomes)
- Output-Format nicht strikt (kein JSON-Format)

---

### P6) Avatar Vision-Beschreibung

Datei: [ai-gardener-avatar/index.ts:97](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-gardener-avatar/index.ts:97)

System-Prompt (vollständig):

```text
You are a portrait description assistant. Describe ONLY the person's face and head for an illustrator. Focus strictly on: approximate age, gender, skin tone, hair color and style, facial hair if any, eye color, face shape, glasses if worn, and distinctive facial features (freckles, dimples, scars, etc.). Do NOT describe clothing, pose, background, or mood. Be concise and specific. Output ONLY the description, no preamble.
```

User-Prompt-Template:

```text
[image_url data:image/jpeg;base64,..., detail: "low"]
Describe this person for an illustrator.
```

Kontext, der übergeben wird:

- Foto

Kontext verfügbar, aber nicht übergeben:

- Sprache/Locale (wird ermittelt, aber nicht genutzt)
- Fallback-Regeln für „kein Gesicht erkennbar“
- strukturierter Output fehlt (rein Freitext)

---

### P7) Avatar Bildgenerierung (DALL·E)

Datei: [ai-gardener-avatar/index.ts:120](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-gardener-avatar/index.ts:120)

System-Prompt:

- keiner (Image API Prompt)

Prompt-Template (vollständig):

```text
Illustrated avatar portrait of a gardener. The person looks like this:

${personDescription}

MANDATORY outfit and props — always include ALL of these:
- A worn, earth-toned gardening apron over a simple shirt.
- Sturdy gardening gloves (one hand holding a small terracotta pot with a green seedling).
- A classic wide-brim straw sun hat.

Composition and style — follow exactly:
- Head-and-shoulders portrait, centered, looking at the viewer with a warm smile.
- Background: a lush green garden with soft bokeh (blurred leaves, flowers, sunlight).
- Art style: clean digital illustration, Pixar-inspired, slightly stylized but the face must be clearly recognizable from the description above.
- Warm golden-hour lighting from the left side.
- No text, no logo, no watermark, no extra people, no speech bubbles.
- Square 1:1 format, suitable as a round app avatar.
```

Kontext, der übergeben wird:

- `personDescription` aus P6

Kontext verfügbar, aber nicht übergeben:

- kein Qualitäts-/Confidence-Signal aus P6
- keine User-Stilpräferenz
- kein definierter Fallback bei leerer/unsicherer Personenbeschreibung

---

### Tool-Definitionen (vollständig)

Datei: [ai-chat/index.ts:155](/Users/tim.esanum/Documents/GitHub/Mein-Gaertner-App/supabase/functions/ai-chat/index.ts:155)

- `create_task` mit Parametern: `plant_name`, `task_type` (Enum: `Gießen|Düngen|Umtopfen|Healthcheck|Sonstiges`), `due_date`, `note`
- `create_recurring_task` mit Parametern: `plant_name`, `task_type` (gleiches Enum), `interval_days`, `note`

---

## 2) Schritt 2: Bewertung (1-10)

| Prompt           | Kontext-Nutzung | Strukturierung | Konsistenz | Output-Kontrolle | Robustheit | Kurzfazit                                                                     |
| ---------------- | --------------: | -------------: | ---------: | ---------------: | ---------: | ----------------------------------------------------------------------------- |
| P1 Plant Scan    |               3 |              7 |          6 |                5 |          5 | Gute Basis, aber kaum Kontext + kein erzwungenes JSON-Format                  |
| P2 Plant Details |               4 |              6 |          6 |                6 |          6 | Schema gut, aber ohne `response_format` und wenig situativer Kontext          |
| P3 Healthcheck   |               5 |              8 |          7 |                9 |          8 | Stärkster JSON-Guardrail; Kontext könnte deutlich tiefer sein                 |
| P4 Ben Chat      |               8 |              7 |          6 |                5 |          7 | Gute Garten-Kontextnutzung, aber Wetter/Saison/Erfahrung fehlen               |
| P5 Summary       |               7 |              6 |          6 |                4 |          6 | Nützlich, aber unstrukturierter Output ohne Formatgarantie                    |
| P6 Avatar Vision |               2 |              6 |          5 |                4 |          3 | Funktioniert, aber kein strukturiertes Ergebnis und keine Edge-Case-Strategie |
| P7 Avatar DALL·E |               4 |              7 |          5 |                6 |          3 | Stil klar, aber abhängig von unstrukturiertem P6-Text                         |

---

## 3) Schritt 3: Optimierte Prompt-Versionen

### OPT-P1 Plant Scan (json-hart, mehr Kontext)

```text
## Rolle
Du bist ein botanischer Bildanalyst für eine Garten-App.

## Kontext
- Antwortsprache: {{language_prompt_name}}  // Quelle: profiles.language / request.language
- Region/Land (optional): {{user_country_code}}  // Quelle: profiles.country (falls vorhanden)
- Saison (optional): {{season_now}}  // Quelle: Serverdatum + Standort
- Bekannte Pflanzen des Users (optional): {{known_species_candidates}}  // Quelle: plants/discovery_events
- Bildhinweise (optional): {{image_quality_notes}}  // Quelle: Client/Preprocessing

## Aufgabe
Identifiziere die wahrscheinlichste Pflanzenart auf dem Bild.

## Regeln
- Wenn unsicher, gib trotzdem den besten Treffer + Alternativen.
- Keine erfundenen Pflegeanweisungen ohne Kennzeichnung geringer Sicherheit.
- Nur eine Sprache verwenden: {{language_prompt_name}}.

## Output-Format (strict JSON)
{
  "name": "string",
  "confidence": 0.0,
  "note": "string",
  "alternatives": [{"name": "string", "confidence": 0.0}],
  "needs_better_image": false,
  "reason_if_uncertain": "string|null"
}

## Edge Cases
- Wenn Bild unbrauchbar: "needs_better_image" = true und "name" = "Uncertain".
- Keine Markdown-Fences, nur valides JSON.
```

### OPT-P2 Plant Details (cache-safe + strukturiert)

```text
## Rolle
Du bist ein präziser Pflanzen-Steckbrief-Generator für eine Garten-App.

## Kontext
- Kanonischer Artenname: {{species_canonical_name}}  // Quelle: species.canonical_name
- Plant type: {{species_plant_type}}  // Quelle: species.plant_type
- Vorwissen (optional): {{species_description}}, {{species_care_summary}}  // Quelle: species.*
- User-Sprache: {{language_prompt_name}}  // Quelle: profiles.language
- User-Hinweis (nur wenn keine canonical species): {{generation_hint}}  // Quelle: request.note
- Saison/Region (optional): {{season_now}}, {{climate_zone}}  // Quelle: profiles location + weather

## Aufgabe
Erzeuge einen korrekten, praxisnahen Steckbrief für die Art.

## Regeln
- Keine Halluzinationen: Wenn unsicher, neutral formulieren.
- Einheitliche Terminologie, keine Mischsprachen.
- Top-Level Keys exakt beibehalten: overview, care, extras.

## Output-Format
{{details_schema_for_language}}
+ zusätzlich:
{
  "confidence_notes": "string",
  "assumptions": ["string"]
}

## Edge Cases
- Wenn Art unbekannt: generischer, sicherer Pflegeleitfaden mit klaren Annahmen.
- Nur valides JSON, ohne Markdown.
```

### OPT-P3 Healthcheck (kontextreicher Diagnose-Prompt)

```text
## Rolle
Du bist ein Pflanzen-Gesundheitsanalyst mit Fokus auf konkrete, sichere Empfehlungen.

## Kontext
- Sprache: {{language_prompt_name}}  // Quelle: profiles.language
- Pflanzenname: {{plant_name}}  // Quelle: request
- Species (optional): {{species_name}}  // Quelle: plants/species
- Zone/Standort (optional): {{zone_type}}, {{location_label}}  // Quelle: zones/locations
- Verlauf (optional): {{latest_healthchecks}}, {{recent_tasks}}  // Quelle: plant_healthchecks/tasks
- Wetter/Saison (optional): {{weather_now}}, {{season_now}}  // Quelle: weather-proxy + datum

## Aufgabe
Bewerte sichtbare Pflanzengesundheit aus dem Bild und gib priorisierte Maßnahmen.

## Regeln
- Nur beobachtbare Symptome bewerten.
- Bei unklarer Bildlage Rückfrage/Unsicherheit explizit markieren.
- Keine chemischen Mittel als Erstempfehlung.

## Output-Format (strict JSON)
{
  "healthscore": 0,
  "table": [
    {
      "criterion_key": "leaf_color_texture",
      "criterion_label": "string",
      "observation": "string",
      "score": 0,
      "reason": "string"
    }
  ],
  "summary": "string",
  "recommendation": "string",
  "urgent_actions": ["string"],
  "needs_better_image": false
}

## Edge Cases
- Wenn kein klares Pflanzenmotiv sichtbar: "needs_better_image" = true.
- Nur valides JSON.
```

### OPT-P4 Ben Chat System-Prompt

```text
## Rolle
Du bist "Ben", ein freundlicher, kompetenter Gartenexperte mit leicht humorvollem Ton.

## Kontext
- Sprache: {{language_prompt_name}}  // Quelle: profiles.language
- User-Profil: {{user_profile_summary}}  // Quelle: profiles (Name, Präferenzen, Erfahrung)
- Gartenstatus: {{garden_context}}  // Quelle: plants, tasks, healthchecks, zones
- Wetter/Saison: {{weather_context}}, {{season_context}}  // Quelle: weather + datum
- Bisheriger Chat: {{memory_summary}} + {{recent_messages}}  // Quelle: chat_memory/messages

## Aufgabe
Beantworte die letzte Nutzeranfrage konkret und handlungsorientiert.

## Regeln
- Max. 5 Sätze, klare nächste Schritte.
- Pflanzennamen des Users aktiv nutzen.
- Bei Unsicherheit genau 1 Rückfrage stellen.
- Keine harten Diagnosen ohne Evidenz.
- Wenn Reminder/Plan gewünscht: Tools verwenden.

## Output-Format
- Reiner Chat-Text in {{language_prompt_name}}.
- Keine Meta-Erklärungen, kein JSON.
```

### OPT-P5 Summary Prompt (strukturiert)

```text
## Rolle
Du aktualisierst ein kompaktes Langzeitgedächtnis für einen Pflanzen-Chatbot.

## Kontext
- Vorherige Summary: {{previous_summary}}
- Neue Nachrichten (chronologisch): {{conversation_chunk}}
- Zielsprache: {{language_prompt_name}}

## Aufgabe
Fasse nur langlebige, nutzbare Fakten zusammen.

## Regeln
- Keine redundanten Formulierungen.
- Keine kurzfristigen Smalltalk-Details.
- Maximal 180 Wörter insgesamt.

## Output-Format (strict JSON)
{
  "facts_about_garden": ["string"],
  "user_preferences": ["string"],
  "open_followups": ["string"],
  "last_updated_message_count": 0
}
```

### OPT-P6 Avatar Vision Prompt (strukturierter Output)

```text
## Rolle
Du extrahierst nur visuelle Gesichtsmerkmale für eine Illustration.

## Kontext
- Bild: {{portrait_image}}

## Aufgabe
Beschreibe ausschließlich Kopf/Gesicht für ein Avatar-Rendering.

## Regeln
- Kein Outfit, kein Hintergrund, keine Stimmung.
- Wenn kein Gesicht klar erkennbar: explizit markieren.

## Output-Format (strict JSON)
{
  "face_detected": true,
  "features": {
    "age_band": "string",
    "skin_tone": "string",
    "hair": "string",
    "eyes": "string",
    "face_shape": "string",
    "facial_hair": "string|null",
    "glasses": "string|null",
    "distinctive_features": ["string"]
  },
  "confidence": 0.0
}
```

### OPT-P7 DALL·E Prompt (robuster mit Fallback)

```text
## Rolle
Erzeuge ein 1:1 App-Avatar-Porträt im freundlichen Gartenstil.

## Kontext
- Gesichtsmerkmale: {{vision_features_json}}
- Confidence: {{vision_confidence}}
- Fallback bei unsicherer Erkennung: {{fallback_style_profile}}

## Pflichtanforderungen
- Head-and-shoulders, centered, warm smile
- Garten-Background mit soft bokeh
- Apron + gloves + seedling pot + straw hat
- Keine Logos/Texte/Wasserzeichen/weitere Personen

## Stil
- Clean digital illustration, leicht stilisiert, aber wiedererkennbar

## Output
- 1024x1024, geeignet für runden Avatar-Crop
```

---

## 4) Schritt 4: Kontext-Mapping

| Prompt        | User-Profil | Pflanzen | History | Wetter | Saison | Erfahrung |
| ------------- | ----------- | -------- | ------- | ------ | ------ | --------- |
| Plant Scan    | ❌→✅       | ❌→✅    | ❌→✅   | ❌→✅  | ❌→✅  | ❌→✅     |
| Plant Details | ❌→✅       | ✅       | ❌→✅   | ❌→✅  | ❌→✅  | ❌→✅     |
| Healthcheck   | ❌→✅       | ✅       | ❌→✅   | ❌→✅  | ❌→✅  | ❌→✅     |
| Ben Chat      | ✅          | ✅       | ✅      | ❌→✅  | ❌→✅  | ❌→✅     |
| Chat Summary  | ❌→✅       | ❌→✅    | ✅      | ❌     | ❌     | ❌        |
| Avatar Vision | ❌→✅       | ❌       | ❌      | ❌     | ❌     | ❌        |
| Avatar Render | ❌→✅       | ❌       | ❌→✅   | ❌     | ❌     | ❌        |

---

## 5) Schritt 5: Implementierungsplan (Diffs, Daten, Aufwand, Priorität)

### 5.1 P1 Plant Scan

```diff
--- a/supabase/functions/ai-plant-scan/index.ts
+++ b/supabase/functions/ai-plant-scan/index.ts
@@
- text: `Identify the plant in this photo and return JSON in exactly this format:
- {
-   "name": "Botanical name",
-   "note": "One concise care tip sentence"
- }
- Rules:
- - Write the note in ${languagePromptName}.
- - Output one language only, no extra text.
- - If uncertain, still provide your best estimate.`,
+ text: `## Rolle
+ Du bist ein botanischer Bildanalyst.
+ ## Kontext
+ - Sprache: ${languagePromptName}
+ - Saison: {{season_now}}
+ - Kandidatenarten: {{known_species_candidates}}
+ ## Aufgabe
+ Identifiziere die Pflanze mit Confidence.
+ ## Output-Format (strict JSON)
+ {"name":"string","confidence":0.0,"note":"string","alternatives":[{"name":"string","confidence":0.0}],"needs_better_image":false,"reason_if_uncertain":"string|null"}
+ ## Regeln
+ - Nur eine Sprache.
+ - Nur valides JSON.`,
@@
- result = await callOpenAI({ messages: [...], max_tokens: 600 });
+ result = await callOpenAI({ messages: [...], max_tokens: 700, response_format: { type: 'json_object' } });
```

Zusätzliche Daten:

- `season_now` (Serverdatum + Hemisphäre)
- `known_species_candidates` (aus `discovery_events`/`plants`)

Aufwand: **M**  
Impact: **Hoch** (bessere Erkennungsqualität + stabileres Parsing)  
Priorität: **2**

---

### 5.2 P2 Plant Details

```diff
--- a/supabase/functions/ai-plant-details/index.ts
+++ b/supabase/functions/ai-plant-details/index.ts
@@
- const prompt = `Create plant details for "${generationName}" (hint: "${generationHint}") ...
+ const systemPrompt = `## Rolle
+ Du bist ein präziser Pflanzen-Steckbrief-Generator.
+ ## Regeln
+ - Keine Halluzinationen
+ - Nur valides JSON`;
+ const userPrompt = `## Kontext
+ - canonical_name: "${generationName}"
+ - hint: "${generationHint}"
+ - plant_type: "{{species_plant_type}}"
+ - sprache: ${languagePromptName}
+ ## Output-Format
+ ${schema}`;
@@
- messages: [{ role: 'user', content: prompt }],
+ messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
+ response_format: { type: 'json_object' },
```

Zusätzliche Daten:

- `species.plant_type`, `species.description`, `species.care_summary`
- optional Klima/Saison-Kontext

Aufwand: **M**  
Impact: **Hoch** (höhere fachliche Präzision)  
Priorität: **3**

---

### 5.3 P3 Healthcheck (+ Aufrufkontext)

```diff
--- a/services/aiService.js
+++ b/services/aiService.js
@@
-export async function performHealthcheck(imageUrl, plantName, language) {
+export async function performHealthcheck(imageUrl, plantName, language, plantId) {
   return callEdgeFunction('ai-healthcheck', {
     image_url: imageUrl,
     plant_name: plantName,
     language,
+    plant_id: plantId,
   });
}
```

```diff
--- a/screens/PlantDetailScreen.js
+++ b/screens/PlantDetailScreen.js
@@
- const result = await performHealthcheck(imageUrl, plant.name);
+ const lang = await fetchCurrentUserLanguage();
+ const result = await performHealthcheck(imageUrl, plant.name, lang, plant.id);
```

```diff
--- a/supabase/functions/ai-healthcheck/index.ts
+++ b/supabase/functions/ai-healthcheck/index.ts
@@
- const { image_url, plant_name, language: requestedLanguage } = await req.json();
+ const { image_url, plant_name, plant_id, language: requestedLanguage } = await req.json();
@@
- const healthcheckPrompt = buildHealthcheckPrompt(resolvedLanguage, languagePromptName);
+ const plantContext = await loadPlantContext(serviceClient, userId, plant_id);
+ const healthcheckPrompt = buildHealthcheckPrompt(resolvedLanguage, languagePromptName, plantContext);
```

Zusätzliche Daten:

- `plants`, `zones`, `locations`, `plant_healthchecks`, `tasks`
- optional Wetter

Aufwand: **M**  
Impact: **Sehr hoch** (deutlich bessere Diagnosequalität)  
Priorität: **1**

---

### 5.4 P4 Ben Chat (Wetter/Saison/Profil/Erfahrung)

```diff
--- a/supabase/functions/ai-chat/index.ts
+++ b/supabase/functions/ai-chat/index.ts
@@
-function buildSystemPrompt(languagePromptName: string, gardenContext: string, memorySummary: string | null): string {
+function buildSystemPrompt(
+  languagePromptName: string,
+  gardenContext: string,
+  memorySummary: string | null,
+  userProfileContext: string,
+  weatherContext: string,
+  seasonContext: string
+): string {
@@
- ## ${gardenContext}
+ ## USER PROFILE
+ ${userProfileContext}
+ ## GARDEN CONTEXT
+ ${gardenContext}
+ ## WEATHER
+ ${weatherContext}
+ ## SEASON
+ ${seasonContext}
```

Zusätzliche Daten:

- Profilfelder (`profiles.*`, inkl. künftig `gardening_experience`)
- Wetter via `weather-proxy` anhand `profiles.location_lat/lon`
- Saison aus Serverdatum

Aufwand: **L**  
Impact: **Sehr hoch** (besseres persönliches Coaching)  
Priorität: **1**

---

### 5.5 Tool-Definitionen (sprachneutral + robuster)

```diff
--- a/supabase/functions/ai-chat/index.ts
+++ b/supabase/functions/ai-chat/index.ts
@@
- enum: ['Gießen', 'Düngen', 'Umtopfen', 'Healthcheck', 'Sonstiges'],
+ enum: ['watering', 'fertilizing', 'repotting', 'healthcheck', 'other'],
@@
- description: 'Type of task',
+ description: 'Language-neutral task type code',
```

Zusätzliche Daten:

- keine externen Daten, nur Mapping im Handler (`code -> display label`)

Aufwand: **S**  
Impact: **Hoch** (weniger Tool-Call-Fehler bei nicht-deutscher Chat-Sprache)  
Priorität: **2**

---

### 5.6 P5 Summary (JSON Memory)

```diff
--- a/supabase/functions/ai-chat/index.ts
+++ b/supabase/functions/ai-chat/index.ts
@@
- content: `Summarize this gardening chat conversation into 3-5 bullet points...`
+ content: `Return strict JSON:
+ {"facts_about_garden":[],"user_preferences":[],"open_followups":[],"last_updated_message_count":0}
+ Keep concise and language-consistent.`,
@@
- temperature: 0.3,
+ temperature: 0.2,
+ response_format: { type: 'json_object' },
```

Zusätzliche Daten:

- keine zwingend; optional tool-results in Summary-Chunk

Aufwand: **S**  
Impact: **Mittel** (stabileres Memory für Folgedialoge)  
Priorität: **4**

---

### 5.7 P6 Avatar Vision (strukturierter Output + Fallback)

```diff
--- a/supabase/functions/ai-gardener-avatar/index.ts
+++ b/supabase/functions/ai-gardener-avatar/index.ts
@@
- content: `You are a portrait description assistant... Output ONLY the description, no preamble.`,
+ content: `Return strict JSON:
+ {"face_detected":true,"features":{"age_band":"","skin_tone":"","hair":"","eyes":"","face_shape":"","facial_hair":null,"glasses":null,"distinctive_features":[]},"confidence":0.0}
+ If no face is visible: face_detected=false.`,
@@
- const personDescription = visionResult.content;
+ const descriptor = JSON.parse(visionResult.content);
```

Zusätzliche Daten:

- keine

Aufwand: **S**  
Impact: **Mittel** (robuster Pipeline-Eingang für DALL·E)  
Priorität: **5**

---

### 5.8 P7 DALL·E Prompt (Confidence-aware)

```diff
--- a/supabase/functions/ai-gardener-avatar/index.ts
+++ b/supabase/functions/ai-gardener-avatar/index.ts
@@
- prompt: `Illustrated avatar portrait of a gardener. The person looks like this:
- ${personDescription}
+ prompt: `## Role
+ Create a friendly gardener avatar.
+ ## Face features
+ ${JSON.stringify(descriptor.features)}
+ ## Confidence
+ ${descriptor.confidence}
+ ## Fallback
+ If confidence < 0.45, use neutral stylized face while preserving major visible traits.
...
```

Zusätzliche Daten:

- `descriptor.confidence` aus P6

Aufwand: **S**  
Impact: **Mittel**  
Priorität: **6**

---

## Priorisierte Umsetzung (Impact zuerst)

1. **P3 Healthcheck-Kontext + korrekter Sprach-Forwarding-Aufruf** (Priorität 1, M)
2. **P4 Ben Chat um Wetter/Saison/Profil/Erfahrung erweitern** (Priorität 1, L)
3. **P1 Plant Scan JSON-hart + Kandidatenkontext** (Priorität 2, M)
4. **P2 Plant Details um Species-Metadaten + JSON-hart erweitern** (Priorität 3, M)
5. **P5 Summary auf JSON umstellen** (Priorität 4, S)
6. **P6/P7 Avatar-Pipeline strukturieren** (Priorität 5/6, S)
