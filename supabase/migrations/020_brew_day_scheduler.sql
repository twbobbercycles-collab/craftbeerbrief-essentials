-- 020_brew_day_scheduler.sql
-- Brew Day Scheduler & Log module for the Operations tier.
-- Creates: brew_days, brew_day_mash_steps, brew_day_hop_additions
-- All tables use RLS scoped to the brewery, matching the pattern from earlier migrations.

-- ── brew_days ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brew_days (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brewery_id                  uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,

  -- Identification
  batch_number                text        NOT NULL,
  recipe_id                   uuid        REFERENCES recipes(id) ON DELETE SET NULL,
  recipe_name                 text,
  beer_style                  text,
  status                      text        NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                                            'scheduled','in_progress','completed','cancelled'
                                          )),
  brew_date                   date        NOT NULL,
  brew_start_time             time,
  brew_end_time               time,
  brewer_name                 text,
  assistant_brewer            text,

  -- Planned / target values
  planned_batch_size          numeric(10,4),
  planned_batch_unit          text        NOT NULL DEFAULT 'barrels',
  target_og                   numeric(7,4),
  target_fg                   numeric(7,4),
  target_abv                  numeric(6,2),
  target_ibu                  numeric(6,1),
  target_brewhouse_efficiency numeric(5,2) NOT NULL DEFAULT 72,

  -- Mash configuration
  mash_type                   text        CHECK (mash_type IN (
                                            'single_infusion','step_mash','decoction',
                                            'biab','no_sparge','turbid','other'
                                          )),
  sparge_method               text        CHECK (sparge_method IN (
                                            'fly_sparge','batch_sparge','no_sparge','biab'
                                          )),
  no_boil                     boolean     NOT NULL DEFAULT false,
  fermentation_type           text        CHECK (fermentation_type IN (
                                            'standard','open_fermentation','mixed_fermentation',
                                            'spontaneous','kveik','cold_fermentation'
                                          )),

  -- Mash stage measurements
  strike_water_volume         numeric(8,3),
  strike_water_temp_target    numeric(6,2),
  strike_water_temp_actual    numeric(6,2),
  mash_temp_target            numeric(6,2),
  mash_temp_actual            numeric(6,2),
  mash_ph_target              numeric(4,2),
  mash_ph_actual              numeric(4,2),
  mash_duration_minutes       integer,
  sparge_water_volume         numeric(8,3),
  sparge_water_temp           numeric(6,2),
  pre_boil_volume_target      numeric(8,3),
  pre_boil_volume_actual      numeric(8,3),
  pre_boil_gravity_target     numeric(7,4),
  pre_boil_gravity_actual     numeric(7,4),
  lauter_notes                text,
  mash_other_description      text,

  -- Boil stage
  boil_duration_minutes       integer,
  post_boil_volume_target     numeric(8,3),
  post_boil_volume_actual     numeric(8,3),
  post_boil_gravity_target    numeric(7,4),
  post_boil_gravity_actual    numeric(7,4),
  wort_ph_post_boil           numeric(4,2),
  chill_method                text,
  chill_time_minutes          integer,
  pitch_temp_target           numeric(6,2),
  pitch_temp_actual           numeric(6,2),

  -- Yeast and pitching
  yeast_strain                text,
  yeast_lot_number            text,
  yeast_generation            integer     NOT NULL DEFAULT 1,
  yeast_pitch_rate            numeric(8,4),
  yeast_health_notes          text,

  -- Mixed / sour fermentation extras
  wild_strains_noted          text,
  souring_method              text,
  sour_target_ph              numeric(4,2),

  -- Cold fermentation extras
  lagering_temp_target        numeric(6,2),
  lagering_duration_target    integer,

  -- Post-brew actuals
  volume_into_fermenter       numeric(8,3),
  trub_loss                   numeric(8,3),
  actual_og                   numeric(7,4),
  actual_brewhouse_efficiency numeric(5,2),
  fermenter_id                text,
  target_packaging_date       date,
  dry_hop_scheduled           boolean     NOT NULL DEFAULT false,
  dry_hop_date                date,

  -- Process notes
  recipe_deviations           text,
  equipment_notes             text,
  water_chemistry_notes       text,
  quality_observations        text,
  general_notes               text,

  -- Inventory deduction tracking
  inventory_deducted          boolean     NOT NULL DEFAULT false,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_brew_days
  BEFORE UPDATE ON brew_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS brew_days_brewery_idx  ON brew_days (brewery_id);
CREATE INDEX IF NOT EXISTS brew_days_date_idx     ON brew_days (brewery_id, brew_date DESC);
CREATE INDEX IF NOT EXISTS brew_days_status_idx   ON brew_days (brewery_id, status);
CREATE INDEX IF NOT EXISTS brew_days_recipe_idx   ON brew_days (recipe_id);

ALTER TABLE brew_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brew_days_select" ON brew_days FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "brew_days_insert" ON brew_days FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "brew_days_update" ON brew_days FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "brew_days_delete" ON brew_days FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

-- ── brew_day_mash_steps ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brew_day_mash_steps (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brew_day_id             uuid        NOT NULL REFERENCES brew_days(id) ON DELETE CASCADE,
  brewery_id              uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  step_number             integer     NOT NULL,
  step_type               text        CHECK (step_type IN ('rest','decoction','infusion','direct_heat')),
  step_name               text,
  target_temp             numeric(6,2),
  actual_temp             numeric(6,2),
  duration_minutes        integer,
  method_to_reach         text        CHECK (method_to_reach IN (
                                        'direct_heat','infusion','decoction','external'
                                      )),
  volume_pulled           numeric(8,3),
  decoction_boil_time_minutes integer,
  temp_before_return      numeric(6,2),
  temp_after_return       numeric(6,2),
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mash_steps_brew_day_idx ON brew_day_mash_steps (brew_day_id);
CREATE INDEX IF NOT EXISTS mash_steps_brewery_idx  ON brew_day_mash_steps (brewery_id);

ALTER TABLE brew_day_mash_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mash_steps_select" ON brew_day_mash_steps FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "mash_steps_insert" ON brew_day_mash_steps FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "mash_steps_update" ON brew_day_mash_steps FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "mash_steps_delete" ON brew_day_mash_steps FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));

-- ── brew_day_hop_additions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brew_day_hop_additions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brew_day_id      uuid        NOT NULL REFERENCES brew_days(id) ON DELETE CASCADE,
  brewery_id       uuid        NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
  ingredient_name  text        NOT NULL,
  ingredient_id    uuid        REFERENCES ingredients(id) ON DELETE SET NULL,
  planned_amount   numeric(10,4),
  actual_amount    numeric(10,4),
  unit             text        NOT NULL DEFAULT 'oz',
  addition_type    text        CHECK (addition_type IN (
                                 'Boil','Whirlpool','Dry Hop','First Wort','Flameout'
                               )),
  planned_time     text,
  actual_time      text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hop_additions_brew_day_idx ON brew_day_hop_additions (brew_day_id);
CREATE INDEX IF NOT EXISTS hop_additions_brewery_idx  ON brew_day_hop_additions (brewery_id);

ALTER TABLE brew_day_hop_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hop_additions_select" ON brew_day_hop_additions FOR SELECT
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "hop_additions_insert" ON brew_day_hop_additions FOR INSERT
  WITH CHECK (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "hop_additions_update" ON brew_day_hop_additions FOR UPDATE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
CREATE POLICY "hop_additions_delete" ON brew_day_hop_additions FOR DELETE
  USING (brewery_id IN (SELECT brewery_id FROM users WHERE id = auth.uid()));
