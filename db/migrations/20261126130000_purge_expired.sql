-- migrate:up
-- Opruimen van app-tabellen (spec achtergrondtaken deel D, ADR 0050 punt 1–2, ADR 0051 punt 14): app_jobs leest de
-- bewaarcatalogus niet zelf maar krijgt via app.retention_targets() de tabellen die hij opruimt, en verwijdert per batch
-- met app.purge_expired. Beide klasse job: execute alleen voor app_jobs. De delete-policy van elke tabel (met
-- app.retention_cutoff) is de tweede grens naast de where-clausule hieronder.

-- De tabellen met purger 'app' en een termijn, op naam gesorteerd.
create function app.retention_targets() returns setof regclass
  language sql stable security definer set search_path = ''
  as $$
    select r.table_name from app.retention r
    where r.purger = 'app' and r.keep is not null
    order by r.table_name::text
  $$;

alter function app.retention_targets() owner to app_definer;
grant execute on function app.retention_targets() to app_jobs;

-- Verwijdert hooguit p_batch verlopen rijen van p_table en geeft het aantal. 1000 = MAX_PURGE_BATCH in
-- src/core/shared/limits.ts (gelijkheidstest in test/jobs/purge.int.test.ts). De tabelnaam komt als regclass (met een leeg
-- search_path altijd met schema), de kolom uit app.retention met %I.
create function app.purge_expired(p_table regclass, p_batch integer) returns integer
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_time_column text;
    v_keep interval;
    v_purger text;
    v_count integer;
  begin
    select r.time_column, r.keep, r.purger into v_time_column, v_keep, v_purger
      from app.retention r where r.table_name = p_table;
    if not found then
      raise exception 'tabel % staat niet in app.retention', p_table using errcode = '22023';
    end if;
    if v_purger <> 'app' then
      raise exception 'tabel % wordt niet door app.purge_expired opgeruimd', p_table using errcode = '22023';
    end if;
    -- ctid is per partitie uniek, niet over de hele tabel: een gepartitioneerde tabel vraagt een eigen opruimvorm.
    if (select c.relkind from pg_catalog.pg_class c where c.oid = p_table) = 'p' then
      raise exception 'tabel % is gepartitioneerd', p_table using errcode = '22023';
    end if;
    if p_batch is null or p_batch < 1 or p_batch > 1000 then
      raise exception 'batch buiten 1 … 1000' using errcode = '22023';
    end if;
    if v_keep is null then
      return 0;
    end if;
    execute pg_catalog.format(
      'delete from %s where ctid = any (array(select ctid from %s where %I < $1 limit $2))',
      p_table, p_table, v_time_column
    ) using app.retention_cutoff(p_table), p_batch;
    get diagnostics v_count = row_count;
    return v_count;
  end
  $$;

alter function app.purge_expired(regclass, integer) owner to app_definer;
grant execute on function app.purge_expired(regclass, integer) to app_jobs;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
