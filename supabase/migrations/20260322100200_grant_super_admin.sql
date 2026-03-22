-- Conceder Super Admin ao utilizador 90f6f092-ef66-4b08-81f5-8c864ac734c4
INSERT INTO public.super_admins (user_id)
VALUES ('90f6f092-ef66-4b08-81f5-8c864ac734c4'::uuid)
ON CONFLICT (user_id) DO NOTHING;
