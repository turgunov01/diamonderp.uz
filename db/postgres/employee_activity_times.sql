-- Postgres SQL: С„Р°РєС‚РёС‡РµСЃРєРѕРµ РІСЂРµРјСЏ РЅР°С‡Р°Р»Р°/РѕРєРѕРЅС‡Р°РЅРёСЏ СЃРјРµРЅС‹ РІ employee_activity

alter table if exists public.employee_activity
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists started_location jsonb,
  add column if not exists finished_location jsonb;

-- Р•СЃР»Рё РІ С‚Р°Р±Р»РёС†Рµ РµСЃС‚СЊ created_at, РјРѕР¶РЅРѕ РѕРґРёРЅ СЂР°Р· Р±СЌРєРѕС„РёСЃРѕРј РїСЂРѕСЃС‚Р°РІРёС‚СЊ started_at:
-- update public.employee_activity
-- set started_at = created_at
-- where started_at is null;
