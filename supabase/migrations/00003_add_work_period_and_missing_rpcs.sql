
-- ── work_period_config (singleton) ──────────────────────────────────────────
CREATE TABLE work_period_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_day   int  NOT NULL CHECK (start_day BETWEEN 1 AND 28),
  end_day     int  NOT NULL CHECK (end_day   BETWEEN 1 AND 28),
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_period_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_work_period_config" ON work_period_config
  FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "staff_read_work_period_config" ON work_period_config
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('agent','supervisor')));

-- ── work_period_history ───────────────────────────────────────────────────────
CREATE TABLE work_period_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_period_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_work_period_history" ON work_period_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor','agent')));

CREATE POLICY "admin_insert_work_period_history" ON work_period_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── RPC: get_internal_cumulative_chart ───────────────────────────────────────
-- Returns hourly cumulative counts for today (Africa/Brazzaville = UTC+1)
CREATE OR REPLACE FUNCTION get_internal_cumulative_chart()
RETURNS TABLE(hour int, total bigint, accepted bigint, rejected bigint, unchanged bigint, other bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH hours AS (
    SELECT generate_series(0, 23) AS h
  ),
  today_start AS (
    -- midnight Brazzaville (UTC+1) expressed in UTC
    SELECT date_trunc('day', now() AT TIME ZONE 'Africa/Brazzaville') AT TIME ZONE 'Africa/Brazzaville' AS ts
  ),
  requests AS (
    SELECT
      EXTRACT(HOUR FROM (processed_at AT TIME ZONE 'Africa/Brazzaville'))::int AS h,
      status
    FROM verification_requests, today_start
    WHERE processed_at >= today_start.ts
      AND processed_at <  today_start.ts + INTERVAL '1 day'
      AND status IN ('accepted','rejected','unchanged','other')
  )
  SELECT
    hours.h,
    COUNT(r.h)                                       AS total,
    COUNT(r.h) FILTER (WHERE r.status = 'accepted')  AS accepted,
    COUNT(r.h) FILTER (WHERE r.status = 'rejected')  AS rejected,
    COUNT(r.h) FILTER (WHERE r.status = 'unchanged') AS unchanged,
    COUNT(r.h) FILTER (WHERE r.status = 'other')     AS other
  FROM hours
  LEFT JOIN requests r ON r.h = hours.h
  GROUP BY hours.h
  ORDER BY hours.h;
$$;

GRANT EXECUTE ON FUNCTION get_internal_cumulative_chart() TO authenticated;

-- ── RPC: get_current_work_period ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_current_work_period()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  cfg         work_period_config%ROWTYPE;
  today_local date := (now() AT TIME ZONE 'Africa/Brazzaville')::date;
  p_start     date;
  p_end       date;
  start_this  date;
  start_next  date;
BEGIN
  SELECT * INTO cfg FROM work_period_config LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('configured', false);
  END IF;

  -- Build period_start: most recent occurrence of start_day <= today
  IF EXTRACT(DAY FROM today_local)::int >= cfg.start_day THEN
    start_this := make_date(EXTRACT(YEAR FROM today_local)::int, EXTRACT(MONTH FROM today_local)::int, cfg.start_day);
  ELSE
    start_this := make_date(EXTRACT(YEAR FROM (today_local - INTERVAL '1 month'))::int,
                            EXTRACT(MONTH FROM (today_local - INTERVAL '1 month'))::int,
                            cfg.start_day);
  END IF;
  p_start := start_this;

  -- end_day = start_day - 1 of NEXT month
  start_next := start_this + INTERVAL '1 month';
  p_end := start_next - INTERVAL '1 day';

  RETURN jsonb_build_object(
    'configured',    true,
    'start_day',     cfg.start_day,
    'end_day',       cfg.end_day,
    'period_start',  p_start,
    'period_end',    p_end,
    'updated_at',    cfg.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_current_work_period() TO authenticated;
