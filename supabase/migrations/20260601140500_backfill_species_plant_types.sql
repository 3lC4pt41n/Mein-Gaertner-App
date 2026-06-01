-- Backfill Plant-Dex categories for species created before AI plant_type classification.
-- Current app categories: houseplant, succulent, flowering, tree, herb, wild,
-- groundcover, other.

ALTER TABLE public.species
  ADD COLUMN IF NOT EXISTS plant_type text DEFAULT 'other';

COMMENT ON COLUMN public.species.plant_type IS
  'Plant-Dex category: houseplant, succulent, flowering, tree, herb, wild, groundcover, other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'species_plant_type_valid'
      AND conrelid = 'public.species'::regclass
  ) THEN
    ALTER TABLE public.species
      ADD CONSTRAINT species_plant_type_valid
      CHECK (
        plant_type IN (
          'houseplant',
          'succulent',
          'flowering',
          'tree',
          'herb',
          'wild',
          'groundcover',
          'other'
        )
      )
      NOT VALID;
  END IF;
END $$;

UPDATE public.species
SET plant_type = 'other'
WHERE plant_type IS NULL
   OR plant_type NOT IN (
     'houseplant',
     'succulent',
     'flowering',
     'tree',
     'herb',
     'wild',
     'groundcover',
     'other'
   );

CREATE OR REPLACE FUNCTION public.infer_species_plant_type(species_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT regexp_replace(lower(coalesce(species_name, '')), '[^[:alnum:]äöüß× ]+', ' ', 'g') AS name
  )
  SELECT CASE
    WHEN name ~ '(cactus|cactaceae|kaktus|echinocereus|lophophora|mammillaria|opuntia|cereus|haworthia|aloe|agave|echeveria|crassula|sedum|sempervivum|kalanchoe|gasteria|schlumbergera|rhipsalis|succulent|sukkulent)'
      THEN 'succulent'
    WHEN name ~ '(monstera|fensterblatt|zamioculcas|glücksfeder|gluecksfeder|spathiphyllum|einblatt|ficus benjamina|ficus elastica|gummibaum|dieffenbachia|philodendron|epipremnum|efeutute|calathea|maranta|alocasia|chlorophytum|grünlilie|gruenlilie|sansevieria|bogenhanf|dracaena|pothos|scindapsus|syngonium|peperomia|pilea|anthurium|schefflera|yucca|beaucarnea|strelitzia nicolai|aspidistra|tradescantia|chamaedorea|areca|fittonia|fatsia|aglaonema|begonia rex)'
      THEN 'houseplant'
    WHEN name ~ '(acer|ahorn|platanus|platane|quercus|eiche|pinus|kiefer|picea|fichte|abies|tanne|betula|birke|tilia|linde|ulmus|ulme|fraxinus|esche|salix|weide|populus|pappel|aesculus|kastanie|ginkgo|malus|apfel|pyrus|birne|prunus|kirsche|laurus|olea|olivenbaum|magnolia|cornus|hartriegel|sambucus|holunder|ficus carica|feige|fig)'
      THEN 'tree'
    WHEN name ~ '(ocimum|basilikum|basil|mentha|minze|mint|rosmarinus|rosmarin|rosemary|thymus|thymian|thyme|salvia|sage|lavandula|lavendel|coriandrum|koriander|coriander|petroselinum|petersilie|parsley|origanum|oregano|allium|schnittlauch|chive|melissa|zitronenmelisse|dill|anethum|estragon|artemisia dracunculus)'
      THEN 'herb'
    WHEN name ~ '(hedera|efeu|clematis|vinca|wisteria|blauregen|parthenocissus|lonicera|geißblatt|geissblatt|jasminum|trachelospermum|ivy|groundcover|bodendecker|climber|kletter|ajuga|pachysandra|waldsteinia|vinca minor|lamium|sedum spurium)'
      THEN 'groundcover'
    WHEN name ~ '(rosa|rose|tulipa|tulpe|petunia|pelargonium|geranium|orchid|orchidee|phalaenopsis|dahlia|hydrangea|hortensie|helianthus|sonnenblume|viola|stiefmütterchen|stiefmuetterchen|cyclamen|begonia|chrysanthemum|hibiscus|muscari|narzisse|narcissus|iris|lilium|lilie|calluna|erica|camellia|azalea|rhododendron|primula|primel|lavatera|zinnia|cosmos|aster|tagetes|marigold)'
      THEN 'flowering'
    WHEN name ~ '(taraxacum|löwenzahn|loewenzahn|urtica|brennnessel|plantago|wegerich|trifolium|klee|achillea|schafgarbe|galium|gänseblümchen|gaensebluemchen|bellis perennis|wild)'
      THEN 'wild'
    ELSE 'other'
  END
  FROM normalized;
$$;

UPDATE public.species
SET plant_type = public.infer_species_plant_type(canonical_name)
WHERE plant_type = 'other'
  AND public.infer_species_plant_type(canonical_name) <> 'other';

ALTER TABLE public.species VALIDATE CONSTRAINT species_plant_type_valid;
