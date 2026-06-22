-- Создаёт роль и базу данных для Alib CRM согласно backend/.env
-- Запускать от имени суперпользователя Postgres (обычно "postgres")

-- 1. Роль (логин) "alib" с паролем "AliB123"
DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'alib') THEN
      CREATE ROLE alib WITH LOGIN PASSWORD 'AliB123';
   END IF;
END
$$;

-- На случай, если роль уже существовала с другим паролем
ALTER ROLE alib WITH LOGIN PASSWORD 'AliB123';

-- 2. База данных "alib_crm", владелец — alib
SELECT 'CREATE DATABASE alib_crm OWNER alib'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'alib_crm')
\gexec

-- 3. Права
GRANT ALL PRIVILEGES ON DATABASE alib_crm TO alib;
