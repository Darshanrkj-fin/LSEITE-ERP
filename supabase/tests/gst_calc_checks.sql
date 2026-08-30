-- Known-good test cases for calculate_gst_split(), the one function that
-- decides CGST+SGST vs IGST (CLAUDE.md section 3). Run manually in the
-- Supabase SQL Editor after applying schema.sql — raises an error and
-- rolls back if any assertion fails, prints nothing on success.
do $$
declare
  r record;
begin
  -- Same state (both 29 = Karnataka): 18% on ₹1000 taxable value
  -- => CGST 9% (₹90) + SGST 9% (₹90), IGST 0.
  select * into r from public.calculate_gst_split('29', '29', 1000, 18);
  assert r.cgst = 90.00, format('same-state cgst expected 90.00, got %', r.cgst);
  assert r.sgst = 90.00, format('same-state sgst expected 90.00, got %', r.sgst);
  assert r.igst = 0.00, format('same-state igst expected 0.00, got %', r.igst);

  -- Different state (29 vs 27 = Maharashtra): 18% on ₹1000
  -- => IGST 18% (₹180), CGST/SGST 0.
  select * into r from public.calculate_gst_split('29', '27', 1000, 18);
  assert r.cgst = 0.00, format('inter-state cgst expected 0.00, got %', r.cgst);
  assert r.sgst = 0.00, format('inter-state sgst expected 0.00, got %', r.sgst);
  assert r.igst = 180.00, format('inter-state igst expected 180.00, got %', r.igst);

  -- Odd taxable value rounds each half independently (₹333.33 at 18%
  -- same-state => 9% each = ₹29.9997 -> rounds to ₹30.00 per side).
  select * into r from public.calculate_gst_split('29', '29', 333.33, 18);
  assert r.cgst = 30.00, format('rounding cgst expected 30.00, got %', r.cgst);
  assert r.sgst = 30.00, format('rounding sgst expected 30.00, got %', r.sgst);

  raise notice 'gst_calc_checks.sql: all assertions passed.';
end;
$$;
