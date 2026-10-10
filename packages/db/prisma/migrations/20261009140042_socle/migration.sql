-- Socle : un schéma par contexte, et les droits de chaque rôle (ADR 0008, ADR 0025 §6, ADR 0006 §3 et §7).
-- Les privilèges par défaut ne valent que pour les objets créés par migrator : toute création passe par lui.

-- Schémas des contextes : chaque rôle app_<contexte> lit et écrit le sien, et lui seul.
DO $$
DECLARE
  context text;
BEGIN
  FOREACH context IN ARRAY ARRAY[
    'identity', 'channel', 'stream', 'chat', 'moderation',
    'discovery', 'monetization', 'notification', 'video'
  ] LOOP
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', context);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', context);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', context, 'app_' || context);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      context, 'app_' || context
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I',
      context, 'app_' || context
    );
  END LOOP;
END
$$;

-- authz : lecture par tous les contextes ; écriture par channel et moderation seulement ;
-- jamais de DELETE, une attribution se révoque par revokedAt.
CREATE SCHEMA IF NOT EXISTS authz;
REVOKE ALL ON SCHEMA authz FROM PUBLIC;

-- audit : append-only, INSERT et SELECT seulement, pour tous les contextes.
CREATE SCHEMA IF NOT EXISTS audit;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;

DO $$
DECLARE
  context_role text;
BEGIN
  FOREACH context_role IN ARRAY ARRAY[
    'app_identity', 'app_channel', 'app_stream', 'app_chat', 'app_moderation',
    'app_discovery', 'app_monetization', 'app_notification', 'app_video'
  ] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA authz, audit TO %I', context_role);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA authz GRANT SELECT ON TABLES TO %I',
      context_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA audit GRANT SELECT, INSERT ON TABLES TO %I',
      context_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA audit GRANT USAGE ON SEQUENCES TO %I',
      context_role
    );
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA authz
  GRANT INSERT, UPDATE ON TABLES TO app_channel, app_moderation;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA authz
  GRANT USAGE, SELECT ON SEQUENCES TO app_channel, app_moderation;

-- Sonde de disponibilité : lecture de la version du schéma, rien d'autre (ADR 0028 §8).
-- La base fantôme de migrate dev n'a pas de _prisma_migrations : le droit n'y a pas d'objet.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    GRANT SELECT ON TABLE public._prisma_migrations TO app_health;
  END IF;
END
$$;
