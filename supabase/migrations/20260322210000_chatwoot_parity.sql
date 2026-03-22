-- Chatwoot parity: schema changes for custom attributes, automation, macros.

-- 1. Custom Attribute Definitions: description + value types (link, date)
ALTER TABLE public.custom_attribute_definitions
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Extend value_type CHECK to include link, date
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
