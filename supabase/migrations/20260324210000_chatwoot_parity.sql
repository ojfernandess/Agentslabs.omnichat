-- Chatwoot parity: custom attributes, automation rules, macros.
-- Colocado depois de 20260324200000 porque em bases que já aplicaram 20260322210100
-- antes deste conteúdo existir como 20260322210001, o CLI bloqueava (ErrMissingRemote).

-- 1. Custom Attribute Definitions: description + value types (link, date)
ALTER TABLE public.custom_attribute_definitions
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.custom_attribute_definitions
  DROP CONSTRAINT IF EXISTS custom_attribute_definitions_value_type_check;

ALTER TABLE public.custom_attribute_definitions
  ADD CONSTRAINT custom_attribute_definitions_value_type_check
  CHECK (value_type IN ('text', 'number', 'boolean', 'list', 'link', 'date'));

-- 2. Automation Rules: description
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Macros: visibility (private/public), created_by
ALTER TABLE public.macros
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'public'));

ALTER TABLE public.macros
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
